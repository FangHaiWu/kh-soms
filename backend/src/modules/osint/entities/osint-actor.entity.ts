import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// Chủ thể online công khai (group/kênh/tài khoản/domain/vân tay chỉ dấu) — generic đa loại
@Entity({ name: 'osint_actor', schema: 'osint' })
export class OsintActor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // group | account | domain | fingerprint
  @Column('varchar', { length: 20, name: 'actor_type' })
  actorType: string;

  // group: groupId | account: platformId:authorExternalId
  @Column('varchar', { length: 300, name: 'actor_key' })
  actorKey: string;

  @Column('varchar', { length: 300, name: 'display_name', nullable: true })
  displayName: string | null;

  @Column('uuid', { name: 'platform_id', nullable: true })
  platformId: string | null;

  @Column('timestamptz', { name: 'first_seen', nullable: true })
  firstSeen: Date | null;

  @Column('timestamptz', { name: 'last_seen', nullable: true })
  lastSeen: Date | null;

  @Column('jsonb', { nullable: true })
  meta: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
