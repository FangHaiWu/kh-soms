import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  OneToOne,
  Unique,
} from 'typeorm';
import { OsintPlatform } from './osint-platform.entity';
import { OsintGroup } from './osint-group.entity';
import { OsintComment } from './osint-comment.entity';
import { OsintPostNlp } from './osint-post-nlp.entity';

@Entity({ name: 'osint_posts', schema: 'osint' })
@Unique(['platformId', 'externalPostId'])
export class OsintPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'platform_id', nullable: false })
  platformId: string;

  @Column('uuid', { name: 'group_id', nullable: true })
  groupId: string;

  @Column('varchar', { length: 500, name: 'external_post_id', nullable: true })
  externalPostId: string;

  @Column('varchar', {
    length: 100,
    name: 'external_group_id',
    nullable: true,
  })
  externalGroupId: string;

  @Column('varchar', { length: 200, name: 'author_name', nullable: true })
  authorName: string;

  @Column('varchar', {
    length: 100,
    name: 'author_external_id',
    nullable: true,
  })
  authorExternalId: string;

  @Column('text', { nullable: false })
  content: string;

  @Column('varchar', { length: 64, name: 'content_hash', nullable: true })
  contentHash: string;

  @Column('text', { array: true, name: 'media_urls', nullable: true })
  mediaUrls: string[];

  // Unified engagement schema across all platforms
  // {likes, shares, reposts, reactions: {like, love, haha}, commentCount, viewCount}
  @Column('jsonb', { nullable: true })
  engagement: {
    likes?: number;
    shares?: number;
    reposts?: number;
    reactions?: Record<string, number>;
    commentCount?: number;
    viewCount?: number;
    [key: string]: unknown;
  };

  @Column('integer', { name: 'comment_count', nullable: true })
  commentCount: number;

  @Column('integer', { name: 'nested_comment_count', nullable: true })
  nestedCommentCount: number;

  @Column('text', { array: true, nullable: true })
  keywords: string[];

  @Column('float', { name: 'risk_score', nullable: true })
  riskScore: number;

  @Column('varchar', { length: 50, name: 'topic_category', nullable: true })
  topicCategory: string;

  @Column('boolean', { name: 'is_relevant', default: false })
  isRelevant: boolean;

  // Links tới osint_articles nếu post từ RSS
  @Column('uuid', { array: true, name: 'source_ref_ids', nullable: true })
  sourceRefIds: string[];

  // Fields đặc thù từng platform
  // TikTok:  {soundId, hashtags, effectId, duration}
  // Reddit:  {subreddit, awards, flair}
  // Threads: {canReply, isCaption}
  // YouTube: {videoId, channelId, duration, thumbnailUrl}
  @Column('jsonb', { name: 'platform_specific_data', nullable: true })
  platformSpecificData: Record<string, unknown>;

  @Column('timestamptz', {
    name: 'crawled_at',
    default: () => 'NOW()',
  })
  crawledAt: Date;

  @Column('timestamptz', { name: 'published_at', nullable: true })
  publishedAt: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => OsintPlatform, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'platform_id' })
  platform: OsintPlatform;

  @ManyToOne(() => OsintGroup, (group) => group.posts, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'group_id' })
  group: OsintGroup;

  @OneToMany(() => OsintComment, (comment) => comment.post)
  comments: OsintComment[];

  @OneToOne(() => OsintPostNlp, (nlp) => nlp.post)
  nlp: OsintPostNlp;
}
