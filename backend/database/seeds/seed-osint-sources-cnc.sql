-- =====================================================================
-- SEED NGUỒN CNC (loại A — cơ quan + cộng đồng đưa tin/cảnh báo tội phạm mạng)
-- An ninh mạng & phòng chống tội phạm công nghệ cao.
--
-- KỶ LUẬT (theo seed-osint-sources-alerts.sql): CHƯA verify RSS/URL công khai
--   → is_active=false, rss_feed_url=NULL. KHÔNG bịa feed. Cán bộ kiểm URL + feed
--   thật rồi mới UPDATE is_active=true (và rss_feed_url nếu có).
-- type: gov | security | community | magazine ; trust_level 5=cơ quan, 4=cộng đồng uy tín
--
-- LƯU Ý: đây là nguồn loại A (đưa tin). Nguồn loại B (nơi tội phạm hoạt động:
--   group/kênh scam) KHÔNG seed tĩnh — khám phá qua cơ chế Lớp 2 (source discovery)
--   + con người duyệt. Social (FB/TG/Reddit) loại A cũng cần curation người, không bịa.
-- =====================================================================

INSERT INTO osint.osint_sources (name, url, type, rss_feed_url, is_active, crawl_interval_minutes, trust_level) VALUES
-- Cơ quan nhà nước chuyên trách ATTT/an ninh mạng

('NCSC — Tín nhiệm mạng',         'https://tinnhiemmang.vn',   'gov',       NULL, false, 30, 5), 
('Tạp chí An toàn thông tin',     'https://antoanthongtin.vn', 'magazine',  NULL, false, 30, 5),
-- Cộng đồng / diễn đàn an ninh mạng uy tín (nguồn cảnh báo scam, blacklist domain)
('Chống Lừa Đảo',                 'https://chongluadao.vn',    'community', NULL, false, 30, 4),
('WhiteHat — Diễn đàn ANM',       'https://whitehat.vn',       'security',  NULL, false, 30, 4),
-- Doanh nghiệp an ninh mạng VN (blog threat-intel, cảnh báo mã độc/lừa đảo)
('CyStack',                       'https://cystack.net',              'security',  NULL, false, 60, 4),
('VSEC',                          'https://vsec.com.vn',              'security',  NULL, false, 60, 4),
('Viettel Cyber Security',        'https://viettelcybersecurity.com', 'security',  NULL, false, 60, 4),
('Bkav',                          'https://bkav.com.vn',              'security',  NULL, false, 60, 4),
-- Nguồn quốc tế uy tín (tin mã độc/ransomware/lừa đảo — có RSS chuẩn, cán bộ verify để bật)
('The Hacker News',               'https://thehackernews.com',        'security',  NULL, false, 60, 4),
('BleepingComputer',              'https://www.bleepingcomputer.com', 'security',  NULL, false, 60, 4),
('Krebs on Security',             'https://krebsonsecurity.com',      'security',  NULL, false, 60, 4),
('ScamAdviser',                   'https://www.scamadviser.com',      'community', NULL, false, 60, 4)
ON CONFLICT (name) DO UPDATE SET
  url                    = EXCLUDED.url,
  type                   = EXCLUDED.type,
  is_active              = EXCLUDED.is_active,
  trust_level            = EXCLUDED.trust_level,
  crawl_interval_minutes = EXCLUDED.crawl_interval_minutes;
-- (không ghi đè rss_feed_url ở DO UPDATE: nếu cán bộ đã điền feed thật thì giữ nguyên)
