-- =====================================================================
-- MIGRATION 000 — Các bảng OSINT gốc (Sprint 1)
-- Tạo bằng synchronize:true trước đây — nay chuyển sang false
-- Dùng CREATE TABLE IF NOT EXISTS để an toàn với DB đang có data
-- Thứ tự chạy: 000 → 001 → 002
-- Chạy: docker exec -i postgres psql -U postgres -d kh_soms < backend/database/migrations/000-initial-osint-tables.sql
-- =====================================================================

-- Đảm bảo schema tồn tại
CREATE SCHEMA IF NOT EXISTS osint;

-- Đảm bảo extension uuid
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. osint_sources — Nguồn tin (báo điện tử, RSS feeds)
-- =====================================================================
CREATE TABLE IF NOT EXISTS osint.osint_sources (
  id                    uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  varchar(200) NOT NULL,
  url                   varchar(500) NOT NULL,
  type                  varchar(50)  NOT NULL,
  rss_feed_url          varchar(500),
  is_active             boolean     DEFAULT TRUE,
  crawl_interval_minutes integer    DEFAULT 15,
  last_crawled_at       timestamptz,
  trust_level           smallint    DEFAULT 3,
  created_at            timestamptz DEFAULT NOW(),
  updated_at            timestamptz DEFAULT NOW()
);

-- =====================================================================
-- 2. osint_keywords — Từ khóa ANTT (phiên bản gốc, không có scope/group_ids)
--    Các cột mới (scope, group_ids, region, notes, updated_at)
--    được thêm bằng ALTER TABLE trong 002-sprint2-foundation.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS osint.osint_keywords (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  category   varchar(100) NOT NULL,
  keyword    varchar(200) NOT NULL,
  is_active  boolean     DEFAULT TRUE,
  priority   smallint    DEFAULT 1,
  created_at timestamptz DEFAULT NOW(),
  CONSTRAINT uq_keyword_category_keyword UNIQUE (category, keyword)
);

-- =====================================================================
-- 3. osint_articles — Bài báo từ RSS (phụ thuộc osint_sources)
-- =====================================================================
CREATE TABLE IF NOT EXISTS osint.osint_articles (
  id                  uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id           uuid        REFERENCES osint.osint_sources(id) ON DELETE SET NULL,
  title               text        NOT NULL,
  content             text,
  url                 text        NOT NULL UNIQUE,
  author              varchar(200),
  published_at        timestamptz,
  crawled_at          timestamptz DEFAULT NOW(),
  content_hash        varchar(64) NOT NULL,
  language            varchar(10) DEFAULT 'vi',
  topics              text[],
  sentiment           varchar(20) DEFAULT 'neutral',
  keywords            text[],
  named_entities      jsonb,
  relevance_score     float       DEFAULT 0,
  is_relevant         boolean     DEFAULT FALSE,
  virality_score      float       DEFAULT 0,
  sensitivity_flag    boolean     DEFAULT FALSE,
  linked_subject_ids  uuid[],
  linked_incident_ids uuid[],
  reviewed_by         uuid,
  review_note         text,
  created_at          timestamptz DEFAULT NOW()
);

-- =====================================================================
-- 4. osint_alerts — Cảnh báo tự động từ NLP pipeline
-- =====================================================================
CREATE TABLE IF NOT EXISTS osint.osint_alerts (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_type       varchar(50) NOT NULL,
  severity         varchar(20) NOT NULL DEFAULT 'info',
  title            text        NOT NULL,
  description      text,
  source_ref_ids   uuid[],
  is_acknowledged  boolean     DEFAULT FALSE,
  acknowledged_by  uuid,
  acknowledged_at  timestamptz,
  created_at       timestamptz DEFAULT NOW()
);
