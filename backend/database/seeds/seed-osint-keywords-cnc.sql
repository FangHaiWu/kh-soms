-- =====================================================================
-- SEED KEYWORD CNC — An ninh mạng & phòng chống tội phạm công nghệ cao
-- Thống kê thực tế theo phân loại nghiệp vụ (A05/PA05). ~125 keyword / 8 nhóm.
-- Nền cho Lớp 1 CNC (category propagation). Xem roadmap:
--   docs/superpowers/specs/2026-07-10-cnc-actor-detection-roadmap.md
-- ADDITIVE — KHÔNG truncate: ON CONFLICT (category, keyword) DO NOTHING
--   → chạy lại an toàn (idempotent), không đụng keyword cũ.
-- scope='global'/region=NULL lấy mặc định (bỏ trống trong INSERT).
-- priority: 1 = nóng nhất … 5 = yếu/cần ngữ cảnh.
-- =====================================================================

INSERT INTO osint.osint_keywords (category, keyword, is_active, priority) VALUES
-- ---------------------------------------------------------------------
-- 1) lua-dao — Lừa đảo chiếm đoạt tài sản trên không gian mạng
-- ---------------------------------------------------------------------
  ('lua-dao', 'giả danh công an',              true, 1),
  ('lua-dao', 'giả danh viện kiểm sát',        true, 1),
  ('lua-dao', 'giả danh tòa án',               true, 1),
  ('lua-dao', 'giả danh cán bộ',               true, 2),
  ('lua-dao', 'giả danh nhân viên ngân hàng',  true, 2),
  ('lua-dao', 'giả danh điện lực',             true, 2),
  ('lua-dao', 'giả danh nhân viên thuế',       true, 2),
  ('lua-dao', 'cơ quan điều tra',              true, 3),
  ('lua-dao', 'lệnh bắt qua điện thoại',       true, 2),
  ('lua-dao', 'việc nhẹ lương cao',            true, 1),
  ('lua-dao', 'làm nhiệm vụ hưởng hoa hồng',   true, 1),
  ('lua-dao', 'cộng tác viên chốt đơn',        true, 1),
  ('lua-dao', 'tuyển cộng tác viên online',    true, 2),
  ('lua-dao', 'đặt đơn ảo',                    true, 2),
  ('lua-dao', 'thực hiện nhiệm vụ',            true, 3),
  ('lua-dao', 'sàn forex',                     true, 2),
  ('lua-dao', 'sàn nhị phân',                  true, 2),
  ('lua-dao', 'sàn BO',                        true, 2),
  ('lua-dao', 'sàn đầu tư',                    true, 2),
  ('lua-dao', 'app đầu tư sinh lời',           true, 2),
  ('lua-dao', 'cam kết lợi nhuận',             true, 2),
  ('lua-dao', 'đầu tư tiền ảo',                true, 3),
  ('lua-dao', 'sàn chứng khoán quốc tế',       true, 2),
  ('lua-dao', 'người nước ngoài gửi quà',      true, 2),
  ('lua-dao', 'hải quan giữ hàng',             true, 2),
  ('lua-dao', 'đóng phí nhận quà',             true, 2),
  ('lua-dao', 'trúng thưởng',                  true, 3),
  ('lua-dao', 'mã trúng thưởng',               true, 2),
  ('lua-dao', 'khóa sim',                      true, 2),
  ('lua-dao', 'nâng cấp sim',                  true, 2),
  ('lua-dao', 'mã OTP',                        true, 3),
  ('lua-dao', 'cung cấp OTP',                  true, 2),
  ('lua-dao', 'khóa tài khoản',                true, 3),
  ('lua-dao', 'hack facebook',                 true, 2),
  ('lua-dao', 'chiếm tài khoản facebook',      true, 2),
  ('lua-dao', 'mượn tiền qua facebook',        true, 2),
  ('lua-dao', 'mạo danh',                      true, 3),
  ('lua-dao', 'lừa đảo',                       true, 1),
  ('lua-dao', 'chiếm đoạt tài sản',            true, 1),
  ('lua-dao', 'chuyển khoản gấp',              true, 2),
-- ---------------------------------------------------------------------
-- 2) mua-ban-dlcn — Mua bán, lộ lọt dữ liệu cá nhân
-- ---------------------------------------------------------------------
  ('mua-ban-dlcn', 'bán data',                     true, 1),
  ('mua-ban-dlcn', 'sỉ data',                      true, 1),
  ('mua-ban-dlcn', 'data khách hàng',              true, 1),
  ('mua-ban-dlcn', 'mua data',                     true, 1),
  ('mua-ban-dlcn', 'cần mua data',                 true, 2),
  ('mua-ban-dlcn', 'data chất',                    true, 2),
  ('mua-ban-dlcn', 'data mới',                     true, 2),
  ('mua-ban-dlcn', 'data bất động sản',            true, 2),
  ('mua-ban-dlcn', 'data chứng khoán',             true, 2),
  ('mua-ban-dlcn', 'data bảo hiểm',                true, 2),
  ('mua-ban-dlcn', 'data mẹ bỉm',                  true, 2),
  ('mua-ban-dlcn', 'data vay',                     true, 2),
  ('mua-ban-dlcn', 'data VIP',                     true, 3),
  ('mua-ban-dlcn', 'thông tin CCCD',               true, 2),
  ('mua-ban-dlcn', 'ảnh CCCD',                     true, 2),
  ('mua-ban-dlcn', 'lộ lọt dữ liệu',               true, 2),
  ('mua-ban-dlcn', 'rò rỉ dữ liệu',                true, 2),
  ('mua-ban-dlcn', 'rao bán dữ liệu',              true, 1),
  ('mua-ban-dlcn', 'dump database',                true, 2),
  ('mua-ban-dlcn', 'mua bán tài khoản ngân hàng',  true, 1),
  ('mua-ban-dlcn', 'thuê tài khoản ngân hàng',     true, 1),
  ('mua-ban-dlcn', 'bán bank',                     true, 1),
  ('mua-ban-dlcn', 'cho thuê bank',                true, 2),
-- ---------------------------------------------------------------------
-- 3) tan-cong-ma-doc — Tấn công mạng, mã độc
-- ---------------------------------------------------------------------
  ('tan-cong-ma-doc', 'mã độc',                     true, 1),
  ('tan-cong-ma-doc', 'ransomware',                 true, 1),
  ('tan-cong-ma-doc', 'tống tiền dữ liệu',          true, 1),
  ('tan-cong-ma-doc', 'mã hóa dữ liệu tống tiền',   true, 1),
  ('tan-cong-ma-doc', 'tấn công mạng',              true, 1),
  ('tan-cong-ma-doc', 'tấn công có chủ đích',       true, 2),
  ('tan-cong-ma-doc', 'APT',                        true, 3),
  ('tan-cong-ma-doc', 'DDoS',                       true, 2),
  ('tan-cong-ma-doc', 'tấn công từ chối dịch vụ',   true, 2),
  ('tan-cong-ma-doc', 'lỗ hổng bảo mật',            true, 2),
  ('tan-cong-ma-doc', 'khai thác lỗ hổng',          true, 2),
  ('tan-cong-ma-doc', 'zero-day',                   true, 2),
  ('tan-cong-ma-doc', 'phishing',                   true, 2),
  ('tan-cong-ma-doc', 'website giả mạo',            true, 2),
  ('tan-cong-ma-doc', 'link giả mạo',               true, 2),
  ('tan-cong-ma-doc', 'phần mềm gián điệp',         true, 2),
  ('tan-cong-ma-doc', 'spyware',                    true, 3),
  ('tan-cong-ma-doc', 'keylogger',                  true, 3),
  ('tan-cong-ma-doc', 'chiếm quyền điều khiển',     true, 2),
  ('tan-cong-ma-doc', 'tấn công website',           true, 2),
-- ---------------------------------------------------------------------
-- 4) co-bac-ca-do — Cờ bạc, cá độ trực tuyến
-- ---------------------------------------------------------------------
  ('co-bac-ca-do', 'cá độ bóng đá',        true, 1),
  ('co-bac-ca-do', 'cá cược',              true, 2),
  ('co-bac-ca-do', 'nhà cái',              true, 1),
  ('co-bac-ca-do', 'tài xỉu',              true, 2),
  ('co-bac-ca-do', 'lô đề online',         true, 2),
  ('co-bac-ca-do', 'số đề online',         true, 2),
  ('co-bac-ca-do', 'đánh bạc online',      true, 1),
  ('co-bac-ca-do', 'casino online',        true, 1),
  ('co-bac-ca-do', 'game bài đổi thưởng',  true, 2),
  ('co-bac-ca-do', 'nạp thẻ game',         true, 3),
  ('co-bac-ca-do', 'soi kèo',              true, 3),
  ('co-bac-ca-do', 'kèo bóng đá',          true, 3),
  ('co-bac-ca-do', 'đại lý cá độ',         true, 2),
-- ---------------------------------------------------------------------
-- 5) tin-dung-den — Tín dụng đen, vay online trái phép
-- ---------------------------------------------------------------------
  ('tin-dung-den', 'app vay',              true, 2),
  ('tin-dung-den', 'vay online',           true, 3),
  ('tin-dung-den', 'vay không thế chấp',   true, 2),
  ('tin-dung-den', 'vay tín chấp nhanh',   true, 2),
  ('tin-dung-den', 'tín dụng đen',         true, 1),
  ('tin-dung-den', 'vay nóng',             true, 2),
  ('tin-dung-den', 'bùng app',             true, 2),
  ('tin-dung-den', 'khủng bố đòi nợ',      true, 1),
  ('tin-dung-den', 'đòi nợ thuê',          true, 2),
-- ---------------------------------------------------------------------
-- 6) deepfake-gia-mao — Deepfake, giả mạo hình ảnh/video
-- ---------------------------------------------------------------------
  ('deepfake-gia-mao', 'deepfake',           true, 1),
  ('deepfake-gia-mao', 'cắt ghép hình ảnh',  true, 2),
  ('deepfake-gia-mao', 'giả mạo video',      true, 2),
  ('deepfake-gia-mao', 'giả giọng nói',      true, 2),
  ('deepfake-gia-mao', 'ghép mặt',           true, 2),
  ('deepfake-gia-mao', 'video giả mạo',      true, 2),
-- ---------------------------------------------------------------------
-- 7) rua-tien — Rửa tiền, trung gian thanh toán trái phép
-- ---------------------------------------------------------------------
  ('rua-tien', 'rửa tiền',                        true, 1),
  ('rua-tien', 'tiền bẩn',                        true, 2),
  ('rua-tien', 'trung gian thanh toán trái phép', true, 2),
  ('rua-tien', 'đổi tiền ảo',                     true, 3),
  ('rua-tien', 'gateway lậu',                     true, 3),
-- ---------------------------------------------------------------------
-- 8) kich-dong-xuyen-tac — Kích động, xuyên tạc (keyword YẾU, chờ LLM L3)
-- ---------------------------------------------------------------------
  ('kich-dong-xuyen-tac', 'xuyên tạc',              true, 2),
  ('kich-dong-xuyen-tac', 'kích động',              true, 2),
  ('kich-dong-xuyen-tac', 'chống phá',              true, 2),
  ('kich-dong-xuyen-tac', 'phản động',              true, 2),
  ('kich-dong-xuyen-tac', 'bôi nhọ',                true, 3),
  ('kich-dong-xuyen-tac', 'vu khống',               true, 3),
  ('kich-dong-xuyen-tac', 'nói xấu lãnh đạo',       true, 3),
  ('kich-dong-xuyen-tac', 'tin giả',                true, 3),
  ('kich-dong-xuyen-tac', 'thông tin sai sự thật',  true, 3),
  ('kich-dong-xuyen-tac', 'thế lực thù địch',       true, 2),
  ('kich-dong-xuyen-tac', 'tụ tập đông người',      true, 3),
  ('kich-dong-xuyen-tac', 'gây rối trật tự',        true, 3),
  ('kich-dong-xuyen-tac', 'luận điệu xuyên tạc',    true, 2)
ON CONFLICT (category, keyword) DO NOTHING;
