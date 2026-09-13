// Logic thuần khớp địa danh → ward. KHÔNG import NestJS, KHÔNG đụng DB.
// Tách thuần để test tất định (cùng cách actor-aggregator.ts tách khỏi job).

export interface Token {
  norm: string; // đã lowercase + bỏ dấu
  start: number; // offset trong CHUỖI GỐC (có dấu)
  end: number;
}

export interface AliasEntry {
  wardId: string;
  alias: string;
  requiresCue: boolean;
}

export type AliasIndex = Map<string, AliasEntry[]>;

export interface Hit {
  aliasNorm: string;
  entries: AliasEntry[]; // >1 phần tử = alias trỏ nhiều ward = mơ hồ
  start: number;
  end: number;
  tokenIndex: number; // vị trí token đầu của cụm, để dò cue phía trước
}

// Số token tối đa của một tên đơn vị ("Đặc khu Trường Sa" = 4 token, chừa dư 1)
const MAX_NGRAM = 5;

// Bỏ dấu tiếng Việt. đ/Đ không phải tổ hợp dấu nên phải thay tay sau khi strip.
function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // dải dấu thanh tổ hợp Unicode (escape tường minh, tránh dán ký tự vô hình)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

// Chuẩn hóa một alias về khóa index: lowercase, bỏ dấu, gộp khoảng trắng
export function normalizeAlias(s: string): string {
  return stripDiacritics(s.normalize('NFC').toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Tách text thành token, chuẩn hóa TỪNG TỪ và giữ offset trong chuỗi gốc.
 *
 * Cố ý không chuẩn hóa cả chuỗi rồi dò lại vị trí: NFD làm lệch chỉ số ký tự,
 * trong khi ta cần offset gốc để cắt location_text nguyên văn CÓ DẤU.
 */
export function tokenizeVi(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({
      norm: stripDiacritics(m[0].toLowerCase()),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return tokens;
}

// Dựng index từ danh sách alias: khóa alias_norm → các ward cùng mang tên đó
export function buildIndex(entries: AliasEntry[]): AliasIndex {
  const index: AliasIndex = new Map();
  for (const e of entries) {
    const key = normalizeAlias(e.alias);
    const bucket = index.get(key);
    if (bucket) bucket.push(e);
    else index.set(key, [e]);
  }
  return index;
}

// Tiền tố báo hiệu phía sau là địa danh. "đặc khu"/"thị trấn" là 2 token nên dò cả cặp.
const CUE_WORDS = new Set([
  'xa', 'phuong', 'khu', 'tran', 'thon', 'tai', 'o', 'thuoc', 'dia', 'ban',
]);

/**
 * Có cue ngay trước cụm không? Chỉ xét 1 token liền trước — cue xa hơn
 * thường thuộc về danh từ khác ("công an huyện X điều tra vụ Tân Định").
 */
export function hasCue(tokens: Token[], tokenIndex: number): boolean {
  if (tokenIndex === 0) return false;
  return CUE_WORDS.has(tokens[tokenIndex - 1].norm);
}

// Tên tỉnh/thành KHÁC Khánh Hòa — địa danh nằm cùng câu với một trong các tên này
// thì không phải địa bàn của ta.
// Gồm CẢ tên hiện hành (33) LẪN tên cũ đã biến mất sau sáp nhập 01/7/2025 (28),
// vì báo chí và mạng xã hội vẫn dùng tên cũ hàng ngày.
// ⚠️ Ninh Thuận CỐ Ý không có trong danh sách: đã là một phần của Khánh Hòa mới.
const OTHER_PROVINCES = [
  // 33 tỉnh/thành hiện hành (34 trừ Khánh Hòa)
  'ha noi', 'hue', 'hai phong', 'da nang', 'ho chi minh', 'can tho',
  'lai chau', 'dien bien', 'son la', 'lang son', 'quang ninh', 'thanh hoa',
  'nghe an', 'ha tinh', 'tuyen quang', 'lao cai', 'thai nguyen', 'phu tho',
  'bac ninh', 'hung yen', 'ninh binh', 'quang tri', 'quang ngai', 'gia lai',
  'lam dong', 'dak lak', 'dong nai', 'tay ninh', 'vinh long', 'dong thap',
  'an giang', 'ca mau', 'cao bang',
  // 28 tên tỉnh cũ đã biến mất khỏi cấp tỉnh (29 trừ Ninh Thuận)
  'ha giang', 'yen bai', 'bac kan', 'vinh phuc', 'hoa binh', 'bac giang',
  'thai binh', 'hai duong', 'ha nam', 'nam dinh', 'quang binh', 'quang nam',
  'kon tum', 'binh dinh', 'phu yen', 'dak nong', 'binh thuan', 'binh phuoc',
  'ba ria vung tau', 'binh duong', 'long an', 'tien giang', 'ben tre',
  'tra vinh', 'hau giang', 'soc trang', 'bac lieu', 'kien giang',
];

/**
 * Địa danh nằm trong câu có nhắc tỉnh/thành KHÁC thì không phải địa bàn của ta.
 *
 * Thiếu guard này thì mọi tin toàn quốc có tên trùng ("xã Tân Định, Bình Dương")
 * sẽ đổ vào bản đồ Khánh Hòa.
 */
export function inOtherProvinceSentence(text: string, hitStart: number): boolean {
  // Cắt đúng câu chứa hit: lùi/tiến tới dấu kết câu gần nhất
  const before = text.lastIndexOf('.', hitStart);
  const nlBefore = text.lastIndexOf('\n', hitStart);
  const from = Math.max(before, nlBefore) + 1;
  let to = text.length;
  for (const ch of ['.', '\n', '!', '?']) {
    const p = text.indexOf(ch, hitStart);
    if (p !== -1 && p < to) to = p;
  }
  const sentence = normalizeAlias(text.slice(from, to));
  return OTHER_PROVINCES.some((p) => sentence.includes(p));
}

/**
 * Quét text tìm mọi alias khớp, ưu tiên CỤM DÀI NHẤT.
 *
 * Dài nhất trước là bắt buộc: nếu không, "Bắc Nha Trang" sẽ bị nuốt thành
 * "Nha Trang" và mọi phường có hậu tố đều gán sai.
 */
export function findHits(text: string, index: AliasIndex): Hit[] {
  const tokens = tokenizeVi(text);
  const hits: Hit[] = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    // n giảm dần → cụm dài thắng cụm ngắn tại cùng vị trí
    for (let n = Math.min(MAX_NGRAM, tokens.length - i); n >= 1; n--) {
      const key = tokens
        .slice(i, i + n)
        .map((t) => t.norm)
        .join(' ');
      const entries = index.get(key);
      if (entries) {
        // Alias mơ hồ (trùng từ thông thường) chỉ nhận khi có tiền tố báo hiệu
        const needCue = entries.every((e) => e.requiresCue);
        const ok =
          (!needCue || hasCue(tokens, i)) &&
          !inOtherProvinceSentence(text, tokens[i].start);
        if (ok) {
          hits.push({
            aliasNorm: key,
            entries,
            start: tokens[i].start,
            end: tokens[i + n - 1].end,
            tokenIndex: i,
          });
        }
        i += n; // nhảy qua cả cụm đã khớp — không cho khớp lồng nhau, cụm dài nhất thắng
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  return hits;
}
