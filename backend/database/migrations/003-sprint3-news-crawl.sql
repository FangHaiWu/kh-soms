-- =====================================================================
-- 003 — Sprint 3: Cào báo không-RSS (trafilatura)
-- Forward-only: chỉ ALTER, không sửa file cũ.
-- =====================================================================

-- 1. Cột discovery_config: cấu hình discovery theo từng nguồn scrape
--    (method=selector|sitemap...). Nullable vì nguồn RSS không dùng.
ALTER TABLE osint.osint_sources
  ADD COLUMN IF NOT EXISTS discovery_config jsonb ;   -- ← điền kiểu

-- 2. Nới external_post_id: URL bài báo dài tới ~144 ký tự, vượt varchar(100)
ALTER TABLE osint.osint_posts
  ALTER COLUMN external_post_id type varchar(500) ;               -- ← điền TYPE ...