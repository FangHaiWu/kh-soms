import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Unique,
} from 'typeorm';
import { OsintGroup } from './osint-group.entity';

@Entity({ name: 'osint_platforms', schema: 'osint' })
@Unique(['name'])
export class OsintPlatform {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 50, nullable: false })
  name: string;

  @Column('varchar', { length: 200, name: 'display_name', nullable: false })
  displayName: string;

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;

  @Column('varchar', { length: 100, name: 'crawler_type', nullable: false })
  crawlerType: string;

  @Column('jsonb', { name: 'platform_settings', nullable: true })
  platformSettings: {
    maxConcurrency?: number;
    requestDelayMs?: number;
    rateLimit?: {
      requestsPerHour?: number;
      requestsPerDay?: number;
      requestsPerMinute?: number;
      requestsPerSecond?: number;
    };
    mediaTypes?: string[];
    maxMediaUrls?: number;
    extractComments?: boolean;
    commentDepthLimit?: number;
    customHeaders?: Record<string, string>;
    timeoutMs?: number;
    retryAttempts?: number;
    proxy?: string;
    antiDetection?: {
      viewportVariations?: number;
      userAgents?: number;
      mouseMovement?: boolean;
      scrollPattern?: boolean;
    };
    [key: string]: unknown;
  };

  @Column('integer', {
    name: 'crawl_interval_minutes_default',
    default: 180,
  })
  crawlIntervalMinutesDefault: number;

  @Column('smallint', { name: 'trust_level', default: 3 })
  trustLevel: number;

  @Column('varchar', {
    length: 500,
    name: 'documentation_url',
    nullable: true,
  })
  documentationUrl: string;

  @Column('text', { nullable: true })
  notes: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => OsintGroup, (group) => group.platform)
  groups: OsintGroup[];
}
