import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'osint_keywords', schema: 'osint' })
@Unique(['category', 'keyword'])
export class OsintKeyword {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 100, nullable: false })
  category: string;

  @Column('varchar', { length: 200, nullable: false })
  keyword: string;

  @Column('boolean', { nullable: true, default: true, name: 'is_active' })
  isActive: boolean;

  @Column('smallint', { nullable: true, default: 1 })
  priority: number;

  // global = áp dụng cho mọi platform | group-specific = chỉ cho nhóm cụ thể
  @Column('varchar', { length: 50, nullable: false, default: 'global' })
  scope: string;

  // Chỉ dùng khi scope='group-specific'
  @Column('uuid', { array: true, name: 'group_ids', nullable: true })
  groupIds: string[];

  // Đặc thù vùng (VD: "Khánh Hòa", "Nha Trang", "Ninh Thuận")
  @Column('varchar', { length: 100, nullable: true })
  region: string;

  @Column('text', { nullable: true })
  notes: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
