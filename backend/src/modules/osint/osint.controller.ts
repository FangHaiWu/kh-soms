import {
  Controller,
  Get,
  Post,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Repository } from 'typeorm';
import { OsintService } from './osint.service';
import { OsintPost } from './entities/osint-post.entity';
import { OsintPostNlp } from './entities/osint-post-nlp.entity';
import { OsintGroup } from './entities/osint-group.entity';

@Controller('osint')
export class OsintController {
  constructor(
    private readonly osintService: OsintService,
    @InjectRepository(OsintPost)
    private readonly postRepo: Repository<OsintPost>,
    @InjectRepository(OsintPostNlp)
    private readonly postNlpRepo: Repository<OsintPostNlp>,
    @InjectRepository(OsintGroup)
    private readonly groupRepo: Repository<OsintGroup>,
    @InjectQueue('osint-nlp')
    private readonly nlpQueue: Queue,
    @InjectQueue('osint-crawl')
    private readonly crawlQueue: Queue,
  ) {}

  // API lay danh sach cac nguon theo doi
  @Get('sources')
  getSources() {
    return this.osintService.getSources();
  }

  // API lay danh sach cac article moi nhat
  @Get('articles')
  getArticles() {
    return this.osintService.getArticles();
  }

  // API lay danh sach cac canh bao chua duoc xac nhan
  @Get('alerts')
  getAlerts() {
    return this.osintService.getAlerts();
  }

  // API lay danh sach cac tu khoa
  @Get('keywords')
  getKeywords() {
    return this.osintService.getKeywords();
  }

  /**
   * [DEV/TEST] Đẩy lại 1 post qua pipeline NLP (queue osint-nlp).
   * Dùng để test thực tế S5a: POST /api/v1/osint/nlp/reprocess/:postId
   * Flow: kiểm post tồn tại → reset hàng nlp về 'pending' → enqueue 'process-post'.
   */
  @Post('nlp/reprocess/:postId')
  async reprocessNlp(@Param('postId') postId: string) {
    // 1. Guard: post phải tồn tại (tránh enqueue job cho id rác)
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException(`Không thấy post ${postId}`);

    // 2. Đưa hàng nlp về 'pending' (tạo mới nếu chưa có) — phản ánh trạng thái sắp xử lý
    let nlp = await this.postNlpRepo.findOne({ where: { postId } });
    if (!nlp) nlp = this.postNlpRepo.create({ postId });
    nlp.processingStatus = 'pending';
    await this.postNlpRepo.save(nlp);

    // 3. Enqueue vào queue thật → worker NlpProcessProcessor sẽ nhả job
    const job = await this.nlpQueue.add('process-post', { postId });
    return {
      message: 'Đã đẩy job phân tích NLP',
      jobId: job.id,
      postId,
    };
  }

  /**
   * [DEV/TEST] Kích crawl NGAY 1 group Facebook (không chờ cron EVERY_HOUR).
   * Dùng để test có kiểm soát collector feed-inline: POST /api/v1/osint/crawl/facebook/:groupId
   * Flow: kiểm group tồn tại + đúng platform facebook → enqueue 'crawl-facebook-group'.
   * KHÔNG tự bật is_active — chỉ đẩy 1 job crawl thủ công cho group này.
   */
  @Post('crawl/facebook/:groupId')
  async crawlFacebookGroup(@Param('groupId') groupId: string) {
    // 1. Guard: group phải tồn tại (tránh enqueue job cho id rác)
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Không thấy group ${groupId}`);

    // 2. Enqueue vào queue crawl thật → FacebookCrawlProcessor sẽ nhả job
    const job = await this.crawlQueue.add('crawl-facebook-group', { groupId });
    return {
      message: 'Đã đẩy job crawl Facebook',
      jobId: job.id,
      group: group.name,
      url: group.url,
    };
  }
}
