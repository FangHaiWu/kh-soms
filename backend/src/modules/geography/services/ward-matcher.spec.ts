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

// Index riêng cho cue-gating: 'Tân Định' trùng cụm tiếng Việt thông thường
// ("tân định cư") nên requiresCue=true; 'Diên Khánh' không mơ hồ nên false.
const CUE_INDEX = buildIndex([
  { wardId: 'w-td', alias: 'Tân Định', requiresCue: true },
  { wardId: 'w-dk', alias: 'Diên Khánh', requiresCue: false },
]);

describe('cue-gating', () => {
  it('alias trùng từ thông thường KHÔNG khớp khi thiếu cue', () => {
    expect(findHits('anh ấy tân định cư ở đây', CUE_INDEX)).toHaveLength(0);
  });

  it('khớp khi có cue "xã"', () => {
    const hits = findHits('bắt tại xã Tân Định', CUE_INDEX);
    expect(hits[0].entries[0].wardId).toBe('w-td');
  });

  it('khớp khi có cue "tại"', () => {
    expect(findHits('xảy ra tại Tân Định', CUE_INDEX)).toHaveLength(1);
  });
});

describe('guard tỉnh khác', () => {
  it('bỏ qua địa danh khi cùng câu có tên tỉnh khác', () => {
    expect(findHits('Công an xã Tân Định, Bình Dương triệt phá', CUE_INDEX)).toHaveLength(0);
  });

  it('KHÔNG bỏ khi tỉnh nhắc tới là Khánh Hòa', () => {
    const hits = findHits('tại Diên Khánh, Khánh Hòa', CUE_INDEX);
    expect(hits).toHaveLength(1);
  });

  it('câu khác không ảnh hưởng nhau', () => {
    const hits = findHits('Tin từ Bình Dương. Vụ việc tại Diên Khánh.', CUE_INDEX);
    expect(hits).toHaveLength(1);
  });

  // Ràng buộc quan trọng nhất của guard: Ninh Thuận đã là một phần của
  // Khánh Hòa mới (sáp nhập 01/7/2025) nên KHÔNG được coi là "tỉnh khác".
  // Nếu sau này ai đó "sửa cho đủ 34 tỉnh" mà lỡ thêm nhầm Ninh Thuận vào
  // OTHER_PROVINCES, test này phải đỏ ngay để chặn lại.
  it('KHÔNG bỏ khi tỉnh nhắc tới là Ninh Thuận — đã sáp nhập vào Khánh Hòa', () => {
    const hits = findHits('tại Diên Khánh, Ninh Thuận', CUE_INDEX);
    expect(hits).toHaveLength(1);
  });
});
