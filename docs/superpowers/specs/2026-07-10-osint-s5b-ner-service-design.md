# S5b — NER Service (underthesea) — Design

**Ngày:** 2026-07-10
**Sprint:** 5 (sub-project S5b)
**Trạng thái:** DUYỆT thiết kế — chờ writing-plans
**Nhánh:** `feature/sprint4-osint-facebook`
**Liên quan:** S5a spine (`2026-07-07-osint-s5a-pipeline-spine-design.md`), 2-zone (`2026-06-25-osint-2zone-pipeline-design.md`)

## 1. Mục tiêu & phạm vi

Cắm NLP **thật** (NER) vào khe đã chừa sẵn trong pipeline S5a, điền cột
`osint_post_nlp.entities` (đang null) để nuôi entity-resolution Zone B (khớp hồ sơ
đối tượng / graph liên kết) về sau.

**Trong phạm vi đợt này:**
- Service Python mới `services/nlp-analyzer/` (FastAPI) chạy underthesea NER, CPU-only.
- Bridge NestJS gọi HTTP sang service, điền `nlp.entities`.
- Suy biến an toàn khi service chết (một bài thiếu entities không làm chết pipeline).

**NGOÀI phạm vi (hoãn — có lý do):**
- **Sentiment** (`sentiment_score`) → **S5b-2**. Phần cứng M4 Pro dev chạy PhoBERT được,
  nhưng hoãn vì: (a) model sentiment VN có sẵn lệch domain (train review sản phẩm/ngân
  hàng, không phải văn ANTT) cần đánh giá trước khi tin; (b) là tín hiệu yếu, chưa có
  `verdict` để học trọng số → giá trị biên cho Gate thấp. Gộp chung đợt cấp GPU với S5c.
- **Topic classification** (`topic_category`) → YAGNI. Không có model VN khớp taxonomy ANTT.
- **NER không đụng Gate.** Entities chỉ điền cột; không phải tín hiệu notability. Giữ nguyên
  calibrate hiện tại (36.7% notable, 100% do hot_keyword). `sentimentScore` vẫn truyền `null`
  vào Gate như cũ.

## 2. Kiến trúc

```
NestJS worker (nlp-process.processor)          services/nlp-analyzer (Python)
  step 3: sau nlpService.analyzeArticle   ──►   FastAPI :8001
    nerBridge.analyze(normalizedContent)  POST   POST /ner  { text }
                                          ◄──    { entities: [ {text,type} ] }
    nlp.entities = result ?? null                underthesea.ner()  (CPU)
                                                  GET /health
```

- **Service mới** `services/nlp-analyzer/` — FastAPI, port **8001** (news-extractor giữ 8000),
  venv + `requirements.txt` riêng (chỉ fastapi, uvicorn, underthesea). Cô lập deps khỏi
  trafilatura. Soi gương cấu trúc `services/news-extractor/` (có `/health`, `main.py`,
  chạy `uvicorn main:app --port 8001`).
- **Bridge mới** `NlpAnalyzerBridgeService` trong module osint (axios), đọc env
  `NLP_ANALYZER_URL` (default `http://localhost:8001`). Sao pattern
  `news-extractor-bridge.service.ts`. Đăng ký provider trong `osint.module.ts`.

## 3. Hợp đồng API

**`POST /ner`**

Request:
```json
{ "text": "..." }
```

Response 200:
```json
{ "entities": [
    { "text": "Nguyễn Văn A", "type": "PER" },
    { "text": "Công an Khánh Hòa", "type": "ORG" },
    { "text": "Nha Trang", "type": "LOC" }
] }
```

- underthesea `ner()` trả tag B-/I- theo token (PER/ORG/LOC/MISC). Python **gộp token
  liền kề cùng loại** (B- mở cụm, I- nối tiếp) thành cụm entity hoàn chỉnh.
- **Bỏ MISC** — nhiễu nhất, ít giá trị Zone B (Zone B cần người/tổ chức/địa danh để khớp
  hồ sơ). Chỉ giữ **PER / ORG / LOC**. Muốn thêm lại MISC sau = bỏ một dòng filter.
- Text rỗng / không có entity → `{ "entities": [] }`.

**`GET /health`** → `{ "status": "ok" }` (NestJS/Docker ping).

Lỗi: text sai kiểu → 422 (Pydantic tự validate). Lỗi bất ngờ → 500 `{detail}`.

## 4. Shape cột `entities`

`osint_post_nlp.entities` (jsonb, đã tồn tại) lưu **nguyên mảng** response:
```json
[ { "text": "...", "type": "PER" }, ... ]
```
Shape phẳng `{text, type}` để Zone B dễ duyệt + khớp hồ sơ. Không cần migration
(cột đã có sẵn từ schema S5a).

## 5. Nối vào worker & kỷ luật Gate

- Trong `nlp-process.processor.ts`, **sau** `nlpService.analyzeArticle` (hiện dòng ~78),
  thêm gọi `nerBridge.analyze(normalizedContent)`.
- Gán `nlp.entities = nerResult ?? null` ở bước ghi `osint_post_nlp` (bước 6).
- **NER KHÔNG thay đổi input Gate.** `gate.evaluate(...)` giữ nguyên `sentimentScore: null`.
  Entities không đưa vào `signalFeatures`, không ảnh hưởng notability. → calibrate không đổi.

## 6. Suy biến & lỗi (graceful degradation)

- Bridge timeout **5s** (NER nhanh; quá 5s coi như service kẹt).
- Service chết / timeout / non-2xx → bridge trả `null` → `nlp.entities = null`, worker
  **vẫn chạy tiếp** các bước còn lại, `processingStatus='done'`. Một bài thiếu entities
  KHÔNG được làm chết worker (đúng như news-extractor bridge trả null).
- Log cảnh báo khi gọi thất bại (phân biệt non-2xx vs không kết nối được), giống bridge cũ.

## 7. Lưu ý production (DMZ / air-gapped)

- underthesea **tải model NER lần đầu qua internet**. Trên DMZ air-gapped phải
  **pre-download model vào image/máy** khi build. → hạng mục deploy, không cản dev.
- Máy production nhiều khả năng x86 (không Apple Silicon). underthesea NER là CPU-only
  nên chạy được; chỉ cần xác nhận cấu hình server khi lên production.

## 8. Test

**Python (pytest):**
- `/ner` gộp token B-/I- cùng loại thành 1 cụm.
- Bỏ MISC, giữ PER/ORG/LOC.
- text rỗng → `entities: []`.
- `/health` → 200.

**NestJS (jest):**
- `NlpAnalyzerBridgeService`: mock axios — 2xx → trả mảng entities; non-2xx / lỗi mạng → `null`.
- Worker: NER trả `null` → `nlp.entities` null, `processingStatus='done'`, không throw.

## 9. Mô hình cộng tác

- **Service Python + bridge NestJS** = scaffold/boilerplate lặp pattern → Claude code luôn.
- **Sửa worker** (nối bridge vào processor) = logic nghiệp vụ lõi → Claude **hướng dẫn,
  user code, Claude review** (mặc định CLAUDE.md).

## 10. Tồn đọng / phase sau

- **S5b-2 Sentiment**: PhoBERT fine-tuned → `sentiment_score` + bật tín hiệu Gate (chỉ điều
  biến severity, log `signal_features`, chưa tự bật notable), gộp đợt GPU với S5c.
- Pre-download model underthesea cho DMZ.
- Chất lượng NER trên văn FB nhiễu/lóng — đánh giá thực tế, cân nhắc hậu xử lý/từ điển địa danh Khánh Hòa nếu cần.
