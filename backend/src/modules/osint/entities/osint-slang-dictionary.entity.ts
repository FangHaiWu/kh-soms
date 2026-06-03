import {
  PrimaryGeneratedColumn,
  Column,
  Entity,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'osint_slang_dictionary', schema: 'osint' })
@Unique(['term'])
export class OsintSlangDictionary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { name: 'term', length: 200, nullable: false }) // Tieng long
  term: string;

  @Column('text', { name: 'meaning', nullable: false }) // Nghia thuc
  meaning: string;

  @Column('varchar', { name: 'category', length: 100, nullable: true }) // nhom: (Ma tuy, co bac,...), nullable
  category: string;

  @Column('uuid', { name: 'added_by', nullable: true }) //User nhap
  addedBy: string;

  @Column('boolean', { name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
