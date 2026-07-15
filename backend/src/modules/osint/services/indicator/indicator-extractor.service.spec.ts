import { describe, it, expect, beforeEach } from '@jest/globals';
import { IndicatorExtractorService } from './indicator-extractor.service';

describe('IndicatorExtractorService', () => {
  let svc: IndicatorExtractorService;
  beforeEach(() => {
    svc = new IndicatorExtractorService();
  });

  const norms = (text: string, type: string) =>
    svc.extract(text).filter((i) => i.type === type).map((i) => i.normalized);

  // ---- PHONE ----
  it('PHONE: bắt 0xxx / +84 / có . - space, chuẩn hóa về 0xxxxxxxxx', () => {
    expect(norms('Liên hệ 0912.345.678 gấp', 'PHONE')).toEqual(['0912345678']);
    expect(norms('gọi +84 912 345 678', 'PHONE')).toEqual(['0912345678']);
    expect(norms('sđt 0987654321', 'PHONE')).toEqual(['0987654321']);
  });

  it('PHONE: loại số không phải đầu số di động VN (giảm false-positive)', () => {
    // 0123456789: đầu 01 không còn là đầu số di động → không nhận
    expect(norms('mã đơn 0123456789', 'PHONE')).toEqual([]);
  });

  // ---- BANK_ACCOUNT (cần ngữ cảnh để tăng precision) ----
  it('BANK_ACCOUNT: chỉ bắt khi có cue STK/tài khoản gần đó', () => {
    expect(norms('STK: 1234567890 Vietcombank', 'BANK_ACCOUNT')).toEqual([
      '1234567890',
    ]);
    // Chuỗi số dài KHÔNG có cue → không nhận (tránh bắt ngày/mã đơn/giá)
    expect(norms('đơn hàng 1234567890 giao hôm nay', 'BANK_ACCOUNT')).toEqual([]);
  });

  // ---- CRYPTO_WALLET ----
  it('CRYPTO_WALLET: bắt ví ETH (0x+40hex) và BTC', () => {
    const eth = '0x' + 'aB'.repeat(20); // 0x + 40 hex
    expect(norms(`gửi về ${eth}`, 'CRYPTO_WALLET')).toEqual([eth.toLowerCase()]);
    const btc = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
    expect(svc.extract(`ví ${btc}`).some((i) => i.type === 'CRYPTO_WALLET')).toBe(
      true,
    );
  });

  // ---- URL / domain ----
  it('URL: bắt URL đầy đủ + domain trần, chuẩn hóa host lowercase bỏ www', () => {
    expect(norms('vào https://Vay-Nhanh.TOP/dangky ngay', 'URL')).toEqual([
      'vay-nhanh.top',
    ]);
    expect(norms('web www.sanabc-invest.vip lừa đảo', 'URL')).toEqual([
      'sanabc-invest.vip',
    ]);
  });

  it('URL: KHÔNG nhầm phần domain của email thành URL', () => {
    expect(norms('mail lienhe@gmail.com', 'URL')).toEqual([]);
  });

  it('URL: loại domain trần có nhãn SLD 1 ký tự (false-positive n.biz)', () => {
    // "n.biz" bắt nhầm từ văn bản — SLD 'n' 1 ký tự → bỏ; nhưng URL đầy đủ vẫn nhận
    expect(norms('doanh nghiệp n.biz phát triển', 'URL')).toEqual([]);
    expect(norms('web ab-xyz.com hợp lệ', 'URL')).toEqual(['ab-xyz.com']);
  });

  // ---- HANDLE ----
  it('HANDLE: bắt @username và link t.me/zalo.me', () => {
    expect(svc.extract('kết bạn @scam_king_88').map((i) => i.type)).toContain(
      'HANDLE',
    );
    expect(norms('vào nhóm t.me/DauTu4_0', 'HANDLE')).toEqual(['t.me/dautu4_0']);
  });

  it('HANDLE: @ trong email KHÔNG bị bắt là handle', () => {
    expect(svc.extract('lienhe@gmail.com').filter((i) => i.type === 'HANDLE'))
      .toEqual([]);
  });

  // ---- Chung ----
  it('dedup theo (type, normalized): cùng số 2 lần → 1', () => {
    expect(norms('0912345678 và lại 0912.345.678', 'PHONE')).toEqual([
      '0912345678',
    ]);
  });

  it('text rỗng/không có chỉ dấu → []', () => {
    expect(svc.extract('')).toEqual([]);
    expect(svc.extract('hôm nay trời đẹp quá')).toEqual([]);
  });
});
