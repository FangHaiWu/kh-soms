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

// Tiền tố báo hiệu phía sau là địa danh — cue đơn-từ.
// CỐ Ý KHÔNG có 'tran' (đụng họ "Trần" — họ phổ biến nhất VN, "Trần Bảo An"
// sẽ khớp nhầm ward "Bảo An"), KHÔNG có 'khu' đơn lẻ (đụng "khu vực", "khu
// phố" — quá nhiễu), và KHÔNG có 'ban' đơn lẻ (đụng "bạn"/"bán" sau khi bỏ
// dấu — "đi cùng bạn Bảo An" sẽ khớp nhầm ward "Bảo An"). Ba trường hợp
// "thị trấn"/"đặc khu"/"địa bàn" xử lý riêng bằng bigram bên dưới, vì cụm 2
// token ghép lại mới đủ đặc trưng để không đụng từ thông thường.
const CUE_WORDS = new Set(['xa', 'phuong', 'thon', 'tai', 'o', 'thuoc']);

// Cue 2 token — cụm này ghép lại mới mang nghĩa tiền tố địa danh, tách rời
// từng từ ("thi", "tran", "dia", "ban") không phải cue vì tự nó không báo
// hiệu gì (hoặc còn gây hại như 'ban' đứng một mình).
const CUE_BIGRAMS = new Set(['thi tran', 'dac khu', 'dia ban']);

/**
 * Có cue ngay trước cụm không? Xét 1 token liền trước (cue đơn) và 2 token
 * liền trước (cue ghép "thị trấn"/"đặc khu"/"địa bàn") — cue xa hơn thường thuộc về
 * danh từ khác ("công an huyện X điều tra vụ Tân Định").
 */
export function hasCue(tokens: Token[], tokenIndex: number): boolean {
  if (tokenIndex === 0) return false;
  if (CUE_WORDS.has(tokens[tokenIndex - 1].norm)) return true;
  // Dò thêm bigram khi có đủ 2 token phía trước
  if (tokenIndex >= 2) {
    const bigram = `${tokens[tokenIndex - 2].norm} ${tokens[tokenIndex - 1].norm}`;
    if (CUE_BIGRAMS.has(bigram)) return true;
  }
  return false;
}

// Tên tỉnh/thành KHÁC Khánh Hòa — địa danh nằm cùng câu với một trong các tên này
// thì không phải địa bàn của ta.
// Gồm CẢ tên hiện hành (33) LẪN tên cũ đã biến mất sau sáp nhập 01/7/2025 (28),
// vì báo chí và mạng xã hội vẫn dùng tên cũ hàng ngày.
// ⚠️ Ninh Thuận CỐ Ý không có trong danh sách: đã là một phần của Khánh Hòa mới.
const OTHER_PROVINCES = [
  // 33 tỉnh/thành hiện hành (34 trừ Khánh Hòa)
  'ha noi',
  'hue',
  'hai phong',
  'da nang',
  'ho chi minh',
  // Cách gọi phổ biến khác của TP.HCM ngoài tên hành chính — "Tân Định" là
  // tên phường/chợ nổi tiếng nhất Sài Gòn, chắc chắn xuất hiện dày trong tin.
  'sai gon',
  'tp hcm',
  'tphcm',
  'can tho',
  'lai chau',
  'dien bien',
  'son la',
  'lang son',
  'quang ninh',
  'thanh hoa',
  'nghe an',
  'ha tinh',
  'tuyen quang',
  'lao cai',
  'thai nguyen',
  'phu tho',
  'bac ninh',
  'hung yen',
  'ninh binh',
  'quang tri',
  'quang ngai',
  'gia lai',
  'lam dong',
  'dak lak',
  'dong nai',
  'tay ninh',
  'vinh long',
  'dong thap',
  'an giang',
  'ca mau',
  'cao bang',
  // 28 tên tỉnh cũ đã biến mất khỏi cấp tỉnh (29 trừ Ninh Thuận)
  'ha giang',
  'yen bai',
  'bac kan',
  'vinh phuc',
  'hoa binh',
  'bac giang',
  'thai binh',
  'hai duong',
  'ha nam',
  'nam dinh',
  'quang binh',
  'quang nam',
  'kon tum',
  'binh dinh',
  'phu yen',
  'dak nong',
  'binh thuan',
  'binh phuoc',
  'ba ria vung tau',
  'binh duong',
  'long an',
  'tien giang',
  'ben tre',
  'tra vinh',
  'hau giang',
  'soc trang',
  'bac lieu',
  'kien giang',
];

/**
 * Địa danh nằm trong câu có nhắc tỉnh/thành KHÁC thì không phải địa bàn của ta.
 *
 * Thiếu guard này thì mọi tin toàn quốc có tên trùng ("xã Tân Định, Bình Dương")
 * sẽ đổ vào bản đồ Khánh Hòa.
 */
// '.' chỉ tính là dấu KẾT CÂU khi theo sau là khoảng trắng hoặc hết chuỗi.
// Dấu chấm viết tắt kiểu "TP.HCM" đứng dính liền chữ ("P" rồi ".HCM" không
// có khoảng trắng) — nếu coi là kết câu thì "HCM" bị cắt rời khỏi câu, guard
// mất luôn tín hiệu "TP.HCM" dù đã có trong OTHER_PROVINCES.
function isSentenceEnd(text: string, pos: number): boolean {
  const ch = text[pos];
  if (ch === '\n' || ch === '!' || ch === '?') return true;
  if (ch !== '.') return false;
  const next = text[pos + 1];
  return next === undefined || /\s/.test(next);
}

export function inOtherProvinceSentence(
  text: string,
  hitStart: number,
): boolean {
  // Cắt đúng câu chứa hit: lùi/tiến tới dấu kết câu gần nhất, đối xứng cả 2
  // phía, và bỏ qua dấu chấm viết tắt (xem isSentenceEnd).
  let from = 0;
  for (let p = hitStart - 1; p >= 0; p--) {
    if (isSentenceEnd(text, p)) {
      from = p + 1;
      break;
    }
  }
  let to = text.length;
  for (let p = hitStart; p < text.length; p++) {
    if (isSentenceEnd(text, p)) {
      to = p;
      break;
    }
  }
  const sentence = normalizeAlias(text.slice(from, to));
  // So khớp theo RANH GIỚI TỪ, không phải substring trần: 'hue' là substring
  // của 'thue' (bỏ dấu của "thuê") nên "thuê phòng trọ" sẽ bị tưởng nhầm là
  // Huế nếu dùng includes() thường. Câu đã chuẩn hóa chỉ còn khoảng trắng
  // đơn nên chèn đệm 2 đầu rồi so cụm có khoảng trắng bao quanh là đủ chặn
  // mọi va chạm substring, không riêng 'hue'.
  const padded = ` ${sentence} `;
  return OTHER_PROVINCES.some((p) => padded.includes(` ${p} `));
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

export type LocationRole = 'P1' | 'P2' | 'P3' | 'P4';

export interface LocationCandidate {
  alias: string;
  wardId: string;
  role: LocationRole;
  offset: number;
}

export interface WardMatchResult {
  wardId: string | null;
  locationText: string | null;
  matchedAlias: string | null;
  candidates: LocationCandidate[];
  reason: 'matched' | 'ambiguous' | 'none';
}

// Cụm báo hiệu vai trò, dò trong cửa sổ 4 token TRƯỚC cụm địa danh.
const P1_PATTERNS = ['xay ra tai', 'xay ra o', 'tren dia ban', 'thuoc dia ban'];
// CỐ Ý KHÔNG có 'tram' đơn lẻ (bỏ dấu từ "trạm" NHƯNG cũng trùng tên riêng
// "Trâm" — tên nữ rất phổ biến): "Nguyễn Văn Trâm tại xã Suối Hiệp" sẽ bị
// đọc nhầm "Trâm" thành cue "trạm" và gán sai P3, hòa với P3 thật của ward
// khác rồi chọn nhầm theo "xuất hiện sớm nhất". Cùng lớp lỗi với 'tran' đã bỏ
// khỏi CUE_WORDS phía trên.
// 'uy ban' đơn lẻ CỐ Ý viết đủ thành 'uy ban nhan dan': "Đại úy Bân" bỏ dấu
// cũng ra "uy ban" — cùng lớp lỗi với 'tram'/"Trâm" ở trên. Viết tắt "UBND"
// đã có pattern 'ubnd' lo riêng nên không mất recall.
const P3_PATTERNS = [
  'cong an',
  'ubnd',
  'uy ban nhan dan',
  'don bien phong',
  'ban chqs',
  'vks',
  'toa an',
];
// 'ngu tai' CỐ Ý GIỮ dù "ngủ tại" (chỗ ngủ tạm) cũng bỏ dấu trùng "ngụ tại"
// (nơi cư trú, cách viết rất phổ biến trong hồ sơ công an). Xét hướng hỏng:
// bỏ pattern → "ngụ tại X" tụt xuống P2 → X bị gán NHẦM thành nơi xảy ra vụ
// việc, sai một cách hệ thống trên rất nhiều bài. Giữ pattern → "ngủ tại X"
// bị loại khỏi ứng viên → chỉ BỎ SÓT một bài hiếm gặp. Gán sai tệ hơn bỏ sót
// (nguyên tắc dự án) → giữ nguyên, không "tối ưu" đi.
const P4_PATTERNS = ['tru tai', 'ngu tai', 'thuong tru', 'que o', 'que quan'];

/**
 * Xác định vai trò của địa danh trong câu.
 *
 * Đây là phần thay cho "đếm tần suất": "Công an xã A bắt ... tại xã B" thì
 * đếm tần suất hòa 1-1 rồi lấy A (sai), còn xét vai trò thì P2 thắng P3 → B (đúng).
 */
export function classifyRole(
  tokens: Token[],
  tokenIndex: number,
): LocationRole {
  const from = Math.max(0, tokenIndex - 4);
  const window = tokens
    .slice(from, tokenIndex)
    .map((t) => t.norm)
    .join(' ');

  // Thứ tự kiểm quan trọng: P4 (nơi cư trú) phải chặn trước P2, vì "trú tại X"
  // cũng chứa "tại" và sẽ bị nhận nhầm thành vị trí nơi xảy ra.
  if (P4_PATTERNS.some((p) => window.includes(p))) return 'P4';
  if (P1_PATTERNS.some((p) => window.includes(p))) return 'P1';
  if (P3_PATTERNS.some((p) => window.includes(p))) return 'P3';
  return 'P2'; // giới từ trần "tại/ở", hoặc nhắc trần không cue
}

const ROLE_RANK: Record<LocationRole, number> = { P1: 3, P2: 2, P3: 1, P4: 0 };

/**
 * Khớp text → 1 ward.
 *
 * Flow: findHits → gắn vai trò (1 lần/hit) → loại P4 → tìm hạng cao nhất
 * trong số còn lại → NẾU hạng cao nhất có hit mơ hồ thì báo "không biết"
 * ngay (không tụt xuống hạng thấp hơn dù nó rõ ràng) → còn lại đều rõ ràng
 * thì phá hòa: nhắc nhiều lần nhất → xuất hiện sớm nhất.
 *
 * Vì sao mơ hồ ở hạng cao nhất KHÔNG được phép tụt xuống chọn hạng thấp hơn:
 * "xảy ra tại Ninh Hải (mơ hồ, P1), sau đó đưa về trụ sở ở xã Suối Hiệp (P2)"
 * — nếu bỏ qua "Ninh Hải" vì mơ hồ rồi chọn "Suối Hiệp" vì nó rõ, hệ thống sẽ
 * gán CHẮC NỊCH vào nơi KHÔNG xảy ra vụ việc. Gán sai tệ hơn không gán.
 */
export function matchWard(text: string, index: AliasIndex): WardMatchResult {
  const tokens = tokenizeVi(text);
  const hits = findHits(text, index);
  const empty: WardMatchResult = {
    wardId: null,
    locationText: null,
    matchedAlias: null,
    candidates: [],
    reason: 'none',
  };
  if (hits.length === 0) return empty;

  // Tính role MỘT LẦN cho mỗi hit — dùng chung cho candidates lẫn phân giải,
  // tránh gọi classifyRole lặp lại nhiều lần cho cùng một hit.
  const roles = hits.map((h) => classifyRole(tokens, h.tokenIndex));

  // candidates giữ MỌI địa danh bắt được kèm vai trò, kể cả cái bị loại bên
  // dưới — để sau này đổi luật chọn mà không phải quét lại toàn bộ dữ liệu.
  const candidates: LocationCandidate[] = [];
  hits.forEach((h, i) => {
    for (const e of h.entries) {
      candidates.push({
        alias: e.alias,
        wardId: e.wardId,
        role: roles[i],
        offset: h.start,
      });
    }
  });

  // Loại toàn bộ P4 (nơi cư trú) TRƯỚC KHI xét gì khác — kể cả hit mơ hồ
  // mang role P4 cũng bị loại thẳng, không được coi là "ambiguous": nơi cư
  // trú không phải ứng viên nơi xảy ra, mơ hồ hay không cũng vô nghĩa.
  const remaining = hits
    .map((h, i) => ({ h, role: roles[i] }))
    .filter((x) => x.role !== 'P4');
  if (remaining.length === 0) return { ...empty, candidates };

  // Hạng vai trò cao nhất còn lại quyết định "tầng" phân giải — chỉ xét
  // trong tầng này, không để tầng thấp hơn (dù rõ ràng) chen vào.
  const topRank = Math.max(...remaining.map((x) => ROLE_RANK[x.role]));
  const topGroup = remaining.filter((x) => ROLE_RANK[x.role] === topRank);

  // Tín hiệu MẠNH NHẤT mà không phân giải được (alias trỏ ≥2 ward) thì phải
  // báo "không biết" ngay, không được tụt xuống chọn tín hiệu yếu hơn dù nó
  // rõ ràng hơn. alias_type KHÔNG được dùng để phá thế mơ hồ này: "Ninh Hải"
  // là xã mới ở Ninh Thuận VÀ phường cũ của Ninh Hòa, cách nhau >100km.
  const ambiguous = topGroup.find((x) => x.h.entries.length > 1);
  if (ambiguous) {
    return {
      wardId: null,
      locationText: text.slice(ambiguous.h.start, ambiguous.h.end),
      matchedAlias: ambiguous.h.entries[0].alias,
      candidates,
      reason: 'ambiguous',
    };
  }

  // Cả nhóm hạng cao nhất đều rõ ràng (entries.length === 1) → phá hòa: nhắc
  // nhiều lần nhất → xuất hiện sớm nhất. topGroup giữ đúng thứ tự xuất hiện
  // trong text (findHits quét trái→phải) nên "first" chính là hit đầu tiên
  // gặp cho mỗi ward, không cần so sánh lại offset.
  const byWard = new Map<string, { count: number; first: Hit }>();
  for (const x of topGroup) {
    const wardId = x.h.entries[0].wardId;
    const cur = byWard.get(wardId);
    if (!cur) byWard.set(wardId, { count: 1, first: x.h });
    else cur.count++;
  }

  const [wardId, best] = [...byWard.entries()].sort(
    (a, b) =>
      b[1].count - a[1].count || // nhắc nhiều lần nhất
      a[1].first.start - b[1].first.start, // xuất hiện sớm nhất
  )[0];

  return {
    wardId,
    locationText: text.slice(best.first.start, best.first.end),
    matchedAlias: best.first.entries[0].alias,
    candidates,
    reason: 'matched',
  };
}
