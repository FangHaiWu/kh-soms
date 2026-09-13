import { buildIndex, findHits, normalizeAlias, tokenizeVi } from './ward-matcher';

// Index nhỏ dựng tay — test thuần, không đụng DB
const INDEX = buildIndex([
  { wardId: 'w-nt', alias: 'Nha Trang', requiresCue: false },
  { wardId: 'w-bnt', alias: 'Bắc Nha Trang', requiresCue: false },
  { wardId: 'w-dk', alias: 'Diên Khánh', requiresCue: false },
]);

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
});
