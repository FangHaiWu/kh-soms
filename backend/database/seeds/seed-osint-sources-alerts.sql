-- =====================================================================
-- SEED BỔ SUNG — 20 báo điện tử ANTT + mẫu alerts
-- RSS đã verify bằng curl (30/05/2026). Báo chưa có RSS công khai:
--   is_active=false, rss_feed_url=NULL → bổ sung sau, KHÔNG bịa URL
-- type: news | tv | gov | magazine ; trust_level: 5=cơ quan ngành, 4=báo lớn
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Cập nhật 2 source cũ sang mục Pháp luật (mẫu article lấy từ đây)
-- ---------------------------------------------------------------------
UPDATE osint.osint_sources SET rss_feed_url='https://vnexpress.net/rss/phap-luat.rss'
  WHERE id='11111111-1111-1111-1111-111111111111';
UPDATE osint.osint_sources SET rss_feed_url='https://tuoitre.vn/rss/phap-luat.rss'
  WHERE id='22222222-2222-2222-2222-222222222222';

-- ---------------------------------------------------------------------
-- 2) Báo mới
--    a) Báo có RSS THẬT đã verify (is_active=true)
--       cand.vn: verify 07/06/2026 — redirect từ cand.com.vn → cand.vn/rss/home.rss
--       baochinhphu.vn: CHƯA verify — is_active=false, bổ sung RSS sau
-- ---------------------------------------------------------------------
INSERT INTO osint.osint_sources (name, url, type, rss_feed_url, is_active, crawl_interval_minutes, trust_level) VALUES
('Báo Pháp Luật TP.HCM', 'https://plo.vn',         'news', 'https://plo.vn/rss/phap-luat-58.rss',              true,  15, 4),
('Báo Người Lao Động',   'https://nld.com.vn',      'news', 'https://nld.com.vn/rss/phap-luat.rss',             true,  15, 4),
('Báo VietNamNet',       'https://vietnamnet.vn',   'news', 'https://vietnamnet.vn/rss/phap-luat.rss',          true,  15, 4),
('Báo Dân Trí',          'https://dantri.com.vn',   'news', 'https://dantri.com.vn/rss/phap-luat.rss',          true,  15, 4),
('Báo Thanh Niên',       'https://thanhnien.vn',    'news', 'https://thanhnien.vn/rss/thoi-su/phap-luat.rss',   true,  15, 4),
('Báo Công an Nhân dân', 'https://cand.vn',         'news', 'https://cand.vn/rss/home.rss',                     true,  15, 5),
('Báo Điện tử Chính phủ','https://baochinhphu.vn',  'gov',  NULL,                                               false, 15, 5)
ON CONFLICT (name) DO UPDATE SET
  url                    = EXCLUDED.url,
  rss_feed_url           = EXCLUDED.rss_feed_url,
  is_active              = EXCLUDED.is_active,
  trust_level            = EXCLUDED.trust_level,
  crawl_interval_minutes = EXCLUDED.crawl_interval_minutes;

--    b) Báo chưa lộ RSS công khai (is_active=false, chờ bổ sung RSS thật)
INSERT INTO osint.osint_sources (name, url, type, rss_feed_url, is_active, crawl_interval_minutes, trust_level) VALUES
('Báo Điện tử An ninh Thủ đô', 'https://www.anninhthudo.vn', 'news',     NULL, false, 15, 5),
('Báo Công an TP.HCM',         'https://congan.com.vn',      'news',     NULL, false, 15, 5),
('Báo An ninh Hải Phòng',      'https://anhp.vn',            'news',     NULL, false, 15, 5),
('Truyền hình CAND (ANTV)',    'https://www.antv.gov.vn',    'tv',       NULL, false, 15, 5),
('Tạp chí Cảnh sát Nhân dân',  'https://csnd.vn',            'magazine', NULL, false, 30, 5),
('Báo Pháp Luật Việt Nam',     'https://baophapluat.vn',     'news',     NULL, false, 15, 5),
('Cổng TTĐT Bộ Công an',       'https://bocongan.gov.vn',    'gov',      NULL, false, 30, 5),
('Báo Quân đội Nhân dân',      'https://www.qdnd.vn',        'news',     NULL, false, 15, 5),
('Tạp chí Quốc phòng toàn dân','http://tapchiqptd.vn',       'magazine', NULL, false, 30, 5),
('Báo Quốc phòng Thủ đô',      'https://quocphongthudo.vn',  'news',     NULL, false, 15, 5),
('Báo Tiền Phong',             'https://tienphong.vn',       'news',     NULL, false, 15, 4)
ON CONFLICT (name) DO UPDATE SET
  url                    = EXCLUDED.url,
  type                   = EXCLUDED.type,
  rss_feed_url           = EXCLUDED.rss_feed_url,
  is_active              = EXCLUDED.is_active,
  trust_level            = EXCLUDED.trust_level,
  crawl_interval_minutes = EXCLUDED.crawl_interval_minutes;
-- ---------------------------------------------------------------------
-- 3) Mẫu ALERTS thật — liên kết article ANTT đã seed (source_ref_ids = article ids)
-- ---------------------------------------------------------------------
INSERT INTO osint.osint_alerts (alert_type, severity, title, description, source_ref_ids, is_acknowledged)
VALUES
('high_priority_keyword', 'warning',
 'Phát hiện vụ bắt giữ giang hồ cộm cán',
 'Từ khóa ưu tiên "bắt", "giang hồ", "cá độ" xuất hiện trong bài về Dũng "Kỷ" và đường dây cá độ 1.200 tỷ đồng.',
 ARRAY(SELECT id FROM osint.osint_articles WHERE url LIKE '%giang-ho-dung-ky%'),
 false),

('keyword_threshold', 'critical',
 'Gia tăng tin tức tội phạm cướp/lừa đảo trong ngày',
 'Nhiều bài liên quan từ khóa ưu tiên 1: "cướp" (cướp tiệm vàng TP HCM), "lừa đảo" (vụ Hàn Quốc 5.000 tỷ won).',
 ARRAY(SELECT id FROM osint.osint_articles WHERE url LIKE '%cuop-tiem-vang%' OR url LIKE '%lua-dao-lon-nhat-han-quoc%'),
 false),

('high_priority_keyword', 'info',
 'Tin về hoạt động triệt phá web lậu',
 'Từ khóa "triệt phá" xuất hiện — bài về website vi phạm bản quyền bị triệt phá vẫn tái lập.',
 ARRAY(SELECT id FROM osint.osint_articles WHERE url LIKE '%web-lau-bi-triet-pha%'),
 true);

-- Bổ sung Trang chuyên mục các Báo điện tử không RSS
-- Báo Pháp luật Việt Nam -> Pháp luật - tin nóng
INSERT INTO osint.osint_sources (name, url, type, rss_feed_url, is_active, crawl_interval_minutes, trust_level) VALUES
('Báo Pháp luật Việt Nam', 'https://baophapluat.vn/chuyen-muc/phap-luat-tin-nong', 'news', NULL, false, 60, 5)
ON CONFLICT (name) DO NOTHING;

-- Báo Khánh Hòa -> Pháp Luật -> An ninh - trật tự 
INSERT INTO osint.osint_sources (name, url, type, rss_feed_url, is_active, crawl_interval_minutes, trust_level) VALUES
('Báo Khánh Hòa/Pháp luật/An ninh - trật tự', 'https://baokhanhhoa.vn/phap-luat/an-ninh-trat-tu/', 'news', NULL, false, 60, 5)
ON CONFLICT (name) DO NOTHING;