# CNC Lớp 1 — Category propagation + Indicator extractor — Design

**Ngày:** 2026-07-11
**Sub-project:** L1 của roadmap `2026-07-10-cnc-actor-detection-roadmap.md`
**Trạng thái:** chờ writing-plans
**Nhánh:** `feature/sprint4-osint-facebook`
**Collaboration:** Claude đề xuất + code trực tiếp (memory `feedback-cnc-claude-codes`).

## Mục tiêu

Làm nền "nhận diện & làm giàu từng bài" cho hệ phát hiện chủ thể CNC:
1. **Dẫn `category`** của keyword khớp xuyên pipeline → biết bài thuộc nhóm CNC nào (backbone đa-đơn-vị).
2. **Trích chỉ dấu CNC** (phone/STK/ví/URL/domain/handle) chuẩn hóa → nền vân-tay-actor cho Lớp 2.
3. **Seed keyword** 3 category CNC.

**Ngoài phạm vi:** gộp actor/chấm tái phạm (L2), LLM ngữ nghĩa (L3), route category→đơn vị (khi có đơn vị 2).

## Quyết định thiết kế (đã duyệt)

1. **Chỉ dấu lưu cột mới `indicators` jsonb riêng** (KHÔNG trộn `entities`). Shape mỗi phần tử:
   `{ type, raw, normalized }` — vd `{type:"PHONE", raw:"0912.345.678", normalized:"0912345678"}`.
   Lý do: chỉ dấu chính xác + có cấu trúc + nuôi vân-tay-actor L2, khác NER nhiễu best-effort.
2. **Category lưu cột mới `matched_categories` varchar[]** trên `osint_post_nlp`. `NlpResult` trả thêm
   `categories: string[]`. Một bài khớp nhiều nhóm → mảng. `topicCategory` cũ giữ nguyên (chỉ 1 giá trị, không đủ).
3. **Chỉ dấu KHÔNG bật Gate notability ở L1.** Chỉ làm giàu bài + nuôi L2. Notability giữ nguyên cơ chế
   keyword/engagement đã calibrate (36.7%). Tránh lặp lỗi "tín hiệu yếu tự quyết" đã sửa ở S5a.

## Thành phần

### A. Seed keyword CNC (data)
3 category trong `osint_keywords.category`:
- `lua-dao`: lừa đảo, chiếm đoạt tài sản, giả danh công an/viện kiểm sát, khóa sim, chuyển khoản gấp, việc nhẹ lương cao, sàn đầu tư, app vay...
- `mua-ban-dlcn`: bán data, sỉ data khách hàng, danh sách khách hàng, thông tin CCCD, data F0/vay/bất động sản...
- `kich-dong-xuyen-tac`: (seed cơ bản — nhóm này keyword YẾU, chủ yếu chờ LLM L3) kích động, xuyên tạc, phản động...

Priority theo mức nóng. `scope='global'` (áp mọi platform) trừ khi cần group-specific.

### B. IndicatorExtractorService (NestJS/TS, regex + chuẩn hóa)
File mới `backend/src/modules/osint/services/indicator/indicator-extractor.service.ts`.
Thuần logic (không DB, không HTTP) → dễ test, chạy inline trong worker.

Hàm chính: `extract(text: string): Indicator[]` với `interface Indicator { type: IndicatorType; raw: string; normalized: string }`
và `type IndicatorType = 'PHONE' | 'BANK_ACCOUNT' | 'CRYPTO_WALLET' | 'URL' | 'HANDLE'`.

Từng loại (regex + chuẩn hóa):
- **PHONE** (VN): bắt `0xxxxxxxxx` / `+84xxxxxxxxx` / có `. - space` xen giữa. Chuẩn hóa: bỏ ký tự
  không phải số, `+84`→`0`. Lọc theo **whitelist đầu số mạng VN** (03/05/07/08/09 + đầu số cố định)
  để giảm false-positive (số bất kỳ 10 chữ số).
- **BANK_ACCOUNT**: chuỗi số dài 8–19 chữ số (heuristic STK/thẻ), thường kèm ngữ cảnh; chuẩn hóa = bỏ
  khoảng trắng/`.`/`-`. ⚠️ dễ trùng số khác → chấp nhận recall cao/precision vừa ở L1, L2 lọc thêm bằng lặp lại.
- **CRYPTO_WALLET**: BTC (`^(1|3|bc1)...`), ETH/USDT-ERC20 (`0x` + 40 hex). Chuẩn hóa = lowercase (ETH).
- **URL / domain / app**: regex URL `https?://...` + domain trần `xxx.yyy`. Chuẩn hóa = hạ host về lowercase,
  bỏ `www.`, lấy host. (Không cần lib — dùng `URL` của Node cho URL đầy đủ.)
- **HANDLE**: `@username` (Telegram/MXH), link `t.me/...`, `zalo.me/...`, `fb.me/...`. Chuẩn hóa = lowercase,
  bóc username.

Dedup trong 1 bài theo `(type, normalized)`.

### C. Category propagation (#1)
- `NlpService.analyzeArticle` hiện trả `matchedKeywords: string[]`. Bổ sung: giữ **category** của keyword khớp
  → `NlpResult.categories: string[]` (distinct các category của matched keywords).
  *Lưu ý:* `getKeywords()` đã load cả `category` (entity có sẵn cột) — chỉ cần map, không đổi query.
- Worker ghi `nlp.matchedCategories = nlpResult.categories`.
- Alert: `createAlertFromGate` nhận thêm categories để ghi vào alert (để route đơn vị sau).

### D. Nối worker
Trong `nlp-process.processor` bước 6:
- `const indicators = this.indicatorExtractor.extract(normalizedContent);` (bước sau NLP rẻ)
- `nlp.indicators = indicators;`
- `nlp.matchedCategories = nlpResult.categories;`
- KHÔNG đưa indicators vào `gate.evaluate(...)` (quyết định 3).

### E. Migration (SQL)
Thêm 2 cột `osint.osint_post_nlp`:
- `indicators jsonb NULL`
- `matched_categories varchar(100)[] NULL`
Không sửa cột cũ. Theo tiền lệ migration S5a (file SQL đánh số trong repo).

## Ràng buộc pháp lý
Nội dung `mua-ban-dlcn` chính là PII → chỉ thu ở không gian công khai (Điều 289), xử lý theo NĐ13 mục đích ANTT,
on-prem, **audit** (đã có ở tầng truy vấn). Chỉ dấu (phone/STK) là PII → không đẩy ra ngoài, chỉ lưu on-prem.

## Test
- **IndicatorExtractorService** (jest, thuần logic): mỗi loại — bắt đúng + chuẩn hóa đúng + whitelist đầu số
  loại số rác; dedup; text không có chỉ dấu → `[]`; `+84`→`0`; URL hạ host.
- **NlpService**: matched keywords ở 2 category → `categories` distinct đúng.
- **Worker**: điền `indicators` + `matched_categories`; Gate KHÔNG đổi (notability như cũ với/không có indicators).

## Tồn đọng / phase sau
- L2 tiêu thụ `indicators.normalized` làm vân tay actor.
- BANK_ACCOUNT precision thấp → L2 lọc bằng lặp lại; hoặc thêm validate checksum sau.
- `kich-dong-xuyen-tac` chủ yếu chờ L3 (LLM).
- Route category→đơn vị khi có đơn vị thứ 2.
