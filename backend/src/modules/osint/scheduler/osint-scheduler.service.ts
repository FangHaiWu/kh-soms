import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OsintSource } from '../entities/osint-source.entity';
import { OsintGroup } from '../entities/osint-group.entity';
import { OsintPlatform } from '../entities/osint-platform.entity';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class OsintSchedulerService {
  private readonly logger = new Logger(OsintSchedulerService.name);
  constructor(
    @InjectQueue('osint-crawl') private crawlQueue: Queue,
    @InjectRepository(OsintSource)
    private sourceRepo: Repository<OsintSource>,
    @InjectRepository(OsintGroup)
    private groupRepo: Repository<OsintGroup>,
    @InjectRepository(OsintPlatform)
    private platformRepo: Repository<OsintPlatform>,
  ) {}

  // Cron job chay moi 1h (co the dieu chinh thoi gian tuong ung)
  @Cron('0 */15 * * * *') // Chạy moi 15 phut
  async scheduleCrawl() {
    this.logger.log('Bắt đầu công việc định kỳ: Crawl dữ liệu OSINT');
    // Lay tat ca source co isActive = true
    const sources = await this.sourceRepo.find({ where: { isActive: true } });
    // Day tung source vao queue de crawl
    for (const source of sources) {
      await this.crawlQueue.add('crawl-source', { sourceId: source.id });
    }
    this.logger.log(`Đã len lich crawl ${sources.length} nguồn tin active`);
  }

  // Telegram crawl mỗi 30 phút (khớp crawl_interval_minutes_default của platform telegram).
  // 6 trường: token đầu là GIÂY → '0 */30 * * * *' = giây 0, mỗi 30 phút (KHÔNG phải mỗi 30 giây).
  @Cron('0 */30 * * * *')
  async scheduleTelegramCrawl() {
    // Chỉ crawl group thuộc platform telegram + đang active → mỗi group 1 job riêng (cô lập lỗi)
    const telegram = await this.platformRepo.findOne({
      where: { name: 'telegram' },
    });
    // Guard: thiếu platform telegram (chưa seed) thì bỏ qua, không làm sập cron
    if (!telegram) return;

    const groups = await this.groupRepo.find({
      where: { platformId: telegram.id, isActive: true },
    });
    // Đẩy 1 job/channel; việc nặng (HTTP + parse + NLP) do TelegramCrawlProcessor xử lý nền
    for (const group of groups) {
      await this.crawlQueue.add('crawl-telegram-group', { groupId: group.id });
    }
    this.logger.log(`Đã lên lịch crawl ${groups.length} channel Telegram active`);
  }
}
