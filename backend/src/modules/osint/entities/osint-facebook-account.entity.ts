import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type FacebookAccountStatus = 'active' | 'checkpoint' | 'retired';

@Entity({ name: 'osint_facebook_accounts', schema: 'osint' })
export class OsintFacebookAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ten goi nho: "tool-acct-01"
  @Column('varchar', { name: 'label', length: 100, unique: true })
  label: string;

  // email/sdt/username de login
  @Column('varchar', { name: 'login_identifier', length: 255, nullable: true })
  loginIdentifier: string;

  // Mật khẩu đã MÃ HÓA AES-256
  @Column('text', { name: 'encrypted_password' })
  encryptedPassword: string;

  // cookie/storageState Playwrigth da ma hoa -> Khoi ma hoa lai moi lan; la credential -> ma hoa
  @Column('text', { name: 'encrypted_session', nullable: true })
  encryptedSession: string;

  // active/checkpoint/retired
  @Column('varchar', { name: 'status', length: 20, default: 'active' })
  status: FacebookAccountStatus;

  // Dem so luot crawl trong ngay
  @Column('integer', { name: 'crawl_count_today', default: 0 })
  crawlCountToday: number;

  // Lan dung gan nhat
  @Column('timestamptz', { name: 'last_used_at', nullable: true })
  lastUsedAt: Date;

  // So lan dinh checkpoint, default: 0, >=3 -> retire
  @Column('integer', { name: 'checkpoint_count', default: 0 })
  checkpointCount: number;

  // Thoi diem checkpoint gan nhat
  @Column('timestamptz', { name: 'last_checkpoint_at', nullable: true })
  lastCheckpointedAt: Date;

  // Ghi chu thu cong
  @Column('text', { name: 'notes', nullable: true })
  notes: string;

  // created_at
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  // updated_at
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
