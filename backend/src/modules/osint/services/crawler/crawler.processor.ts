import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { CrawlerService } from './crawler.service';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NlpService } from '../nlp/nlp.service';
import { SlangDictionaryService } from '../slang-dictionary.service';
import { AlertService } from '../alert/alert.service';
import { OsintArticle } from '../../entities/osint-article.entity';
import { OsintSource } from '../../entities/osint-source.entity';
import { OsintPlatform } from '../../entities/osint-platform.entity';
import { PostIngestService } from '../ingest/post-ingest.service';
import { RawPost } from '../collectors/raw-post.interface';

@Processor('osint-crawl')
export class CrawlerProcessor {
  private readonly logger = new Logger(CrawlerProcessor.name);
  // Cache id platform 'rss' để khỏi query lại mỗi lần crawl (platform là seed cứng, không đổi)
  private rssPlatformId: string | null = null;

  constructor(
    private crawlerService: CrawlerService,
    private nlpService: NlpService,
    private slangDictionaryService: SlangDictionaryService,
    private alertService: AlertService,
    private postIngestService: PostIngestService,
    @InjectRepository(OsintArticle)
    private articleRepo: Repository<OsintArticle>,
    @InjectRepository(OsintSource)
    private sourceRepo: Repository<OsintSource>,
    @InjectRepository(OsintPlatform)
    private platformRepo: Repository<OsintPlatform>,
  ) {}

  // Lấy + cache id platform 'rss'. Trả null nếu chưa seed (caller sẽ bỏ qua bước hợp nhất).
  private async getRssPlatformId(): Promise<string | null> {
    if (this.rssPlatformId) return this.rssPlatformId;
    const rss = await this.platformRepo.findOne({ where: { name: 'rss' } });
    this.rssPlatformId = rss?.id ?? null;
    return this.rssPlatformId;
  }
  @Process('crawl-source')
  async handleCrawlSource(job: Job<{ sourceId: string }>) {
    const { sourceId } = job.data;

    // load source theo sourceId
    const source = await this.sourceRepo.findOne({ where: { id: sourceId } });
    if (!source) {
      this.logger.warn(`Nguồn tin với id ${sourceId} không tồn tại`);
      return;
    }
    // crawl dữ liệu từ source -> Danh sach bai moi
    this.logger.log(
      `Bắt đầu crawl nguồn "${source.name}" — feed: ${source.rssFeedUrl ?? '(chưa cấu hình RSS)'}`,
    );
    const newArticles = await this.crawlerService.crawlRssFeed(source);

    // Phan tich va cap nhat tung bai
    for (const article of newArticles) {
      // Phân tích NLP
      const nlpResult = await this.nlpService.analyzeArticle(
        article.title,
        article.content,
      );

      // Phân tích slang
      const slangResult = await this.slangDictionaryService.detectSlang(
        article.title,
        article.content,
      );
      // Cap nhat bai
      article.isRelevant = nlpResult.isRelevant;
      article.keywords = nlpResult.matchedKeywords;
      await this.articleRepo.save(article);

      // tao alert (tu dedup trong AlertService)
      // Neu bai viet khong co keyword lien quan + khong phat hien slang thi se khong tao alert (de tranh qua nhieu alert vo nghia)
      await this.alertService.createAlertForArticle(
        article.id,
        article.title,
        nlpResult,
        slangResult,
      );
    }
    // Hợp nhất bài RSS mới vào osint_posts (bảng thống nhất cho NLP/report cùng MXH).
    // createAlerts=false: alert đã tạo ở cấp article phía trên → tránh cảnh báo trùng.
    if (newArticles.length > 0) {
      const rssPlatformId = await this.getRssPlatformId();
      if (rssPlatformId) {
        // Map article → RawPost; sourceRefIds truy vết ngược về bài gốc (kiến trúc Hướng A)
        const rawPosts: RawPost[] = newArticles.map((a) => ({
          externalPostId: a.id,
          externalGroupId: null, // RSS không có khái niệm group
          authorName: a.author || null,
          content: `${a.title}\n${a.content ?? ''}`.trim(),
          publishedAt: a.publishedAt,
          sourceRefIds: [a.id],
          platformSpecificData: { url: a.url },
        }));
        await this.postIngestService.ingest(rawPosts, {
          platformId: rssPlatformId,
          crawlType: 'rss_feedparser',
          groupId: null,
          createAlerts: false,
        });
      } else {
        // Thiếu platform 'rss' (chưa seed) → chỉ cảnh báo, KHÔNG làm hỏng luồng crawl article
        this.logger.warn(
          'Chưa seed platform rss → bỏ qua bước hợp nhất osint_posts',
        );
      }
    }

    // log + return tom tat
    this.logger.log(
      `Nguồn ${sourceId} xử lý ${newArticles.length} bài mới`,
    );
    return {
      sourceId,
      processed: newArticles.length,
    };
  }
}
