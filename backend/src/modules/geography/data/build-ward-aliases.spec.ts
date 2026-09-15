import { WardSeed } from './khanh-hoa-wards';
import { buildAliasRows } from './build-ward-aliases';

describe('buildAliasRows', () => {
  // KHÓA THỨ TỰ: official phải push trước old_ward. Nếu ai đảo hai vòng lặp
  // trong buildAliasRows để "gọn code", old_ward sẽ thắng dedupe và test này
  // phải ĐỎ — đây là test duy nhất bắt được lỗi lặng lẽ mất khả năng khớp
  // của 24/65 ward có short_name trùng chính oldName của mình.
  it('short_name trùng một oldName của chính ward → chỉ giữ 1 alias, kiểu official thắng', () => {
    const seed: WardSeed = {
      name: 'Đặc khu Trường Sa',
      type: 'dac_khu',
      region: 'khanh_hoa_cu',
      oldNames: ['Trường Sa', 'Song Tử Tây', 'Sinh Tồn'],
    };
    const rows = buildAliasRows(seed);
    const truongSa = rows.filter((r) => r.aliasNorm === 'truong sa');
    expect(truongSa).toHaveLength(1);
    expect(truongSa[0].aliasType).toBe('official');
    // Ward không đặt cờ requiresCue → alias official kế thừa false, KHÔNG bị
    // ép thành true như alias old_ward sẽ ép nếu nó thắng nhầm.
    expect(truongSa[0].requiresCue).toBe(false);
  });

  it('alias old_ward luôn requiresCue = true, kể cả khi ward không đặt cờ', () => {
    const seed: WardSeed = {
      name: 'Xã Vạn Thắng',
      type: 'xa',
      region: 'khanh_hoa_cu',
      oldNames: ['Vạn Bình', 'Vạn Thắng'],
      // không có requiresCue trên seed
    };
    const rows = buildAliasRows(seed);
    const oldWardRows = rows.filter((r) => r.aliasType === 'old_ward');
    expect(oldWardRows.length).toBeGreaterThan(0);
    expect(oldWardRows.every((r) => r.requiresCue === true)).toBe(true);
  });

  it('alias official kế thừa đúng cờ requiresCue của ward (có cờ và không cờ)', () => {
    const seedWithCue: WardSeed = {
      name: 'Xã Bác Ái',
      type: 'xa',
      region: 'ninh_thuan_cu',
      oldNames: ['Phước Tiến', 'Phước Thắng', 'Phước Chính'],
      requiresCue: true,
    };
    const rowsWithCue = buildAliasRows(seedWithCue).filter(
      (r) => r.aliasType === 'official',
    );
    expect(rowsWithCue.every((r) => r.requiresCue === true)).toBe(true);

    const seedNoCue: WardSeed = {
      name: 'Xã Cam An',
      type: 'xa',
      region: 'khanh_hoa_cu',
      oldNames: ['Cam Phước Tây', 'Cam An Bắc', 'Cam An Nam'],
    };
    const rowsNoCue = buildAliasRows(seedNoCue).filter(
      (r) => r.aliasType === 'official',
    );
    expect(rowsNoCue.every((r) => r.requiresCue === false)).toBe(true);
  });
});
