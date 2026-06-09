import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { RawPost, CollectorResult } from './raw-post.interface';
import {
  ExtractedArticle,
  NewsExtractorBridgeService,
} from '../news-extractor/news-extractor-brigde.service';
@Injectable()
export class NewsCrawlCollector {
  private readonly logger = new Logger(NewsCrawlCollector.name);
  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  constructor(private readonly brigde: NewsExtractorBridgeService) {}

  /*
collect(categoryUrl)
  → 1. Tải HTML trang chuyên mục (axios)
  → 2. Discovery: regex/cheerio lấy danh sách URL bài
  → 3. Lọc trùng + giới hạn số bài (vd 10 bài/lần)
  → 4. Với mỗi URL: gọi bridge.extract(url)  (rate limit ≤1 req/s!)
       - null → skip (bài hỏng)
       - có data → map sang RawPost
  → 5. return CollectorResult { sourceLabel, posts, ok }
*/

  async collect(categoryUrl: string): Promise<CollectorResult> {
    // Lấy domain làm nhãn nguồn ('vd: baokhanhhoa.vn')
    const domain = new URL(categoryUrl).hostname.replace(/^www\./, '');
    try {
      // 1. Tải HTML trang chuyên mục (axios)
      const { data: html } = await axios.get(categoryUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 15_000,
        responseType: 'text',
      });
      // 2. Discovery Url bai - Dung cheerio chon <a href> bai viet
      // baokhanhhoa.vn link bai viet co dang .../202606...-<hash>/
      const urls = this.extractArticleUrls(html, categoryUrl);

      // 3. Lọc trùng + giới hạn số bài (vd 10 bài/lần)
      const uniqueUrls = [...urls].slice(0, 10);
      const posts: RawPost[] = [];

      // 4. Bóc từng bài, GIÃN CÁCH > 1s/req
      for (const url of uniqueUrls) {
        const article = await this.brigde.extract(url);
        if (!article) continue; // skip -> bài hỏng
        posts.push(this.toRawPost(article));
        await this.sleep(1_000); // rate limit <=1 req/s
      }

      // 5. return CollectorResult { sourceLabel, posts, ok }
      return {
        sourceLabel: domain,
        posts,
        ok: true,
      };
    } catch (error) {
      // Lỗi tải trang chuyên mục
      if (axios.isAxiosError(error)) {
        if (error.response) {
          this.logger.warn(
            `Collect lỗi: ${error.response.status} cho ${categoryUrl}: ${error.response.data?.detail}`,
          );
        } else {
          // Khong co response = khong ket noi duoc -> service python chet/sai url
          this.logger.error(
            `Không gọi được news-extractor cho ${categoryUrl}: ${error.message}`,
          );
        }
      } else {
        // Lỗi lạ ngoài axios
        this.logger.error(
          `Lỗi không xác định khi collect ${categoryUrl}: ${String(error)}`,
        );
      }
      return {
        sourceLabel: domain,
        posts: [],
        ok: false,
        error: String(error),
      };
    }
  }
  // Map ExtractedArticle -> RawPost
  private toRawPost(article: ExtractedArticle): RawPost {
    return {
      externalPostId: article.url, // URL làm Id duy nhất cho bài viết
      authorName: article.author,
      content: article.content ?? article.title ?? '', // Không có content -> lấy title -> title rỗng -> lấy ''
      mediaUrls: [],
      engagement: {}, // Vì thường web báo không có view/like công khai
      publishedAt: article.publishedDate
        ? new Date(article.publishedDate)
        : new Date(), // Nếu không có ngày đăng bài thì lấy ngày hiện tại
      sourceRefIds: [],
      platformSpecificData: {
        title: article.title,
        url: article.url,
      },
    };
  }

  // Lấy danh sách URL bài từ HTML trang chuyên mục
  // Input: html (chuỗi), baseUrl (vd "https://baokhanhhoa.vn") để ghép Url tương đối -> tuyệt đối
  // Output: danh sách URL tuyệt đối, đã lọc đúng bài + bỏ trùng
  private extractArticleUrls(html: string, baseUrl: string): Set<string> {
    // 1. Nạp HTML vào cheerio dể truy vấn theo selector giống jQuery
    const $ = cheerio.load(html);
    // urls là kiểu dữ liệu Set sử dụng cho lọc trùng
    const urls: Set<string> = new Set();
    // Regex nhận diện URL bài: có /20xxxx/ ở giữa
    // Loại link menu/chuyên mục vì không có đoạn này
    const articlePattern = /\/20\d{4}\//;
    $('a.title2').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return; // skip
      // Nếu href không khớp article pattern -> return
      if (!articlePattern.test(href)) return; // Kiểm tra href có chứa article pattern hay không

      // Ghép thành URL tuyệt đối
      const url = new URL(href, baseUrl).toString();
      // push URL tuyệt đối vào mảng urls
      urls.add(url);
    });
    return urls;
  }

  // Giải quyet bài toán rate limit
  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
