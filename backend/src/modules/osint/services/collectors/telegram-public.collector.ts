// Khong dung @nestjs/common types trong moi truong build → khai bao ambient toi thieu
declare module '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { RawPost, CollectorResult } from './raw-post.interface';

/**
 * TelegramPublicCollector — thu thập post từ TRANG XEM TRƯỚC CÔNG KHAI của Telegram:
 *   https://t.me/s/<channel>
 *
 * Vì sao dùng t.me/s thay vì Telethon (MTProto):
 *   - KHÔNG cần đăng nhập tài khoản → tuân thủ quy tắc OSINT pháp lý của dự án
 *     ("Chỉ thu thập nội dung công khai, không đăng nhập tài khoản" — CLAUDE.md).
 *   - $0, không cần api_id/api_hash, không cần session file.
 *   - Đánh đổi: chỉ lấy được post của channel PUBLIC có bật preview, không có comment/reaction
 *     chi tiết, history giới hạn ~15-20 post gần nhất mỗi lần fetch.
 */
@Injectable()
export class TelegramPublicCollector {
  private readonly logger = new Logger(TelegramPublicCollector.name);

  // User-Agent rõ ràng để minh bạch (không giả mạo trình duyệt) — đúng tinh thần OSINT hợp pháp
  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  /**
   * Chuyển chuỗi view dạng Telegram ("1.76K", "1.2M", "523") sang số nguyên.
   * Cần vì Telegram rút gọn số lớn bằng hậu tố K/M, không parse trực tiếp được.
   */
  private parseViews(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const s = raw.trim().toUpperCase();
    // Bắt phần số (có thể có dấu chấm thập phân) + hậu tố K/M tuỳ chọn
    const m = s.match(/^([\d.]+)\s*([KM]?)$/);
    if (!m) return undefined;
    const num = parseFloat(m[1]);
    if (m[2] === 'K') return Math.round(num * 1_000);
    if (m[2] === 'M') return Math.round(num * 1_000_000);
    return Math.round(num);
  }

  /**
   * Crawl 1 channel Telegram qua trang preview công khai.
   * Flow: build URL → HTTP GET → parse HTML (cheerio) → map từng message sang RawPost.
   *
   * @param channelUsername  username channel KHÔNG kèm @ (vd "photvietnam")
   * @returns CollectorResult — luôn trả về (không throw) để 1 channel lỗi không chặn cả mẻ crawl
   */
  async collect(channelUsername: string): Promise<CollectorResult> {
    // 1. Chuẩn hoá username: bỏ @ và mọi phần URL nếu lỡ truyền vào
    const channel = channelUsername.replace(/^@/, '').replace(/^.*t\.me\//, '');
    const url = `https://t.me/s/${channel}`;

    try {
      // 2. HTTP GET với timeout 20s — feed lớn (~110KB) nhưng vẫn phải chặn treo crawler
      const res = await axios.get<string>(url, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 20_000,
        responseType: 'text',
      });

      // 3. Nạp HTML vào cheerio để truy vấn theo selector giống jQuery
      const $ = cheerio.load(res.data);
      const posts: RawPost[] = [];

      // Mỗi message là 1 khối .tgme_widget_message (mang data-post="<channel>/<id>")
      $('.tgme_widget_message').each((_, el) => {
        const node = $(el);
        const dataPost = node.attr('data-post'); // vd "photvietnam/12264"
        // Bỏ qua khối không có data-post (vd block "xem thêm" hoặc message không hỗ trợ)
        if (!dataPost) return;

        // external_post_id = phần sau dấu "/" (số thứ tự message trong channel)
        const externalPostId = dataPost.split('/')[1] ?? dataPost;

        // Nội dung text: lấy text thuần, <br> → xuống dòng để giữ ngắt đoạn cho NLP đọc
        const textEl = node.find('.tgme_widget_message_text').first();
        const content = textEl.length
          ? (textEl
              .html()
              ?.replace(/<br\s*\/?>/gi, '\n')
              .replace(/<[^>]+>/g, '') // bỏ thẻ HTML còn lại
              .trim() ?? '')
          : '';

        // Bỏ qua message rỗng (chỉ ảnh/sticker, không text) — NLP không có gì để phân tích
        if (!content) return;

        // Tên channel hiển thị (tác giả post với channel = chính channel)
        const authorName =
          node.find('.tgme_widget_message_owner_name').text().trim() || channel;

        // View count: Telegram preview chỉ phơi bày lượt xem, không có like/share
        const viewsText = node.find('.tgme_widget_message_views').text();
        const viewCount = this.parseViews(viewsText);

        // Thời điểm đăng: thuộc tính datetime của <time> (ISO 8601, đã UTC)
        const datetime = node
          .find('.tgme_widget_message_date time')
          .attr('datetime');
        const publishedAt = datetime ? new Date(datetime) : null;

        // Media: Telegram nhúng ảnh qua background-image:url('...') trong style → tách bằng regex
        const mediaUrls: string[] = [];
        node.find('.tgme_widget_message_photo_wrap').each((__, p) => {
          const style = $(p).attr('style') ?? '';
          const match = style.match(/background-image:url\('([^']+)'\)/);
          if (match) mediaUrls.push(match[1]);
        });

        posts.push({
          externalPostId,
          externalGroupId: channel,
          authorName,
          content,
          mediaUrls: mediaUrls.length ? mediaUrls : undefined,
          engagement: viewCount !== undefined ? { viewCount } : undefined,
          publishedAt,
          platformSpecificData: {
            messageUrl: `https://t.me/${dataPost}`,
          },
        });
      });

      this.logger.log(
        `[t.me/s/${channel}] thu được ${posts.length} post có nội dung text`,
      );
      return { sourceLabel: channel, posts, ok: true };
    } catch (error: unknown) {
      // Trả về ok=false thay vì throw → caller ghi crawl_log lỗi và đi tiếp channel khác
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[t.me/s/${channel}] crawl lỗi: ${message}`);
      return { sourceLabel: channel, posts: [], ok: false, error: message };
    }
  }
}
