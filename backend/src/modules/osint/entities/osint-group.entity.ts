import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { OsintPlatform } from './osint-platform.entity';
import { OsintPost } from './osint-post.entity';

@Entity({ name: 'osint_groups', schema: 'osint' })
export class OsintGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'platform_id', nullable: false })
  platformId: string;

  @Column('varchar', {
    length: 100,
    name: 'external_group_id',
    nullable: true,
  })
  externalGroupId: string;

  @Column('varchar', { length: 200, nullable: false })
  name: string;

  @Column('varchar', { length: 500, nullable: false })
  url: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('integer', { name: 'member_count', nullable: true })
  memberCount: number;

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;

  @Column('timestamptz', { name: 'last_crawled_at', nullable: true })
  lastCrawledAt: Date;

  // null = dùng crawlIntervalMinutesDefault từ platform
  @Column('integer', { name: 'crawl_interval_hours', nullable: true })
  crawlIntervalHours: number;

  @Column('smallint', { name: 'trust_level', default: 3 })
  trustLevel: number;

  @Column('text', { array: true, nullable: true })
  tags: string[];

  // Lưu fields đặc thù từng platform
  // Facebook: {isPublic, hasApproval, category}
  // Telegram: {isChannel, followerCount}
  // TikTok:   {followerCount, videoCount, verificationBadge}
  // Reddit:   {subscribers, isNsfw}
  @Column('jsonb', { name: 'platform_specific_data', nullable: true })
  platformSpecificData: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => OsintPlatform, (platform) => platform.groups, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'platform_id' })
  platform: OsintPlatform;

  @OneToMany(() => OsintPost, (post) => post.group)
  posts: OsintPost[];
}
