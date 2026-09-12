import { Injectable } from '@nestjs/common';

// Loại chỉ dấu CNC bóc từ nội dung bài (regex thuần, không ML)
export type IndicatorType =
  | 'PHONE'
  | 'BANK_ACCOUNT'
  | 'CRYPTO_WALLET'
  | 'URL'
  | 'HANDLE';

// raw = chuỗi gốc trong bài; normalized = dạng chuẩn để khớp chéo (vân tay actor L2)
export interface Indicator {
  type: IndicatorType;
  raw: string;
  normalized: string;
}

// TLD chấp nhận cho domain TRẦN (không có http). Full-URL thì nhận mọi TLD.
const BARE_TLDS = new Set([
  'com',
  'net',
  'org',
  'vn',
  'info',
  'biz',
  'co',
  'io',
  'me',
  'top',
  'vip',
  'xyz',
  'cc',
  'icu',
  'online',
  'site',
  'live',
  'app',
  'club',
  'shop',
  'store',
  'pro',
  'bond',
  'trading',
  'link',
  'click',
  'fun',
  'cfd',
  'asia',
  'one',
  'tech',
  'host',
  'space',
  'website',
  'digital',
  'finance',
  'fund',
  'capital',
  'trade',
  'markets',
  'win',
]);

// Nền tảng nhắn tin/MXH → coi là HANDLE (kênh dẫn dụ) thay vì URL thường
const HANDLE_HOSTS = new Set([
  't.me',
  'zalo.me',
  'fb.me',
  'm.me',
  'facebook.com',
  'instagram.com',
]);

/**
 * IndicatorExtractorService — bóc chỉ dấu CNC (SĐT/STK/ví/URL/handle) bằng regex + chuẩn hóa.
 *
 * Thuần logic (không DB/HTTP) → chạy inline trong worker. Không đụng Gate (chỉ làm giàu bài +
 * nuôi vân-tay-actor Lớp 2). Chiến lược: bóc theo thứ tự, "che" (blank) phần đã nhận để tránh
 * bắt chồng (vd domain trong URL, số trong ví). BANK_ACCOUNT cần cue ngữ cảnh để tăng precision.
 */
@Injectable()
export class IndicatorExtractorService {
  extract(text: string): Indicator[] {
    if (!text || !text.trim()) return [];
    const found: Indicator[] = [];
    let masked = text;

    // Thứ tự quan trọng: URL/handle/crypto/domain (có chữ) trước, rồi phone, rồi bank (số)
    masked = this.consumeUrls(masked, found);
    masked = this.consumeHandles(masked, found);
    masked = this.consumeCrypto(masked, found);
    masked = this.consumeDomains(masked, found);
    masked = this.consumePhones(masked, found);
    this.collectBankAccounts(masked, found);

    return this.dedup(found);
  }

  /** URL đầy đủ http(s): host chuẩn hóa; nếu là nền tảng nhắn tin → xếp thành HANDLE. */
  private consumeUrls(text: string, found: Indicator[]): string {
    const re = /\bhttps?:\/\/[^\s<>"'()]+/gi;
    return text.replace(re, (m) => {
      try {
        const url = new URL(m);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        if (HANDLE_HOSTS.has(host)) {
          const norm = (host + url.pathname).replace(/\/+$/, '');
          found.push({ type: 'HANDLE', raw: m, normalized: norm });
        } else {
          found.push({ type: 'URL', raw: m, normalized: host });
        }
      } catch {
        // URL không parse được → bỏ qua
      }
      return ' '.repeat(m.length); // che để domain/phone không bắt lại phần bên trong
    });
  }

  /** Handle: link nền tảng không scheme (t.me/…) + @username (loại phần local của email). */
  private consumeHandles(text: string, found: Indicator[]): string {
    let out = text;
    // Link nền tảng dạng trần: t.me/xxx, zalo.me/xxx…
    const linkRe =
      /\b(?:t\.me|zalo\.me|fb\.me|m\.me|facebook\.com|instagram\.com)\/[A-Za-z0-9_.]+/gi;
    out = out.replace(linkRe, (m) => {
      found.push({
        type: 'HANDLE',
        raw: m,
        normalized: m.toLowerCase().replace(/\/+$/, ''),
      });
      return ' '.repeat(m.length);
    });
    // @username — lookbehind chặn '@' đứng sau ký tự chữ (tức phần local của email)
    const atRe = /(?<![\w@.])@[A-Za-z0-9_]{4,}/g;
    out = out.replace(atRe, (m) => {
      found.push({ type: 'HANDLE', raw: m, normalized: m.toLowerCase() });
      return ' '.repeat(m.length);
    });
    return out;
  }

  /** Ví crypto: ETH/USDT-ERC20 (0x+40hex, chuẩn hóa lowercase) + BTC (base58, giữ nguyên). */
  private consumeCrypto(text: string, found: Indicator[]): string {
    let out = text;
    out = out.replace(/\b0x[a-fA-F0-9]{40}\b/g, (m) => {
      found.push({
        type: 'CRYPTO_WALLET',
        raw: m,
        normalized: m.toLowerCase(),
      });
      return ' '.repeat(m.length);
    });
    out = out.replace(
      /\b(?:bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g,
      (m) => {
        found.push({ type: 'CRYPTO_WALLET', raw: m, normalized: m });
        return ' '.repeat(m.length);
      },
    );
    return out;
  }

  /** Domain trần (không scheme): chỉ nhận nếu TLD nằm trong whitelist (giảm nhầm 'tp.hcm'…). */
  private consumeDomains(text: string, found: Indicator[]): string {
    // lookbehind (?<![@\w.]) chặn domain của email + tránh cắt giữa chuỗi
    const re =
      /(?<![@\w.])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(?![\w.@])/gi;
    return text.replace(re, (m) => {
      const host = m.toLowerCase().replace(/^www\./, '');
      const labels = host.split('.');
      const tld = labels[labels.length - 1] ?? '';
      const sld = labels[labels.length - 2] ?? ''; // nhãn ngay trước TLD
      // Nhận khi: TLD trong whitelist VÀ SLD >= 2 ký tự (loại false-positive kiểu "n.biz")
      if (BARE_TLDS.has(tld) && sld.length >= 2) {
        found.push({ type: 'URL', raw: m, normalized: host });
        return ' '.repeat(m.length);
      }
      return m; // TLD lạ / SLD quá ngắn → giữ nguyên, không nhận
    });
  }

  /** SĐT VN: 0xxx/+84 có . - space; chuẩn hóa 0xxxxxxxxx; chỉ nhận đầu số di động 03/05/07/08/09. */
  private consumePhones(text: string, found: Indicator[]): string {
    const re = /(?<!\d)(?:\+?84|0)(?:[\s.\-]?\d){9}(?!\d)/g;
    return text.replace(re, (m) => {
      let d = m.replace(/\D/g, ''); // chỉ giữ chữ số
      if (d.length === 11 && d.startsWith('84')) d = '0' + d.slice(2); // +84 → 0
      // Hợp lệ = 10 số + đầu số di động VN → nhận; ngược lại giữ nguyên cho bước khác
      if (d.length === 10 && /^0(3|5|7|8|9)/.test(d)) {
        found.push({ type: 'PHONE', raw: m.trim(), normalized: d });
        return ' '.repeat(m.length);
      }
      return m;
    });
  }

  /** STK/thẻ: chuỗi 8–19 số CHỈ nhận khi có cue (STK/tài khoản/ngân hàng…) gần trước — tăng precision. */
  private collectBankAccounts(text: string, found: Indicator[]): void {
    const cue =
      /(stk|tk|tài khoản|tai khoan|số tài khoản|account|acc|ngân hàng|ngan hang)/i;
    const re = /(?<!\d)\d{8,19}(?!\d)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const before = text.slice(Math.max(0, m.index - 20), m.index);
      if (cue.test(before)) {
        found.push({ type: 'BANK_ACCOUNT', raw: m[0], normalized: m[0] });
      }
    }
  }

  /** Loại trùng theo (type + normalized) trong cùng một bài. */
  private dedup(list: Indicator[]): Indicator[] {
    const seen = new Set<string>();
    const out: Indicator[] = [];
    for (const i of list) {
      const key = `${i.type}:${i.normalized}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(i);
      }
    }
    return out;
  }
}
