import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OsintSource } from '../entities/osint-source.entity';
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
}
