-- migration 005 sprint 4 fb comments
-- Dedup comment + cờ relevance. Chạy: docker exec -i postgres psql -U postgres -d kh_soms < backend/database/migrations/005-...sql

-- 1. Cột relevance (song song osint_posts) - NLP tầng 2 ghi vào đây 
ALTER TABLE osint.osint_comments
ADD COLUMN IF NOT EXISTS is_relevant boolean DEFAULT FALSE not null,
ADD COLUMN IF NOT EXISTS keywords text[];

-- 2. Dedup: cùng post + cùng external_comment_id = 1 comment 
ALTER TABLE osint.osint_comments 
  ADD CONSTRAINT uq_post_external_comment_id UNIQUE (post_id, external_comment_id);

-- Index tra comment theo post (đọc nhiều khi hiển thị / NLP) 
CREATE INDEX IF NOT EXISTS idx_comments_post_id    ON osint.osint_comments (post_id);