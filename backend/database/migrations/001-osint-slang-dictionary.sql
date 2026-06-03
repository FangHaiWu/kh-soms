-- =====================================================================
-- MIGRATION 001 — Bảng từ điển từ lóng (cán bộ nhập thủ công)
-- synchronize:false → tạo bảng thủ công. Khớp entity OsintSlangDictionary
-- gen_random_uuid(): pgcrypto đã enable ở seed trước
-- added_by: soft reference (chưa FK) → thêm FK ở Sprint 3 khi có public.users
-- =====================================================================
CREATE TABLE IF NOT EXISTS osint.osint_slang_dictionary (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term       varchar(200) NOT NULL,
  meaning    text NOT NULL,
  category   varchar(100),
  added_by   uuid NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_slang_term UNIQUE (term)
);
