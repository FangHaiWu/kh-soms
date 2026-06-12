# Luồng xử lý cào báo không-RSS (News Crawl Flow)

> Mô tả end-to-end khi hệ thống cào **1 chuyên mục** báo điện tử không có RSS
> (ví dụ `baokhanhhoa.vn/xa-hoi/`), từ lúc cron nổ tới khi bài nằm trong `osint_posts`.
>
> Áp dụng cho Sprint 3 — nhánh News (trafilatura). Cùng đổ về `osint_posts` như RSS & Telegram.

---

## Sơ đồ tổng

```
[Cron] → [Queue Bull] → [NewsCrawlProcessor] → [NewsCrawlCollector]
                                                     ├─ discovery (cheerio)
                                                     └─ vòng lặp: [Bridge] → [Python/trafilatura]
                                                                      ↓
                                             [PostIngestService] → osint_posts
```

**Thành phần chính:**

| Thành phần | File | Vai trò |
|------------|------|---------|
| Scheduler | `scheduler/osint-scheduler.service.ts` | Cron đẩy job vào queue |
| Processor | `services/crawler/news-crawl.processor.ts` | Worker nền xử lý 1 job = 1 nguồn |
| Collector | `services/collectors/news-crawl.collector.ts` | Discovery URL + gọi bridge → RawPost |
| Bridge | `services/news-extractor/news-extractor-bridge.service.ts` | Client NestJS → Python |
| Extractor | `services/news-extractor/main.py` (Python) | trafilatura bóc nội dung bài |
| Ingest | `services/ingest/post-ingest.service.ts` | Đường nạp hợp nhất → `osint_posts` |

---

## Diễn giải từng chặng

### ① Scheduler đẩy job (mỗi 20 phút)

`scheduleNewsCrawl()` chạy → query `osint_sources` lấy nguồn:

```
isActive = true  AND  rss_feed_url IS NULL
```

(`rss_feed_url IS NULL` = không có feed → phải scrape — đây là cờ phân biệt RSS vs scrape.)

→ Mỗi nguồn đẩy **1 job** `crawl-news-source` `{ sourceId }` vào queue `osint-crawl`.
**Cron không chờ** — việc nặng để worker lo.

> ⚠️ Cron RSS (`scheduleCrawl`) phải lọc ngược lại `rss_feed_url IS NOT NULL`,
> nếu không sẽ vớ nhầm nguồn scrape rồi parse như XML → lỗi.

### ② Bull định tuyến → Processor nhận

Worker rảnh lấy job, thấy tên `crawl-news-source` → gọi
`NewsCrawlProcessor.handleCrawlNewsSource(job)`.

> Job name là **hợp đồng ngầm bằng chuỗi** giữa scheduler (`queue.add('crawl-news-source')`)
> và processor (`@Process('crawl-news-source')`). Lệch 1 ký tự → job kẹt queue, không handler nhận.

### ③ Processor kiểm tra điều kiện (guard)

```
load source theo sourceId
 ├─ không tồn tại / isActive=false  → warn + return (dừng)
 ├─ có rssFeedUrl                    → warn + return (nguồn này thuộc RSS, không scrape)
 └─ load platform 'web_news'
       └─ không có                   → warn + return
```

Qua hết guard → có `source.url` (= `/xa-hoi/`) + `platform`
(id + crawlerType `web_trafilatura`).

### ④ Gọi Collector — `collector.collect(source.url)`

**4a. Tải trang chuyên mục** — `axios.get('/xa-hoi/')` kèm User-Agent trung lập (OPSEC)
→ nhận HTML thô.

**4b. Discovery** — `extractArticleUrls(html)`:
- cheerio chọn `a.title2`
- lọc regex `/20\d{4}/` (loại link menu/chuyên mục)
- `new URL(href, base)` → URL tuyệt đối
- `Set` dedup
- → ra **~19 URL bài**

**4c. Giới hạn** — `slice(0, 10)` → lấy 10 URL.

**4d. Vòng lặp bóc từng bài** (~10s vì sleep):

```
cho mỗi URL trong 10 URL:
   bridge.extract(url)                    ← gọi HTTP sang Python
      └─ Python: trafilatura.fetch_url + extract → JSON {title, text, author, date}
      └─ Python trả 200 → bridge trả ExtractedArticle
         (nếu 422/502/500 → bridge trả null)
   article null?  → skip (bài hỏng, bỏ qua)
   article ok?    → toRawPost(article) → đẩy vào mảng posts
   await sleep(1000)                      ← rate limit ≤1 req/s (luật OSINT)
```

**4e. Trả về** — `CollectorResult { sourceLabel, posts:[~10 RawPost], ok:true }`.

### ⑤ Processor kiểm kết quả

`if (!result.ok)` → log lỗi + return. Ở đây `ok:true` → đi tiếp.

### ⑥ Nạp pipeline chung — `ingest.ingest(posts, { platformId, crawlType })`

**Mỗi RawPost** đi qua 6 bước:

```
1. Dedup    — đã có post cùng (platformId + externalPostId=URL)? → skip
2. NLP      — phân tích nội dung (keyword ANTT, sentiment...)
3. Slang    — chuẩn hoá tiếng lóng
4. Risk     — tính điểm rủi ro
5. Save     — INSERT vào osint_posts
6. Alert    — nếu liên quan → tạo cảnh báo (createAlerts mặc định true cho news)
```

Cuối cùng ghi **crawl_log** (denormalize `crawlType='web_trafilatura'`) + trả
`IngestSummary { collected, skipped, relevant, alertsCreated }`.

### ⑦ Processor chốt sổ

```
source.lastCrawledAt = now → save   (đánh dấu để health-check & lần crawl sau)
logger.log("[Báo Khánh Hòa] +N bài mới, M trùng, K alert")
return summary                        (Bull lưu kết quả job)
```

---

## Điểm cần nhớ về luồng

- **Bất đồng bộ 2 tầng**: cron chỉ *đẩy job* rồi thoát; việc nặng (HTTP + parse + NLP)
  chạy nền trong worker → không chặn hệ thống chính.
- **Cô lập lỗi**: 1 bài hỏng → `null` → skip, không sập cả mẻ. 1 nguồn lỗi → job đó fail,
  nguồn khác không ảnh hưởng.
- **2 lần "lấy mạng"**: lần 1 = collector tải trang chuyên mục (discovery);
  lần 2..11 = Python tải từng bài (extract). Mỗi `fetch_url` là 1 hit vào domain
  → lý do `sleep(1000)` giữa các bài.
- **Hợp nhất**: news, RSS, Telegram đều đổ về **cùng** `osint_posts` qua **cùng**
  `PostIngestService` → NLP/báo cáo phía sau không cần biết bài đến từ nguồn nào.
- **Dedup theo URL**: chạy lại job nhiều lần không nhân đôi — bài cũ bị skip ở bước 1.

---

## Ràng buộc pháp lý / OPSEC áp dụng trong luồng

- Chỉ thu thập nội dung **công khai**, không đăng nhập.
- Tôn trọng **robots.txt** (baokhanhhoa.vn chặn `/tim-kiem`, `/search`, `/service/api`…
  → tránh chọn các path này làm `source.url`).
- **Rate limit ≤ 1 req/giây/domain** — bảo đảm bằng `sleep(1000)` mỗi vòng.
- **User-Agent trung lập** (giống trình duyệt chung), không lộ danh tính cơ quan — lý do
  bảo mật nghiệp vụ; KHÔNG giả mạo phiên bản trình duyệt cụ thể để né anti-bot.
