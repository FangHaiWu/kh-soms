import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// Tên gọi dùng để khớp text → ward. 1 alias được phép trỏ NHIỀU ward (thế mơ hồ).
@Entity({ name: 'ward_aliases', schema: 'spatial' })
export class WardAlias {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'ward_id' })
  wardId: string;

  // Dạng hiển thị, có dấu
  @Column('varchar', { length: 150 })
  alias: string;

  // Dạng chuẩn hóa để khớp: lowercase, bỏ dấu, gộp khoảng trắng
  @Column('varchar', { length: 150, name: 'alias_norm' })
  aliasNorm: string;

  // official | old_ward — chỉ để truy vết/thống kê, KHÔNG dùng phá thế mơ hồ
  @Column('varchar', { length: 20, name: 'alias_type' })
  aliasType: string;

  // true = chỉ nhận khi có tiền tố "xã/phường/tại/ở..." (tên trùng từ thông thường)
  @Column('boolean', { name: 'requires_cue', default: false })
  requiresCue: boolean;
}
