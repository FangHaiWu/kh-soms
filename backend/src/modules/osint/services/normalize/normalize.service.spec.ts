import { NormalizeService } from './normalize.service';
import { describe, it, expect } from '@jest/globals';
describe('NormalizeService', () => {
  const svc = new NormalizeService();

  it('NFC: hai dạng Unicode cùng nội dung → cùng contentHash', () => {
    const nfd = 'cà phê'.normalize('NFD'); // ký tự tổ hợp
    const nfc = 'cà phê'.normalize('NFC');
    expect(svc.normalize(nfd).contentHash).toBe(svc.normalize(nfc).contentHash);
  });

  it('bóc HTML + giải entity', () => {
    expect(svc.normalize('<p>xin&nbsp;chào</p>').normalizedContent).toBe(
      'xin chào',
    );
  });

  it('gom whitespace + trim', () => {
    expect(svc.normalize('  a\n\n  b\t c  ').normalizedContent).toBe('a b c');
  });

  it('nội dung khác → hash khác; thừa space → hash giống', () => {
    expect(svc.normalize('an ninh').contentHash).not.toBe(
      svc.normalize('trật tự').contentHash,
    );
    expect(svc.normalize('an  ninh').contentHash).toBe(
      svc.normalize('an ninh').contentHash,
    );
  });
  it('normalizedContent giữ nguyên hoa/thường; hash không phân biệt case', () => {
    const out = svc.normalize('An Ninh Trật Tự');
    expect(out.normalizedContent).toBe('An Ninh Trật Tự'); // giữ case
    expect(out.contentHash).toBe(svc.normalize('an ninh trật tự').contentHash); // hash bỏ case
  });
});
