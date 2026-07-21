import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// Thống kê gộp của 1 actor theo cửa sổ (30 ngày) — recompute định kỳ bởi ActorAggregateJob
@Entity({ name: 'osint_actor_stat', schema: 'osint' })
export class OsintActorStat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'actor_id' })
  actorId: string;

  @Column('int', { name: 'window_days' })
  windowDays: number;

  @Column('int', { name: 'post_count', default: 0 })
  postCount: number;

  @Column('int', { name: 'notable_count', default: 0 })
  notableCount: number;

  // {"lua-dao":5,"co-bac-ca-do":2,...} — chỉ nhóm CNC
  @Column('jsonb', { name: 'category_counts', nullable: true })
  categoryCounts: Record<string, number> | null;

  @Column('int', { name: 'distinct_indicators', default: 0 })
  distinctIndicators: number;

  @Column('timestamptz', { name: 'last_post_at', nullable: true })
  lastPostAt: Date | null;

  @Column('boolean', { name: 'is_repeat_offender', default: false })
  isRepeatOffender: boolean;

  @Column('timestamptz', { name: 'computed_at', default: () => 'now()' })
  computedAt: Date;
}
