// If TypeScript cannot find @nestjs/common types in some environments,
// provide a minimal ambient module declaration to avoid build errors.
declare module '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
// import rss-parser library
import Parser from 'rss-parser';
// import SHA-256 hashing function
import { createHash } from 'crypto';

// Import entities
import { OsintArticle } from '../../entities/osint-article.entity';
import { OsintSource } from '../../entities/osint-source.entity';

@Injectable()
export class CrawlerService {
  private readonly logger: Logger = new Logger(CrawlerService.name);
  private parser: Parser = new Parser(); // Khoi tao parser RSS
  constructor(
    @InjectRepository(OsintArticle)
    private articleRepo: Repository<OsintArticle>,
  ) {}

  private generateContentHash(title: string, content: string): string {
    // Khoi tao thuat toan SHA-256
    const hash = createHash('sha256')
      .update(title + content) // Cap nhat du lieu can hash (noi chuoi content va title de tang do phong phu)
      .digest('hex'); // Lay hash duoi dang hex
    return hash;
  }

  private async isArticleExist(url: string): Promise<boolean> {
    const article = await this.articleRepo.findOne({ where: { url } });

    return !!article; // Tra ve true neu tim thay, nguoc lai tra ve false
  }

  // Lay du lieu tu Rss Feed cua tung source, luu vao database
  async crawlRssFeed(source: OsintSource): Promise<OsintArticle[]> {
    // 1. Guard: Neu khong co rssFeedUrl thi khong the crawl
    if (!source.rssFeedUrl) {
      this.logger.warn(`Source ${source.name} khong co Rss Feed. Bo qua`);
      return [];
    }
    // 2. Parse Rss Feed - dung try/catch vi co the timeout, 404...
    try {
      const feed = await this.parser.parseURL(source.rssFeedUrl);
      const savedArticles: OsintArticle[] = [];
      for (const item of feed.items) {
        // Bo qua neu da ton tai
        if (!item.link || (await this.isArticleExist(item.link))) continue;

        const title = item.title ?? '';
        const content = item.content ?? item.contentSnippet ?? '';
        const entity = this.articleRepo.create({
          sourceId: source.id,
          title,
          content,
          url: item.link,
          author: item.creator ?? '',
          publishedAt: new Date(item.pubDate ?? Date.now()),
          contentHash: this.generateContentHash(title, content),
          language: 'vi',
          relevanceScore: 0,
        });
        const saved = await this.articleRepo.save(entity);
        // save() tra ve article da duoc luu trong database, co id va cac truong khac da duoc cap nhat
        savedArticles.push(saved);
      }
      this.logger.log(
        `[${source.name}] Crawled ${feed.items.length} items, saved ${savedArticles.length} new articles`,
      );
      return savedArticles;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Loi khi crawl Rss Feed tu source ${source.name}: ${message}`,
      );
      return [];
    }
  }
}
