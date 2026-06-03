# Báo cáo Sprint 1 — OSINT Core (KH-SOMS)

> Hệ thống phần mềm hỗ trợ bảo đảm an ninh, trật tự tỉnh Khánh Hòa.
> Module: `osint` — Giám sát nguồn mở (báo chí RSS).
> Ngày chốt: 2026-06-03.

---

## 1. Tổng quan & kết quả kiểm tra

| Hạng mục | Trạng thái |
|----------|-----------|
| 7/7 mục roadmap Sprint 1 | ✅ Hoàn thành |
| Build (`npm run build`) | ✅ Sạch, 0 lỗi |
| Lint (ESLint) | ✅ Sạch |
| Unit test (`npx jest`) | ✅ **20/20 pass** (5 suite) |
| Verify chạy thật (live) | ✅ Đã chạy: 50 bài → idempotent 0 bài |

---

## 2. Danh sách công việc đã làm

| Task | Deliverable | File |
|------|-------------|------|
| 1 | Entity từ điển lóng + migration | `entities/osint-slang-dictionary.entity.ts`, `migrations/001-osint-slang-dictionary.sql` |
| 2 | Dịch vụ phát hiện từ lóng | `services/slang-dictionary.service.ts` (+ spec 5 test) |
| 3 | Dịch vụ tạo cảnh báo + dedup 1h | `services/alert/alert.service.ts` (+ spec 7 test) |
| 4 | Worker tiêu thụ job (Bull) | `services/crawler/crawler.processor.ts` |
| 5 | Bộ lập lịch tự động | `scheduler/osint-scheduler.service.ts` |
| 6 | Dọn endpoint test + code chết | `osint.controller.ts`, `crawler.service.ts` |

Bổ sung: `NlpService` (`services/nlp/nlp.service.ts`) đã hoàn thành từ trước — tầng gating Layer 1 rule-based.

---

## 3. Luồng xử lý end-to-end

```
┌─ SCHEDULER ─────────────────────────────────────────────────┐
│ OsintSchedulerService  @Cron('*/30 * * * *')  mỗi 30 phút    │
│   → lấy mọi source isActive=true                            │
│   → mỗi source: queue.add('crawl-source', { sourceId })     │
└───────────────────────────┬─────────────────────────────────┘
                            ▼  (đẩy job, KHÔNG chờ)
              ┌─ QUEUE 'osint-crawl' (Redis) ─┐
              │ job bền vững · retry · isolation │
              └───────────────┬─────────────────┘
                            ▼  (consumer đọc job)
┌─ WORKER ────────────────────────────────────────────────────┐
│ CrawlerProcessor  @Process('crawl-source')                  │
│   ① load source theo sourceId                               │
│   ② crawlRssFeed(source) → OsintArticle[] (bài MỚI)         │
│   ③ mỗi bài:                                                │
│       • NlpService.analyzeArticle  → isRelevant, keywords   │
│       • SlangDictionaryService.detectSlang → hasSlang       │
│       • articleRepo.save (UPDATE is_relevant + keywords)    │
│       • AlertService.createAlertForArticle (dedup 1h)       │
│   ④ log tổng kết + return                                   │
└─────────────────────────────────────────────────────────────┘
                            ▼
        Ghi DB: osint_articles (bài) + osint_alerts (cảnh báo)
```

**Đặc tính quan trọng:** producer/consumer tách rời qua Redis → crawl chạy **nền**, không chặn API (đúng yêu cầu *"OSINT queue riêng, không ảnh hưởng hệ thống chính"*).

---

## 4. Các quyết định kỹ thuật đã chốt

- **1 job = 1 source** (payload nhẹ `{ sourceId }`) → lỗi 1 nguồn không kéo cả dây, retry độc lập.
- **NLP rule-based** (gating Layer 1): output `{ isRelevant, matchedKeywords, topKeywordPriority }`, **chưa** định lượng `relevanceScore` (để 0, chờ PhoBERT Sprint 2).
- **Severity alert** (ưu tiên cao→thấp): `priority===1` → critical/high_priority_keyword; `hasSlang` → warning/slang_detected; `isRelevant` → info/relevant_keyword; không gì → không tạo alert.
- **Dùng `bull` cổ điển** (qua `@nestjs/bull`), không phải `bullmq`.
- **Bài viết save 2 lần**: lần 1 trong `crawlRssFeed` (INSERT bài thô), lần 2 trong processor (UPDATE thêm `is_relevant`/`keywords`) — cùng 1 dòng vì entity đã mang `id`.

---

## 5. Hai cơ chế chống trùng (dễ nhầm — cần lưu ý)

| Cơ chế | Khóa theo | Cửa sổ | Bản chất |
|--------|-----------|--------|----------|
| Chống trùng **bài** (`isArticleExist`) | `url` | Vĩnh viễn | Tập tích lũy, không quên |
| Dedup **alert** (`isDuplicate`) | `(articleId, alertType)` | 1 giờ | **Cửa sổ trượt** theo `Date.now()` |

→ Hệ thống **idempotent**: chạy lại bao nhiêu lần cũng không nhân đôi dữ liệu (quan trọng vì cron lặp mỗi 30 phút).

---

## 6. Kết quả verify thực tế (bằng chứng)

- **Lần crawl 1** (Báo Thanh Niên): `xử lý 50 bài mới` — toàn bộ backlog feed.
- **Lần crawl 2** (cùng nguồn): `Crawled 50 items, saved 0 new articles` → `xử lý 0 bài` — chứng minh chống trùng url hoạt động.
- **AlertService** (qua `npm run test:pipeline`, chạy 2 lần): lần 1 tạo 5 alert (3 critical + 2 info), lần 2 dedup chặn cả 5 → xác nhận SQL `@> ARRAY[...]::uuid[]` chạy đúng trên Postgres thật.

---

## 7. Lỗi đã phát hiện & sửa khi audit

1. **Bug `return` trong vòng for** (processor): ban đầu return ngay sau bài #1 → bỏ sót 49 bài. Đã đưa return ra ngoài for.
2. **Test bị nhiễm**: `slang-dictionary.service.spec.ts` lỡ `import từ 'node:test'` + một hàm `expect` rác IDE tự sinh → đè global Jest, làm cả suite fail. Đã xóa.
3. **2 spec scaffold mặc định** (`osint.service`, `osint.controller`) thiếu provider mock → đã bổ sung.

---

## 8. Hạn chế hiện tại & việc Sprint sau

- **NLP/Slang rule-based**: từ lóng ngắn dễ khớp nhầm chuỗi con (vd "đá" trong "đá bóng") → Sprint 2 dùng `underthesea` microservice cho MXH.
- **`crawlIntervalMinutes` per-source** chưa áp dụng — hiện hard-code 30 phút chung.
- **Chưa có auth** bảo vệ API (Sprint 3) — đây là lý do xóa hẳn endpoint trigger tay thay vì giữ lại.
- **Dọn tùy chọn**: `npm uninstall bullmq` (cài thừa).
- 13 nguồn báo ngành công an/quốc phòng còn `rss_feed_url=NULL` (chưa tìm được RSS công khai).

---

## 9. Lệnh kiểm chứng nhanh

```bash
cd backend
npm run build          # biên dịch
npx jest               # 20/20 test pass
npm run test:pipeline  # chạy pipeline thật trên DB (cần Postgres + Redis)
```

API đọc dữ liệu (sau khi crawl):

```bash
curl http://localhost:3000/api/v1/osint/articles   # bài + is_relevant/keywords
curl http://localhost:3000/api/v1/osint/alerts      # cảnh báo sinh ra
```
