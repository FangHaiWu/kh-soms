-- =====================================================================
-- SEED GROUP FACEBOOK CNC (curation — chủ dự án/đơn vị cung cấp 15/07/2026)
-- Nhóm công khai liên quan tội phạm công nghệ cao: mua bán via/clone/nick,
-- MMO/KYC, nguyên liệu scam, mua bán dữ liệu cá nhân, check-scam/escrow.
--
-- PHÁP LÝ: chỉ thu ở KHÔNG GIAN CÔNG KHAI (Điều 289) qua tài khoản công cụ; xử lý
--   theo NĐ13 mục đích ANTT; on-prem; audit. Nhóm "Data..." rao bán PII → thu để làm
--   BẰNG CHỨNG hành vi mua-ban-dlcn, không phát tán.
--
-- is_active=FALSE: KÍCH HOẠT LÀ BƯỚC CHỦ ĐỘNG (bật crawl = hit FB thật). Cán bộ đổi
--   is_active=true khi sẵn sàng + đã verify collector feed-inline.
-- Idempotent: INSERT...WHERE NOT EXISTS theo external_group_id (osint_groups chưa có UNIQUE).
-- trust_level=2 (chưa xác minh). url dùng thẳng làm entryUrl cho collector.
-- =====================================================================

INSERT INTO osint.osint_groups
  (platform_id, name, url, external_group_id, description, is_active, trust_level, tags, member_count, platform_specific_data)
SELECT
  (SELECT id FROM osint.osint_platforms WHERE name = 'facebook'),
  v.name, v.url, v.ext, v.descr, false, 2, v.tags, v.members,
  '{"target_type":"group"}'::jsonb
FROM (VALUES
  ('Mua Bán - Trao Đổi - Nick - Via - Clone FaceBook',
   'https://web.facebook.com/groups/1401902211508306', '1401902211508306',
   'Mua bán nick/via/clone Facebook', ARRAY['CNC','LUA-DAO','MUA-BAN-TAI-KHOAN','CHUA-XAC-MINH'], 6600::int),
  ('Cộng Đồng MMO KYC sàn app 2026',
   'https://web.facebook.com/groups/kycmmofull', 'kycmmofull',
   'MMO / vượt KYC sàn app', ARRAY['CNC','LUA-DAO','KYC','CHUA-XAC-MINH'], 5300),
  ('Nguyên Liệu Scan Bm, Via, Clone',
   'https://web.facebook.com/groups/564183967247543', '564183967247543',
   'Nguyên liệu scam: BM/Via/Clone', ARRAY['CNC','LUA-DAO','NGUYEN-LIEU-SCAM','CHUA-XAC-MINH'], NULL),
  ('Data Siêu chất lượng cao',
   'https://web.facebook.com/groups/1292292351558654', '1292292351558654',
   'Rao bán dữ liệu cá nhân', ARRAY['CNC','MUA-BAN-DLCN','CHUA-XAC-MINH'], NULL),
  ('Data Khách hàng',
   'https://web.facebook.com/groups/608991940844601', '608991940844601',
   'Rao bán data khách hàng', ARRAY['CNC','MUA-BAN-DLCN','CHUA-XAC-MINH'], NULL),
  ('Tố Cáo Scam - Check Scam - Giao Dịch Trung gian',
   'https://web.facebook.com/groups/sconnectgiaodichtrun', 'sconnectgiaodichtrun',
   'Check scam / giao dịch trung gian (escrow) — nguồn tố cáo', ARRAY['CNC','CHECK-SCAM','TO-CAO','CHUA-XAC-MINH'], 18700)
) AS v(name, url, ext, descr, tags, members)
WHERE NOT EXISTS (
  SELECT 1 FROM osint.osint_groups g WHERE g.external_group_id = v.ext
);
