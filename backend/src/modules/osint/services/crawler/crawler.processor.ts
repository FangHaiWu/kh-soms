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

@Processor('osint-crawl')
export class CrawlerProcessor {
  private readonly logger = new Logger(CrawlerProcessor.name);
  constructor(
    private crawlerService: CrawlerService,
    private nlpService: NlpService,
    private slangDictionaryService: SlangDictionaryService,
    private alertService: AlertService,
    @InjectRepository(OsintArticle)
    private articleRepo: Repository<OsintArticle>,
    @InjectRepository(OsintSource)
    private sourceRepo: Repository<OsintSource>,
  ) {}
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
