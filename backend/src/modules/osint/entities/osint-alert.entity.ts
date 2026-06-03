import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'osint_alerts', schema: 'osint' })
export class OsintAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column('varchar', { length: 50, name: 'alert_type', nullable: false })
  alertType: string;

  @Column('varchar', { length: 20, nullable: false, default: 'info' })
  severity: string;

  @Column('text', { nullable: false })
  title: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('uuid', { array: true, nullable: true, name: 'source_ref_ids' })
  sourceRefIds: string[];

  @Column('boolean', {
    nullable: true,
    default: false,
    name: 'is_acknowledged',
  })
  isAcknowledged: boolean;

  @Column('uuid', { nullable: true, name: 'acknowledged_by' })
  acknowledgedBy: string;

  @Column('timestamptz', { name: 'acknowledged_at', nullable: true })
  acknowledgedAt: Date;
}
