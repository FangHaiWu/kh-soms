# Thiết kế: Pipeline OSINT 2 vùng (2-Zone) — Crawl → Xử lý ngoài → Dashboard/Alert nội bộ

- **Ngày:** 2026-06-25
- **Trạng thái:** Đã duyệt thiết kế (brainstorming) → chuyển sang viết plan
- **Bối cảnh:** Sprint 4 (Facebook). Tinh chỉnh kiến trúc xử lý dữ liệu OSINT.
- **Chuẩn tuân thủ:** Pháp luật Việt Nam (NĐ 13/2023/NĐ-CP, Điều 289 BLHS). Xem `legal-finalization-checklist`.

## 1. Vấn đề & mục tiêu

Ý tưởng ban đầu: "xử lý OSINT hết trên môi trường internet (công cụ online), chỉ Dashboard+Alert là on-prem".

Vấn đề phát hiện khi brainstorm: nếu "công cụ online" = **SaaS bên thứ 3** (OpenAI/Claude API, Google NLP, Apify, social-listening), thì việc gửi nội dung đã cào (gắn với đối tượng) ra ngoài **vi phạm**:
- NĐ13 Điều 25 (chuyển dữ liệu cá nhân xuyên biên giới).
- OPSEC/phản gián: lộ **danh sách đối tượng cơ quan đang theo dõi** cho bên thứ 3.
- Mất kiểm soát dữ liệu (cache/index/train).

Phân biệt cốt lõi: **"công khai khi cào về" ≠ "được phép xử lý ở bất kỳ đâu"**. Tính công khai của nguồn không gỡ được nghĩa vụ về *nơi xử lý*.

**Mục tiêu thiết kế:** giữ ý tưởng tốt (tách phần xử lý nặng khỏi mạng nội bộ) nhưng làm đúng luật bằng cách:
1. Phần xử lý chạy trên **hạ tầng đơn vị kiểm soát** (DMZ / VPS trong nước), **self-host model open-source**, KHÔNG gọi SaaS bên thứ 3.
2. Đặt **subject-linkage (khớp hồ sơ đối tượng) ở vùng nội bộ**, không ở vùng ngoài.

## 2. Kiến trúc 2 vùng

```
┌─────────────────────────────────────┐        ┌──────────────────────────────┐
│  ZONE A — DMZ (máy đặt tại đơn vị)   │        │  ZONE B — Mạng nội bộ on-prem │
│  Có Internet, kiểm soát riêng        │        │  KHÔNG Internet, bảo mật cao  │
│                                      │        │                              │
│  Crawl FB ─▶ Raw ─▶ Normalize ─▶     │ ─push─▶ │  Entity Resolution           │
│             NLP+slang ─▶ [gate]      │ (kết quả│  (khớp post ↔ hồ sơ đối tượng)│
│             ─▶ LLM (bài đáng chú ý)  │  1 chiều)│       │                       │
│                                      │ ◀config─ │  Dashboard + Alert (rule)    │
│  Self-host: underthesea/PhoBERT/     │ (task    │  Subject DB (hồ sơ đối tượng) │
│  Qwen/Vistral qua Ollama (1 GPU)     │  crawl)  │  [Zone B LLM — Phase sau]    │
└─────────────────────────────────────┘        └──────────────────────────────┘
```

### Zone A (DMZ — có Internet)
Xử lý post công khai **như post công khai vô danh**. NLP bóc thực thể, sentiment, phân loại — nhưng **KHÔNG biết** thực thể nào ứng với đối tượng có hồ sơ. Chạy self-host model. Giữ raw PII tạm thời.

### Zone B (Nội bộ — không Internet)
Nhận kết quả đã xử lý từ A. Thực hiện **entity resolution** (khớp với Subject DB), sinh cảnh báo bằng rule, hiển thị dashboard. Đây là nơi duy nhất chứa hồ sơ đối tượng.

## 3. Quyết định thiết kế cốt lõi

### 3.1. Subject-linkage nằm ở Zone B (KHÔNG ở Zone A)
**Quyết định:** việc khớp `post ↔ hồ sơ đối tượng` chạy bên trong Zone B on-prem.

**Lý do:** nếu Zone A (dính Internet, kém an toàn hơn) bị xâm nhập, kẻ tấn công chỉ lấy được *post công khai + nhãn NLP*, **không** lấy được "danh sách đối tượng đang theo dõi + hồ sơ". Giải quyết OPSEC bằng kiến trúc, không bằng niềm tin.

### 3.2. Pipeline phân tầng theo chi phí (trong Zone A)
```
Raw (100%) → Normalize+dedup (100%, CPU) → dictionary-slang (100%, CPU)
           → NLP/PhoBERT (100%, CPU) → [GATE] → LLM (chỉ ~5-10% bài đáng chú ý, GPU)
```
Bước rẻ chạy toàn bộ; chỉ subset vượt gate mới tốn GPU. Một GPU tầm trung đủ cho demo.

### 3.3. Gate "đáng chú ý" — đa tín hiệu (OR)
Một bài qua gate (→ LLM) nếu chạm **bất kỳ** điều kiện nào. Các tín hiệu **tái dùng kết quả bước rẻ đã tính**, gate chỉ là một bước `if`, không thêm tính toán:

| Tín hiệu | Ngưỡng (cấu hình được) | Nguồn |
|----------|------------------------|-------|
| Từ khóa nóng | Khớp watchlist keyword | dictionary match |
| Sentiment tiêu cực mạnh | PhoBERT score < ngưỡng âm | NLP |
| Thực thể quan trọng | NER ra tên/tổ chức/địa điểm trong danh mục | NER |
| Tương tác bất thường | Like/share/comment vọt so baseline page | crawl metadata |
| Nguồn độ tin cao | Page/group trust level cao | trust methodology |

Bài không chạm tín hiệu nào: dừng ở nhãn NLP, không tốn GPU. Ngưỡng cấu hình được (demo đặt lỏng → siết dần).

### 3.4. LLM (Zone A) xử lý nội dung công khai vô danh
Tại thời điểm LLM chạy, dữ liệu vẫn là post công khai chưa gắn đối tượng (vì 3.1). LLM làm: tóm tắt, suy luận ý định, phân loại tinh. Hợp lệ vì self-host + chưa có PII-hồ sơ. GPU vốn nằm ở Zone A.

### 3.5. Ranh giới A↔B — đúng 2 luồng, mỗi luồng một chiều
- **A → B (kết quả):** đẩy bản ghi đã xử lý (entities, sentiment, nhãn, mức độ) qua gateway kiểm soát.
- **B → A (cấu hình):** B gửi *task crawl* (keyword, URL page/group công khai). Keyword/URL ít nhạy cảm hơn danh tính đối tượng.
- **B KHÔNG BAO GIỜ tự mở kết nối ra Internet.** Bất di bất dịch.

## 4. Công cụ (self-host, free bản quyền)

| Stage | Công cụ | Chạy trên |
|-------|---------|-----------|
| Normalize | Code thuần: Unicode NFC, bóc HTML, dedup, regex | CPU |
| NLP (NER/sentiment/phân loại) | underthesea / VnCoreNLP + PhoBERT | CPU |
| Slang/teencode | Từ điển teencode (ca phổ biến) → LLM (ca khó) | CPU + đôi khi LLM |
| LLM | Qwen2.5 / SeaLLM-v3 / Vistral-7B / PhoGPT qua Ollama (quantized) | 1 GPU |

**Lưu ý "free":** free bản quyền, không free hoàn toàn — stage LLM cần 1 GPU. Đổi lại: data không rời tầm kiểm soát, không lộ đối tượng, không vướng NĐ13.

## 5. Zone B LLM — Phase sau (optional, KHÔNG làm cho demo)

**Demo: KHÔNG có LLM ở Zone B.** A's LLM + cảnh báo rule-based ở B là đủ (YAGNI).

**Phase sau (khi có nhu cầu thật + có hồ sơ để tận dụng):** thêm LLM Zone B, **giới hạn đúng 3 việc** cần ngữ cảnh hồ sơ (A không làm được):
1. Cảnh báo có ngữ cảnh: "với hồ sơ đối tượng X, bài này nghiêm trọng cỡ nào?" → giảm false alert.
2. RAG hỏi-đáp cho điều tra viên trên corpus nội bộ (câu hỏi + hồ sơ Tối mật).
3. Soạn báo cáo TTANXH tự động (ghép OSINT + hồ sơ — đúng mục tiêu dự án).

**Kỹ thuật (nếu làm):**
- Cùng stack self-host nhưng **air-gapped**: weights nạp bằng tay, Zone B **không có egress Internet** — đây là điều khiến LLM chạm PII-hồ sơ vẫn hợp pháp (toàn bộ on-prem).
- Model nhỏ đủ dùng (7B quantized) — việc "hiểu nặng" A làm rồi, B chủ yếu tổng hợp đầu vào có cấu trúc.
- RAG dùng **pgvector** trên PostgreSQL nội bộ sẵn có, không thêm thành phần mới.

**⛔ Lằn ranh:** Zone B LLM = **local-only vĩnh viễn**. Không bao giờ dùng cloud API cho khâu chạm hồ sơ, kể cả "vì xịn hơn".

## 6. Lộ trình hạ tầng

- **Demo:** 1 máy GPU đặt tại đơn vị (DMZ) chạy cả Zone A. Zone B = hệ thống nội bộ sẵn có.
- **Scale:** nhu cầu lớn → dời Zone A lên VPS-GPU thuê **trong nước** (data trong lãnh thổ VN, vẫn hạ tầng đơn vị kiểm soát). Zone B không đổi. Ranh giới A↔B đã định nghĩa rõ (2 luồng) nên dời A không động tới B.

## 7. Khớp với codebase hiện tại

Module `backend/src/modules/osint/` đã có sẵn các mảnh:
- `services/crawler`, `services/facebook` — Zone A crawl ✅ (Sprint 4 đang làm)
- `services/nlp`, `services/slang-dictionary` — Zone A NLP+slang ✅ (cần thêm Normalize chuẩn hóa + gate)
- `services/ingest` — ranh giới ghi dữ liệu
- `services/alert` — Zone B alert
- entity `osint-post-nlp` — lưu nhãn NLP

**Cần thêm/làm rõ (đưa vào plan):**
- Bước **Normalize** tường minh (Unicode NFC, dedup) trước NLP.
- **Gate "đáng chú ý"** đa tín hiệu (mục 3.3) — service mới đọc kết quả NLP, quyết định có gọi LLM.
- **LLM service (Zone A)** self-host qua Ollama — tóm tắt/phân loại bài qua gate.
- **Tách logical zone**: đảm bảo entity-resolution (khớp Subject DB) chạy phía nội bộ, không ở luồng crawl/NLP.
- **Gateway A→B / B→A** một chiều mỗi luồng (có thể là queue/staging table có kiểm soát).

## 8. Phạm vi demo (DoD)

- [ ] Zone A: crawl FB → normalize → NLP+slang → gate → LLM (self-host) cho bài đáng chú ý.
- [ ] Gate đa tín hiệu cấu hình được; bài không đáng chú ý KHÔNG gọi LLM.
- [ ] LLM self-host (Ollama + model VN open-source) chạy trên máy đơn vị.
- [ ] Kết quả đẩy sang phía nội bộ; entity-resolution + alert rule + dashboard chạy ở Zone B.
- [ ] KHÔNG có lời gọi SaaS bên thứ 3 nào trong toàn pipeline.
- [ ] Zone B LLM: KHÔNG làm (ghi nhận Phase sau).

## 9. Ngoài phạm vi (Phase sau)

- Zone B LLM (cảnh báo ngữ cảnh / RAG / báo cáo tự động).
- Dời Zone A lên VPS thuê.
- Proxy/IP rotation nâng cao (đã có hướng ở spec Sprint 4).
