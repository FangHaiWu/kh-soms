import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

import { OsintPost } from '../../entities/osint-post.entity';
import { OsintPostNlp } from '../../entities/osint-post-nlp.entity';
import { OsintCrawlLog } from '../../entities/osint-crawl-log.entity';
import { RawPost } from '../collectors/raw-post.interface';
import { OsintComment } from '@modules/osint/entities/osint-comment.entity';

/** Tham số ngữ cảnh 1 mẻ ingest — biết post thuộc platform/group/crawl_type nào. */
export interface IngestContext {
  platformId: string;
  crawlType: string; // denormalized từ platform.crawlerType, ghi vào crawl_log cho dễ query
  groupId?: string | null;
  // @deprecated S5a: alert đã dời sang worker (Gate quyết định). Giữ field cho tương thích caller
  // nhưng ingest KHÔNG còn tạo alert nên cờ này hiện là no-op.
  createAlerts?: boolean;
}

/** Số liệu tổng kết 1 mẻ ingest — trả về cho caller in báo cáo demo. */
export interface IngestSummary {
  collected: number; // số post MỚI thực sự INSERT + enqueue phân tích
  skipped: number; // số post bị bỏ vì đã tồn tại (dedup)
  relevant: number; // S5a: luôn 0 ở ingest (phân tích chuyển sang worker async)
  alertsCreated: number; // S5a: luôn 0 ở ingest (alert do worker/Gate tạo)
}

/**
 * PostIngestService — tầng NẠP dùng chung cho mọi nguồn (RSS, Telegram, Facebook...).
 *
 * S5a: ingest ĐÃ MỎNG LẠI. Nhiệm vụ chỉ còn "lấy về → dedup → lưu thô → xếp hàng".
 * Toàn bộ phân tích (Normalize → NLP → Trust → Gate → alert) chuyển sang worker
 * NlpProcessProcessor qua queue 'osint-nlp' (async, tách khỏi hot-path crawl).
 */
@Injectable()
export class PostIngestService {
  private readonly logger = new Logger(PostIngestService.name);

  constructor(
    @InjectRepository(OsintPost)
    private postRepo: Repository<OsintPost>,
    @InjectRepository(OsintPostNlp)
    private postNlpRepo: Repository<OsintPostNlp>,
    @InjectRepository(OsintCrawlLog)
    private crawlLogRepo: Repository<OsintCrawlLog>,
    @InjectRepository(OsintComment)
    private commentRepo: Repository<OsintComment>,
    @InjectQueue('osint-nlp')
    private nlpQueue: Queue,
  ) {}

  /**
   * Nạp 1 mẻ RawPost vào osint_posts.
   * Flow mỗi post: dedup → lưu thô → tạo osint_post_nlp(pending) → enqueue → (lưu comment thô).
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
        continue; // đã có → không enqueue lại
      }

      // 2. Dựng entity THÔ (chưa phân tích — content_hash/keywords/isRelevant do worker ghi)
      const post = this.postRepo.create({
        platformId: ctx.platformId,
        groupId: ctx.groupId ?? undefined,
        externalPostId: raw.externalPostId,
        externalGroupId: raw.externalGroupId ?? undefined,
        authorName: raw.authorName ?? undefined,
        authorExternalId: raw.authorExternalId ?? undefined,
        content: raw.content,
        mediaUrls: raw.mediaUrls,
        engagement: raw.engagement,
        sourceRefIds: raw.sourceRefIds,
        platformSpecificData: raw.platformSpecificData,
        publishedAt: raw.publishedAt ?? undefined,
      });

      // 3. Persist post. Tách try/catch để 1 post lỗi không hỏng cả mẻ.
      let saved: OsintPost;
      try {
        saved = await this.postRepo.save(post);
      } catch (e) {
        this.logger.error(
          `Lưu post ${raw.externalPostId} thất bại: ${e instanceof Error ? e.message : String(e)}`,
        );
        continue;
      }

      // 4. Tạo hàng phân tích 'pending' + đẩy job sang worker osint-nlp.
      //    Worker lo Normalize→NLP→Trust→Gate→alert. Ingest KHÔNG phân tích/alert nữa.
      await this.postNlpRepo.save(
        this.postNlpRepo.create({
          postId: saved.id,
          processingStatus: 'pending',
        }),
      );
      await this.nlpQueue.add('process-post', { postId: saved.id });
      summary.collected++;

      // 5. Lưu comment THÔ (dedup theo unique). NLP comment để pha sau, không làm inline.
      if (!raw.comments) continue;
      for (const rawComment of raw.comments) {
        if (!rawComment.externalCommentId) continue; // tránh ghi null
        if (this.isJunkComment(rawComment.content)) continue; // bỏ rác hiển nhiên

        const comment = this.commentRepo.create({
          postId: saved.id,
          externalCommentId: rawComment.externalCommentId,
          authorName: rawComment.authorName,
          authorExternalId: rawComment.authorExternalId,
          content: rawComment.content,
          depth: rawComment.depth ?? 0,
        });
        try {
          await this.commentRepo.save(comment);
        } catch (e: any) {
          if (e?.code === '23505') continue; // đã có comment này → dedup, im lặng
          this.logger.error(
            `Lưu comment ${comment.externalCommentId} thất bại: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }

    // 6. Ghi 1 dòng osint_crawl_logs cho cả mẻ — phục vụ health-check & truy vết
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

  // Comment rác hiển nhiên: rỗng/quá ngắn hoặc chỉ emoji/dấu câu, hoặc cụm nút UI
  private isJunkComment(content: string): boolean {
    const t = content.trim();
    if (t.length < 10) return true; // quá ngắn
    if (!/\p{L}/u.test(t)) return true; // không có chữ (chỉ emoji/số/dấu)
    if (/^(thích|trả lời|chia sẻ|like|reply|share)\b/i.test(t)) return true; // text nút UI
    return false;
  }
}
