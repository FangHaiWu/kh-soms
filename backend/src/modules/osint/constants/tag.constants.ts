/**
 * Bộ tag chuẩn cho osint_groups — phân loại đối tượng giám sát theo 5 chiều.
 * Quy ước giá trị: VIẾT HOA, không dấu, kebab (SCREAMING-KEBAB), từ ngữ tiếng Việt.
 * Postgres so sánh phân biệt hoa/thường → mọi nơi (seed, query, filter) PHẢI dùng đúng dạng ở đây.
 * Tên biến giữ tiếng Anh theo quy ước CLAUDE.md (English cho technical detail).
 */

// TAG địa bàn — cấu trúc 2 cấp Khánh Hòa (sau sáp nhập Ninh Thuận, bỏ cấp huyện)
export const LOCATION_TAGS = [
  'KHANH-HOA',
  'NHA-TRANG',
  'CAM-RANH',
  'CAM-LAM',
  'NINH-HOA',
  'NINH-THUAN',
  'PHAN-RANG',
  'THAP-CHAM',
  'NINH-PHUOC',
  'DONG-HAI',
  'VINH-HAI',
  'THUAN-NAM',
  'NAM-NHA-TRANG',
  'BAC-NHA-TRANG',
  'TAY-NHA-TRANG',
  'NAM-KHANH-HOA',
  'BAC-KHANH-HOA',
  'VEN-BIEN',
  'MIEN-NUI',
  'CONG-NGHIEP',
] as const;

// TAG loại nguồn
export const SOURCE_TYPE_TAGS = [
  'CHINH-THUC', // Nguồn chính thức (báo ngành, cổng CA, chính quyền)
  'BAO-CHI', // Báo chí, tin tức
  'CONG-DONG', // Nhóm cộng đồng dân cư
  'CA-NHAN', // Tài khoản/kênh cá nhân
  'TONG-HOP', // Tổng hợp (vd Google News)
] as const;

// TAG chủ đề ANTT — khớp với keyword OSINT
export const TOPIC_TAGS = [
  'ANTT',
  'TTATXH',
  'AN-NINH',
  'AN-NINH-CHINH-TRI',
  'AN-NINH-MANG',
  'TOI-PHAM',
  'VI-PHAM-PHAP-LUAT',
  'GIAO-THONG',
  'MA-TUY',
  'TROM-CAP',
  'CUOP',
  'GIET-NGUOI',
  'CO-Y-GAY-THUONG-TICH',
  'VU-KHI',
  'TU-TAP',
  'TON-GIAO',
  'MOI-TRUONG',
  'CO-BAC',
  'TIN-DUNG-DEN',
  'CHAY-NO',
  'KHUNG-BO',
  'MAI-DAM',
  'BUON-LAU',
  'LUA-DAO',
  'DU-LIEU',
  'DU-LUAN',
  'HONG-BIEN',
] as const;

// TAG độ ưu tiên giám sát
export const PRIORITY_TAGS = [
  'UU-TIEN-CAO',
  'UU-TIEN-BINH-THUONG',
  'UU-TIEN-THAP',
  'GIAM-SAT-DAC-BIET',
] as const;

// TAG trạng thái nguồn
export const STATUS_TAGS = [
  'DA-XAC-MINH', // Đã xác minh nguồn tồn tại/đáng tin
  'CHUA-XAC-MINH', // Chưa xác minh
  'DE-BIEN-DONG', // Hay bị xóa/đổi (kênh cá nhân)
] as const;

// Gộp tất cả — dùng cho validation nếu cần
export const ALL_TAGS = [
  ...LOCATION_TAGS,
  ...SOURCE_TYPE_TAGS,
  ...TOPIC_TAGS,
  ...PRIORITY_TAGS,
  ...STATUS_TAGS,
] as const;

export type OsintTag = (typeof ALL_TAGS)[number];
