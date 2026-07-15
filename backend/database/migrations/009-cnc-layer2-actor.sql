-- =====================================================================
-- Migration 009 — CNC Lớp 2: actor aggregation
-- osint_actor: chủ thể (group/account/domain/fingerprint) — generic đa loại
-- osint_actor_stat: thống kê gộp theo cửa sổ (30 ngày) — recompute định kỳ
-- An toàn chạy lại: CREATE TABLE IF NOT EXISTS.
-- =====================================================================

CREATE TABLE IF NOT EXISTS osint.osint_actor (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_type   varchar(20) NOT NULL,       -- group | account | domain | fingerprint
  actor_key    varchar(300) NOT NULL,      -- group: groupId | account: platformId:authorExternalId
  display_name varchar(300),
  platform_id  uuid,
  first_seen   timestamptz,
  last_seen    timestamptz,
  meta         jsonb,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  CONSTRAINT uq_actor UNIQUE (actor_type, actor_key)
);

CREATE TABLE IF NOT EXISTS osint.osint_actor_stat (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id uuid NOT NULL REFERENCES osint.osint_actor(id) ON DELETE CASCADE,
  window_days int NOT NULL,                 -- 30 (v1)
  post_count int NOT NULL DEFAULT 0,
  notable_count int NOT NULL DEFAULT 0,
  category_counts jsonb,                    -- {"lua-dao":5,...} chỉ nhóm CNC
  distinct_indicators int NOT NULL DEFAULT 0,
  last_post_at timestamptz,
  is_repeat_offender boolean NOT NULL DEFAULT false,
  computed_at timestamptz DEFAULT now(),
  CONSTRAINT uq_actor_stat UNIQUE (actor_id, window_days)
);
