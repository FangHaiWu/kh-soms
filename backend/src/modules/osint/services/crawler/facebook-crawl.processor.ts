import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OsintGroup } from '../../entities/osint-group.entity';
import { OsintPlatform } from '../../entities/osint-platform.entity';
import { FacebookCollector } from '@modules/osint/services/facebook/facebook.collector';
import { FacebookAccountManager } from '@modules/osint/services/facebook/facebook-account-manager.service';
import { PostIngestService } from '../ingest/post-ingest.service';
import { AlertService } from '../alert/alert.service';

/**
 * FacebookCrawlProcessor — worker nền xử lý 1 job = 1 group/page Facebook.
 *
 * Tách riêng khỏi CrawlerProcessor (RSS) + TelegramCrawlProcessor để 1 group FB lỗi/treo
 * KHÔNG ảnh hưởng luồng khác. Cùng dùng queue 'osint-crawl' nhưng job name khác
 * ('crawl-facebook-group'), nên @nestjs/bull tự định tuyến đúng handler.
 */
@Processor('osint-crawl')
export class FacebookCrawlProcessor {
  private readonly logger = new Logger(FacebookCrawlProcessor.name);

  constructor(
    @InjectRepository(OsintGroup)
    private groupRepo: Repository<OsintGroup>,
    @InjectRepository(OsintPlatform)
    private platformRepo: Repository<OsintPlatform>,
    private accountManager: FacebookAccountManager,
    private collector: FacebookCollector,
    private ingest: PostIngestService,
    private alertService: AlertService,
  ) {}

  /**
   * Crawl 1 group/page Facebook công khai rồi nạp vào osint_posts.
   * Flow: pick account → load group → guard active → collect → ingest → cập nhật last_crawled_at.
   */
  @Process('crawl-facebook-group')
  async handleCrawlFacebookGroup(job: Job<{ groupId: string }>) {
    const { groupId } = job.data;

    // Đăng nhập
    const account = await this.accountManager.pickAvailable();
    if (!account) {
      this.logger.warn('Không có acct Facebook active - bỏ qua');
      await this.alertService.createSystemAlert({
        alertType: 'fb_account_exhausted',
        severity: 'critical',
        title:
          'Pool tài khoản Facebook đã cạn - mọi acct đều checkpoint/retired',
        description:
          'Không còn tài khoản Facebook nào active để crawl group/page công khai. Vui lòng kiểm tra pool tài khoản.',
        dedupWindowMinutes: 30, // tránh spam alert nếu nhiều job cùng lúc
      });
      return; // cả pool checkpoint/retired -> tránh đốt acct
    }

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

    // 3. Crawl group — collector trả ok=false thay vì throw nên job không bị Bull retry vô ích
    const result = await this.collector.collect(account, group.url);
    if (result.needsRelogin) {
      // Session hết hạn: auth đã markNeedsRelogin + alert admin → chỉ log, KHÔNG mark lần 2
      this.logger.warn(
        `[${group.name} acct ${account.label}] session hết hạn, cần capture lại (đã alert admin)`,
      );
      return;
    }
    if (!result.ok) {
      this.logger.error(`Crawl ${group.name} lỗi: ${result.error}`);
      return;
    }
    await this.accountManager.recordUsage(account.id); // Đếm quota ngày

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
      `[${group.name}] +${summary.collected} post mới, ` +
        `${summary.skipped} trùng, ${summary.alertsCreated} alert`,
    );
    return summary;
  }
}
