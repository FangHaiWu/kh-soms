import { buildIndex, findHits, normalizeAlias, tokenizeVi } from './ward-matcher';

// Index nhỏ dựng tay — test thuần, không đụng DB
const INDEX = buildIndex([
  { wardId: 'w-nt', alias: 'Nha Trang', requiresCue: false },
  { wardId: 'w-bnt', alias: 'Bắc Nha Trang', requiresCue: false },
  { wardId: 'w-dk', alias: 'Diên Khánh', requiresCue: false },
]);

describe('buildIndex', () => {
  // Invariant cốt lõi của S6: một alias có thể trỏ NHIỀU ward (trùng tên khác
  // địa bàn, vd "Ninh Hải" vừa là xã ở Ninh Thuận vừa là phường cũ Ninh Hòa).
  // Task 5 dựa vào entries.length > 1 để nhận biết mơ hồ và BỎ GÁN — nếu
  // buildIndex lỡ đổi thành ghi đè (index.set thay vì push) thì hệ thống sẽ
  // lặng lẽ gán sai địa bàn thay vì bỏ trống, nên bắt buộc phải test riêng.
  it('một alias trỏ nhiều ward → gộp thành mảng, không ghi đè', () => {
    const idx = buildIndex([
      { wardId: 'w-nh-nt', alias: 'Ninh Hải', requiresCue: false },
      { wardId: 'w-dnh', alias: 'Ninh Hải', requiresCue: false },
    ]);
    const entries = idx.get('ninh hai');
    expect(entries).toHaveLength(2);
    expect(entries?.map((e) => e.wardId).sort()).toEqual(['w-dnh', 'w-nh-nt']);
  });
});

describe('normalizeAlias', () => {
  it('bỏ dấu, lowercase, gộp khoảng trắng', () => {
    expect(normalizeAlias('  Diên   Khánh ')).toBe('dien khanh');
    expect(normalizeAlias('Đặc khu Trường Sa')).toBe('dac khu truong sa');
  });
});

describe('tokenizeVi', () => {
  it('giữ offset gốc để cắt được text nguyên văn có dấu', () => {
    const toks = tokenizeVi('Tại xã Diên Khánh');
    const dien = toks.find((t) => t.norm === 'dien')!;
    expect('Tại xã Diên Khánh'.slice(dien.start, dien.end)).toBe('Diên');
  });
});

describe('findHits', () => {
  it('khớp cụm dài nhất trước — "Bắc Nha Trang" không bị nuốt thành "Nha Trang"', () => {
    const hits = findHits('Vụ việc ở Bắc Nha Trang hôm qua', INDEX);
    expect(hits).toHaveLength(1);
    expect(hits[0].entries[0].wardId).toBe('w-bnt');
  });

  it('cắt được location_text nguyên văn CÓ DẤU từ offset', () => {
    const text = 'Bắt giữ tại Diên Khánh';
    const hits = findHits(text, INDEX);
    expect(text.slice(hits[0].start, hits[0].end)).toBe('Diên Khánh');
  });

  it('khớp cả khi viết không dấu', () => {
    const hits = findHits('cong an dien khanh', INDEX);
    expect(hits[0].entries[0].wardId).toBe('w-dk');
  });

  // Bài báo nhắc nhiều xã/phường trong 1 đoạn là chuyện thường — đây là chỗ
  // dễ lộ bug ở logic nhảy con trỏ (i += n) giữa các hit nếu cài sai.
  it('khớp nhiều địa danh trong cùng một đoạn, đúng thứ tự xuất hiện', () => {
    // Index riêng cho test này (thêm 'Suối Hiệp' cạnh 'Diên Khánh')
    const multiIndex = buildIndex([
      { wardId: 'w-dk', alias: 'Diên Khánh', requiresCue: false },
      { wardId: 'w-sh', alias: 'Suối Hiệp', requiresCue: false },
    ]);
    const text = 'Công an xã Diên Khánh phối hợp xã Suối Hiệp';
    const hits = findHits(text, multiIndex);

    expect(hits).toHaveLength(2);
    // Đúng thứ tự xuất hiện trong text, không bị đảo hay trùng lặp
    expect(hits[0].entries[0].wardId).toBe('w-dk');
    expect(hits[1].entries[0].wardId).toBe('w-sh');
    // start/end của từng hit phải cắt ra đúng tên nguyên văn CÓ DẤU
    expect(text.slice(hits[0].start, hits[0].end)).toBe('Diên Khánh');
    expect(text.slice(hits[1].start, hits[1].end)).toBe('Suối Hiệp');
  });
});
