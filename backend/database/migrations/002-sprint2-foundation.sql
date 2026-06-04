-- Migration: 002-sprint2-foundation
-- Sprint 2: Multi-platform OSINT foundation
-- Bảng mới: osint_platforms, osint_groups, osint_posts, osint_comments, osint_crawl_logs, osint_post_nlp
-- Sửa: osint_keywords (thêm scope, group_ids, region, notes)
-- Chạy: docker exec -i postgres psql -U postgres -d kh_soms < backend/database/migrations/002-sprint2-foundation.sql

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

-- Bang osint_comments 
CREATE TABLE osint.osint_comments (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references osint.osint_posts(id) on delete cascade,
  external_comment_id varchar(100),
  parent_comment_id uuid references osint.osint_comments(id) on delete cascade,
  depth smallint default 0,
  author_name varchar(200),
  author_external_id varchar(100),
  content text not null,
  engagement jsonb,
  platform_specific_data jsonb,
  crawled_at timestamptz default now(),
  published_at timestamptz,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Bang osint.crawl_logs 
CREATE TABLE osint.osint_crawl_logs (
  id uuid primary key default uuid_generate_v4(),
  platform_id uuid references osint.osint_platforms(id) on delete set null,
  group_id uuid references osint.osint_groups(id) on delete set null,
  crawl_type varchar (50),
  status varchar(20),
  posts_collected int default 0,
  posts_skipped int default 0, 
  comments_collected int,
  error_message text,
  error_code varchar(50),
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_ms int,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
-- Bang osint_post_nlp
CREATE TABLE osint.osint_post_nlp (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid unique not null references osint.osint_posts(id) on delete cascade,
  is_relevant boolean default false,
  matched_keywords text[],
  top_keyword_priority smallint,
  has_slang boolean default false,
  detected_slang jsonb,
  topic_category varchar(50),
  trend_score float,
  risk_level varchar(20),
  processing_status varchar(20) default 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- ALTER TABLE osint_keywords — Thêm cột mới Sprint 2
-- IF NOT EXISTS: an toàn khi chạy lại trên DB đã có cột
-- =====================================================================
ALTER TABLE osint.osint_keywords
  ADD COLUMN IF NOT EXISTS scope      varchar(50)  NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS group_ids  uuid[],
  ADD COLUMN IF NOT EXISTS region     varchar(100),
  ADD COLUMN IF NOT EXISTS notes      text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz  DEFAULT NOW();

-- =====================================================================
-- INDEXES — Tăng tốc các query thường dùng
-- =====================================================================

-- osint_posts: lọc theo platform, nhóm, thời gian, relevance
CREATE INDEX IF NOT EXISTS idx_posts_platform_id   ON osint.osint_posts (platform_id);
CREATE INDEX IF NOT EXISTS idx_posts_group_id      ON osint.osint_posts (group_id);
CREATE INDEX IF NOT EXISTS idx_posts_published_at  ON osint.osint_posts (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_is_relevant   ON osint.osint_posts (is_relevant) WHERE is_relevant = TRUE;
CREATE INDEX IF NOT EXISTS idx_posts_crawled_at    ON osint.osint_posts (crawled_at DESC);

-- osint_comments: lọc theo bài viết và thread
CREATE INDEX IF NOT EXISTS idx_comments_post_id    ON osint.osint_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id  ON osint.osint_comments (parent_comment_id);

-- osint_crawl_logs: monitor crawl gần nhất theo platform/group
CREATE INDEX IF NOT EXISTS idx_crawl_logs_platform ON osint.osint_crawl_logs (platform_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_logs_group    ON osint.osint_crawl_logs (group_id, created_at DESC);

-- osint_post_nlp: lọc theo trạng thái xử lý
CREATE INDEX IF NOT EXISTS idx_post_nlp_status     ON osint.osint_post_nlp (processing_status);

-- osint_groups: lọc group đang active theo platform
CREATE INDEX IF NOT EXISTS idx_groups_platform_active ON osint.osint_groups (platform_id, is_active);