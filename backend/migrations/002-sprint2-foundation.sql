-- Migration: 002-sprint2-foundation
-- Sprint 2: Multi-platform OSINT foundation
-- Bảng mới: osint_platforms, osint_groups, osint_posts, osint_comments, osint_crawl_logs, osint_post_nlp
-- Sửa: osint_keywords (thêm scope, group_ids, region, notes)
-- Chạy: docker exec -i postgres psql -U postgres -d kh_soms < backend/migrations/002-sprint2-foundation.sql

-- Bảng osint platform 
CREATE TABLE osint.osint_platforms (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(50) UNIQUE NOT NULL,
  display_name varchar(200) NOT NULL,
  is_active boolean DEFAULT TRUE,
  crawler_type varchar(100) NOT NULL,
  platform_settings jsonb,
  crawl_interval_minutes_default INT DEFAULT 180,
  trust_level SMALLINT DEFAULT 3,
  documentation_url varchar(500),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Bang osint_groups 
CREATE TABLE osint.osint_groups (
  id uuid primary key default uuid_generate_v4(),
  platform_id uuid not null references osint.osint_platforms(id) on delete restrict,
  external_group_id varchar(100),
  name varchar(200) not null,
  url varchar(500) not null,
  description text, 
  member_count int,
  is_active boolean default true,
  last_crawled_at timestamptz,
  crawl_interval_hours int,
  trust_level SMALLINT DEFAULT 3,
  tags text[],
  platform_specific_data jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Bang osint_posts
CREATE TABLE osint.osint_posts (
  id uuid primary key default uuid_generate_v4(),
  platform_id uuid not null references osint.osint_platforms(id) on delete restrict,
  group_id uuid references osint.osint_groups(id) on delete set null,
  external_post_id varchar(100),
  external_group_id varchar(100),
  author_name varchar(200),
  author_external_id varchar(100),
  content text not null,
  content_hash varchar(64),
  media_urls text[],
  engagement jsonb,
  comment_count int,
  nested_comment_count int,
  keywords text[],
  risk_score float,
  topic_category varchar(50),
  is_relevant boolean default false,
  source_ref_ids uuid[],
  platform_specific_data jsonb,
  crawled_at timestamptz default now(),
  published_at timestamptz,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  constraint uq_posts_platform_external unique (platform_id, external_post_id)
)