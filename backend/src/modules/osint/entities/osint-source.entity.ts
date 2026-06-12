import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { OsintArticle } from './osint-article.entity';
import { DiscoveryConfig } from '../services/collectors/news-crawl.collector';
@Entity({ name: 'osint_sources', schema: 'osint' })
export class OsintSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'name', length: 200, nullable: false })
  name: string;

  @Column('varchar', { length: 500, nullable: false })
  url: string;

  @Column('varchar', { length: 50, nullable: false })
  type: string;

  @Column('varchar', { length: 500, name: 'rss_feed_url', nullable: true })
  rssFeedUrl: string;

  @Column('boolean', { default: true, name: 'is_active' })
  isActive: boolean;

  @Column({ type: 'int', default: 15, name: 'crawl_interval_minutes' })
  crawlIntervalMinutes: number;

  @Column({
    type: 'timestamptz',
    name: 'last_crawled_at',
    nullable: true,
  })
  lastCrawledAt: Date;

  @Column({ type: 'smallint', default: 3, name: 'trust_level' })
  trustLevel: number;

  // Cấu hình cách tìm URL bài cho nguồn này (method + tham số). null = mặc định selector
  @Column('jsonb', { name: 'discovery_config', nullable: true })
  discoveryConfig: DiscoveryConfig | null;

  @CreateDateColumn({
    type: 'timestamptz',

    name: 'created_at',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',

    name: 'updated_at',
  })
  updatedAt: Date;

  @OneToMany(() => OsintArticle, (article) => article.source)
  articles: OsintArticle[];
}
