-- =====================================================================
-- SEED MẪU OSINT — Dữ liệu THẬT lấy từ RSS VnExpress (30/05/2026)
-- Mục đích: mẫu test cho NlpService gating (relevant ANTT vs không liên quan)
-- An toàn chạy lại: TRUNCATE trước, fixed UUID cho sources
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- để tính content_hash SHA256

-- Dọn sạch dữ liệu mẫu cũ (giữ schema)
TRUNCATE osint.osint_articles, osint.osint_keywords, osint.osint_sources RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------
-- 1) SOURCES (2 nguồn báo chí thật)
-- ---------------------------------------------------------------------
INSERT INTO osint.osint_sources (id, name, url, type, rss_feed_url, is_active, crawl_interval_minutes, trust_level)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'VnExpress', 'https://vnexpress.net', 'news',
   'https://vnexpress.net/rss/tin-moi-nhat.rss', true, 15, 5),
  ('22222222-2222-2222-2222-222222222222', 'Tuổi Trẻ', 'https://tuoitre.vn', 'news',
   'https://tuoitre.vn/rss/tin-moi-nhat.rss', true, 15, 5);

-- ---------------------------------------------------------------------
-- 2) KEYWORDS ANTT (cán bộ định nghĩa — priority 1 = nóng nhất)
-- ---------------------------------------------------------------------
INSERT INTO osint.osint_keywords (category, keyword, is_active, priority) VALUES
  ('Tội phạm',  'bắt',        true, 1),
  ('Tội phạm',  'cướp',       true, 1),
  ('Tội phạm',  'lừa đảo',    true, 1),
  ('Tội phạm',  'ma túy',     true, 1),
  ('Tội phạm',  'giết',       true, 1),
  ('Tội phạm',  'giang hồ',   true, 2),
  ('Tội phạm',  'cá độ',      true, 2),
  ('Tội phạm',  'trộm',       true, 2),
  ('Tội phạm',  'triệt phá',  true, 2),
  ('ANTT',      'an ninh',    true, 1),
  ('ANTT',      'vụ án',      true, 3),
  ('ANTT',      'công an',    true, 3);

-- ---------------------------------------------------------------------
-- 3) ARTICLES — 8 bài THẬT từ RSS VnExpress 30/05/2026
--    5 bài LIÊN QUAN ANTT + 3 bài KHÔNG liên quan
--    content_hash = SHA256(title||content), is_relevant để false (NlpService sẽ set)
-- ---------------------------------------------------------------------
INSERT INTO osint.osint_articles
  (source_id, title, content, url, author, published_at, content_hash, language, is_relevant, relevance_score)
VALUES
-- ===== LIÊN QUAN ANTT (5 bài) =====
('11111111-1111-1111-1111-111111111111',
 'Giang hồ Dũng ''Kỷ'' bị bắt',
 'Nguyễn Kỳ Dũng, tức Dũng "Kỷ", giang hồ cộm cán với nhiều tiền án, bị cáo buộc tham gia đường dây cá độ bóng đá 1.200 tỷ đồng.',
 'https://vnexpress.net/giang-ho-dung-ky-bi-bat-5079923.html',
 'VnExpress', '2026-05-30 08:34:10+07',
 encode(digest('Giang hồ Dũng ''Kỷ'' bị bắt' || 'cá độ bóng đá', 'sha256'), 'hex'), 'vi', false, 0),

('11111111-1111-1111-1111-111111111111',
 'Kế hoạch cướp tiệm vàng trong 20 giây ở TP HCM',
 'Quen nhau qua "Hội vỡ nợ thích làm liều", Phan Tấn Đạt cùng đồng phạm lên kế hoạch dùng rìu đập tủ kính của tiệm vàng, cướp nữ trang trong 20 giây rồi bỏ trốn.',
 'https://vnexpress.net/ke-hoach-cuop-tiem-vang-trong-20-giay-o-tp-hcm-5079930.html',
 'VnExpress', '2026-05-30 07:56:33+07',
 encode(digest('Kế hoạch cướp tiệm vàng' || 'cướp nữ trang', 'sha256'), 'hex'), 'vi', false, 0),

('11111111-1111-1111-1111-111111111111',
 'Cái chết kỳ lạ của kẻ chủ mưu vụ lừa đảo lớn nhất Hàn Quốc',
 'Bốn năm sau khi chiếm đoạt 5.000 tỷ won từ 70.000 nạn nhân rồi trốn sang Trung Quốc, Cho Hee-pal được thông báo đã chết nhưng thực hư còn nhiều nghi vấn.',
 'https://vnexpress.net/cai-chet-ky-la-cua-ke-chu-muu-vu-lua-dao-lon-nhat-han-quoc-5079825.html',
 'VnExpress', '2026-05-30 00:00:00+07',
 encode(digest('vụ lừa đảo lớn nhất Hàn Quốc' || 'chiếm đoạt', 'sha256'), 'hex'), 'vi', false, 0),

('11111111-1111-1111-1111-111111111111',
 'Người dân ngồi nhà vẫn có thể theo dõi, giao nhận hồ sơ vụ án qua VNeID',
 'Từ nhận thông báo tố tụng đến tra cứu chi tiết hồ sơ vụ án, người dân sẽ có thể thực hiện tất cả tại nhà chỉ với vài thao tác đăng nhập VNeID.',
 'https://vnexpress.net/nguoi-dan-ngoi-nha-van-co-the-theo-doi-giao-nhan-ho-so-vu-an-qua-vneid-5079649.html',
 'VnExpress', '2026-05-29 00:00:00+07',
 encode(digest('theo dõi hồ sơ vụ án qua VNeID' || 'tố tụng', 'sha256'), 'hex'), 'vi', false, 0),

('11111111-1111-1111-1111-111111111111',
 'Lý do một số web lậu bị triệt phá vẫn ''sống lại''',
 'Dù bị cơ quan chức năng mạnh tay triệt phá, nhiều website vi phạm bản quyền số về phim ảnh, thể thao... vẫn "mọc" trở lại thông qua những tên miền gần giống.',
 'https://vnexpress.net/ly-do-mot-so-web-lau-bi-triet-pha-van-song-lai-5077186.html',
 'VnExpress', '2026-05-30 09:02:00+07',
 encode(digest('web lậu bị triệt phá' || 'vi phạm bản quyền', 'sha256'), 'hex'), 'vi', false, 0),

-- ===== KHÔNG LIÊN QUAN ANTT (3 bài) =====
('11111111-1111-1111-1111-111111111111',
 'Phần lớn người nhập cư không cần rời Mỹ để xin thẻ xanh',
 'Mỹ nói phần lớn người nhập cư không cần rời nước này để xin cấp thẻ xanh, dường như rút lại một phần thay đổi được công bố trước đó.',
 'https://vnexpress.net/phan-lon-nguoi-nhap-cu-khong-can-roi-my-de-xin-the-xanh-5079934.html',
 'VnExpress', '2026-05-30 09:15:56+07',
 encode(digest('người nhập cư xin thẻ xanh' || 'thẻ xanh Mỹ', 'sha256'), 'hex'), 'vi', false, 0),

('11111111-1111-1111-1111-111111111111',
 'Ở rể là sai lầm lớn nhất của tôi',
 'Vợ tôi nói nếu muốn mẹ con cô ấy về quê nội sống, tôi phải xin cho cô ấy một công việc kế toán ổn định ở quê.',
 'https://vnexpress.net/o-re-la-sai-lam-lon-nhat-cua-toi-5079920.html',
 'VnExpress', '2026-05-30 09:00:00+07',
 encode(digest('Ở rể là sai lầm' || 'công việc kế toán', 'sha256'), 'hex'), 'vi', false, 0),

('11111111-1111-1111-1111-111111111111',
 'Bác sĩ gợi ý 10 thực phẩm vàng giúp kéo dài tuổi thọ cho thận',
 'Thay vì gánh chịu tổn thương do thói quen ăn mặn, việc bổ sung các thực phẩm lành mạnh được chuyên gia khuyên dùng sẽ giúp nâng cao chức năng giải độc cho thận.',
 'https://vnexpress.net/bac-si-goi-y-10-thuc-pham-vang-giup-keo-dai-tuoi-tho-cho-than-5079757.html',
 'VnExpress', '2026-05-29 00:00:00+07',
 encode(digest('thực phẩm vàng cho thận' || 'tuổi thọ', 'sha256'), 'hex'), 'vi', false, 0);
