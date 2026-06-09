declare module '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';

import { OsintPost } from '../../entities/osint-post.entity';
import { OsintCrawlLog } from '../../entities/osint-crawl-log.entity';
import { NlpService } from '../nlp/nlp.service';
import { SlangDictionaryService } from '../slang-dictionary.service';
import { AlertService } from '../alert/alert.service';
import { RawPost } from '../collectors/raw-post.interface';

/** Tham số ngữ cảnh 1 mẻ ingest — biết post thuộc platform/group/crawl_type nào. */
export interface IngestContext {
  platformId: string;
  crawlType: string; // denormalized từ platform.crawlerType, ghi vào crawl_log cho dễ query
  groupId?: string | null;
  // Mặc định true. Đặt false cho RSS: bài báo đã được CrawlerProcessor tạo alert ở cấp
  // osint_articles (Sprint 1) → nếu ingest vào osint_posts lại alert nữa sẽ TRÙNG cảnh báo.
  createAlerts?: boolean;
}

/** Số liệu tổng kết 1 mẻ ingest — trả về cho caller in báo cáo demo. */
export interface IngestSummary {
  collected: number; // số post MỚI thực sự INSERT
  skipped: number; // số post bị bỏ vì đã tồn tại (dedup)
  relevant: number; // số post MỚI dính keyword ANTT
  alertsCreated: number; // số alert mới sinh ra
}

/**
 * PostIngestService — tầng NẠP dùng chung cho mọi nguồn (RSS, Telegram, Facebook...).
 *
 * Đây là điểm HỢP NHẤT của kiến trúc: bất kể post đến từ đâu, đều đổ về cùng bảng
 * osint_posts và đi qua cùng pipeline NLP → Slang → Alert. Collector chỉ lo "lấy về";
 * service này lo "chuẩn hoá + dedup + phân tích + lưu".
 */
@Injectable()
export class PostIngestService {
  private readonly logger = new Logger(PostIngestService.name);

  constructor(
    @InjectRepository(OsintPost)
    private postRepo: Repository<OsintPost>,
    @InjectRepository(OsintCrawlLog)
    private crawlLogRepo: Repository<OsintCrawlLog>,
    private nlpService: NlpService,
    private slangService: SlangDictionaryService,
    private alertService: AlertService,
  ) {}

  /** SHA-256 nội dung — phục vụ phát hiện trùng nội dung (ngoài dedup theo external id). */
  private contentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Ánh xạ độ ưu tiên keyword (1 = nóng nhất) → điểm rủi ro 0..1 để hiển thị/sắp xếp.
   * Đây là điểm rủi ro TẠM (rule-based); Sprint 5 sẽ thay bằng mô hình định lượng.
   */
  private riskFromPriority(topPriority: number | null): number {
    // Bảng tra cứng: priority càng nhỏ → rủi ro càng cao
    switch (topPriority) {
      case 1:
        return 0.9;
      case 2:
        return 0.7;
      case 3:
        return 0.5;
      case 4:
        return 0.3;
      case 5:
        return 0.15;
      default:
        return 0; // không match keyword nào
    }
  }

  /**
   * Nạp 1 mẻ RawPost vào osint_posts.
   * Flow mỗi post: dedup → NLP+Slang → tạo entity → save → tạo alert → đếm.
   */
  async ingest(
    rawPosts: RawPost[],
    ctx: IngestContext,
  ): Promise<IngestSummary> {
    const startedAt = new Date();
    const summary: IngestSummary = {
      collected: 0,
      skipped: 0,
      relevant: 0,
      alertsCreated: 0,
    };

    for (const raw of rawPosts) {
      // 1. Dedup: cùng platform + external_post_id thì coi như đã có (khớp UNIQUE constraint DB)
      const exists = await this.postRepo.findOne({
        where: {
          platformId: ctx.platformId,
          externalPostId: raw.externalPostId,
        },
      });
      if (exists) {
        summary.skipped++;
        continue; // bỏ qua, không phân tích lại để tiết kiệm
      }

      // 2. Phân tích NLP + Slang (post không có title → truyền '' cho tham số title)
      const nlp = await this.nlpService.analyzeArticle('', raw.content);
      const slang = await this.slangService.detectSlang('', raw.content);

      // 3. Dựng entity trong memory (chưa INSERT)
      const post = this.postRepo.create({
        platformId: ctx.platformId,
        groupId: ctx.groupId ?? undefined,
        externalPostId: raw.externalPostId,
        externalGroupId: raw.externalGroupId ?? undefined,
        authorName: raw.authorName ?? undefined,
        content: raw.content,
        contentHash: this.contentHash(raw.content),
        mediaUrls: raw.mediaUrls,
        engagement: raw.engagement,
        keywords: nlp.matchedKeywords,
        isRelevant: nlp.isRelevant,
        riskScore: this.riskFromPriority(nlp.topKeywordPriority),
        sourceRefIds: raw.sourceRefIds,
        platformSpecificData: raw.platformSpecificData,
        publishedAt: raw.publishedAt ?? undefined,
      });

      // 4. Persist — TypeORM gán id + timestamps. Tách try/catch để 1 post lỗi không hỏng cả mẻ.
      let saved: OsintPost;
      try {
        saved = await this.postRepo.save(post);
      } catch (e) {
        this.logger.error(
          `Lưu post ${raw.externalPostId} thất bại: ${e instanceof Error ? e.message : String(e)}`,
        );
        continue;
      }
      summary.collected++;
      if (nlp.isRelevant) summary.relevant++;

      // 5. Tạo alert (tái dùng AlertService — source_ref_ids nhận post.id, dedup 1h tự xử lý).
      //    Bỏ qua nếu createAlerts=false (RSS đã alert ở cấp article, tránh trùng).
      //    title alert = 80 ký tự đầu của nội dung (post không có tiêu đề riêng).
      if (ctx.createAlerts !== false) {
        const alertTitle = raw.content.slice(0, 80);
        const alert = await this.alertService.createAlertForArticle(
          saved.id,
          alertTitle,
          nlp,
          slang,
        );
        if (alert) summary.alertsCreated++;
      }
    }

    // 6. Ghi 1 dòng osint_crawl_logs cho cả mẻ — phục vụ health-check & truy vết về sau
    const completedAt = new Date();
    await this.crawlLogRepo.save(
      this.crawlLogRepo.create({
        platformId: ctx.platformId,
        groupId: ctx.groupId ?? undefined,
        crawlType: ctx.crawlType,
        status: 'success',
        postsCollected: summary.collected,
        postsSkipped: summary.skipped,
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      }),
    );

    return summary;
  }
}
