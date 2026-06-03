-- =====================================================================
-- SEED TỪ LÓNG THẬT — tiếng lóng tội phạm phổ biến (ma túy, cờ bạc, hành hung)
-- Nguồn: thuật ngữ lóng đã xuất hiện công khai trên báo chí ANTT/cảnh báo
-- Ưu tiên từ ĐẶC TRƯNG ≥3 ký tự, ít trùng từ thường → giảm khớp nhầm includes()
-- added_by = NULL (chưa có UsersModule — soft reference, thêm FK ở Sprint 3)
-- An toàn chạy lại: ON CONFLICT (term) DO NOTHING nhờ ràng buộc UNIQUE
-- =====================================================================
INSERT INTO osint.osint_slang_dictionary (term, meaning, category, is_active) VALUES
  -- Ma túy
  ('đập đá',      'sử dụng ma túy đá (methamphetamine)',        'Ma túy',     true),
  ('hàng trắng',  'heroin',                                     'Ma túy',     true),
  ('hàng đá',     'ma túy đá (methamphetamine)',                'Ma túy',     true),
  ('cỏ Mỹ',       'cần sa tổng hợp',                            'Ma túy',     true),
  ('tem giấy',    'ma túy LSD tẩm trên giấy',                   'Ma túy',     true),
  ('bùa lưỡi',    'ma túy LSD ngậm dưới lưỡi',                  'Ma túy',     true),
  ('nước vui',    'ma túy dạng nước (GHB)',                     'Ma túy',     true),
  ('thuốc lắc',   'ma túy tổng hợp MDMA (ecstasy)',             'Ma túy',     true),
  ('cắn kẹo',     'sử dụng thuốc lắc',                          'Ma túy',     true),
  ('bay lắc',     'sử dụng ma túy tổng hợp kết hợp nhảy nhạc',  'Ma túy',     true),
  ('ke',          'ma túy ketamine',                            'Ma túy',     true),
  ('phê pha',     'trạng thái phê ma túy',                      'Ma túy',     true),
  -- Cờ bạc
  ('tài xỉu',     'cờ bạc bằng xúc xắc',                        'Cờ bạc',     true),
  ('cá độ',       'cá cược bóng đá/cờ bạc trái phép',           'Cờ bạc',     true),
  ('lô đề',       'đánh số đề trái phép',                       'Cờ bạc',     true),
  -- Hành hung / xã hội đen
  ('xử đẹp',      'thanh toán, hành hung đối thủ',              'Hành hung',  true),
  ('dằn mặt',     'đe dọa, cảnh cáo bằng bạo lực',              'Hành hung',  true),
  ('bảo kê',      'cưỡng đoạt tiền dưới danh nghĩa bảo vệ',     'Tội phạm',   true),
  -- Lừa đảo / khác
  ('chăn rau',    'dắt mối, lừa đảo nạn nhân qua mạng',         'Lừa đảo',    true),
  ('nhập kho',    'bị bắt giam',                                'Tội phạm',   true)
ON CONFLICT (term) DO NOTHING;
