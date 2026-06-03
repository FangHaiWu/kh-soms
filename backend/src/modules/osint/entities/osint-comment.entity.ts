import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { OsintPost } from './osint-post.entity';

@Entity({ name: 'osint_comments', schema: 'osint' })
export class OsintComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'post_id', nullable: false })
  postId: string;

  @Column('varchar', {
    length: 100,
    name: 'external_comment_id',
    nullable: true,
  })
  externalCommentId: string;

  // null = top-level comment (depth 0)
  @Column('uuid', { name: 'parent_comment_id', nullable: true })
  parentCommentId: string;

  // 0 = top-level, 1 = reply, 2+ = nested reply
  @Column('smallint', { default: 0 })
  depth: number;

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

  @Column('jsonb', { nullable: true })
  engagement: {
    likes?: number;
    reactions?: Record<string, number>;
    [key: string]: unknown;
  };

  // Platform-specific comment data (TikTok duets, Threads reply context, etc.)
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

  @ManyToOne(() => OsintPost, (post) => post.comments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'post_id' })
  post: OsintPost;

  // Self-reference: comment cha
  @ManyToOne(() => OsintComment, (comment) => comment.children, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parent_comment_id' })
  parent: OsintComment;

  // Self-reference: các comment con
  @OneToMany(() => OsintComment, (comment) => comment.parent)
  children: OsintComment[];
}
