# Thiết kế: OSINT Sprint 5a — Pipeline Spine (Normalize → NLP async → Trust → Gate)

- **Ngày:** 2026-07-07
- **Trạng thái:** Đã duyệt thiết kế (brainstorming) → chuyển sang viết plan
- **Bối cảnh:** Sprint 5. Sprint 5 gốc trong [[sprint2-hybrid-osint-plan]] (§III Sprint 5) gộp Normalize + NLP nâng cao + Trust + Gate + LLM vào "40 giờ". Thực tế đây là ~3 hệ con với phụ thuộc hạ tầng khác nhau → **decompose**.
- **Chuẩn tuân thủ:** Pháp luật Việt Nam (NĐ 13/2023/NĐ-CP, Điều 289 BLHS). Xem `legal-finalization-checklist`. Toàn bộ S5a chạy Zone A, self-host, không SaaS bên thứ 3.

## 0. Quyết định decompose Sprint 5

Sprint 5 tách thành 3 sub-project, mỗi cái có spec → plan → implement riêng:

| Sub | Nội dung | Hạ tầng mới | Phiên này |
|-----|----------|-------------|-----------|
| **S5a** | Pipeline spine: Normalize → `osint_post_nlp` sống lại (async) → Trust → Gate | Không | ✅ Spec này |
| **S5b** | NLP thật: Python FastAPI + underthesea (NER) + PhoBERT (sentiment/topic) | Microservice Python | Sau |
| **S5c** | LLM self-host: Ollama + model VN cho ~5-10% bài qua Gate | 1 GPU | Sau |

S5a là **xương sống** mà S5b/S5c cắm vào. Spec này chỉ mô tả S5a. Các khe cắm cho S5b/S5c được thiết kế sẵn (cột null, cờ `gate_passed`) để bật sau **không phải viết lại**.

## 1. Vấn đề & mục tiêu

### Hiện trạng (Sprint 1 baseline)
- `NlpService` = **khớp chuỗi keyword thuần TypeScript** ([nlp.service.ts](../../backend/src/modules/osint/services/nlp/nlp.service.ts)). Không NER, không sentiment, không phân loại. Không có microservice Python nào trong repo.
- Entity `osint_post_nlp` **tồn tại nhưng CHẾT** — pipeline trong [post-ingest.service.ts:117-134](../../backend/src/modules/osint/services/ingest/post-ingest.service.ts#L117) ghi kết quả NLP thẳng lên cột `osint_posts` (`isRelevant`, `riskScore`, `keywords`), không bao giờ đụng `osint_post_nlp`.
- NLP chạy **inline, đồng bộ** trong vòng lặp ingest ([post-ingest.service.ts:113](../../backend/src/modules/osint/services/ingest/post-ingest.service.ts#L113)) — mỗi post phân tích xong mới lưu, mới sang post kế.
- Các cột NLP trên `osint_posts` **chỉ được ghi lúc ingest, không nơi nào đọc lại** (dashboard là Sprint 7) → tự do tái cấu trúc.
- `isRelevant = text.includes(keyword)` → **false positive cao**: keyword `ma túy` khớp cả bài tuyên truyền phòng chống; `tai nạn` khớp bài không liên quan.

### Mục tiêu S5a
1. Tách phân tích NLP khỏi hot-path ingest → **async BullMQ queue**, để tầng LLM (S5c, GPU-bound) sau này cắm vào tự nhiên.
2. Đưa `osint_post_nlp` thành **nguồn sự thật** của kết quả phân tích.
3. Thêm bước **Normalize** tường minh trước NLP.
4. Xây **Gate notability** đa tín hiệu: lọc rác + luật ngữ cảnh (giảm false positive) + chấm điểm → drive alert + đánh dấu bài cho LLM.
5. Dựng khung **Trust Level** đủ làm tín hiệu cho Gate + schema ổn định.
6. Trọng số/ngưỡng Gate **khách quan hết mức không cần nhãn** (OR-gate + z-score + EWM) và **log feature** để pha sau học được.

## 2. Kiến trúc & luồng dữ liệu (Zone A spine)

Ingest chỉ còn lo "lấy về + lưu thô + xếp hàng"; toàn bộ phân tích chuyển sang **1 worker async** chạy pipeline phân tầng theo chi phí (spec 2-zone §3.2).

```
CRAWL (collectors)
   │  RawPost[]
   ▼
PostIngestService  (mỏng lại)
   │  1. dedup theo (platform_id, external_post_id)   ← giữ nguyên
   │  2. INSERT osint_posts (thô, CHƯA phân tích)
   │  3. INSERT osint_post_nlp { processing_status: 'pending' }
   │  4. enqueue nlp-process { postId }
   ▼
BullMQ  nlp-process queue  (concurrency cấu hình, retry/backoff)
   ▼
NlpProcessProcessor (worker — pipeline 4 bước, tất cả Zone A, CPU)
   │  status → 'processing'
   ├─ 1. Normalize      (NFC, bóc HTML, chuẩn whitespace → normalizedContent + content_hash)
   ├─ 2. NLP rẻ          (keyword match + slang; NER/sentiment = khe cắm S5b, tạm null)
   ├─ 3. Trust           (platform prior + source trust + corroboration cluster theo content_hash)
   ├─ 4. GATE notability (lọc rác → luật ngữ cảnh → chấm điểm đa tín hiệu)
   │        ├─ ghi osint_post_nlp (is_notable, notability_score/reasons, gate_passed…)
   │        ├─ drive AlertService  (thay các rule rời trong alert cũ)
   │        └─ set cờ gate_passed cho S5c LLM (S5a chưa tiêu thụ)
   │  status → 'done' | 'failed'
   ▼
osint_post_nlp  (bảng phân tích — TỪ ĐÂY là nguồn sự thật NLP)
```

### 3 nguyên tắc thiết kế cốt lõi

**2.1. Dedup ≠ Corroboration (dễ nhầm).** Ingest vẫn drop trùng theo `external_post_id` (một bài crawl 2 lần). Nhưng `content_hash` **KHÔNG dùng để drop** — nó dùng để **gom cụm nguồn độc lập** (cùng nội dung xuất hiện ở nhiều group/nền tảng = tín hiệu corroboration, chống circular reporting). Hai việc khác nhau.

**2.2. Alert dời vào worker.** Alert phụ thuộc kết quả NLP, mà NLP giờ async → không thể alert trong ingest nữa. Worker gọi `AlertService` sau Gate. **Phải bỏ nhánh alert inline cũ** để tránh double-alert.

**2.3. `osint_post_nlp` = nguồn sự thật NLP.** Các cột NLP trên `osint_posts` (`isRelevant`, `riskScore`, `keywords`) để worker ghi lại như **cache tiện lọc** (denormalized); chi tiết đầy đủ nằm ở `osint_post_nlp`.

**Phương án loại:** gộp Normalize/NLP/Gate thành một service khổng lồ — loại, vì mỗi bước một trách nhiệm rõ, test độc lập được, và Gate cần đọc kết quả từng bước tách bạch.

## 3. Trách nhiệm từng component

### ① NormalizeService (mới, CPU, 100% bài)
- Unicode NFC, bóc HTML/entity, gom whitespace, chuẩn hóa URL/emoji thừa.
- Tính lại `content_hash` **trên text đã chuẩn hóa** (cùng nội dung khác dấu/format → cùng hash → gom cụm đúng).
- Input `osint_posts.content` → Output `normalizedContent` (dùng nội bộ pipeline, không nhất thiết lưu) + `content_hash` ổn định.

### ② NLP rẻ — tái dùng `NlpService` + `SlangDictionaryService`, KHÔNG viết lại
- Ghi: `matched_keywords`, `top_keyword_priority`, `has_slang`, `detected_slang`, `topic_category` (rule-based cơ bản), `trend_score = f(priority, engagement)`.
- **Khe cắm S5b:** `sentiment_score`, `entities` để null. Gate coi tín hiệu sentiment/entity là "off" khi null → S5b bật là tự có tác dụng, **không sửa Gate**.

### ③ TrustService (mới) — dựng khung, đủ làm tín hiệu Gate
Theo [[trust_level_methodology]]:
- **Platform prior:** đọc `osint_platforms.trust_level`. Migration seed baseline: RSS chính thống=5, YouTube=3, FB/Reddit=2, TG/TikTok=1.
- **Source trust:** `S = clamp(0.3·P + 0.5·R_track + 0.2·Profile, 1, 5)`. **R_track = baseline** (Wilson stub, `n=0` vì chưa có `verdict`) → S5a source-trust ≈ prior. Ghi `osint_groups.trust_level`.
- **Corroboration:** gom bài cùng `content_hash` trong cửa sổ thời gian → gán `independent_cluster_id`; đếm `k` = số cụm **chủ sở hữu khác nhau** → `Corrob_indep = 1 − exp(−0.7·k)`.
- **Credibility (post):** tính một phần (bỏ trống nhánh track-record) → ghi `osint_post_nlp.credibility`.
- **Wilson job:** scheduled **stub**, cấu trúc sẵn, bật khi có `verdict`.

### ④ GateService (mới) — notability duy nhất, 3 lớp tuần tự

```
Lớp A · LỌC RÁC (hard filter → dừng: không notable, không alert)
   • quá ngắn / chỉ link-emoji / spam bán hàng lặp (nâng isJunkComment lên cấp post)

Lớp B · LUẬT NGỮ CẢNH KEYWORD (hạ cờ false-positive)
   • keyword khớp nhưng cửa sổ quanh nó chứa từ "phòng chống / tuyên truyền /
     cai nghiện / hội thảo…" → coi là nhắc-đến, không phải nội dung nóng

Lớp C · CHẤM ĐIỂM ĐA TÍN HIỆU (OR pass/fail; điểm để xếp hạng)
   • keyword nóng (priority thấp)          [S5a ✓]
   • tương tác bất thường (z-score/page)   [S5a ✓]
   • nguồn trust cao                        [S5a ✓]
   • corroboration nhiều cụm độc lập        [S5a ✓]
   • sentiment tiêu cực mạnh                [S5b — tạm off]
   • thực thể trong watchlist               [S5b — tạm off]
```

- **OR pass/fail:** chạm bất kỳ tín hiệu mạnh nào → `is_notable = true`. **Quyết định lọt hay không KHÔNG cần trọng số** (né chủ quan ở khâu chốt).
- Output ghi `osint_post_nlp`: `is_notable`, `notability_score`, `notability_reasons[]`, `gate_passed` (cờ S5c), `signal_features` (log).
- Ngưỡng **cấu hình được** qua `osint_gate_config` (demo lỏng → siết dần).

### ⑤ Alert (dời vào worker)
`AlertService` refactor nhận **quyết định Gate** thay vì tự chấm rule rời. `is_notable` → tạo alert; severity map từ `notability_reasons`/`top_keyword_priority`; giữ dedup 1h. Bỏ nhánh alert inline trong ingest.

## 4. Trọng số & ngưỡng khách quan (không cần nhãn)

Xử lý điểm yếu "trọng số gán ghép chủ quan":

**4.1. Tách pass/fail khỏi trọng số.** Gate là **OR** → quyết định notable/không **không dùng trọng số nào**. Trọng số chỉ ảnh hưởng **xếp hạng ưu tiên/severity**, không quyết định lọt.

**4.2. Ngưỡng bằng thống kê, không phải số ma thuật.** "Tương tác bất thường" = **z-score theo baseline của chính page**: `z = (engagement − μ_page) / σ_page`, bất thường khi `z > ngưỡng` (mặc định 2). Tự định nghĩa từ dữ liệu, tự thích nghi từng nguồn. `μ, σ` tính rolling từ N bài gần nhất của group bằng query aggregate (cache ngắn) — **không cần bảng mới**.

**4.3. Trọng số xếp hạng = Entropy Weight Method (EWM).** Job định kỳ tính trọng số từ độ phân tán của `signal_features` quan sát được → khách quan từ dữ liệu (không cần nhãn), phổ biến trong nghiên cứu VN. Ghi vào `osint_gate_config.signal_weights`. Caveat: EWM cân theo *độ phân tán*, không phải *khả năng dự báo* — chấp nhận ở pha cold-start.

**4.4. Lộ trình pha 2 (khi có `verdict`):** chuyển trọng số sang **Logistic Regression** (hệ số học từ dữ liệu, diễn giải được), đồng thời nuôi Wilson track-record. **Bắt buộc S5a: log `signal_features` mỗi bài** — không lưu bây giờ thì pha 2 vĩnh viễn không có dữ liệu huấn luyện.

## 5. Thay đổi schema (migration mới)

### `osint_post_nlp` (thêm cột; entity đã có nhiều)
| Cột mới | Kiểu | Mục đích |
|---|---|---|
| `sentiment_score` | float null | Khe cắm S5b |
| `entities` | jsonb null | Khe cắm S5b (NER) |
| `is_notable` | bool default false | Kết quả Gate (OR pass/fail) |
| `notability_score` | float null | Điểm xếp hạng (EWM) |
| `notability_reasons` | jsonb | Tín hiệu trip Gate → map severity |
| `gate_passed` | bool default false | Khe cắm S5c (cờ LLM) |
| `credibility` | float null | Post credibility (một phần) |
| `signal_features` | jsonb | Feature log cho pha 2 |

*(đã có: `is_relevant`, `matched_keywords`, `top_keyword_priority`, `has_slang`, `detected_slang`, `topic_category`, `trend_score`, `risk_level`, `processing_status`)*

### `osint_posts` (thêm 2 cột — fact theo bài)
| Cột | Kiểu | Mục đích |
|---|---|---|
| `verdict` | varchar(20) default `'unverified'` | Khe Wilson track-record (pha 2) |
| `independent_cluster_id` | varchar(64) null | Cụm corroboration; dùng chính `content_hash` làm khóa cụm (các bài cùng hash = cùng cụm) |

### `osint_platforms` / `osint_groups`
Không thêm cột (`trust_level` đã có, default 3). **Migration seed** lại baseline đúng phương pháp (RSS=5, YouTube=3, FB/Reddit=2, TG/TikTok=1).

### `osint_gate_config` (bảng mới, nhỏ)
| Cột | Kiểu | Mục đích |
|---|---|---|
| `signal_weights` | jsonb | Trọng số mỗi tín hiệu (job EWM ghi định kỳ) |
| `thresholds` | jsonb | Ngưỡng OR mỗi tín hiệu (z-score cutoff, priority cutoff…) |
| `is_active` | bool | Một hàng active; không có → worker dùng default trong code |

## 6. Xử lý lỗi & resilience (worker)
- `processing_status`: `pending → processing → done | failed`.
- **Idempotent:** `osint_post_nlp.post_id` UNIQUE (đã có) → job chạy lại chỉ update, không tạo trùng. An toàn khi BullMQ retry.
- **Retry/backoff:** BullMQ (vd 3 lần, exponential). Hết retry → `failed` + log, không chặn job khác (mỗi post 1 job độc lập).
- **Bọc try/catch từng bước:** một bước lỗi → ghi phần làm được + đánh dấu, không văng cả job (tinh thần "1 post lỗi không hỏng cả mẻ").
- **Double-alert:** khi dời alert sang worker phải bỏ nhánh alert inline trong ingest — điểm dễ sót.

## 7. Test (TDD từng unit)
- `NormalizeService`: NFC, bóc HTML, content_hash ổn định (cùng nội dung khác format → cùng hash).
- `GateService`: lọc rác (Lớp A); luật ngữ cảnh negation ("phòng chống ma túy" KHÔNG notable — Lớp B); OR pass/fail (Lớp C); z-score bất thường.
- `TrustService`: corroboration clustering (2 nguồn độc lập cùng content → k=2; cùng chủ sở hữu → k=1).
- EWM job: trọng số chuẩn hóa cộng lại; tín hiệu phân tán cao → trọng số cao.
- **Integration:** ingest → enqueue → worker → `osint_post_nlp` populated + đúng **1 alert** (không double).

## 8. Ranh giới scope — S5a KHÔNG làm (khe cắm để sẵn)
- ❌ NER/sentiment thật (Python underthesea/PhoBERT) → **S5b**. `sentiment_score`/`entities` null.
- ❌ LLM self-host (Ollama+GPU) → **S5c**. `gate_passed` set nhưng chưa ai tiêu thụ.
- ❌ Cơ chế sinh `verdict` (UI xác minh cho điều tra viên) → sau. Wilson job = stub.
- ❌ Entity-resolution (khớp hồ sơ đối tượng) → **Zone B**, không thuộc spine.
- ❌ Dashboard/report → Sprint 6-7.
- ❌ Logistic Regression học trọng số → pha 2 (khi có verdict); S5a chỉ **log feature**.

## 9. Definition of Done
- [ ] Ingest mỏng lại: chỉ dedup + lưu thô + tạo `osint_post_nlp(pending)` + enqueue.
- [ ] BullMQ `nlp-process` queue + worker chạy pipeline 4 bước; `processing_status` đúng vòng đời; idempotent + retry.
- [ ] `NormalizeService`, `GateService`, `TrustService` mới, có unit test.
- [ ] `osint_post_nlp` được populate (entity "sống lại"); các cột NLP trên `osint_posts` là cache denormalized.
- [ ] Gate: lọc rác + luật ngữ cảnh giảm false positive; OR pass/fail; z-score engagement; ghi `signal_features`.
- [ ] Trust: platform prior seed đúng baseline; source trust (Wilson stub); corroboration `independent_cluster_id`; credibility một phần.
- [ ] EWM job ghi `osint_gate_config.signal_weights`.
- [ ] Alert dời vào worker, driven bởi Gate; **không double-alert** (integration test xác nhận).
- [ ] Migration: cột mới + seed trust baseline + bảng `osint_gate_config`.
- [ ] KHÔNG có lời gọi SaaS bên thứ 3 nào.

## 10. Ngoài phạm vi (Phase sau / sub-project khác)
- S5b (NLP thật), S5c (LLM), verdict UI + Wilson thật, Logistic Regression, Zone B entity-resolution, dashboard/report.
