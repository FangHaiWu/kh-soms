/**
 * RawPost — schema chuẩn hoá (normalized) mà MỌI collector phải trả về.
 *
 * Mục đích: tách trách nhiệm giữa "thu thập" (collector, biết cấu trúc từng platform)
 * và "nạp vào DB" (PostIngestService, không cần biết platform). Nhờ đó thêm platform mới
 * (Facebook Sprint 4, TikTok...) chỉ cần viết 1 collector mới trả về RawPost — KHÔNG đụng
 * tới logic ingest/NLP/alert.
 */
export interface RawPost {
  // Định danh gốc của post trên platform (vd Telegram: "12264"). Dùng để dedup cùng external_group_id.
  externalPostId: string;

  // Định danh group/channel gốc (vd "photvietnam"). null nếu nguồn không có khái niệm group (vd RSS).
  externalGroupId?: string | null;

  // Tên tác giả hiển thị (với channel Telegram = tên channel; với RSS = tên báo/author).
  authorName?: string | null;

  // Nội dung text thuần của post (đã bỏ HTML). BẮT BUỘC — NLP chạy trên trường này.
  content: string;

  // Link media (ảnh/video) — CHỈ lưu URL, không tải file (quyết định kiến trúc "links only").
  mediaUrls?: string[];

  // Chỉ số tương tác đã chuẩn hoá về dạng số (Telegram preview chỉ có viewCount).
  engagement?: {
    likes?: number;
    shares?: number;
    reactions?: Record<string, number>;
    commentCount?: number;
    viewCount?: number;
  };

  // Thời điểm đăng (UTC). null nếu platform không cung cấp.
  publishedAt?: Date | null;

  // Liên kết ngược về bản ghi nguồn gốc nếu có (vd RSS: id của osint_articles) — phục vụ truy vết.
  sourceRefIds?: string[];

  // Dữ liệu đặc thù platform không nằm trong schema chung (vd Telegram: {messageUrl, isForwarded}).
  platformSpecificData?: Record<string, unknown>;
}

/**
 * Kết quả 1 lần collector chạy trên 1 nguồn — dùng để ghi osint_crawl_logs + báo cáo demo.
 */
export interface CollectorResult {
  // Tên nguồn đã crawl (channel/feed) để log cho dễ đọc.
  sourceLabel: string;

  // Danh sách post thô thu được (chưa dedup, chưa nạp DB).
  posts: RawPost[];

  // true nếu fetch/parse thành công; false nếu lỗi mạng/HTTP/parse.
  ok: boolean;

  // Thông điệp lỗi nếu ok=false (đưa vào osint_crawl_logs.error_message).
  error?: string;
}
