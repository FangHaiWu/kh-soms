-- ============================================================
-- SEED osint_groups — CHỈ mạng xã hội (Hướng A: RSS quản lý ở osint_sources)
-- Tất cả is_active=false: chờ adapter (Telegram Sprint 3, Facebook Sprint 4)
-- platform_id lấy bằng subquery; external_group_id = định danh gốc platform
-- target_type (group/page/profile/channel) lưu trong platform_specific_data
-- tags theo tag.constants.ts (VIẾT HOA, không dấu, tiếng Việt)
-- Idempotent nhờ ON CONFLICT (platform_id, url)
--   → CẦN: ALTER TABLE osint.osint_groups ADD CONSTRAINT uq_groups_platform_url UNIQUE (platform_id, url);
-- Chạy: docker exec -i postgres psql -U postgres -d kh_soms < database/seeds/seed-osint-groups-kh.sql
-- ============================================================

-- A) FACEBOOK — chờ adapter Sprint 4 (URL chưa verify được do login-wall)
INSERT INTO osint.osint_groups
  (platform_id, name, url, external_group_id, description, is_active, trust_level, tags, platform_specific_data) VALUES
((SELECT id FROM osint.osint_platforms WHERE name='facebook'),
 'Hóng biến Khánh Hòa', 'https://www.facebook.com/groups/928673574825156', '928673574825156',
 'Nhóm cộng đồng lớn', false, 2,
 ARRAY['CONG-DONG','KHANH-HOA','UU-TIEN-CAO','CHUA-XAC-MINH'],
 '{"target_type":"group"}'::jsonb),

((SELECT id FROM osint.osint_platforms WHERE name='facebook'),
 '79 Khánh Hòa News', 'https://www.facebook.com/79khanhhoanews', '79khanhhoanews',
 'Trang tin cộng đồng', false, 2,
 ARRAY['CONG-DONG','KHANH-HOA','UU-TIEN-CAO','CHUA-XAC-MINH'],
 '{"target_type":"page"}'::jsonb),

((SELECT id FROM osint.osint_platforms WHERE name='facebook'),
 'Beat Khánh Hòa', 'https://www.facebook.com/profile.php?id=61578579235269', '61578579235269',
 'Cá nhân - admin nhóm Hóng biến', false, 1,
 ARRAY['CA-NHAN','KHANH-HOA','UU-TIEN-THAP','CHUA-XAC-MINH'],
 '{"target_type":"profile"}'::jsonb),

((SELECT id FROM osint.osint_platforms WHERE name='facebook'),
 'Tin nhanh Khánh Hòa', 'https://www.facebook.com/groups/tinnhanhkhanhhoa', 'tinnhanhkhanhhoa',
 'Nhóm cộng đồng', false, 2,
 ARRAY['CONG-DONG','KHANH-HOA','UU-TIEN-CAO','CHUA-XAC-MINH'],
 '{"target_type":"group"}'::jsonb),

((SELECT id FROM osint.osint_platforms WHERE name='facebook'),
 'Hội Những Người Vỡ Nợ Thích Làm Liều', 'https://www.facebook.com/groups/780859249833705', '780859249833705',
 'Nhóm cộng đồng - liên quan tín dụng đen', false, 2,
 ARRAY['CONG-DONG','TIN-DUNG-DEN','KHANH-HOA','UU-TIEN-CAO','CHUA-XAC-MINH'],
 '{"target_type":"group"}'::jsonb),

((SELECT id FROM osint.osint_platforms WHERE name='facebook'),
 'Tin nóng trong ngày', 'https://www.facebook.com/groups/2752590578393247', '2752590578393247',
 'Nhóm cộng đồng', false, 2,
 ARRAY['CONG-DONG','KHANH-HOA','UU-TIEN-CAO','CHUA-XAC-MINH'],
 '{"target_type":"group"}'::jsonb),

((SELECT id FROM osint.osint_platforms WHERE name='facebook'),
 'Khánh Hòa News', 'https://www.facebook.com/khanhhoanews.official', 'khanhhoanews.official',
 'Trang tin', false, 2,
 ARRAY['BAO-CHI','KHANH-HOA','UU-TIEN-CAO','CHUA-XAC-MINH'],
 '{"target_type":"page"}'::jsonb)
ON CONFLICT (platform_id, url) DO UPDATE SET
  name=EXCLUDED.name, external_group_id=EXCLUDED.external_group_id, description=EXCLUDED.description,
  is_active=EXCLUDED.is_active, trust_level=EXCLUDED.trust_level, tags=EXCLUDED.tags,
  platform_specific_data=EXCLUDED.platform_specific_data;

-- B) TELEGRAM — đã verify tồn tại + public 07/06/2026, chờ adapter Sprint 3
INSERT INTO osint.osint_groups
  (platform_id, name, url, external_group_id, description, is_active, trust_level, tags, platform_specific_data) VALUES
((SELECT id FROM osint.osint_platforms WHERE name='telegram'),
 'Hóng biến - EZ Group', 'https://t.me/hongbien_ez', 'hongbien_ez',
 'Kênh cộng đồng - 134 message (verify 07/06/2026)', false, 1,
 ARRAY['CONG-DONG','KHANH-HOA','UU-TIEN-CAO','DA-XAC-MINH'],
 '{"target_type":"channel"}'::jsonb),

((SELECT id FROM osint.osint_platforms WHERE name='telegram'),
 'Phốt Việt Nam', 'https://t.me/photvietnam', 'photvietnam',
 'Kênh thời sự - 188 message (verify 07/06/2026)', false, 1,
 ARRAY['CONG-DONG','UU-TIEN-CAO','DA-XAC-MINH'],
 '{"target_type":"channel"}'::jsonb)
ON CONFLICT (platform_id, url) DO UPDATE SET
  name=EXCLUDED.name, external_group_id=EXCLUDED.external_group_id, description=EXCLUDED.description,
  is_active=EXCLUDED.is_active, trust_level=EXCLUDED.trust_level, tags=EXCLUDED.tags,
  platform_specific_data=EXCLUDED.platform_specific_data;
