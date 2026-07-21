import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'osint_gate_config', schema: 'osint' })
export class OsintGateConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Trọng số mỗi tín hiệu do job EWM ghi, đọc lúc chấm notablity_score
  @Column('jsonb', { name: 'signal_weights', nullable: true })
  signalWeights: Record<string, number>;

  // Ngưỡng OR mỗi tín hiệu (zScoreCutoff, hotPriorityMax, minCorrobK...)
  @Column('jsonb', { name: 'thresholds', nullable: true })
  thresholds: Record<string, number>;

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
