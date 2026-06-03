import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OsintPlatform } from './osint-platform.entity';
import { OsintGroup } from './osint-group.entity';

@Entity({ name: 'osint_crawl_logs', schema: 'osint' })
export class OsintCrawlLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'platform_id', nullable: true })
  platformId: string;

  // null = không thuộc group cụ thể (VD: bulk crawl)
  @Column('uuid', { name: 'group_id', nullable: true })
  groupId: string;

  // Derived từ OsintPlatform.crawlerType — denormalized để query nhanh
  @Column('varchar', { length: 50, name: 'crawl_type', nullable: true })
  crawlType: string;

  @Column('varchar', { length: 20, nullable: false })
  status: string;

  @Column('integer', { name: 'posts_collected', default: 0 })
  postsCollected: number;

  @Column('integer', { name: 'posts_skipped', default: 0 })
  postsSkipped: number;

  @Column('integer', { name: 'comments_collected', nullable: true })
  commentsCollected: number;

  @Column('text', { name: 'error_message', nullable: true })
  errorMessage: string;

  // HTTP_429, CHECKPOINT, API_ERROR, TIMEOUT, AUTH_FAILED, RATE_LIMITED
  @Column('varchar', { length: 50, name: 'error_code', nullable: true })
  errorCode: string;

  @Column('timestamptz', { name: 'started_at', nullable: false })
  startedAt: Date;

  @Column('timestamptz', { name: 'completed_at', nullable: true })
  completedAt: Date;

  @Column('integer', { name: 'duration_ms', nullable: true })
  durationMs: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => OsintPlatform, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'platform_id' })
  platform: OsintPlatform;

  @ManyToOne(() => OsintGroup, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'group_id' })
  group: OsintGroup;
}
