import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OsintSource } from './osint-source.entity';
@Entity({ name: 'osint_articles', schema: 'osint' })
export class OsintArticle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'source_id', nullable: true })
  sourceId: string;

  @Column('text', { nullable: false })
  title: string;

  @Column('text', { nullable: true })
  content: string;

  @Column('text', { unique: true, nullable: false })
  url: string;

  @Column('varchar', { length: 200, nullable: true })
  author: string;

  @Column('timestamptz', { name: 'published_at', nullable: true })
  publishedAt: Date;

  @Column('timestamptz', { name: 'crawled_at', default: () => 'NOW()' })
  crawledAt: Date;

  @Column('varchar', { length: 64, nullable: false, name: 'content_hash' })
  contentHash: string;

  @Column('varchar', { length: 10, default: 'vi' })
  language: string;

  @Column('text', { array: true, nullable: true })
  topics: string[];

  @Column('varchar', { length: 20, default: 'neutral' })
  sentiment: string;

  @Column('text', { array: true, nullable: true })
  keywords: string[];

  @Column('jsonb', { nullable: true, name: 'named_entities' })
  namedEntities: {
    persons: string[];
    locations: string[];
    organizations: string[];
  };

  @Column('float', { name: 'relevance_score', nullable: true, default: 0 })
  relevanceScore: number;

  @Column('boolean', { name: 'is_relevant', nullable: true, default: false })
  isRelevant: boolean;

  @Column('float', { name: 'virality_score', nullable: true, default: 0 })
  viralityScore: number;

  @Column('boolean', {
    name: 'sensitivity_flag',
    nullable: true,
    default: false,
  })
  sensitivityFlag: boolean;

  @Column('uuid', { array: true, name: 'linked_subject_ids', nullable: true })
  linkedSubjectIds: string[];

  @Column('uuid', { array: true, name: 'linked_incident_ids', nullable: true })
  linkedIncidentIds: string[];

  @Column('uuid', { name: 'reviewed_by', nullable: true })
  reviewedBy: string;

  @Column('text', { name: 'review_note', nullable: true })
  reviewNote: string;

  @CreateDateColumn({
    type: 'timestamptz',
    name: 'created_at',
  })
  createdAt: Date;

  @ManyToOne(() => OsintSource, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_id' })
  source: OsintSource;
}
