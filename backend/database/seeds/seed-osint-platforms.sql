-- ======================================================= --
 -- SEED PLATFORMS: osint_platforms 
 -- Y nghia: Day la danh sach cac platform de crawl OSINT
 -- Thong nhat cwarler_type: 
    -- rss	rss_feedparser	Parse XML feed, không cần browser
    -- facebook	facebook_playwright	Cần browser giả lập, không có API công khai
    -- telegram	telegram_public_preview	Scrape HTML công khai t.me/s/<channel>, KHÔNG login (thay Telethon — tuân thủ quy tắc "không đăng nhập tài khoản")
    -- tiktok	tiktok_playwright	Không có API công khai
    -- threads	threads_playwright	Không có API công khai
    -- reddit	reddit_api	Reddit có public API (r/KhanhHoa...)
    -- youtube	youtube_api	YouTube Data API v3
    -- instagram	instagram_playwright	Không có API công khai
  -- Ap dung Rubric chấm điểm trust_level cho platform 
    -- Tieu chi: 
        -- Tiêu chí	                     0 điểm	              1 điểm	              2 điểm
        -- Kiểm duyệt biên tập	  | Không có (UGC thuần) |	Có nhưng hạn chế | 	Có tòa soạn/ban biên tập
        -- Xác minh danh tính      | Ẩn danh hoàn toàn	  |   Tùy chọn	       |  Bắt buộc real-name
        -- Trách nhiệm pháp lý	   | Không (nước ngoài, ẩn danh)  |	Thấp      |  Cao (báo được cấp phép)
        -- Tính ổn định nguồn	   | Kênh cá nhân, dễ xóa	| Trang/nhóm, khó xóa	| Tên miền/tổ chức chính thức
        -- API / dữ liệu có cấu trúc	| Không có	        | Có giới hạn	        |API chính thức đầy đủ
-- ======================================================= --

INSERT INTO osint.osint_platforms (name, display_name, is_active, crawler_type, platform_settings, crawl_interval_minutes_default, trust_level, documentation_url ) VALUES
('facebook', 'Facebook', true, 'facebook_playwright', null, 180, 2, null ),
('instagram', 'Instagram', false, 'instagram_playwright', null, 180, 2, null),
('reddit', 'Reddit', false, 'reddit_api', null, 180, 2, null),
('threads', 'Threads', false, 'threads_playwright', null, 180, 2, null),
('tiktok', 'TikTok', false, 'tiktok_playwright', null, 180, 1, null),
('telegram', 'Telegram', true, 'telegram_public_preview', null, 30, 1, null),
('youtube', 'YouTube', false, 'youtube_api', null, 180, 3, null),
('rss', 'RSS Feed', true, 'rss_feedparser', null, 60, 5, null)
ON CONFLICT (name) DO NOTHING;


-- Bổ sung thêm 1 platform: Web news
INSERT INTO osint.osint_platforms (name, display_name, is_active, crawler_type, platform_settings, crawl_interval_minutes_default, trust_level, documentation_url ) VALUES
('web_news', 'Báo điện tử (Không RSS)', true, 'web_tràilatura', null, 60, 5, null)
ON CONFLICT (name) DO NOTHING;

-- Sửa lỗi thông tin cột crawler_type 
INSERT INTO osint.osint_platforms (name, display_name, is_active, crawler_type, platform_settings, crawl_interval_minutes_default, trust_level, documentation_url ) VALUES
('web_news', 'Báo điện tử (Không RSS)', true, 'web_trafilatura', null, 60, 5, null)
ON CONFLICT (name)
DO UPDATE SET 
    crawler_type = EXCLUDED.crawler_type;