import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OsintGroup } from '../../entities/osint-group.entity';
import { OsintPlatform } from '../../entities/osint-platform.entity';
import { TelegramPublicCollector } from '../collectors/telegram-public.collector';
import { PostIngestService } from '../ingest/post-ingest.service';

/**
 * TelegramCrawlProcessor — worker nền xử lý 1 job = 1 channel Telegram.
 *
 * Tách riêng khỏi CrawlerProcessor (RSS) để 1 channel Telegram lỗi/treo KHÔNG ảnh hưởng
 * luồng RSS. Cùng dùng queue 'osint-crawl' nhưng job name khác ('crawl-telegram-group'),
 * nên @nestjs/bull tự định tuyến đúng handler.
 */
@Processor('osint-crawl')
export class TelegramCrawlProcessor {
  private readonly logger = new Logger(TelegramCrawlProcessor.name);

  constructor(
    @InjectRepository(OsintGroup)
    private groupRepo: Repository<OsintGroup>,
    @InjectRepository(OsintPlatform)
    private platformRepo: Repository<OsintPlatform>,
    private collector: TelegramPublicCollector,
    private ingest: PostIngestService,
  ) {}

  /**
   * Crawl 1 channel Telegram public rồi nạp vào osint_posts.
   * Flow: load group → guard active → collect t.me/s → ingest → cập nhật last_crawled_at.
   */
  @Process('crawl-telegram-group')
  async handleCrawlTelegramGroup(job: Job<{ groupId: string }>) {
    const { groupId } = job.data;

    // 1. Load group; bỏ qua nếu không tồn tại hoặc đã bị tắt (admin có thể tắt giữa chừng)
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) {
      this.logger.warn(`Group ${groupId} không tồn tại — bỏ qua`);
      return;
    }
    if (!group.isActive) {
      this.logger.warn(`Group ${group.name} đang tắt — bỏ qua`);
      return;
    }

    // 2. Lấy platform để có platform_id + crawler_type (denormalized vào crawl_log)
    const platform = await this.platformRepo.findOne({
      where: { id: group.platformId },
    });
    if (!platform) {
      this.logger.warn(
        `Platform của group ${group.name} không tồn tại — bỏ qua`,
      );
      return;
    }

    // 3. Crawl t.me/s — collector trả ok=false thay vì throw nên job không bị Bull retry vô ích
    const result = await this.collector.collect(group.externalGroupId);
    if (!result.ok) {
      this.logger.error(`Crawl @${group.externalGroupId} lỗi: ${result.error}`);
      return;
    }

    // 4. Nạp vào osint_posts qua pipeline chung (dedup + NLP + alert + crawl_log)
    const summary = await this.ingest.ingest(result.posts, {
      platformId: platform.id,
      crawlType: platform.crawlerType,
      groupId: group.id,
    });

    // 5. Đánh dấu thời điểm crawl gần nhất — phục vụ health-check & lên lịch lần sau
    group.lastCrawledAt = new Date();
    await this.groupRepo.save(group);

    this.logger.log(
      `[@${group.externalGroupId}] +${summary.collected} post mới, ` +
        `${summary.skipped} trùng, ${summary.alertsCreated} alert`,
    );
    return summary;
  }
}
