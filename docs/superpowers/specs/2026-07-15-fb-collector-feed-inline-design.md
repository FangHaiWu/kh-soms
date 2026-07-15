# FB Collector — Bóc inline từ feed group — Design

**Ngày:** 2026-07-15
**Bối cảnh:** chuẩn bị dữ liệu chủ thể cho Lớp 2 CNC (actor aggregation).
**Trạng thái:** chờ writing-plans
**Nhánh:** `feature/sprint4-osint-facebook`
**Collaboration:** Claude code trực tiếp (memory `feedback-cnc-claude-codes`), TDD phần parse thuần.
**Liên quan:** roadmap CNC `2026-07-10-cnc-actor-detection-roadmap.md`; Lớp 2 (chưa spec).

## Vấn đề

Lớp 2 cần gộp theo **chủ thể** (tài khoản/group). Dữ liệu thật cho thấy nút thắt:
FB chỉ **8 post / 7 lần crawl** (≈1 post/lần). Nguyên nhân: collector hiện
(1) chặn cứng `FB_MAX_POSTS_PER_RUN=6`, (2) **vào từng permalink** (`scrapePostByPermalink`)
để bóc content/author/comment — cách này giòn, ~80% trả null (FB chặn/DOM đổi) và tạo
nhiều navigation (dấu hiệu bot).

`author_external_id` gần như rỗng (8/4899) **không phải vì code trích author hỏng**
(FB collector đã bóc `authorExternalId` từ href profile), mà vì **quá ít post FB được thu**.

## Mục tiêu

Tăng sản lượng FB/lần crawl (≫6) + điền `authorExternalId`/`authorName` ổn định, bằng cách
**bóc inline trực tiếp từ feed group** khi cuộn — bỏ bước vào từng permalink.

**Ngoài phạm vi:** comment (bỏ ở luồng chính), curation nguồn CNC, Lớp 2 engine.

## Kiến trúc

Thêm method `scrapeGroupFeed(context, entryUrl): Promise<RawPost[]>` — thay thế cặp
`scrapeGroupPostIds` + vòng lặp `scrapePostByPermalink` trong `collect()`.

**Quyết định test (đã chốt):** jest chạy `testEnvironment: node` (KHÔNG jsdom), repo có sẵn
`cheerio`. → Browser chỉ **lấy `outerHTML` từng article** (sau khi bấm "Xem thêm"); toàn bộ
**parse bằng cheerio trong Node** qua hàm thuần `parseArticle(html)` — unit-test trên chuỗi HTML,
khớp cách `news-crawl.collector` đã dùng cheerio. KHÔNG parse trong `page.evaluate`.

```
scrapeGroupFeed:
  mở group (goto) → chờ div[role="article"] → lặp cuộn tối đa FB_MAX_SCROLLS:
    • bấm hết nút "Xem thêm/See more" trong feed (mở nội dung bị cắt)
    • page.evaluate: trả mảng article.outerHTML (mỗi div[role="article"] → 1 chuỗi HTML)
    • dồn Map theo externalPostId (parse từng HTML để lấy id; bản mới đè — dedup)
    • 2 vòng cuộn không thêm bài → dừng; ngược lại scroll + delay ngẫu nhiên
  → với mỗi HTML: parseArticle(html) → { externalPostId, content, authorName, authorHref,
       likeRaw, commentRaw, shareRaw }; bỏ article thiếu externalPostId hoặc content.
  → RawPost[]: authorExternalId = extractExternalId(authorHref),
       engagement = parseEngagement(likeRaw/commentRaw/shareRaw), externalGroupId.
  → cap FB_MAX_POSTS_PER_RUN (mặc định 40) — slice(0, cap).
```

`collect()` (dòng ~618) đổi: `const posts = await this.scrapeGroupFeed(context, entryUrl);`
rồi ingest như cũ. `scrapePostByPermalink` + `scrapeGroupPostIds` **giữ lại trong file**
(không xóa) cho hybrid deep-scrape phase sau — nhưng `collect()` không gọi.

## Điểm mấu chốt

1. **Neo theo article:** parse phải chạy trong phạm vi từng `article` element. Sai phạm vi →
   gán nhầm author/id của bài khác. Test phải phủ ca "2 article liền nhau, mỗi cái ra đúng record của mình".
2. **Hàm thuần `parseArticle(html: string)`** (cheerio, trả object field thô) để **unit test**
   không cần FB thật: dựng HTML 1 article giả → assert đúng field. Browser chỉ trả `outerHTML`.
   Neo phạm vi tự nhiên vì mỗi lần parse đúng 1 article HTML.
3. **Nội dung cắt "Xem thêm":** bấm nút mở rộng trước khi bóc. Nếu vẫn cắt → chấp nhận
   content ngắn (đủ cho NLP keyword); không chặn.

## Cap & anti-detection

- Bỏ cap 6 → `FB_MAX_POSTS_PER_RUN` mặc định **40**, vẫn đọc từ env.
- Giữ nguyên Sprint 4: stealth context, random delay cuộn, kill browser mỗi lần, guard
  checkpoint/needs-relogin.
- Feed-inline **ít navigation hơn** → OPSEC tốt hơn cách cũ.

## Không đổi phía sau

`RawPost[]` → `PostIngestService.ingest` (đã map `authorExternalId`/`authorName`) →
`osint_posts` có author → nền cho Lớp 2. Không đụng ingest/NLP/gate.

## Suy biến & lỗi

- 1 article parse lỗi/thiếu field → skip article đó, không throw.
- Feed load lỗi (timeout/chặn) → `CollectorResult { ok:false, error }` như hiện tại;
  1 group lỗi không chặn cả mẻ.
- Không tìm thấy article nào → trả `posts:[]`, ok:true.

## Test

- **Unit (jest, cheerio):** `parseArticle(html)` — 1 article đủ field → đúng {id,content,author,href};
  article thiếu message → skip; content bị cắt "Xem thêm" → vẫn lấy phần có; href vanity vs số →
  `extractExternalId` đúng. Không cần jsdom (parse HTML string bằng cheerio).
- **Verify thật (thủ công):** chạy `scrapeGroupFeed` trên 1 group FB công khai qua tài khoản
  công cụ → số post ≫ 6, `author_external_id` được điền trong DB, không mở modal permalink.

## Tồn đọng / phase sau

- Hybrid: deep-scrape permalink (lấy comment) chỉ cho bài đáng chú ý — dùng lại
  `scrapePostByPermalink` đã giữ.
- Curation nguồn CNC (kênh/group tội phạm thật) — đòn bẩy lớn, việc trinh sát/đơn vị.
- Lớp 2 engine sau khi có dữ liệu chủ thể.
