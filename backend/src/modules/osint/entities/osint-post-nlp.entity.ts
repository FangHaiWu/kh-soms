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

  @Column('float', { name: 'sentiment_score', nullable: true })
  sentimentScore: number;

  @Column('jsonb', { name: 'entities', nullable: true })
  entities: any;

  // #1 CNC: category distinct của keyword khớp (nhãn nhóm bài — route đơn vị đa-đơn-vị)
  @Column('varchar', {
    length: 100,
    array: true,
    name: 'matched_categories',
    nullable: true,
  })
  matchedCategories: string[];

  // #3 CNC: chỉ dấu {type, raw, normalized} do IndicatorExtractorService điền (nối sau)
  @Column('jsonb', { name: 'indicators', nullable: true })
  indicators: any;

  @Column('boolean', { name: 'is_notable', default: false })
  isNotable: boolean;

  @Column('float', { name: 'notability_score', nullable: true })
  notabilityScore: number;

  @Column('jsonb', { name: 'notability_reasons', nullable: true })
  notabilityReasons: string[];

  @Column('boolean', { name: 'gate_passed', default: false })
  gatePassed: boolean;

  @Column('jsonb', { name: 'signal_features', nullable: true })
  signalFeatures: Record<string, number>;

  @Column('float', { name: 'credibility', nullable: true })
  credibility: number;

  // S6 địa bàn hóa — NULL khi không khớp được đúng 1 xã (mơ hồ hoặc không có địa danh)
  @Column('uuid', { name: 'ward_id', nullable: true })
  wardId: string | null;

  // Cụm địa danh bắt được trong bài, giữ nguyên văn kể cả khi wardId NULL
  @Column('varchar', { length: 200, name: 'location_text', nullable: true })
  locationText: string | null;

  @Column('varchar', { length: 150, name: 'matched_alias', nullable: true })
  matchedAlias: string | null;

  // Mọi địa danh kèm vai trò P1-P4 — để đổi luật chọn sau mà không phải quét lại bài
  @Column('jsonb', { name: 'location_candidates', nullable: true })
  locationCandidates: unknown | null;

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
