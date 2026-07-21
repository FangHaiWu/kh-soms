-- Bổ sung các cột vào bảng `osint_post_nlp` (sử dụng `ALTER TABLE`)
ALTER TABLE osint.osint_post_nlp ADD COLUMN IF NOT EXISTS sentiment_score FLOAT;
ALTER TABLE osint.osint_post_nlp ADD COLUMN IF NOT EXISTS entities JSONB;
ALTER TABLE osint.osint_post_nlp ADD COLUMN IF NOT EXISTS is_notable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE osint.osint_post_nlp ADD COLUMN IF NOT EXISTS notability_score FLOAT;
ALTER TABLE osint.osint_post_nlp ADD COLUMN IF NOT EXISTS notability_reasons JSONB;
ALTER TABLE osint.osint_post_nlp ADD COLUMN IF NOT EXISTS gate_passed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE osint.osint_post_nlp ADD COLUMN IF NOT EXISTS signal_features JSONB;
ALTER TABLE osint.osint_post_nlp ADD COLUMN IF NOT EXISTS credibility DOUBLE PRECISION;

-- Bổ sung các cột vào bảng 'osint_posts' (sử dụng `ALTER TABLE`)
ALTER TABLE osint.osint_posts ADD COLUMN IF NOT EXISTS verdict VARCHAR(20) NOT NULL DEFAULT 'unverified';
ALTER TABLE osint.osint_posts ADD COLUMN IF NOT EXISTS independent_cluster_id VARCHAR(64);

-- Tạo bảng `osint_gate_config` (sử dụng `CREATE TABLE`)
CREATE TABLE IF NOT EXISTS osint.osint_gate_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  signal_weights JSONB,
  thresholds JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed baseline trust theo phương pháp (thay default=3). Tên platform đã verify khớp DB.
UPDATE osint.osint_platforms SET trust_level = 5 WHERE name IN ('web_news','rss');
UPDATE osint.osint_platforms SET trust_level = 3 WHERE name = 'youtube';
UPDATE osint.osint_platforms SET trust_level = 2 WHERE name IN ('facebook','reddit','threads','instagram');
UPDATE osint.osint_platforms SET trust_level = 1 WHERE name IN ('telegram','tiktok');

-- config mặc định cho osint_gate_config
INSERT INTO osint.osint_gate_config (signal_weights, thresholds, is_active)
VALUES (NULL, '{"zScoreCutoff":2,"hotPriorityMax":2,"minCorrobK":2}'::jsonb, true);

-- Chạy: docker exec -i postgres psql -U postgres -d kh_soms < backend/database/migrations/007-...sql