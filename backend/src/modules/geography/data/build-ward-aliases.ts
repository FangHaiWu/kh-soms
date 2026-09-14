// Dựng danh sách alias cho một ward từ WardSeed. Hàm THUẦN — không đụng DB,
// tách riêng để test tất định (cùng cách ward-matcher.ts tách khỏi tầng Nest).
import { WardSeed } from './khanh-hoa-wards';
import { normalizeAlias } from '../services/ward-matcher';

export interface AliasRow {
  alias: string;
  aliasNorm: string;
  aliasType: 'official' | 'old_ward';
  requiresCue: boolean;
}

// Bỏ tiền tố loại để lấy tên gọi thường ngày: "Phường Nha Trang" → "Nha Trang"
export function stripPrefix(name: string): string {
  return name.replace(/^(Phường|Xã|Đặc khu|Thị trấn)\s+/i, '');
}

/**
 * Dựng + khử trùng alias cho một ward.
 *
 * Flow: alias official (tên đầy đủ + tên rút gọn) → alias old_ward (tên cũ) → khử trùng.
 *
 * Thứ tự PUSH BẮT BUỘC official trước old_ward: bước khử trùng bên dưới dùng
 * Set giữ bản ghi xuất hiện ĐẦU TIÊN theo alias_norm, nên khi short_name
 * (official) trùng một oldName của chính ward đó (vd "Cam Linh", "Trường Sa"
 * — 24/65 ward rơi vào tình huống này), official phải thắng để giữ đúng cờ
 * requiresCue của ward: old_ward luôn cứng requiresCue=true, còn official
 * theo đúng cờ khai trong seed (đa số false). Đảo thứ tự hai vòng lặp để
 * "gọn code" sẽ khiến 24 tên CHÍNH THỨC bỗng đòi cue — hệ thống lặng lẽ mất
 * khả năng khớp, không test nào kêu nếu thiếu test khóa thứ tự
 * (xem build-ward-aliases.spec.ts).
 */
export function buildAliasRows(seed: WardSeed): AliasRow[] {
  const shortName = stripPrefix(seed.name);
  const rows: AliasRow[] = [];

  // 1. Alias official: cả tên đầy đủ lẫn tên rút gọn — PHẢI đứng trước old_ward
  for (const a of [seed.name, shortName]) {
    rows.push({
      alias: a,
      aliasNorm: normalizeAlias(a),
      aliasType: 'official',
      requiresCue: seed.requiresCue ?? false,
    });
  }

  // 2. Alias tên cũ: luôn requires_cue — tên cũ mơ hồ hơn tên hiện hành
  for (const old of seed.oldNames) {
    rows.push({
      alias: old,
      aliasNorm: normalizeAlias(old),
      aliasType: 'old_ward',
      requiresCue: true,
    });
  }

  // 3. Khử trùng trong cùng 1 ward (vd short_name trùng 1 oldName) — UNIQUE(alias_norm, ward_id).
  // Giữ bản ghi ĐẦU TIÊN gặp theo alias_norm: nhờ thứ tự push ở bước 1-2,
  // alias official luôn thắng alias old_ward khi hai bên trùng alias_norm.
  const seen = new Set<string>();
  return rows.filter((r) =>
    seen.has(r.aliasNorm) ? false : (seen.add(r.aliasNorm), true),
  );
}
