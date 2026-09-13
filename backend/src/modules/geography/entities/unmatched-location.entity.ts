import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// Lưới vớt: địa danh NER bắt được nhưng chưa có trong gazetteer.
// Đọc bảng này định kỳ để biết danh mục alias đang thiếu gì, thay vì ngồi đoán.
@Entity({ name: 'unmatched_locations', schema: 'spatial' })
export class UnmatchedLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 200, name: 'text_norm' })
  textNorm: string;

  @Column('varchar', { length: 200, name: 'text_raw', nullable: true })
  textRaw: string | null;

  @Column('int', { default: 1 })
  occurrences: number;

  @Column('timestamptz', { name: 'first_seen', nullable: true })
  firstSeen: Date | null;

  @Column('timestamptz', { name: 'last_seen', nullable: true })
  lastSeen: Date | null;
}
