-- =====================================================================
-- Migration 008 — CNC Lớp 1: category propagation (#1) + indicator slot (#3)
-- Thêm 2 cột vào osint_post_nlp:
--   matched_categories: category distinct của keyword khớp (backbone đa-đơn-vị, route đơn vị)
--   indicators: chỉ dấu CNC {type,raw,normalized} do IndicatorExtractorService điền (#3, nối sau)
-- An toàn chạy lại: ADD COLUMN IF NOT EXISTS.
-- =====================================================================

ALTER TABLE osint.osint_post_nlp ADD COLUMN IF NOT EXISTS matched_categories VARCHAR(100)[];
ALTER TABLE osint.osint_post_nlp ADD COLUMN IF NOT EXISTS indicators JSONB;
