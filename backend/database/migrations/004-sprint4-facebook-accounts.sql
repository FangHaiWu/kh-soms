-- migration 004 sprint 4 facebook accounts
-- Bảng mới: osint_facebook_accounts
-- Chạy: docker exec -i postgres psql -U postgres -d kh_soms < backend/database/migrations/004-sprint4-facebook-accounts.sql


-- Bảng óint_facebook_accounts 
CREATE TABLE IF NOT EXISTS osint.osint_facebook_accounts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  label VARCHAR(100) UNIQUE NOT NULL,
  login_identifier VARCHAR(255),
  encrypted_password TEXT NOT NULL,
  encrypted_session TEXT,
  status VARCHAR(20) DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'checkpoint', 'retired')),
  crawl_count_today INT DEFAULT 0 NOT NULL,
  last_used_at TIMESTAMPTZ,
  checkpoint_count INT DEFAULT 0 NOT NULL,
  last_checkpoint_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fb_acct_pickable
  ON osint.osint_facebook_accounts (status, crawl_count_today);
