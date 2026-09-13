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

-- Tên bảng đúng là osint_alerts (số nhiều) — xem 000-initial-osint-tables.sql
-- và @Entity({ name: 'osint_alerts' }) trong osint-alert.entity.ts
ALTER TABLE osint.osint_alerts
  ADD COLUMN IF NOT EXISTS ward_id uuid REFERENCES spatial.wards(id);
