# S5b — NER Service (underthesea) Implementation Plan

> **Mô hình cộng tác (CLAUDE.md §9):** KHÔNG phải agentic-worker/subagent. Claude
> **hướng dẫn → user tự code → Claude review** cho MỌI task. Plan này cố ý cho
> **skeleton + test + cạm bẫy**, KHÔNG dán code hoàn chỉnh để copy-paste. Checkbox
> `- [ ]` để bám tiến độ.

**Goal:** Cắm NER thật (underthesea) vào pipeline S5a, điền `osint_post_nlp.entities`
(PER/ORG/LOC) qua một service Python mới, suy biến an toàn khi service chết.

**Architecture:** Service FastAPI mới `services/nlp-analyzer/` (:8001, CPU-only) chạy
underthesea NER → NestJS gọi qua `NlpAnalyzerBridgeService` (axios) trong worker
`nlp-process.processor`. NER KHÔNG đụng Gate; chỉ điền cột nuôi Zone B.

**Tech Stack:** Python 3 + FastAPI + uvicorn + underthesea; NestJS + axios + TypeORM + jest; pytest.

**Spec:** `docs/superpowers/specs/2026-07-10-osint-s5b-ner-service-design.md`

## Global Constraints

- **NER không thay đổi input Gate.** `gate.evaluate(...)` giữ nguyên `sentimentScore: null`.
  Entities KHÔNG vào `signalFeatures`, KHÔNG ảnh hưởng notability.
- **Suy biến null-safe.** Service chết/timeout/non-2xx → bridge trả `null` → `entities=null`,
  worker vẫn `processingStatus='done'`, không throw. Một bài thiếu entities không làm chết worker.
- **Chỉ giữ PER / ORG / LOC**, bỏ MISC.
- **Port 8001** cho nlp-analyzer (news-extractor giữ 8000). Bridge đọc env `NLP_ANALYZER_URL`,
  default `http://localhost:8001`. Timeout **5s**.
- Comment tiếng Việt cho logic nghiệp vụ, tiếng Anh cho technical detail (CLAUDE.md).

## File Structure

- Create: `services/nlp-analyzer/main.py` — FastAPI `/health` + `/ner`, gộp token B-/I-, filter MISC.
- Create: `services/nlp-analyzer/requirements.txt` — fastapi, uvicorn, underthesea.
- Create: `services/nlp-analyzer/test_main.py` — pytest cho `/ner` + `/health`.
- Create: `backend/src/modules/osint/services/nlp-analyzer/nlp-analyzer-bridge.service.ts`
- Create: `backend/.../nlp-analyzer/nlp-analyzer-bridge.service.spec.ts`
- Modify: `backend/src/modules/osint/osint.module.ts` — import + đăng ký provider.
- Modify: `backend/.../nlp-process/nlp-process.processor.ts` — inject bridge + gọi NER + gán entities.
- Modify: `backend/.../nlp-process/nlp-process.processor.spec.ts` — thêm arg bridge vào constructor.

---

## Task 1: Service Python NER (`services/nlp-analyzer`)

**Files:**
- Create: `services/nlp-analyzer/main.py`
- Create: `services/nlp-analyzer/requirements.txt`
- Create: `services/nlp-analyzer/test_main.py`

**Interfaces:**
- Produces: `POST /ner {text:str} → {entities: [{text:str, type:"PER"|"ORG"|"LOC"}]}`;
  `GET /health → {status:"ok"}`. Đây là hợp đồng bridge NestJS (Task 2) sẽ gọi.

**Bối cảnh underthesea:** `underthesea.ner(text)` trả **list tuple**
`(word, pos_tag, chunk_tag, ner_tag)`. Phần tử thứ 4 (`ner_tag`) dạng IOB:
`B-PER`/`I-PER`/`B-ORG`/`I-ORG`/`B-LOC`/`I-LOC`/`B-MISC`/`I-MISC`/`O`.
- `B-` = mở đầu một cụm entity mới; `I-` = token nối tiếp cùng cụm; `O` = ngoài entity.
- Ví dụ "Nguyễn Văn A ở Nha Trang" → `Nguyễn:B-PER, Văn:I-PER, A:I-PER, ở:O, Nha:B-LOC, Trang:I-LOC`
  → phải gộp thành `{text:"Nguyễn Văn A",type:"PER"}`, `{text:"Nha Trang",type:"LOC"}`.

**Cạm bẫy:**
- underthesea **tải model lần đầu qua internet** — chạy test đầu tiên sẽ lâu (đang tải).
- Đừng nối token bằng `''` — tiếng Việt tách theo khoảng trắng, nối bằng `' '`.
- `I-` mà không có `B-` trước (model lỗi) → coi như mở cụm mới, đừng để crash.
- Text rỗng/None → trả `{entities: []}`, đừng gọi `ner()` với None.

- [ ] **Step 1: Viết test thất bại** (`test_main.py`)

Dùng `fastapi.testclient.TestClient`. Mock `underthesea.ner` để test **không phụ thuộc
model thật** (nhanh + tất định). Viết các test sau (đây là hợp đồng hành vi — bạn tự code body):

```python
# test_main.py — skeleton, bạn điền theo mô tả
from fastapi.testclient import TestClient
from unittest.mock import patch
# import app từ main

# 1. test_health: GET /health → 200, {"status":"ok"}

# 2. test_ner_gop_cum: mock underthesea.ner trả
#    [("Nguyễn","Np","B-NP","B-PER"),("Văn","Np","I-NP","I-PER"),("A","Np","I-NP","I-PER"),
#     ("ở","E","O","O"),("Nha","Np","B-NP","B-LOC"),("Trang","Np","I-NP","I-LOC")]
#    POST /ner {"text":"..."} → entities == [{"text":"Nguyễn Văn A","type":"PER"},
#                                             {"text":"Nha Trang","type":"LOC"}]

# 3. test_bo_misc: mock trả 1 cụm B-MISC/I-MISC + 1 cụm B-ORG
#    → response CHỈ có ORG, không có MISC

# 4. test_text_rong: POST /ner {"text":""} → {"entities":[]} (không gọi ner())
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

```bash
cd services/nlp-analyzer && python3 -m venv .venv && . .venv/bin/activate \
  && pip install -r requirements.txt && pytest test_main.py -v
```
Kỳ vọng: FAIL (chưa có `main.py`/`app`). *(requirements phải có `pytest`, `httpx` cho TestClient.)*

- [ ] **Step 3: Viết `requirements.txt`**

Gồm: `fastapi`, `uvicorn`, `underthesea`, `pytest`, `httpx`. Ghim version như news-extractor style (pip freeze sau khi cài).

- [ ] **Step 4: Viết `main.py`** (skeleton — bạn điền logic)

```python
# main.py — skeleton
# from fastapi import FastAPI; from pydantic import BaseModel; from underthesea import ner
# app = FastAPI(title="NLP Analyzer Service", version="1.0.0")
# class NerRequest(BaseModel): text: str

# GET /health → {"status":"ok"}

# POST /ner:
#   - nếu text rỗng/trắng → return {"entities": []}
#   - tags = ner(req.text)                     # list tuple 4 phần tử
#   - gộp: duyệt tags, tách ner_tag = tag[3]:
#       * "O" hoặc MISC → đóng cụm đang mở (nếu có)
#       * "B-XXX" (XXX in PER/ORG/LOC) → đóng cụm cũ, mở cụm mới {tokens:[word], type:XXX}
#       * "I-XXX" cùng type cụm đang mở → append word
#       * I-XXX lạc (không có cụm) → coi như B-XXX (mở cụm mới) — không crash
#   - cụm hoàn chỉnh → {"text": " ".join(tokens), "type": type}
#   - return {"entities": [...]}
```
**Gợi ý tách hàm:** viết `_merge_entities(tags) -> list[dict]` thuần (không FastAPI) để dễ test đơn vị + đọc rõ. Endpoint chỉ validate + gọi nó.

- [ ] **Step 5: Chạy test — xác nhận PASS**

```bash
cd services/nlp-analyzer && . .venv/bin/activate && pytest test_main.py -v
```
Kỳ vọng: 4 PASS.

- [ ] **Step 6: Smoke thủ công với model thật** (một lần, xác nhận underthesea chạy)

```bash
. .venv/bin/activate && uvicorn main:app --port 8001 &
curl -s localhost:8001/health
curl -s -X POST localhost:8001/ner -H 'Content-Type: application/json' \
  -d '{"text":"Công an Khánh Hòa bắt đối tượng Nguyễn Văn A tại Nha Trang"}'
```
Kỳ vọng: thấy ORG/PER/LOC hợp lý. (Lần chạy đầu chờ tải model.) Rồi `kill %1`.

- [ ] **Step 7: Commit**

```bash
git add services/nlp-analyzer/main.py services/nlp-analyzer/requirements.txt services/nlp-analyzer/test_main.py
git commit -m "feat(osint): S5b service Python NER underthesea — /ner gộp cụm PER/ORG/LOC, bỏ MISC"
```
*(Kiểm tra `.gitignore` đã loại `services/*/.venv` — services/news-extractor đã có tiền lệ.)*

---

## Task 2: Bridge NestJS `NlpAnalyzerBridgeService`

**Files:**
- Create: `backend/src/modules/osint/services/nlp-analyzer/nlp-analyzer-bridge.service.ts`
- Create: `backend/src/modules/osint/services/nlp-analyzer/nlp-analyzer-bridge.service.spec.ts`
- Modify: `backend/src/modules/osint/osint.module.ts`

**Interfaces:**
- Consumes: `POST /ner` từ Task 1.
- Produces: `interface NerEntity { text: string; type: 'PER'|'ORG'|'LOC' }` và
  `NlpAnalyzerBridgeService.analyze(text: string): Promise<NerEntity[] | null>`
  (null khi lỗi/service chết). Worker Task 3 gọi hàm này.

**Mẫu tham chiếu:** sao gần như nguyên `news-extractor-bridge.service.ts` — cùng cách
xử lý axios error (phân biệt `error.response` non-2xx vs không kết nối được), cùng cách
đọc env + default.

**Cạm bẫy:**
- Timeout **5s** (NER nhanh; news-extractor để 20s vì tải trang — NER khác, để 5s).
- Trả `null` MỌI nhánh lỗi — không throw. Worker dựa vào đó để suy biến.
- Response service là `{entities: [...]}` → trả `res.data.entities`, KHÔNG phải `res.data`.

- [ ] **Step 1: Viết test thất bại** (`.spec.ts`)

Mock `axios` (jest). Test hành vi:

```typescript
// nlp-analyzer-bridge.service.spec.ts — skeleton
import { jest } from '@jest/globals';
jest.mock('axios');
// import axios from 'axios'; import { NlpAnalyzerBridgeService } from './...';

// 1. 'trả mảng entities khi 2xx':
//    axios.post mock resolve { data: { entities: [{text:'A',type:'PER'}] } }
//    → analyze('x') resolves [{text:'A',type:'PER'}]

// 2. 'trả null khi non-2xx (response lỗi)':
//    axios.post reject { isAxiosError:true, response:{status:422,data:{detail:'x'}} }
//    → analyze('x') resolves null   (dùng jest.spyOn(axios,'isAxiosError'))

// 3. 'trả null khi không kết nối được':
//    axios.post reject { isAxiosError:true, message:'ECONNREFUSED' } (no response)
//    → analyze('x') resolves null
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

```bash
cd backend && npx jest nlp-analyzer-bridge --silent
```
Kỳ vọng: FAIL (chưa có service).

- [ ] **Step 3: Viết `nlp-analyzer-bridge.service.ts`** (skeleton)

```typescript
// export interface NerEntity { text: string; type: 'PER' | 'ORG' | 'LOC' }
// @Injectable() NlpAnalyzerBridgeService:
//   private url = process.env.NLP_ANALYZER_URL ?? 'http://localhost:8001'
//   async analyze(text): Promise<NerEntity[] | null>
//     try: res = await axios.post(`${url}/ner`, { text }, { timeout: 5000 })
//          return res.data.entities as NerEntity[]
//     catch: (sao xử lý error của news-extractor-bridge) → logger.warn/error → return null
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

```bash
cd backend && npx jest nlp-analyzer-bridge --silent
```
Kỳ vọng: 3 PASS.

- [ ] **Step 5: Đăng ký provider trong `osint.module.ts`**

Thêm `import { NlpAnalyzerBridgeService } from './services/nlp-analyzer/nlp-analyzer-bridge.service';`
và thêm vào mảng `providers:` (cạnh `NewsExtractorBridgeService`, dòng ~82). Không cần export
trừ khi module khác dùng.

- [ ] **Step 6: Build xác nhận không vỡ DI**

```bash
cd backend && npx tsc --noEmit
```
Kỳ vọng: sạch.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/osint/services/nlp-analyzer/ backend/src/modules/osint/osint.module.ts
git commit -m "feat(osint): S5b bridge NlpAnalyzerBridgeService — gọi /ner, null-safe, đăng ký provider"
```

---

## Task 3: Nối NER vào worker `nlp-process.processor`

**Files:**
- Modify: `backend/src/modules/osint/services/nlp-process/nlp-process.processor.ts`
- Modify: `backend/src/modules/osint/services/nlp-process/nlp-process.processor.spec.ts`

**Interfaces:**
- Consumes: `NlpAnalyzerBridgeService.analyze(text): Promise<NerEntity[]|null>` (Task 2).
- Produces: `nlp.entities` được điền (mảng `NerEntity` hoặc null) khi worker chạy.

**Cạm bẫy quan trọng:**
- Constructor hiện có **10 tham số positional**. Thêm bridge = **tham số thứ 11**. `.spec.ts`
  dựng processor bằng `new NlpProcessProcessor(...)` với 10 arg positional (dòng ~47-58) →
  **BẮT BUỘC thêm arg thứ 11 vào spec**, nếu không test cũ vỡ. Đặt bridge **cuối danh sách**
  để không lệch các arg cũ.
- NER chạy trên `normalizedContent` (nội dung sạch), **sau** `nlpService.analyzeArticle` (dòng ~78).
- Gán `nlp.entities` ở **bước 6** (khối ghi osint_post_nlp, quanh dòng ~114-124), cạnh các `nlp.*` khác.
- **Không** đưa entities vào `gate.evaluate(...)` — Gate không đổi (Global Constraint).
- Gọi NER **trong** `try` — nếu bridge tự nuốt lỗi trả null thì ổn; nhưng đặt trong try để chắc chắn
  một sự cố bất ngờ không thoát ra ngoài catch của worker.

- [ ] **Step 1: Sửa spec — thêm mock bridge + assert entities**

Trong `.spec.ts`:
1. Thêm mock: `const analyze = jest.fn<() => Promise<any>>().mockResolvedValue([{ text: 'Nha Trang', type: 'LOC' }]);`
2. Thêm `{ analyze } as any` làm **arg thứ 11** trong `new NlpProcessProcessor(...)`.
3. Thêm test mới:

```typescript
it('điền entities từ NER bridge vào osint_post_nlp', async () => {
  await run();
  const saved = nlpSave.mock.calls.at(-1)![0] as any;
  expect(saved.entities).toEqual([{ text: 'Nha Trang', type: 'LOC' }]);
});

it('NER trả null → entities null nhưng vẫn done, không throw', async () => {
  analyze.mockResolvedValueOnce(null);
  await run();
  const saved = nlpSave.mock.calls.at(-1)![0] as any;
  expect(saved.entities).toBeNull();
  expect(saved.processingStatus).toBe('done');
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

```bash
cd backend && npx jest nlp-process.processor --silent
```
Kỳ vọng: FAIL (constructor chưa nhận bridge / chưa gán entities). *(Test cũ cũng có thể đỏ do thiếu arg — đó là tín hiệu đúng.)*

- [ ] **Step 3: Sửa processor**

1. Import `NlpAnalyzerBridgeService`.
2. Thêm param cuối constructor: `private nerBridge: NlpAnalyzerBridgeService,`.
3. Trong `handle`, sau `analyzeArticle` (dòng ~78), thêm:
   `const nerEntities = await this.nerBridge.analyze(normalizedContent);`
   với comment nghiệp vụ (vd: `// NER thật (S5b) — điền entities nuôi Zone B; null nếu service chết`).
4. Ở bước 6, thêm: `nlp.entities = nerEntities ?? null;`

- [ ] **Step 4: Chạy test — xác nhận PASS**

```bash
cd backend && npx jest nlp-process.processor --silent
```
Kỳ vọng: tất cả PASS (cả test cũ notable/junk lẫn 2 test entities mới).

- [ ] **Step 5: Toàn bộ suite osint + build**

```bash
cd backend && npx jest --silent && npx tsc --noEmit
```
Kỳ vọng: xanh + build sạch.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/osint/services/nlp-process/
git commit -m "feat(osint): S5b nối NER vào worker — điền osint_post_nlp.entities, null-safe, Gate không đổi"
```

---

## Task 4: E2E xác minh trên dữ liệu thật (bằng chứng, không mock)

**Files:** không sửa code — chạy pipeline thật.

- [ ] **Step 1: Bật cả hai service**

```bash
# term1: NER service
cd services/nlp-analyzer && . .venv/bin/activate && uvicorn main:app --port 8001
# term2: backend (Redis + Postgres đã chạy như S5a)
cd backend && npm run start:dev
```

- [ ] **Step 2: Reprocess vài post thật qua endpoint dev**

Dùng `POST /api/v1/osint/nlp/reprocess/:postId` (hoặc `reprocess-batch.sh`) trên vài post đã có.

- [ ] **Step 3: Xác minh DB**

```sql
SELECT post_id, entities, is_notable, processing_status
FROM osint.osint_post_nlp
WHERE entities IS NOT NULL
ORDER BY updated_at DESC LIMIT 10;
```
Kỳ vọng: `entities` có mảng `{text,type}` PER/ORG/LOC hợp lý; `processing_status='done'`.

- [ ] **Step 4: Xác minh suy biến** — tắt NER service (`kill`), reprocess 1 post →
`entities` NULL nhưng `processing_status='done'`, không có post nào 'failed' vì NER.

- [ ] **Step 5:** Ghi kết quả E2E vào memory `sprint5-decomposition.md` (S5b DONE + số liệu).

---

## Self-Review (đã chạy)

**Spec coverage:** §2 kiến trúc→Task1+2+3; §3 API→Task1; §4 shape entities→Task3 (gán mảng);
§5 nối worker + Gate không đổi→Task3 (+Global Constraint); §6 suy biến→Task2 (null) + Task3 (test null)
+ Task4 (E2E tắt service); §7 DMZ→ghi chú Task1 cạm bẫy (pre-download phase sau, không trong plan code);
§8 test→Task1/2/3 steps; §9 cộng tác→header. Đủ.

**Placeholder scan:** không có TBD; skeleton là CỐ Ý theo §9 (guide→user code), kèm mô tả logic
đủ để code + test cụ thể làm hợp đồng hành vi.

**Type consistency:** `NerEntity {text, type:'PER'|'ORG'|'LOC'}` dùng nhất quán Task2→Task3;
`analyze(text)→Promise<NerEntity[]|null>` khớp giữa bridge, spec mock, worker. Constructor arg thứ 11
nhất quán giữa processor + spec.
