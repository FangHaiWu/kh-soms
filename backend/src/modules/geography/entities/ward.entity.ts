import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// Đơn vị hành chính cấp xã (65 đơn vị) — cấu trúc 2 cấp, KHÔNG có cấp huyện
@Entity({ name: 'wards', schema: 'spatial' })
export class Ward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 20, nullable: true })
  code: string | null;

  // Tên đầy đủ kèm tiền tố loại: "Phường Nha Trang", "Xã Diên Khánh"
  @Column('varchar', { length: 150 })
  name: string;

  // Tên bỏ tiền tố loại: "Nha Trang", "Diên Khánh"
  @Column('varchar', { length: 150, name: 'short_name', nullable: true })
  shortName: string | null;

  // xa | phuong | dac_khu
  @Column('varchar', { length: 20, name: 'ward_type' })
  wardType: string;

  // khanh_hoa_cu | ninh_thuan_cu — nhãn lọc hiển thị, KHÔNG phải cấp hành chính
  @Column('varchar', { length: 20, nullable: true })
  region: string | null;

  // Polygon từ OSM; NULL được vì nhánh import là độc lập, không chặn việc gán địa bàn
  @Column({ type: 'geometry', nullable: true, select: false })
  geom: unknown | null;

  @Column('varchar', { length: 50, name: 'geom_source', nullable: true })
  geomSource: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
