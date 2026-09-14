# S6 — Địa bàn hóa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gán mỗi bài OSINT về một trong 65 xã/phường/đặc khu tỉnh Khánh Hòa, để S7 tính được baseline theo địa bàn và S9 vẽ được bản đồ nhiệt.

**Architecture:** Gazetteer trong PostgreSQL (`spatial.wards` + `spatial.ward_aliases`) nạp vào bộ nhớ; logic khớp là hàm **thuần** trong `ward-matcher.ts` (chuẩn hóa theo token giữ offset → quét n-gram dài nhất trước → cue-gating → thang vai trò P1–P4), bọc bởi `WardMatcherService` của Nest. Cắm vào worker NLP ở bước 3.5, null-safe. Backfill bằng script riêng, không đụng queue.

**Tech Stack:** NestJS, TypeORM, PostgreSQL + PostGIS, Jest. Không thêm thư viện mới.

**Spec:** `docs/superpowers/specs/2026-09-13-s6-dia-ban-hoa-design.md`

## Global Constraints

- **Cấu trúc 2 cấp:** Tỉnh → Xã/Phường/Đặc khu. KHÔNG có `districtId`/`district` trong schema. `region` chỉ là nhãn lọc hiển thị (`khanh_hoa_cu` | `ninh_thuan_cu`), không phải cấp hành chính.
- **Comment tiếng Việt cho logic nghiệp vụ, tiếng Anh cho technical detail.** Trước mỗi hàm: mục đích. Trước câu lệnh quan trọng: giải thích **tại sao**. Điều kiện phức tạp/regex: bắt buộc có comment.
- **Null-safe:** một bài không gán được địa bàn KHÔNG bao giờ được làm chết worker.
- **Không bật Gate:** địa bàn là thuộc tính mô tả, không phải tín hiệu notability.
- **Zone A:** không nối hồ sơ người thật. Subject-linkage chỉ ở Zone B.
- **TDD:** test thất bại trước, implement sau. Commit từng task.
- **Migration forward-only:** file mới, không sửa file cũ. `CREATE TABLE IF NOT EXISTS`.
- Chạy test: `cd backend && npx jest <path>`. Build: `cd backend && npm run build`.

## File Structure

| File | Trách nhiệm |
|---|---|
| `backend/database/migrations/010-s6-spatial-wards.sql` | Schema `spatial`, 3 bảng, 4 cột thêm vào `osint_post_nlp` + `osint_alerts` |
| `backend/src/modules/geography/entities/ward.entity.ts` | Entity `spatial.wards` |
| `backend/src/modules/geography/entities/ward-alias.entity.ts` | Entity `spatial.ward_aliases` |
| `backend/src/modules/geography/entities/unmatched-location.entity.ts` | Entity `spatial.unmatched_locations` |
| `backend/src/modules/geography/data/khanh-hoa-wards.ts` | **Dữ liệu gốc** 65 đơn vị + đơn vị cũ hợp thành (cán bộ verify) |
| `backend/src/modules/geography/services/ward-matcher.ts` | **Logic thuần** — không import NestJS, không đụng DB |
| `backend/src/modules/geography/services/ward-matcher.service.ts` | Wrapper Nest: nạp alias index từ DB + cache, ghi `unmatched_locations` |
| `backend/src/modules/geography/geography.module.ts` | Module, export `WardMatcherService` |
| `backend/src/scripts/seed-wards.ts` | Sinh + load gazetteer từ data file |
| `backend/src/scripts/backfill-ward.ts` | Backfill địa bàn cho bài đã thu |
| `backend/src/scripts/measure-ward-precision.ts` | Đo precision trên mẫu gán tay |
| `backend/src/scripts/import-ward-geom.ts` | Import polygon OSM (độc lập) |

Tách `ward-matcher.ts` (thuần) khỏi `ward-matcher.service.ts` (Nest) đúng cách `actor-aggregator.ts` tách khỏi `actor-aggregate.job.ts` — để test tất định không cần DB.

---

## Task 0: Khảo sát OSM có đủ 65 ranh giới mới không

**Spike — không code, không commit.** Mục đích: biết trước Task 11 có làm được không, để không hứa `geom` rồi phát hiện OSM trống.

**Files:** không tạo file nào.

- [ ] **Step 1: Đếm ranh giới cấp xã của Khánh Hòa trên OSM**

```bash
curl -s -X POST https://overpass-api.de/api/interpreter \
  --data-urlencode 'data=[out:json][timeout:90];
rel(1887959);map_to_area->.kh;
relation(area.kh)["boundary"="administrative"]["admin_level"="6"];
out tags;' | python3 -c "
import json,sys,collections
d=json.load(sys.stdin)['elements']
lv=collections.Counter(e['tags'].get('admin_level') for e in d)
print('Tổng quan hệ ranh giới:', len(d), '| theo admin_level:', dict(lv))
names=sorted(e['tags'].get('name','?') for e in d)
print('\n'.join(names))
"
```

- [ ] **Step 2: Đối chiếu và kết luận**

So số lượng + tên trả về với 65 tên trong `khanh-hoa-wards.ts` (Task 2).

Ghi kết luận vào một trong ba mức, rồi báo lại cho chủ dự án:
- **Đủ 65** → Task 11 làm được như kế hoạch.
- **Thiếu một phần** → Task 11 vẫn chạy, `geom` NULL cho phần thiếu; ghi rõ thiếu bao nhiêu.
- **Vẫn là ranh giới cũ (trước 01/7/2025)** → **KHÔNG import**. Polygon sai còn tệ hơn không có polygon, vì bản đồ sẽ vẽ ra ranh giới không tồn tại. Báo lại để chủ dự án quyết mua GeoJSON hay hoãn.

**KẾT QUẢ ĐÃ CHẠY (13/09/2026):** OSM có **đủ 65/65 đơn vị mới**, tên khớp tuyệt đối với
`khanh-hoa-wards.ts` (0 thiếu, 0 thừa). Quan hệ cấp tỉnh duy nhất là `rel(1887959)` "Tỉnh Khánh Hòa"
— Ninh Thuận đã biến mất khỏi OSM, tức OSM đã cập nhật sau sáp nhập. Cấp xã nằm ở
**`admin_level=6`** (không phải 8/9 — bỏ cấp huyện nên cấp xã dời lên 6; level 9 là tổ dân phố).
→ **Task 11 làm được như kế hoạch.**

Task 0 không chặn Task 1–10. Kết quả chỉ quyết định số phận Task 11.

---

## Task 1: Schema — migration 010 + 3 entity

**Files:**
- Create: `backend/database/migrations/010-s6-spatial-wards.sql`
- Create: `backend/src/modules/geography/entities/ward.entity.ts`
- Create: `backend/src/modules/geography/entities/ward-alias.entity.ts`
- Create: `backend/src/modules/geography/entities/unmatched-location.entity.ts`
- Create: `backend/src/modules/geography/geography.module.ts`
- Modify: `backend/src/app.module.ts` (thêm `GeographyModule` vào imports)

**Interfaces:**
- Produces: entity `Ward` (`id`, `code`, `name`, `shortName`, `wardType`, `region`, `geom`, `geomSource`), `WardAlias` (`wardId`, `alias`, `aliasNorm`, `aliasType`, `requiresCue`), `UnmatchedLocation` (`textNorm`, `textRaw`, `occurrences`).

- [ ] **Step 1: Viết migration**

```sql
-- =====================================================================
-- Migration 010 — S6 Địa bàn hóa
-- spatial.wards: 65 đơn vị HC cấp xã (2 cấp, KHÔNG có cấp huyện)
-- spatial.ward_aliases: tên gọi khớp text — official | old_ward
-- spatial.unmatched_locations: lưới vớt LOC của NER chưa có trong danh mục
-- An toàn chạy lại: CREATE ... IF NOT EXISTS.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS spatial;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS spatial.wards (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        varchar(20) UNIQUE,
  name        varchar(150) NOT NULL,
  short_name  varchar(150),
  ward_type   varchar(20) NOT NULL,        -- xa | phuong | dac_khu
  region      varchar(20),                 -- khanh_hoa_cu | ninh_thuan_cu (nhãn lọc, KHÔNG phải cấp HC)
  centroid    geography(Point,4326),
  geom        geometry(MultiPolygon,4326), -- NULL được: polygon là nhánh độc lập
  geom_source varchar(50),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  CONSTRAINT uq_ward_name UNIQUE (name)
);
CREATE INDEX IF NOT EXISTS idx_wards_geom ON spatial.wards USING GIST(geom);

CREATE TABLE IF NOT EXISTS spatial.ward_aliases (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ward_id      uuid NOT NULL REFERENCES spatial.wards(id) ON DELETE CASCADE,
  alias        varchar(150) NOT NULL,
  alias_norm   varchar(150) NOT NULL,
  alias_type   varchar(20)  NOT NULL,      -- official | old_ward
  requires_cue boolean NOT NULL DEFAULT false,
  -- CỐ Ý không UNIQUE(alias_norm): 1 alias PHẢI được trỏ nhiều xã.
  -- "Ninh Hải" vừa là xã mới (Ninh Thuận) vừa là phường cũ của Ninh Hòa —
  -- matcher dựa vào chính việc trỏ nhiều xã để nhận ra thế mơ hồ và bỏ gán.
  CONSTRAINT uq_alias UNIQUE (alias_norm, ward_id)
);
CREATE INDEX IF NOT EXISTS idx_alias_norm ON spatial.ward_aliases(alias_norm);

CREATE TABLE IF NOT EXISTS spatial.unmatched_locations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  text_norm   varchar(200) NOT NULL UNIQUE,
  text_raw    varchar(200),
  occurrences int NOT NULL DEFAULT 1,
  first_seen  timestamptz DEFAULT now(),
  last_seen   timestamptz DEFAULT now()
);

ALTER TABLE osint.osint_post_nlp
  ADD COLUMN IF NOT EXISTS ward_id             uuid REFERENCES spatial.wards(id),
  ADD COLUMN IF NOT EXISTS location_text       varchar(200),
  ADD COLUMN IF NOT EXISTS matched_alias       varchar(150),
  ADD COLUMN IF NOT EXISTS location_candidates jsonb;
CREATE INDEX IF NOT EXISTS idx_post_nlp_ward ON osint.osint_post_nlp(ward_id);

ALTER TABLE osint.osint_alerts
  ADD COLUMN IF NOT EXISTS ward_id uuid REFERENCES spatial.wards(id);
```

- [ ] **Step 2: Áp migration lên DB thật**

```bash
psql -U postgres -d kh_soms -f backend/database/migrations/010-s6-spatial-wards.sql
```

Nếu `CREATE EXTENSION postgis` báo lỗi thiếu package: `brew install postgis` rồi chạy lại. Ba bảng còn lại không phụ thuộc PostGIS ngoài 2 cột `centroid`/`geom`.

- [ ] **Step 3: Viết `ward.entity.ts`**

```typescript
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
  @Column('geometry', { nullable: true, select: false })
  geom: unknown | null;

  @Column('varchar', { length: 50, name: 'geom_source', nullable: true })
  geomSource: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
```

`select: false` trên `geom` là cố ý: polygon nặng, mọi truy vấn nghiệp vụ đều không cần nó — chỉ script vẽ bản đồ mới `addSelect`.

- [ ] **Step 4: Viết `ward-alias.entity.ts`**

```typescript
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
```

- [ ] **Step 5: Viết `unmatched-location.entity.ts`**

```typescript
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
```

- [ ] **Step 6: Viết `geography.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ward } from './entities/ward.entity';
import { WardAlias } from './entities/ward-alias.entity';
import { UnmatchedLocation } from './entities/unmatched-location.entity';

// Module địa bàn — S6. Export WardMatcherService cho OsintModule dùng ở worker NLP.
@Module({
  imports: [TypeOrmModule.forFeature([Ward, WardAlias, UnmatchedLocation])],
  providers: [],
  exports: [TypeOrmModule],
})
export class GeographyModule {}
```

`WardMatcherService` sẽ được thêm vào `providers`/`exports` ở Task 6.

- [ ] **Step 7: Đăng ký module**

Trong `backend/src/app.module.ts`, thêm import và đưa `GeographyModule` vào mảng `imports` ngay trước `OsintModule`.

- [ ] **Step 8: Build + commit**

```bash
cd backend && npm run build
git add backend/database/migrations/010-s6-spatial-wards.sql backend/src/modules/geography backend/src/app.module.ts
git commit -m "feat(geo): S6 schema — spatial.wards + ward_aliases + unmatched_locations (migration 010)"
```

---

## Task 2: Dữ liệu gazetteer — 65 đơn vị + alias

**Files:**
- Create: `backend/src/modules/geography/data/khanh-hoa-wards.ts`
- Create: `backend/src/scripts/seed-wards.ts`

**Interfaces:**
- Produces: `WARDS: WardSeed[]` với `WardSeed = { name, type, region, oldNames, requiresCue? }`; script `seed-wards.ts` load vào DB.

⚠️ **Cổng verify:** file data là trích xuất từ NQ 1667/NQ-UBTVQH15 (nguồn: cổng Xây dựng chính sách Chính phủ). **Cán bộ phải đọc và xác nhận trước khi load.** Claude không có thẩm quyền khẳng định danh mục địa giới hành chính.

- [ ] **Step 1: Viết data file**

```typescript
// Danh mục 65 đơn vị hành chính cấp xã tỉnh Khánh Hòa sau sáp nhập.
// Nguồn: Nghị quyết 1667/NQ-UBTVQH15, hiệu lực 01/7/2025.
// ⚠️ CÁN BỘ VERIFY trước khi load vào DB.
export interface WardSeed {
  name: string; // tên đầy đủ kèm tiền tố loại
  type: 'xa' | 'phuong' | 'dac_khu';
  region: 'khanh_hoa_cu' | 'ninh_thuan_cu';
  // Đơn vị HC cũ hợp thành. Tên cũ bị XẺ cho nhiều xã mới vẫn để nguyên ở đây —
  // khi 2 ward cùng khai một tên cũ, matcher tự nhận ra thế mơ hồ và bỏ gán.
  oldNames: string[];
  // true = tên trùng từ tiếng Việt thông thường, chỉ nhận khi có cue "xã/phường/tại/ở"
  requiresCue?: boolean;
}

export const WARDS: WardSeed[] = [
  // ---------- 16 PHƯỜNG ----------
  { name: 'Phường Nha Trang', type: 'phuong', region: 'khanh_hoa_cu',
    oldNames: ['Vạn Thạnh', 'Lộc Thọ', 'Vĩnh Nguyên', 'Tân Tiến', 'Phước Hòa'] },
  { name: 'Phường Bắc Nha Trang', type: 'phuong', region: 'khanh_hoa_cu',
    oldNames: ['Vĩnh Hòa', 'Vĩnh Hải', 'Vĩnh Phước', 'Vĩnh Thọ', 'Vĩnh Lương', 'Vĩnh Phương'] },
  { name: 'Phường Tây Nha Trang', type: 'phuong', region: 'khanh_hoa_cu',
    oldNames: ['Ngọc Hiệp', 'Phương Sài', 'Vĩnh Ngọc', 'Vĩnh Thạnh', 'Vĩnh Hiệp', 'Vĩnh Trung'] },
  { name: 'Phường Nam Nha Trang', type: 'phuong', region: 'khanh_hoa_cu',
    oldNames: ['Phước Hải', 'Phước Long', 'Vĩnh Trường', 'Vĩnh Thái', 'Phước Đồng'] },
  { name: 'Phường Bắc Cam Ranh', type: 'phuong', region: 'khanh_hoa_cu',
    oldNames: ['Cam Nghĩa', 'Cam Phúc Bắc', 'Cam Thành Nam'] },
  { name: 'Phường Cam Ranh', type: 'phuong', region: 'khanh_hoa_cu',
    oldNames: ['Cam Phú', 'Cam Lộc', 'Cam Phúc Nam'] },
  { name: 'Phường Cam Linh', type: 'phuong', region: 'khanh_hoa_cu',
    oldNames: ['Cam Thuận', 'Cam Lợi', 'Cam Linh'] },
  { name: 'Phường Ba Ngòi', type: 'phuong', region: 'khanh_hoa_cu',
    oldNames: ['Ba Ngòi', 'Cam Phước Đông'] },
  { name: 'Phường Ninh Hòa', type: 'phuong', region: 'khanh_hoa_cu',
    oldNames: ['Ninh Hiệp', 'Ninh Đa', 'Ninh Đông', 'Ninh Phụng'] },
  { name: 'Phường Đông Ninh Hòa', type: 'phuong', region: 'khanh_hoa_cu',
    oldNames: ['Ninh Diêm', 'Ninh Hải', 'Ninh Thủy', 'Ninh Phước'] },
  { name: 'Phường Hòa Thắng', type: 'phuong', region: 'khanh_hoa_cu',
    oldNames: ['Ninh Giang', 'Ninh Hà', 'Ninh Phú'], requiresCue: true },
  { name: 'Phường Phan Rang', type: 'phuong', region: 'ninh_thuan_cu',
    oldNames: ['Kinh Dinh', 'Phủ Hà', 'Đài Sơn', 'Đạo Long'] },
  { name: 'Phường Đông Hải', type: 'phuong', region: 'ninh_thuan_cu',
    oldNames: ['Mỹ Bình', 'Mỹ Đông', 'Mỹ Hải', 'Đông Hải'] },
  { name: 'Phường Ninh Chử', type: 'phuong', region: 'ninh_thuan_cu',
    oldNames: ['Văn Hải', 'Khánh Hải'] },
  { name: 'Phường Bảo An', type: 'phuong', region: 'ninh_thuan_cu',
    oldNames: ['Phước Mỹ', 'Bảo An', 'Thành Hải'], requiresCue: true },
  { name: 'Phường Đô Vinh', type: 'phuong', region: 'ninh_thuan_cu',
    oldNames: ['Đô Vinh', 'Nhơn Sơn'] },

  // ---------- 48 XÃ ----------
  { name: 'Xã Nam Cam Ranh', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Cam Lập', 'Cam Bình', 'Cam Thịnh Đông', 'Cam Thịnh Tây'] },
  { name: 'Xã Bắc Ninh Hòa', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Ninh An', 'Ninh Sơn', 'Ninh Thọ'] },
  { name: 'Xã Tân Định', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Ninh Xuân', 'Ninh Quang', 'Ninh Bình'], requiresCue: true },
  { name: 'Xã Nam Ninh Hòa', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Ninh Lộc', 'Ninh Ích', 'Ninh Hưng', 'Ninh Tân'] },
  { name: 'Xã Tây Ninh Hòa', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Ninh Tây', 'Ninh Sim'] },
  { name: 'Xã Hòa Trí', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Ninh Thượng', 'Ninh Trung', 'Ninh Thân'], requiresCue: true },
  { name: 'Xã Đại Lãnh', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Vạn Thạnh', 'Vạn Thọ', 'Đại Lãnh'] },
  { name: 'Xã Tu Bông', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Vạn Khánh', 'Vạn Long', 'Vạn Phước'] },
  { name: 'Xã Vạn Thắng', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Vạn Bình', 'Vạn Thắng'] },
  { name: 'Xã Vạn Ninh', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Vạn Giã', 'Vạn Phú', 'Vạn Lương'] },
  { name: 'Xã Vạn Hưng', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Xuân Sơn', 'Vạn Hưng'] },
  { name: 'Xã Diên Khánh', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Diên An', 'Diên Toàn'] },
  { name: 'Xã Diên Lạc', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Diên Thạnh', 'Diên Lạc', 'Diên Hòa'] },
  { name: 'Xã Diên Điền', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Diên Sơn', 'Diên Phú', 'Diên Điền'] },
  { name: 'Xã Diên Lâm', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Xuân Đông', 'Diên Lâm'] },
  { name: 'Xã Diên Thọ', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Diên Tân', 'Diên Phước', 'Diên Thọ'] },
  { name: 'Xã Suối Hiệp', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Suối Tiên', 'Bình Lộc', 'Suối Hiệp'] },
  { name: 'Xã Cam Lâm', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Cam Đức', 'Cam Hải Đông', 'Cam Hải Tây', 'Cam Thành Bắc',
               'Cam Hiệp Bắc', 'Cam Hiệp Nam', 'Cam Hòa', 'Cam Tân',
               'Cam An Bắc', 'Cam An Nam', 'Suối Tân'] },
  { name: 'Xã Suối Dầu', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Suối Cát', 'Cam Hòa', 'Cam Tân', 'Suối Tân'] },
  { name: 'Xã Cam Hiệp', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Sơn Tân', 'Cam Hiệp Bắc', 'Cam Hiệp Nam', 'Cam Hòa', 'Cam Tân', 'Suối Tân'] },
  { name: 'Xã Cam An', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Cam Phước Tây', 'Cam An Bắc', 'Cam An Nam'] },
  { name: 'Xã Bắc Khánh Vĩnh', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Khánh Bình', 'Khánh Đông'] },
  { name: 'Xã Trung Khánh Vĩnh', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Khánh Trung', 'Khánh Hiệp'] },
  { name: 'Xã Tây Khánh Vĩnh', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Giang Ly', 'Khánh Thượng', 'Khánh Nam'] },
  { name: 'Xã Nam Khánh Vĩnh', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Cầu Bà', 'Khánh Thành', 'Liên Sang', 'Sơn Thái'] },
  { name: 'Xã Khánh Vĩnh', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Sông Cầu', 'Khánh Phú'] },
  { name: 'Xã Khánh Sơn', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Tô Hạp', 'Sơn Hiệp', 'Sơn Bình'] },
  { name: 'Xã Tây Khánh Sơn', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Sơn Lâm', 'Thành Sơn'] },
  { name: 'Xã Đông Khánh Sơn', type: 'xa', region: 'khanh_hoa_cu',
    oldNames: ['Sơn Trung', 'Ba Cụm Bắc', 'Ba Cụm Nam'] },
  { name: 'Xã Ninh Phước', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Phước Dân', 'Phước Thuận', 'Phước Hải'] },
  { name: 'Xã Phước Hữu', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Phước Thái', 'Phước Hữu'] },
  { name: 'Xã Phước Hậu', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Phước Vinh', 'Phước Sơn', 'Phước Hậu'] },
  { name: 'Xã Thuận Nam', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Phước Nam', 'Phước Ninh', 'Phước Minh'] },
  { name: 'Xã Cà Ná', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Phước Diêm', 'Cà Ná'] },
  { name: 'Xã Phước Hà', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Nhị Hà', 'Phước Hà'] },
  { name: 'Xã Phước Dinh', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['An Hải', 'Phước Dinh', 'Đông Hải'] },
  { name: 'Xã Ninh Hải', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Phương Hải', 'Tri Hải', 'Bắc Sơn'] },
  { name: 'Xã Xuân Hải', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Hộ Hải', 'Tân Hải', 'Xuân Hải'] },
  { name: 'Xã Vĩnh Hải', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Nhơn Hải', 'Thanh Hải', 'Vĩnh Hải'] },
  { name: 'Xã Thuận Bắc', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Bắc Phong', 'Phước Kháng', 'Lợi Hải'] },
  { name: 'Xã Công Hải', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Phước Chiến', 'Công Hải'] },
  { name: 'Xã Ninh Sơn', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Tân Sơn', 'Quảng Sơn'] },
  { name: 'Xã Lâm Sơn', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Lương Sơn', 'Lâm Sơn'] },
  { name: 'Xã Anh Dũng', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Ma Nới', 'Hòa Sơn'], requiresCue: true },
  { name: 'Xã Mỹ Sơn', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Phước Trung', 'Mỹ Sơn'], requiresCue: true },
  { name: 'Xã Bác Ái Đông', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Phước Đại', 'Phước Thành'] },
  { name: 'Xã Bác Ái', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Phước Tiến', 'Phước Thắng', 'Phước Chính'] },
  { name: 'Xã Bác Ái Tây', type: 'xa', region: 'ninh_thuan_cu',
    oldNames: ['Phước Hòa', 'Phước Tân', 'Phước Bình'] },

  // ---------- 1 ĐẶC KHU ----------
  { name: 'Đặc khu Trường Sa', type: 'dac_khu', region: 'khanh_hoa_cu',
    oldNames: ['Trường Sa', 'Song Tử Tây', 'Sinh Tồn'] },
];
```

**Ba chỗ cố ý trong data này, đừng "sửa cho gọn":**

1. `Cam Hòa`, `Cam Tân`, `Suối Tân`, `Cam Hiệp Bắc/Nam`, `Cam An Bắc/Nam`, `Đông Hải`, `Phước Hải`, `Vĩnh Hải`, `Ninh Hải`, `Ninh Sơn`, `Vạn Thạnh` xuất hiện ở **nhiều ward**. Đó là sự thật của nghị quyết (xã cũ bị xẻ, hoặc tên trùng giữa hai tỉnh cũ) — giữ nguyên để matcher nhận ra thế mơ hồ.
2. Tên thị trấn cũ bỏ tiền tố "Thị trấn" (`Vạn Giã`, `Cam Đức`, `Tô Hạp`, `Khánh Hải`, `Tân Sơn`, `Phước Dân`, `Trường Sa`) — người viết không kèm tiền tố.
3. Ba đơn vị mới trùng tên đơn vị cũ của chính nó (`Xã Diên Khánh` ⊃ thị trấn Diên Khánh, `Xã Khánh Vĩnh` ⊃ thị trấn Khánh Vĩnh) đã bỏ tên cũ trùng ra khỏi `oldNames` vì alias official đã phủ.

- [ ] **Step 2: Cán bộ verify — CỔNG CHẶN**

Trình file cho chủ dự án đối chiếu với NQ 1667. Dừng lại ở đây tới khi được xác nhận. Kiểm tối thiểu: đủ 65 mục; đúng 16 phường / 48 xã / 1 đặc khu; danh sách `requiresCue` có thiếu tên nào trùng từ thông thường không.

- [ ] **Step 3: Viết script seed**

```typescript
/**
 * Sinh gazetteer từ khanh-hoa-wards.ts → spatial.wards + spatial.ward_aliases.
 * Idempotent: xóa alias cũ của ward rồi ghi lại; ward khớp theo `name`.
 *
 * Chạy: npx ts-node -r tsconfig-paths/register src/scripts/seed-wards.ts
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { Ward } from '../modules/geography/entities/ward.entity';
import { WardAlias } from '../modules/geography/entities/ward-alias.entity';
import { WARDS } from '../modules/geography/data/khanh-hoa-wards';
import { normalizeAlias } from '../modules/geography/services/ward-matcher';

// Bỏ tiền tố loại để lấy tên gọi thường ngày: "Phường Nha Trang" → "Nha Trang"
function stripPrefix(name: string): string {
  return name.replace(/^(Phường|Xã|Đặc khu|Thị trấn)\s+/i, '');
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const wardRepo: Repository<Ward> = app.get(getRepositoryToken(Ward));
  const aliasRepo: Repository<WardAlias> = app.get(getRepositoryToken(WardAlias));

  let nWard = 0;
  let nAlias = 0;
  for (const seed of WARDS) {
    let ward = await wardRepo.findOne({ where: { name: seed.name } });
    if (!ward) {
      ward = wardRepo.create({ name: seed.name });
      nWard++;
    }
    ward.shortName = stripPrefix(seed.name);
    ward.wardType = seed.type;
    ward.region = seed.region;
    await wardRepo.save(ward);

    // Ghi lại toàn bộ alias của ward này để script chạy lại không nhân đôi
    await aliasRepo.delete({ wardId: ward.id });

    const rows: Partial<WardAlias>[] = [];
    // Alias official: cả tên đầy đủ lẫn tên rút gọn
    for (const a of [seed.name, ward.shortName]) {
      rows.push({
        wardId: ward.id,
        alias: a,
        aliasNorm: normalizeAlias(a),
        aliasType: 'official',
        requiresCue: seed.requiresCue ?? false,
      });
    }
    // Alias tên cũ: luôn requires_cue — tên cũ mơ hồ hơn tên hiện hành
    for (const old of seed.oldNames) {
      rows.push({
        wardId: ward.id,
        alias: old,
        aliasNorm: normalizeAlias(old),
        aliasType: 'old_ward',
        requiresCue: true,
      });
    }
    // Khử trùng trong cùng 1 ward (vd short_name trùng 1 old name) — UNIQUE(alias_norm, ward_id)
    const seen = new Set<string>();
    const deduped = rows.filter((r) =>
      seen.has(r.aliasNorm!) ? false : (seen.add(r.aliasNorm!), true),
    );
    await aliasRepo.save(deduped.map((r) => aliasRepo.create(r)));
    nAlias += deduped.length;
  }

  const total = await wardRepo.count();
  console.log(`✅ ward mới: ${nWard} | alias ghi: ${nAlias} | tổng ward: ${total}`);
  if (total !== 65) console.warn(`⚠️  Tổng ward = ${total}, kỳ vọng 65`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Lưu ý: script import `normalizeAlias` từ Task 3. Chạy script này **sau** Task 3.

- [ ] **Step 4: Commit (chưa chạy script)**

```bash
git add backend/src/modules/geography/data backend/src/scripts/seed-wards.ts
git commit -m "feat(geo): S6 data — danh mục 65 xã/phường + ánh xạ tên cũ theo NQ 1667"
```

---

## Task 3: Chuẩn hóa + quét n-gram (logic thuần)

**Files:**
- Create: `backend/src/modules/geography/services/ward-matcher.ts`
- Test: `backend/src/modules/geography/services/ward-matcher.spec.ts`

**Interfaces:**
- Produces:
  - `normalizeAlias(s: string): string`
  - `tokenizeVi(text: string): Token[]` với `Token = { norm: string; start: number; end: number }`
  - `AliasEntry = { wardId: string; alias: string; requiresCue: boolean }`
  - `AliasIndex = Map<string, AliasEntry[]>` (khóa = `alias_norm`)
  - `findHits(text: string, index: AliasIndex): Hit[]` với `Hit = { aliasNorm: string; entries: AliasEntry[]; start: number; end: number; tokenIndex: number }`

- [ ] **Step 1: Viết test thất bại**

```typescript
import { buildIndex, findHits, normalizeAlias, tokenizeVi } from './ward-matcher';

// Index nhỏ dựng tay — test thuần, không đụng DB
const INDEX = buildIndex([
  { wardId: 'w-nt', alias: 'Nha Trang', requiresCue: false },
  { wardId: 'w-bnt', alias: 'Bắc Nha Trang', requiresCue: false },
  { wardId: 'w-dk', alias: 'Diên Khánh', requiresCue: false },
]);

describe('normalizeAlias', () => {
  it('bỏ dấu, lowercase, gộp khoảng trắng', () => {
    expect(normalizeAlias('  Diên   Khánh ')).toBe('dien khanh');
    expect(normalizeAlias('Đặc khu Trường Sa')).toBe('dac khu truong sa');
  });
});

describe('tokenizeVi', () => {
  it('giữ offset gốc để cắt được text nguyên văn có dấu', () => {
    const toks = tokenizeVi('Tại xã Diên Khánh');
    const dien = toks.find((t) => t.norm === 'dien')!;
    expect('Tại xã Diên Khánh'.slice(dien.start, dien.end)).toBe('Diên');
  });
});

describe('findHits', () => {
  it('khớp cụm dài nhất trước — "Bắc Nha Trang" không bị nuốt thành "Nha Trang"', () => {
    const hits = findHits('Vụ việc ở Bắc Nha Trang hôm qua', INDEX);
    expect(hits).toHaveLength(1);
    expect(hits[0].entries[0].wardId).toBe('w-bnt');
  });

  it('cắt được location_text nguyên văn CÓ DẤU từ offset', () => {
    const text = 'Bắt giữ tại Diên Khánh';
    const hits = findHits(text, INDEX);
    expect(text.slice(hits[0].start, hits[0].end)).toBe('Diên Khánh');
  });

  it('khớp cả khi viết không dấu', () => {
    const hits = findHits('cong an dien khanh', INDEX);
    expect(hits[0].entries[0].wardId).toBe('w-dk');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

```bash
cd backend && npx jest src/modules/geography/services/ward-matcher.spec.ts
```
Expected: FAIL — `Cannot find module './ward-matcher'`.

- [ ] **Step 3: Implement**

```typescript
// Logic thuần khớp địa danh → ward. KHÔNG import NestJS, KHÔNG đụng DB.
// Tách thuần để test tất định (cùng cách actor-aggregator.ts tách khỏi job).

export interface Token {
  norm: string; // đã lowercase + bỏ dấu
  start: number; // offset trong CHUỖI GỐC (có dấu)
  end: number;
}

export interface AliasEntry {
  wardId: string;
  alias: string;
  requiresCue: boolean;
}

export type AliasIndex = Map<string, AliasEntry[]>;

export interface Hit {
  aliasNorm: string;
  entries: AliasEntry[]; // >1 phần tử = alias trỏ nhiều ward = mơ hồ
  start: number;
  end: number;
  tokenIndex: number; // vị trí token đầu của cụm, để dò cue phía trước
}

// Số token tối đa của một tên đơn vị ("Đặc khu Trường Sa" = 4)
const MAX_NGRAM = 5;

// Bỏ dấu tiếng Việt. đ/Đ không phải tổ hợp dấu nên phải thay tay sau khi strip.
function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // dải dấu thanh tổ hợp Unicode
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

// Chuẩn hóa một alias về khóa index: lowercase, bỏ dấu, gộp khoảng trắng
export function normalizeAlias(s: string): string {
  return stripDiacritics(s.normalize('NFC').toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Tách text thành token, chuẩn hóa TỪNG TỪ và giữ offset trong chuỗi gốc.
 *
 * Cố ý không chuẩn hóa cả chuỗi rồi dò lại vị trí: NFD làm lệch chỉ số ký tự,
 * trong khi ta cần offset gốc để cắt location_text nguyên văn CÓ DẤU.
 */
export function tokenizeVi(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({
      norm: stripDiacritics(m[0].toLowerCase()),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return tokens;
}

// Dựng index từ danh sách alias: khóa alias_norm → các ward cùng mang tên đó
export function buildIndex(entries: AliasEntry[]): AliasIndex {
  const index: AliasIndex = new Map();
  for (const e of entries) {
    const key = normalizeAlias(e.alias);
    const bucket = index.get(key);
    if (bucket) bucket.push(e);
    else index.set(key, [e]);
  }
  return index;
}

/**
 * Quét text tìm mọi alias khớp, ưu tiên CỤM DÀI NHẤT.
 *
 * Dài nhất trước là bắt buộc: nếu không, "Bắc Nha Trang" sẽ bị nuốt thành
 * "Nha Trang" và mọi phường có hậu tố đều gán sai.
 */
export function findHits(text: string, index: AliasIndex): Hit[] {
  const tokens = tokenizeVi(text);
  const hits: Hit[] = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    // n giảm dần → cụm dài thắng cụm ngắn tại cùng vị trí
    for (let n = Math.min(MAX_NGRAM, tokens.length - i); n >= 1; n--) {
      const key = tokens
        .slice(i, i + n)
        .map((t) => t.norm)
        .join(' ');
      const entries = index.get(key);
      if (entries) {
        hits.push({
          aliasNorm: key,
          entries,
          start: tokens[i].start,
          end: tokens[i + n - 1].end,
          tokenIndex: i,
        });
        i += n; // nhảy qua cụm đã khớp, tránh khớp lồng nhau
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  return hits;
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

```bash
cd backend && npx jest src/modules/geography/services/ward-matcher.spec.ts
```
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/geography/services/ward-matcher.ts backend/src/modules/geography/services/ward-matcher.spec.ts
git commit -m "feat(geo): S6 lõi khớp — tokenize giữ offset + quét n-gram dài nhất trước"
```

---

## Task 4: Cue-gating + guard tỉnh khác

**Files:**
- Modify: `backend/src/modules/geography/services/ward-matcher.ts`
- Modify: `backend/src/modules/geography/services/ward-matcher.spec.ts`

**Interfaces:**
- Produces: `hasCue(tokens: Token[], tokenIndex: number): boolean`, `inOtherProvinceSentence(text: string, hitStart: number): boolean`; `findHits` nhận thêm tham số `text` để lọc.

- [ ] **Step 1: Viết test thất bại**

```typescript
const CUE_INDEX = buildIndex([
  { wardId: 'w-td', alias: 'Tân Định', requiresCue: true },
  { wardId: 'w-dk', alias: 'Diên Khánh', requiresCue: false },
]);

describe('cue-gating', () => {
  it('alias trùng từ thông thường KHÔNG khớp khi thiếu cue', () => {
    expect(findHits('anh ấy tân định cư ở đây', CUE_INDEX)).toHaveLength(0);
  });

  it('khớp khi có cue "xã"', () => {
    const hits = findHits('bắt tại xã Tân Định', CUE_INDEX);
    expect(hits[0].entries[0].wardId).toBe('w-td');
  });

  it('khớp khi có cue "tại"', () => {
    expect(findHits('xảy ra tại Tân Định', CUE_INDEX)).toHaveLength(1);
  });
});

describe('guard tỉnh khác', () => {
  it('bỏ qua địa danh khi cùng câu có tên tỉnh khác', () => {
    expect(findHits('Công an xã Tân Định, Bình Dương triệt phá', CUE_INDEX)).toHaveLength(0);
  });

  it('KHÔNG bỏ khi tỉnh nhắc tới là Khánh Hòa', () => {
    const hits = findHits('tại Diên Khánh, Khánh Hòa', CUE_INDEX);
    expect(hits).toHaveLength(1);
  });

  it('câu khác không ảnh hưởng nhau', () => {
    const hits = findHits('Tin từ Bình Dương. Vụ việc tại Diên Khánh.', CUE_INDEX);
    expect(hits).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Expected: FAIL — cue chưa được cài, alias `requiresCue` vẫn khớp trần.

- [ ] **Step 3: Implement**

Thêm vào `ward-matcher.ts`:

```typescript
// Tiền tố báo hiệu phía sau là địa danh. "đặc khu"/"thị trấn" là 2 token nên dò cả cặp.
const CUE_WORDS = new Set(['xa', 'phuong', 'thon', 'tai', 'o', 'thuoc', 'dia', 'ban']);
// Cue 2 token. BẮT BUỘC tách khỏi cue đơn-từ: bỏ dấu làm "trấn" (thị trấn) đụng
// nguyên vào họ "Trần" — họ phổ biến nhất VN — nên "Trần Bảo An" từng khớp nhầm
// thành xã Bảo An. Hồ sơ ANTT đầy "Trần Văn X" nên đây là gán sai quy mô lớn.
const CUE_BIGRAMS = new Set(['thi tran', 'dac khu']);

/**
 * Có cue ngay trước cụm không? Chỉ xét 1 token liền trước — cue xa hơn
 * thường thuộc về danh từ khác ("công an huyện X điều tra vụ Tân Định").
 */
export function hasCue(tokens: Token[], tokenIndex: number): boolean {
  if (tokenIndex === 0) return false;
  if (CUE_WORDS.has(tokens[tokenIndex - 1].norm)) return true;
  // "thị trấn X" / "đặc khu X": cue nằm ở 2 token, không thể bắt bằng từ đơn
  if (tokenIndex >= 2) {
    const bigram = `${tokens[tokenIndex - 2].norm} ${tokens[tokenIndex - 1].norm}`;
    return CUE_BIGRAMS.has(bigram);
  }
  return false;
}

// Tên tỉnh/thành KHÁC Khánh Hòa. Gồm CẢ tên hiện hành (33) LẪN tên cũ đã biến mất
// sau sáp nhập 01/7/2025 (28) — báo chí và MXH vẫn dùng tên cũ hàng ngày, guard chỉ
// biết tên mới là hở thật (Nghị quyết 202/2025/QH15).
// ⚠️ Ninh Thuận CỐ Ý không có: đã là một phần của Khánh Hòa mới.
const OTHER_PROVINCES = [
  'ha noi', 'hue', 'hai phong', 'da nang', 'ho chi minh', 'can tho',
  'lai chau', 'dien bien', 'son la', 'lang son', 'quang ninh', 'thanh hoa',
  'nghe an', 'ha tinh', 'tuyen quang', 'lao cai', 'thai nguyen', 'phu tho',
  'bac ninh', 'hung yen', 'ninh binh', 'quang tri', 'quang ngai', 'gia lai',
  'lam dong', 'dak lak', 'dong nai', 'tay ninh', 'vinh long', 'dong thap',
  'an giang', 'ca mau', 'cao bang',
  // 28 tên tỉnh cũ đã biến mất khỏi cấp tỉnh (29 trừ Ninh Thuận)
  'ha giang', 'yen bai', 'bac kan', 'vinh phuc', 'hoa binh', 'bac giang',
  'thai binh', 'hai duong', 'ha nam', 'nam dinh', 'quang binh', 'quang nam',
  'kon tum', 'binh dinh', 'phu yen', 'dak nong', 'binh thuan', 'binh phuoc',
  'ba ria vung tau', 'binh duong', 'long an', 'tien giang', 'ben tre',
  'tra vinh', 'hau giang', 'soc trang', 'bac lieu', 'kien giang',
];

/**
 * Địa danh nằm trong câu có nhắc tỉnh/thành KHÁC thì không phải địa bàn của ta.
 *
 * Thiếu guard này thì mọi tin toàn quốc có tên trùng ("xã Tân Định, Bình Dương")
 * sẽ đổ vào bản đồ Khánh Hòa.
 */
export function inOtherProvinceSentence(text: string, hitStart: number): boolean {
  // Cắt đúng câu chứa hit: lùi/tiến tới dấu kết câu gần nhất
  // Phải xét cả ! và ? ở chiều lùi, không chỉ dấu chấm — nếu không, câu trước kết
  // bằng "!" sẽ bị nối vào câu chứa hit và guard chặn nhầm.
  let from = 0;
  for (const ch of ['.', '\n', '!', '?']) {
    const p = text.lastIndexOf(ch, hitStart);
    if (p !== -1 && p + 1 > from) from = p + 1;
  }
  let to = text.length;
  for (const ch of ['.', '\n', '!', '?']) {
    const p = text.indexOf(ch, hitStart);
    if (p !== -1 && p < to) to = p;
  }
  const sentence = normalizeAlias(text.slice(from, to));
  return OTHER_PROVINCES.some((p) => sentence.includes(p));
}
```

Sửa `findHits` — sau khi tìm được `entries`, lọc trước khi push:

```typescript
      if (entries) {
        // Alias mơ hồ (trùng từ thông thường) chỉ nhận khi có tiền tố báo hiệu
        const needCue = entries.every((e) => e.requiresCue);
        const ok =
          (!needCue || hasCue(tokens, i)) &&
          !inOtherProvinceSentence(text, tokens[i].start);
        if (ok) {
          hits.push({ ... });
        }
        i += n;
        matched = true;
        break;
      }
```

`entries.every` chứ không phải `some`: chỉ cần một ward mang tên này ở dạng không-cần-cue thì cả cụm được nhận.

- [ ] **Step 4: Chạy test, xác nhận PASS**

```bash
cd backend && npx jest src/modules/geography/services/ward-matcher.spec.ts
```
Expected: PASS, 11 test.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/geography/services/ward-matcher.ts backend/src/modules/geography/services/ward-matcher.spec.ts
git commit -m "feat(geo): S6 cue-gating + guard tỉnh khác — chặn dương tính giả tên trùng"
```

---

## Task 5: Thang vai trò P1–P4 + phân giải

**Files:**
- Modify: `backend/src/modules/geography/services/ward-matcher.ts`
- Modify: `backend/src/modules/geography/services/ward-matcher.spec.ts`

**Interfaces:**
- Produces:
  - `LocationRole = 'P1' | 'P2' | 'P3' | 'P4'`
  - `LocationCandidate = { alias: string; wardId: string; role: LocationRole; offset: number }`
  - `WardMatchResult = { wardId: string | null; locationText: string | null; matchedAlias: string | null; candidates: LocationCandidate[]; reason: 'matched' | 'ambiguous' | 'none' }`
  - `matchWard(text: string, index: AliasIndex): WardMatchResult`

- [ ] **Step 1: Viết test thất bại**

```typescript
const RES_INDEX = buildIndex([
  { wardId: 'w-dk', alias: 'Diên Khánh', requiresCue: false },
  { wardId: 'w-sh', alias: 'Suối Hiệp', requiresCue: false },
  // "Ninh Hải" trỏ 2 ward — thế mơ hồ có thật trong NQ 1667
  { wardId: 'w-nh-nt', alias: 'Ninh Hải', requiresCue: true },
  { wardId: 'w-dnh', alias: 'Ninh Hải', requiresCue: true },
]);

describe('matchWard — thang vai trò', () => {
  it('P2 "tại" thắng P3 "Công an xã"', () => {
    const r = matchWard(
      'Công an xã Diên Khánh bắt nhóm đối tượng tại xã Suối Hiệp',
      RES_INDEX,
    );
    expect(r.wardId).toBe('w-sh');
    expect(r.reason).toBe('matched');
  });

  it('P4 nơi cư trú bị loại, lấy nơi gây án', () => {
    const r = matchWard('Đối tượng trú tại xã Diên Khánh, gây án tại xã Suối Hiệp', RES_INDEX);
    expect(r.wardId).toBe('w-sh');
  });

  it('alias trỏ 2 ward → mơ hồ, KHÔNG gán nhưng giữ location_text', () => {
    const r = matchWard('Vụ việc xảy ra tại Ninh Hải', RES_INDEX);
    expect(r.wardId).toBeNull();
    expect(r.reason).toBe('ambiguous');
    expect(r.locationText).toBe('Ninh Hải');
  });

  it('không khớp gì → none, mọi trường null', () => {
    const r = matchWard('Hôm nay trời đẹp', RES_INDEX);
    expect(r).toEqual({
      wardId: null, locationText: null, matchedAlias: null,
      candidates: [], reason: 'none',
    });
  });

  it('chỉ có P4 → không gán (nơi cư trú không phải nơi xảy ra)', () => {
    const r = matchWard('Đối tượng thường trú tại xã Diên Khánh', RES_INDEX);
    expect(r.wardId).toBeNull();
    expect(r.reason).toBe('none');
  });

  it('candidates giữ mọi địa danh kèm vai trò để tính lại sau', () => {
    const r = matchWard('Công an xã Diên Khánh bắt tại xã Suối Hiệp', RES_INDEX);
    expect(r.candidates.map((c) => c.role).sort()).toEqual(['P2', 'P3']);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Expected: FAIL — `matchWard is not a function`.

- [ ] **Step 3: Implement**

```typescript
export type LocationRole = 'P1' | 'P2' | 'P3' | 'P4';

export interface LocationCandidate {
  alias: string;
  wardId: string;
  role: LocationRole;
  offset: number;
}

export interface WardMatchResult {
  wardId: string | null;
  locationText: string | null;
  matchedAlias: string | null;
  candidates: LocationCandidate[];
  reason: 'matched' | 'ambiguous' | 'none';
}

// Cụm báo hiệu vai trò, dò trong cửa sổ 4 token TRƯỚC cụm địa danh.
const P1_PATTERNS = ['xay ra tai', 'xay ra o', 'tren dia ban', 'thuoc dia ban'];
const P3_PATTERNS = ['cong an', 'ubnd', 'uy ban', 'don bien phong', 'tram', 'ban chqs', 'vks', 'toa an'];
const P4_PATTERNS = ['tru tai', 'ngu tai', 'thuong tru', 'que o', 'que quan'];

/**
 * Xác định vai trò của địa danh trong câu.
 *
 * Đây là phần thay cho "đếm tần suất": "Công an xã A bắt ... tại xã B" thì
 * đếm tần suất hòa 1-1 rồi lấy A (sai), còn xét vai trò thì P2 thắng P3 → B (đúng).
 */
export function classifyRole(tokens: Token[], tokenIndex: number): LocationRole {
  const from = Math.max(0, tokenIndex - 4);
  const window = tokens.slice(from, tokenIndex).map((t) => t.norm).join(' ');

  // Thứ tự kiểm quan trọng: P4 (nơi cư trú) phải chặn trước P2, vì "trú tại X"
  // cũng chứa "tại" và sẽ bị nhận nhầm thành vị trí nơi xảy ra.
  if (P4_PATTERNS.some((p) => window.includes(p))) return 'P4';
  if (P1_PATTERNS.some((p) => window.includes(p))) return 'P1';
  if (P3_PATTERNS.some((p) => window.includes(p))) return 'P3';
  return 'P2'; // giới từ trần "tại/ở", hoặc nhắc trần không cue
}

const ROLE_RANK: Record<LocationRole, number> = { P1: 3, P2: 2, P3: 1, P4: 0 };

/**
 * Khớp text → 1 ward. Flow: findHits → gắn vai trò → loại P4 → chọn theo thang.
 *
 * Quy tắc chọn (spec §Phân giải): hạng vai trò cao nhất → nhắc nhiều lần nhất
 * → xuất hiện sớm nhất. Chuỗi này luôn cho ra kết quả khi có ứng viên hợp lệ.
 */
export function matchWard(text: string, index: AliasIndex): WardMatchResult {
  const tokens = tokenizeVi(text);
  const hits = findHits(text, index);
  const empty: WardMatchResult = {
    wardId: null, locationText: null, matchedAlias: null,
    candidates: [], reason: 'none',
  };
  if (hits.length === 0) return empty;

  const candidates: LocationCandidate[] = [];
  for (const h of hits) {
    const role = classifyRole(tokens, h.tokenIndex);
    for (const e of h.entries) {
      candidates.push({ alias: e.alias, wardId: e.wardId, role, offset: h.start });
    }
  }

  // Alias trỏ ≥2 ward = mơ hồ. alias_type KHÔNG được dùng để phá thế này:
  // "Ninh Hải" là xã mới ở Ninh Thuận VÀ phường cũ của Ninh Hòa, cách nhau >100km.
  const usable = hits.filter(
    (h) => h.entries.length === 1 && classifyRole(tokens, h.tokenIndex) !== 'P4',
  );
  if (usable.length === 0) {
    const ambiguous = hits.find((h) => h.entries.length > 1);
    if (ambiguous) {
      return {
        wardId: null,
        locationText: text.slice(ambiguous.start, ambiguous.end),
        matchedAlias: ambiguous.entries[0].alias,
        candidates,
        reason: 'ambiguous',
      };
    }
    // Chỉ còn P4 (nơi cư trú) → không phải nơi xảy ra, không gán
    return { ...empty, candidates };
  }

  // Gom theo ward để đếm số lần nhắc
  const byWard = new Map<string, { rank: number; count: number; first: Hit }>();
  for (const h of usable) {
    const wardId = h.entries[0].wardId;
    const rank = ROLE_RANK[classifyRole(tokens, h.tokenIndex)];
    const cur = byWard.get(wardId);
    if (!cur) byWard.set(wardId, { rank, count: 1, first: h });
    else {
      cur.count++;
      if (rank > cur.rank) {
        cur.rank = rank;
        cur.first = h; // giữ lần nhắc có vai trò mạnh nhất để cắt location_text
      }
    }
  }

  const [wardId, best] = [...byWard.entries()].sort(
    (a, b) =>
      b[1].rank - a[1].rank || // hạng vai trò cao nhất
      b[1].count - a[1].count || // nhắc nhiều lần nhất
      a[1].first.start - b[1].first.start, // xuất hiện sớm nhất
  )[0];

  return {
    wardId,
    locationText: text.slice(best.first.start, best.first.end),
    matchedAlias: best.first.entries[0].alias,
    candidates,
    reason: 'matched',
  };
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

```bash
cd backend && npx jest src/modules/geography/services/ward-matcher.spec.ts
```
Expected: PASS, 17 test.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/geography/services/ward-matcher.ts backend/src/modules/geography/services/ward-matcher.spec.ts
git commit -m "feat(geo): S6 thang vai trò P1-P4 — chọn nơi xảy ra, loại nơi cư trú"
```

---

## Task 6: WardMatcherService (wrapper Nest)

**Files:**
- Create: `backend/src/modules/geography/services/ward-matcher.service.ts`
- Test: `backend/src/modules/geography/services/ward-matcher.service.spec.ts`
- Modify: `backend/src/modules/geography/geography.module.ts`

**Interfaces:**
- Consumes: `matchWard`, `buildIndex`, `normalizeAlias`, `AliasIndex` từ Task 3–5.
- Produces: `WardMatcherService.match(text: string, nerLocs?: string[]): Promise<WardMatchResult>`, `WardMatcherService.reloadIndex(): Promise<void>`.

- [ ] **Step 1: Viết test thất bại**

```typescript
import { WardMatcherService } from './ward-matcher.service';

describe('WardMatcherService', () => {
  const aliasRows = [
    { wardId: 'w-dk', alias: 'Diên Khánh', requiresCue: false },
  ];

  function make() {
    const aliasRepo: any = { find: async () => aliasRows };
    const unmatchedSaved: any[] = [];
    const unmatchedRepo: any = {
      findOne: async () => null,
      create: (x: any) => x,
      save: async (x: any) => {
        unmatchedSaved.push(x);
        return x;
      },
    };
    return {
      svc: new WardMatcherService(aliasRepo, unmatchedRepo),
      unmatchedSaved,
    };
  }

  it('nạp index từ DB rồi khớp được', async () => {
    const { svc } = make();
    const r = await svc.match('Bắt giữ tại Diên Khánh');
    expect(r.wardId).toBe('w-dk');
  });

  it('LOC của NER không khớp alias nào → ghi unmatched_locations', async () => {
    const { svc, unmatchedSaved } = make();
    await svc.match('Tin tức', ['Hòn Rớ']);
    expect(unmatchedSaved).toHaveLength(1);
    expect(unmatchedSaved[0].textNorm).toBe('hon ro');
  });

  it('LOC khớp alias đã có → KHÔNG ghi unmatched', async () => {
    const { svc, unmatchedSaved } = make();
    await svc.match('tại Diên Khánh', ['Diên Khánh']);
    expect(unmatchedSaved).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Implement**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WardAlias } from '../entities/ward-alias.entity';
import { UnmatchedLocation } from '../entities/unmatched-location.entity';
import {
  AliasIndex,
  buildIndex,
  matchWard,
  normalizeAlias,
  WardMatchResult,
} from './ward-matcher';

/**
 * Bọc logic thuần ward-matcher bằng tầng Nest: nạp gazetteer từ DB (cache trong
 * bộ nhớ) và ghi lưới vớt LOC chưa biết. Mọi quyết định khớp nằm ở hàm thuần.
 */
@Injectable()
export class WardMatcherService {
  private readonly logger = new Logger(WardMatcherService.name);
  private index: AliasIndex | null = null;

  constructor(
    @InjectRepository(WardAlias) private aliasRepo: Repository<WardAlias>,
    @InjectRepository(UnmatchedLocation)
    private unmatchedRepo: Repository<UnmatchedLocation>,
  ) {}

  // Nạp lại index (gọi sau khi seed/sửa gazetteer mà không restart app)
  async reloadIndex(): Promise<void> {
    const rows = await this.aliasRepo.find();
    this.index = buildIndex(
      rows.map((r) => ({
        wardId: r.wardId,
        alias: r.alias,
        requiresCue: r.requiresCue,
      })),
    );
  }

  async match(text: string, nerLocs?: string[]): Promise<WardMatchResult> {
    // Gazetteer chỉ ~700 mục và đổi rất hiếm → nạp 1 lần, giữ trong bộ nhớ
    if (!this.index) await this.reloadIndex();
    const result = matchWard(text, this.index!);

    // Lưới vớt: LOC nào NER thấy mà gazetteer không biết → ghi lại để bổ sung alias
    for (const loc of nerLocs ?? []) {
      const norm = normalizeAlias(loc);
      if (!norm || this.index!.has(norm)) continue;
      await this.recordUnmatched(norm, loc);
    }
    return result;
  }

  // Upsert đếm số lần gặp. Lỗi ở đây không được ảnh hưởng kết quả khớp.
  private async recordUnmatched(norm: string, raw: string): Promise<void> {
    try {
      const existing = await this.unmatchedRepo.findOne({
        where: { textNorm: norm },
      });
      if (existing) {
        existing.occurrences++;
        existing.lastSeen = new Date();
        await this.unmatchedRepo.save(existing);
        return;
      }
      await this.unmatchedRepo.save(
        this.unmatchedRepo.create({
          textNorm: norm,
          textRaw: raw,
          occurrences: 1,
          firstSeen: new Date(),
          lastSeen: new Date(),
        }),
      );
    } catch (e) {
      this.logger.warn(`Không ghi được unmatched_location "${norm}": ${e}`);
    }
  }
}
```

- [ ] **Step 4: Đăng ký provider**

Trong `geography.module.ts`: thêm `WardMatcherService` vào `providers` và `exports`.

- [ ] **Step 5: Chạy test + build**

```bash
cd backend && npx jest src/modules/geography && npm run build
```
Expected: PASS 20 test, build sạch.

- [ ] **Step 6: Chạy seed gazetteer lên DB thật**

```bash
cd backend && npx ts-node -r tsconfig-paths/register src/scripts/seed-wards.ts
```
Expected: `✅ ward mới: 65 | alias ghi: ~350 | tổng ward: 65`. Nếu tổng ≠ 65 thì dừng, kiểm lại data file.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/geography
git commit -m "feat(geo): S6 WardMatcherService — nạp gazetteer + lưới vớt LOC chưa biết"
```

---

## Task 7: Cắm vào worker NLP

**Files:**
- Modify: `backend/src/modules/osint/services/nlp-process/nlp-process.processor.ts`
- Modify: `backend/src/modules/osint/osint.module.ts` (import `GeographyModule`)
- Modify: `backend/src/modules/osint/entities/osint-post-nlp.entity.ts` (4 cột mới)
- Modify: `backend/src/modules/osint/entities/osint-alert.entity.ts` (`wardId`)
- Test: `backend/src/modules/osint/services/nlp-process/nlp-process.processor.spec.ts`

**Interfaces:**
- Consumes: `WardMatcherService.match(text, nerLocs)` từ Task 6.
- Produces: `osint_post_nlp.ward_id` được điền trong luồng worker.

- [ ] **Step 1: Thêm cột vào entity**

Trong `osint-post-nlp.entity.ts`:

```typescript
  // S6 địa bàn hóa — NULL khi không khớp được đúng 1 xã (mơ hồ hoặc không có địa danh)
  @Column('uuid', { name: 'ward_id', nullable: true })
  wardId: string | null;

  // Cụm địa danh bắt được trong bài, giữ nguyên văn kể cả khi wardId NULL
  @Column('varchar', { length: 200, name: 'location_text', nullable: true })
  locationText: string | null;

  @Column('varchar', { length: 150, name: 'matched_alias', nullable: true })
  matchedAlias: string | null;

  // Mọi địa danh kèm vai trò P1-P4 — để đổi luật chọn sau mà không phải quét lại bài
  @Column('jsonb', { name: 'location_candidates', nullable: true })
  locationCandidates: unknown | null;
```

Trong `osint-alert.entity.ts`:

```typescript
  // S6 — alert kế thừa địa bàn từ post
  @Column('uuid', { name: 'ward_id', nullable: true })
  wardId: string | null;
```

- [ ] **Step 2: Viết test thất bại**

Thêm vào `nlp-process.processor.spec.ts` (giữ nguyên cách dựng mock đang có trong file, thêm mock `wardMatcher` vào danh sách tham số constructor):

```typescript
  it('S6: post có địa danh → điền ward_id vào post_nlp', async () => {
    const wardMatcher: any = {
      match: async () => ({
        wardId: 'w-dk', locationText: 'Diên Khánh', matchedAlias: 'Diên Khánh',
        candidates: [], reason: 'matched',
      }),
    };
    // ... dựng processor với wardMatcher, chạy handle({postId})
    expect(savedNlp.wardId).toBe('w-dk');
    expect(savedNlp.locationText).toBe('Diên Khánh');
  });

  it('S6: matcher ném lỗi → post vẫn done, ward_id NULL', async () => {
    const wardMatcher: any = {
      match: async () => {
        throw new Error('gazetteer chết');
      },
    };
    // ... chạy handle
    expect(savedNlp.processingStatus).toBe('done');
    expect(savedNlp.wardId).toBeNull();
  });
```

- [ ] **Step 3: Chạy test, xác nhận FAIL**

```bash
cd backend && npx jest src/modules/osint/services/nlp-process
```
Expected: FAIL — constructor chưa nhận `wardMatcher`.

- [ ] **Step 4: Implement**

Thêm `private wardMatcher: WardMatcherService` vào constructor. Chèn **bước 3.5** ngay sau khi có `nerEntities` (bước 3), trước bước 4:

```typescript
      // 3.5. S6 địa bàn hóa: khớp địa danh → 1 xã/phường. Dùng LOC của NER làm lưới vớt.
      // Null-safe: gazetteer lỗi KHÔNG được làm chết bài — địa bàn là thuộc tính mô tả.
      let geo = {
        wardId: null as string | null,
        locationText: null as string | null,
        matchedAlias: null as string | null,
        candidates: [] as unknown[],
      };
      try {
        const locs = (nerEntities ?? [])
          .filter((e) => e.type === 'LOC')
          .map((e) => e.text);
        geo = await this.wardMatcher.match(normalizedContent, locs);
      } catch (e) {
        this.logger.warn(`Địa bàn hóa thất bại post ${postId}: ${e}`);
      }
```

Ở bước 6, trước `await this.postNlpRepo.save(nlp)`:

```typescript
      // S6: ghi địa bàn. KHÔNG đưa vào Gate — địa bàn không phải tín hiệu notability.
      nlp.wardId = geo.wardId;
      nlp.locationText = geo.locationText;
      nlp.matchedAlias = geo.matchedAlias;
      nlp.locationCandidates = geo.candidates.length > 0 ? geo.candidates : null;
```

Ở bước 7, sau khi tạo alert, gán `ward_id` cho alert vừa tạo (alert service trả về entity hoặc null):

```typescript
        const created = await this.alert.createAlertFromGate(...);
        // Alert kế thừa địa bàn của post để S7/S9 lọc cảnh báo theo xã
        if (created && geo.wardId) {
          created.wardId = geo.wardId;
          await this.alertRepo.save(created);
        }
```

Nếu processor chưa có `alertRepo`, thay bằng cách truyền `wardId` vào `createAlertFromGate` như tham số thêm và để `AlertService` gán trước khi save — chọn cách nào ít sửa hơn, miễn `osint_alerts.ward_id` được điền.

Trong `osint.module.ts`: thêm `GeographyModule` vào `imports`.

- [ ] **Step 5: Chạy toàn bộ test + build**

```bash
cd backend && npx jest && npm run build
```
Expected: PASS toàn bộ (98 cũ + test mới), build sạch. Không được có regression.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/osint backend/src/modules/geography
git commit -m "feat(geo): S6 cắm địa bàn hóa vào worker NLP — null-safe, không đụng Gate"
```

---

## Task 8: Đo precision trên mẫu gán tay

**Files:**
- Create: `backend/src/scripts/measure-ward-precision.ts`
- Create: `backend/database/samples/ward-gold-100.csv` (do cán bộ điền)

**Cổng chất lượng — chạy TRƯỚC Task 9.** Không có phép đo này thì "chính xác" chỉ là ý kiến.

- [ ] **Step 1: Xuất 100 bài ngẫu nhiên để gán tay**

```bash
psql -U postgres -d kh_soms -A -F',' -c "
COPY (
  SELECT p.id, replace(substr(p.content, 1, 300), E'\n', ' ')
  FROM osint.osint_posts p
  JOIN osint.osint_post_nlp n ON n.post_id = p.id
  ORDER BY random() LIMIT 100
) TO STDOUT WITH CSV HEADER" > backend/database/samples/ward-gold-100.csv
```

Cán bộ thêm cột thứ ba `gold_ward_name`: tên xã/phường đúng, hoặc để trống nếu bài không nêu địa bàn.

- [ ] **Step 2: Viết script đo**

```typescript
/**
 * Đo precision/recall của WardMatcher trên mẫu gán tay.
 * precision = đúng / số bài máy CÓ gán;  recall = đúng / số bài người gán được.
 *
 * Chạy: npx ts-node -r tsconfig-paths/register src/scripts/measure-ward-precision.ts
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import { AppModule } from '../app.module';
import { OsintPost } from '../modules/osint/entities/osint-post.entity';
import { Ward } from '../modules/geography/entities/ward.entity';
import { WardMatcherService } from '../modules/geography/services/ward-matcher.service';
import { NormalizeService } from '../modules/osint/services/normalize/normalize.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const postRepo: Repository<OsintPost> = app.get(getRepositoryToken(OsintPost));
  const wardRepo: Repository<Ward> = app.get(getRepositoryToken(Ward));
  const matcher = app.get(WardMatcherService);
  const normalize = app.get(NormalizeService);

  const wards = await wardRepo.find();
  const nameById = new Map(wards.map((w) => [w.id, w.name]));

  const lines = fs.readFileSync('database/samples/ward-gold-100.csv', 'utf8')
    .split('\n').slice(1).filter(Boolean);

  let tp = 0, machineTagged = 0, goldTagged = 0, wrong = 0;
  const mistakes: string[] = [];

  for (const line of lines) {
    const [postId, , gold] = line.split(',');
    const post = await postRepo.findOne({ where: { id: postId } });
    if (!post) continue;
    const { normalizedContent } = normalize.normalize(post.content ?? '');
    const r = await matcher.match(normalizedContent);
    const predicted = r.wardId ? nameById.get(r.wardId) ?? null : null;
    const goldName = (gold ?? '').trim() || null;

    if (predicted) machineTagged++;
    if (goldName) goldTagged++;
    if (predicted && goldName && predicted === goldName) tp++;
    else if (predicted && predicted !== goldName) {
      wrong++;
      mistakes.push(`${postId}: máy=${predicted} | người=${goldName ?? '(trống)'}`);
    }
  }

  console.log(`Máy gán: ${machineTagged} | Người gán: ${goldTagged} | Đúng: ${tp} | Sai: ${wrong}`);
  console.log(`Precision: ${machineTagged ? ((tp / machineTagged) * 100).toFixed(1) : 0}%`);
  console.log(`Recall:    ${goldTagged ? ((tp / goldTagged) * 100).toFixed(1) : 0}%`);
  console.log('\n--- Ca sai (đọc để siết luật) ---\n' + mistakes.join('\n'));
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Chạy đo và quyết định**

```bash
cd backend && npx ts-node -r tsconfig-paths/register src/scripts/measure-ward-precision.ts
```

**Precision quan trọng hơn recall** ở đây: gán sai làm bản đồ cảnh báo chỉ nhầm xã, tệ hơn hẳn là không gán. Đọc danh sách ca sai, sửa `requiresCue` / pattern vai trò / danh mục alias, đo lại. Chỉ sang Task 9 khi chủ dự án chấp nhận con số.

- [ ] **Step 4: Commit**

```bash
git add backend/src/scripts/measure-ward-precision.ts backend/database/samples/ward-gold-100.csv
git commit -m "test(geo): S6 bộ đo precision địa bàn hóa trên 100 bài gán tay"
```

---

## Task 9: Backfill

**Files:**
- Create: `backend/src/scripts/backfill-ward.ts`

- [ ] **Step 1: Viết script**

```typescript
/**
 * Gán địa bàn ngược cho bài đã thu (S7 cần lịch sử mới tính được baseline).
 *
 * normalizedContent KHÔNG được lưu trong DB (chỉ contentHash) → normalize lại
 * từ post.content. Normalize là hàm thuần nên chạy lại vô hại.
 *
 * Chạy thử: npx ts-node -r tsconfig-paths/register src/scripts/backfill-ward.ts --dry-run
 * Chạy thật: npx ts-node -r tsconfig-paths/register src/scripts/backfill-ward.ts
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { OsintPostNlp } from '../modules/osint/entities/osint-post-nlp.entity';
import { OsintPost } from '../modules/osint/entities/osint-post.entity';
import { WardMatcherService } from '../modules/geography/services/ward-matcher.service';
import { NormalizeService } from '../modules/osint/services/normalize/normalize.service';

const PAGE = 500;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const nlpRepo: Repository<OsintPostNlp> = app.get(getRepositoryToken(OsintPostNlp));
  const postRepo: Repository<OsintPost> = app.get(getRepositoryToken(OsintPost));
  const matcher = app.get(WardMatcherService);
  const normalize = app.get(NormalizeService);

  let offset = 0;
  let seen = 0, matched = 0, ambiguous = 0, none = 0;

  for (;;) {
    // Chỉ đụng bài ĐÃ có bản ghi NLP; bài chưa qua worker sẽ được gán khi tới lượt
    const rows = await nlpRepo.find({ order: { createdAt: 'ASC' }, skip: offset, take: PAGE });
    if (rows.length === 0) break;

    for (const nlp of rows) {
      const post = await postRepo.findOne({ where: { id: nlp.postId } });
      if (!post) continue;
      const { normalizedContent } = normalize.normalize(post.content ?? '');
      const r = await matcher.match(normalizedContent);
      seen++;
      if (r.reason === 'matched') matched++;
      else if (r.reason === 'ambiguous') ambiguous++;
      else none++;

      if (!dryRun) {
        // Idempotent: ghi đè kết quả cũ, chạy lại không nhân đôi
        nlp.wardId = r.wardId;
        nlp.locationText = r.locationText;
        nlp.matchedAlias = r.matchedAlias;
        nlp.locationCandidates = r.candidates.length > 0 ? r.candidates : null;
        await nlpRepo.save(nlp);
      }
    }
    offset += rows.length;
    console.log(`... đã xử lý ${offset}`);
  }

  const pct = (n: number) => (seen ? ((n / seen) * 100).toFixed(1) : '0');
  console.log(
    `\n${dryRun ? '[DRY-RUN] ' : ''}Tổng ${seen} | gán được ${matched} (${pct(matched)}%) ` +
    `| mơ hồ ${ambiguous} (${pct(ambiguous)}%) | không có địa danh ${none} (${pct(none)}%)`,
  );
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Chạy dry-run**

```bash
cd backend && npx ts-node -r tsconfig-paths/register src/scripts/backfill-ward.ts --dry-run
```

Tỉ lệ gán được rất thấp (dưới ~10%) nghĩa là danh mục alias thiếu, **không phải** chuyện bình thường — kiểm `spatial.unmatched_locations` và bổ sung trước khi chạy thật. Sửa danh mục rẻ hơn nhiều so với ghi sai 4.900 bản ghi.

- [ ] **Step 3: Chạy thật**

```bash
cd backend && npx ts-node -r tsconfig-paths/register src/scripts/backfill-ward.ts
```

- [ ] **Step 4: Kiểm DB**

```sql
SELECT w.name, count(*) FROM osint.osint_post_nlp n
JOIN spatial.wards w ON w.id = n.ward_id
GROUP BY w.name ORDER BY count(*) DESC LIMIT 20;

SELECT text_raw, occurrences FROM spatial.unmatched_locations
ORDER BY occurrences DESC LIMIT 20;
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/scripts/backfill-ward.ts
git commit -m "feat(geo): S6 backfill địa bàn — idempotent, có dry-run, không đụng queue"
```

---

## Task 10: Endpoint thống kê + verify E2E

**Files:**
- Modify: `backend/src/modules/osint/osint.controller.ts`
- Modify: `backend/src/modules/osint/osint.service.ts`

**Interfaces:**
- Produces: `GET /api/v1/osint/wards/stats` → `{ wards: {name, wardType, region, postCount}[], unmatchedTop: {textRaw, occurrences}[] }`

- [ ] **Step 1: Thêm `getWardStats` vào `osint.service.ts`**

```typescript
  /**
   * Thống kê số bài đã gán theo từng xã/phường + top địa danh chưa khớp.
   * Phục vụ verify sau backfill và là nguồn dữ liệu đầu cho bản đồ S9.
   */
  async getWardStats() {
    // LEFT JOIN để xã chưa có bài nào vẫn hiện với count 0 (bản đồ cần đủ 65 ô)
    const wards = await this.wardRepo
      .createQueryBuilder('w')
      .leftJoin('osint.osint_post_nlp', 'n', 'n.ward_id = w.id')
      .select('w.name', 'name')
      .addSelect('w.ward_type', 'wardType')
      .addSelect('w.region', 'region')
      .addSelect('COUNT(n.id)', 'postCount')
      .groupBy('w.id')
      .orderBy('COUNT(n.id)', 'DESC')
      .getRawMany();

    const unmatchedTop = await this.unmatchedRepo.find({
      order: { occurrences: 'DESC' },
      take: 20,
    });
    return { wards, unmatchedTop };
  }
```

Thêm `Ward` và `UnmatchedLocation` repo vào constructor của `OsintService`.

- [ ] **Step 2: Thêm endpoint vào `osint.controller.ts`**

```typescript
  // GET /api/v1/osint/wards/stats — số bài theo địa bàn + địa danh chưa khớp
  @Get('wards/stats')
  async getWardStats() {
    return this.osintService.getWardStats();
  }
```

⚠️ Đặt route này **trước** bất kỳ route `@Get(':id')` nào trong cùng controller, nếu không `wards` sẽ bị nuốt thành `:id`.

- [ ] **Step 3: Build + full suite**

```bash
cd backend && npm run build && npx jest
```

- [ ] **Step 4: Verify E2E**

```bash
cd backend && npm run dev   # terminal riêng, CHỈ 1 instance (nhiều instance → EADDRINUSE + worker loạn)
curl -s 'http://localhost:3000/api/v1/osint/wards/stats' | head -40
```

Kiểm: đủ 65 ward trong kết quả; xã có nhiều bài nhất có hợp lý không (Nha Trang/Cam Ranh nên cao nếu nguồn thiên về tin thành phố).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/osint/osint.controller.ts backend/src/modules/osint/osint.service.ts
git commit -m "feat(geo): S6 endpoint GET /osint/wards/stats — số bài theo địa bàn"
```

---

## Task 11: Import polygon OSM (độc lập)

**Chỉ làm nếu Task 0 kết luận OSM có ranh giới MỚI.** Task 1–10 không phụ thuộc task này.

**Files:**
- Create: `backend/src/scripts/import-ward-geom.ts`

- [ ] **Step 1: Viết script**

```typescript
/**
 * Import ranh giới xã/phường từ OSM (Overpass) vào spatial.wards.geom.
 * Khớp ward theo tên chuẩn hóa; OSM thiếu tên nào thì bỏ qua, KHÔNG đoán.
 *
 * Chạy: npx ts-node -r tsconfig-paths/register src/scripts/import-ward-geom.ts
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { Ward } from '../modules/geography/entities/ward.entity';
import { normalizeAlias } from '../modules/geography/services/ward-matcher';

// admin_level=6 là cấp xã/phường của Khánh Hòa trên OSM — KHÔNG phải 8/9.
// Bỏ cấp huyện sau sáp nhập nên cấp xã dời lên 6; level 9 là tổ dân phố, không dùng.
// rel(1887959) = quan hệ "Tỉnh Khánh Hòa"; tra theo id thay vì theo tên cho chắc.
const QUERY = `[out:json][timeout:180];
rel(1887959);map_to_area->.kh;
relation(area.kh)["boundary"="administrative"]["admin_level"="6"];
out geom;`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const wardRepo: Repository<Ward> = app.get(getRepositoryToken(Ward));

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: new URLSearchParams({ data: QUERY }),
  });
  const data = (await res.json()) as { elements: any[] };

  const wards = await wardRepo.find();
  // Khớp theo short_name chuẩn hóa: OSM ghi "Phường Nha Trang" hoặc "Nha Trang" tùy nơi
  const byNorm = new Map(wards.map((w) => [normalizeAlias(w.shortName ?? w.name), w]));

  const stamp = `osm@${new Date().toISOString().slice(0, 10)}`;
  let ok = 0;
  const missing: string[] = [];

  for (const el of data.elements) {
    const name = el.tags?.name ?? '';
    const ward = byNorm.get(normalizeAlias(name.replace(/^(Phường|Xã|Đặc khu)\s+/i, '')));
    if (!ward) {
      missing.push(name);
      continue;
    }
    // Ghi bằng SQL thô: TypeORM không dựng được geometry PostGIS từ GeoJSON
    await wardRepo.query(
      `UPDATE spatial.wards
         SET geom = ST_Multi(ST_GeomFromGeoJSON($1)), geom_source = $2, updated_at = now()
       WHERE id = $3`,
      [JSON.stringify(toGeoJsonPolygon(el)), stamp, ward.id],
    );
    ok++;
  }

  console.log(`✅ Ghi geom cho ${ok}/${wards.length} ward`);
  if (missing.length) console.log(`⚠️  OSM có nhưng không khớp ward nào: ${missing.join(', ')}`);
  const empty = await wardRepo.query(`SELECT count(*) FROM spatial.wards WHERE geom IS NULL`);
  console.log(`⚠️  Ward chưa có ranh giới: ${empty[0].count}`);
  await app.close();
}

// Ghép các way của relation thành Polygon GeoJSON (outer ring đầu tiên)
function toGeoJsonPolygon(el: any) {
  const rings = (el.members ?? [])
    .filter((m: any) => m.role === 'outer' && m.geometry)
    .map((m: any) => m.geometry.map((p: any) => [p.lon, p.lat]));
  return { type: 'Polygon', coordinates: rings };
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Chạy và kiểm**

```bash
cd backend && npx ts-node -r tsconfig-paths/register src/scripts/import-ward-geom.ts
psql -U postgres -d kh_soms -c "
SELECT count(*) FILTER (WHERE geom IS NOT NULL) AS co_geom,
       count(*) FILTER (WHERE geom IS NULL) AS chua_co FROM spatial.wards;"
```

Ward thiếu `geom` **để NULL**, không đoán, không lấy tạm ranh giới cũ.

- [ ] **Step 3: Commit**

```bash
git add backend/src/scripts/import-ward-geom.ts
git commit -m "feat(geo): S6 import ranh giới OSM vào spatial.wards.geom"
```

---

## Self-Review

**Spec coverage:** mọi mục của spec có task tương ứng — schema (T1), dữ liệu nguồn + verify (T2), chuẩn hóa/n-gram (T3), cue + guard tỉnh (T4), thang P1–P4 (T5), lưới vớt unmatched (T6), wiring null-safe + không đụng Gate (T7), cổng đo precision (T8), backfill dry-run (T9), endpoint (T10), polygon OSM (T0 + T11).

**Type consistency:** `WardMatchResult` / `LocationCandidate` / `AliasIndex` / `AliasEntry` / `Hit` / `Token` khai ở T3–T5 và dùng nguyên tên ở T6–T9. `normalizeAlias` dùng chung bởi seed (T2), service (T6) và import geom (T11).

**Điểm cần chú ý khi thực thi:**
- T2 `seed-wards.ts` import từ `ward-matcher.ts` (T3) → chạy script sau khi T3 xong. Thứ tự commit không đổi, chỉ thứ tự *chạy*.
- T7 có hai cách gán `ward_id` cho alert; chọn cách ít sửa hơn tùy cấu trúc `AlertService` lúc đó.
- Danh sách `OTHER_PROVINCES` (T4) và `requiresCue` (T2) là phán đoán, cần cán bộ soát cùng lúc với danh mục 65 đơn vị.
