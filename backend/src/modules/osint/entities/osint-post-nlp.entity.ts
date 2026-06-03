import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { OsintPost } from './osint-post.entity';

@Entity({ name: 'osint_post_nlp', schema: 'osint' })
export class OsintPostNlp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'post_id', nullable: false, unique: true })
  postId: string;

  // Layer 1 gating (NlpService — tái dùng từ Sprint 1)
  @Column('boolean', { name: 'is_relevant', default: false })
  isRelevant: boolean;

  @Column('varchar', {
    length: 200,
    array: true,
    name: 'matched_keywords',
    nullable: true,
  })
  matchedKeywords: string[];

  // Priority thấp nhất = nóng nhất (smallint, tương tự NlpService Sprint 1)
  @Column('smallint', { name: 'top_keyword_priority', nullable: true })
  topKeywordPriority: number;

  // Slang detection (SlangDictionaryService — tái dùng từ Sprint 1)
  @Column('boolean', { name: 'has_slang', default: false })
  hasSlang: boolean;

  @Column('jsonb', { name: 'detected_slang', nullable: true })
  detectedSlang: Array<{ term: string; meaning: string }>;

  // Classification
  @Column('varchar', { length: 50, name: 'topic_category', nullable: true })
  topicCategory: string;

  // Điểm xu hướng = f(keywords priority + engagement)
  @Column('float', { name: 'trend_score', nullable: true })
  trendScore: number;

  // critical | high | medium | low
  @Column('varchar', { length: 20, name: 'risk_level', nullable: true })
  riskLevel: string;

  // pending | processing | done | failed
  @Column('varchar', {
    length: 20,
    name: 'processing_status',
    default: 'pending',
  })
  processingStatus: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => OsintPost, (post) => post.nlp, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'post_id' })
  post: OsintPost;
}
