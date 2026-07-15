# FB Collector Feed-Inline Implementation Plan

> **Mô hình:** hướng CNC → Claude code trực tiếp (memory `feedback-cnc-claude-codes`), TDD phần parse thuần. Checkbox `- [ ]` để bám tiến độ.

**Goal:** Tăng sản lượng crawl Facebook (≫6 post/lần) + điền `authorExternalId`/`authorName` ổn định, bằng cách bóc inline từ feed group (thay vòng vào-từng-permalink giòn).

**Architecture:** Browser cuộn feed + bấm "Xem thêm" → trả mảng `article.outerHTML`. Node parse mỗi HTML bằng cheerio qua hàm thuần `parseArticle` → RawPost. `collect()` gọi `scrapeGroupFeed` thay `scrapeGroupPostIds`+loop `scrapePostDetail`.

**Tech Stack:** NestJS, Playwright (browser), cheerio (parse HTML string), jest (testEnvironment: node).

**Spec:** `docs/superpowers/specs/2026-07-15-fb-collector-feed-inline-design.md`

## Global Constraints

- **Test bằng cheerio trên chuỗi HTML** (jest `testEnvironment: node`, KHÔNG jsdom). Browser chỉ trả `outerHTML`; KHÔNG parse trong `page.evaluate`.
- **Neo theo article:** mỗi lần `parseArticle` xử lý đúng 1 article HTML → không lẫn author/id bài khác.
- **Giữ nguyên** `scrapePostDetail` + `scrapeGroupPostIds` trong file (cho hybrid deep-scrape sau); `collect()` không gọi chúng nữa.
- **Không đụng** `PostIngestService`/NLP/gate. RawPost giữ schema cũ.
- **Anti-detection Sprint 4 giữ nguyên:** stealth context, random delay cuộn, kill browser mỗi lần, guard NEEDS_RELOGIN.
- **Engagement = best-effort:** v1 parseArticle KHÔNG bóc engagement (để null) — reliable hơn; gate xử lý thiếu engagement bình thường. Ghi tồn đọng.
- Comment tiếng Việt cho logic nghiệp vụ (CLAUDE.md).

## File Structure

- Create: `backend/src/modules/osint/services/facebook/fb-article-parser.ts` — hàm thuần `parseArticle(html)` (cheerio).
- Create: `backend/src/modules/osint/services/facebook/fb-article-parser.spec.ts` — unit test parser.
- Modify: `backend/src/modules/osint/services/facebook/facebook.collector.ts` — thêm `scrapeGroupFeed`, sửa `collect()`.

---

## Task 1: `parseArticle` — parser thuần (cheerio) + unit test

**Files:**
- Create: `backend/src/modules/osint/services/facebook/fb-article-parser.ts`
- Create: `backend/src/modules/osint/services/facebook/fb-article-parser.spec.ts`

**Interfaces:**
- Produces: `interface ParsedArticle { externalPostId: string; content: string; authorName: string | null; authorHref: string | null }`
  và `parseArticle(html: string): ParsedArticle | null` (null nếu thiếu content hoặc externalPostId).
  Task 2 gọi hàm này.

**Bối cảnh selector (từ code hiện có):**
- content: `div[data-ad-preview="message"]`
- author: `[data-ad-rendering-role="profile_name"] a` → text = tên, href = authorHref
- permalink id: quét `a[href]`, match 1 trong 4 regex:
  `/\/posts\/(pfbid[\w-]+|\d+)/`, `/\/permalink\/(\d+)/`, `/multi_permalinks=(\d+)/`, `/story_fbid=(pfbid[\w-]+|\d+)/`

- [ ] **Step 1: Viết test thất bại** (`fb-article-parser.spec.ts`)

```typescript
import { describe, it, expect } from '@jest/globals';
import { parseArticle } from './fb-article-parser';

const article = (opts: { msg?: string; postHref?: string; authorName?: string; authorHref?: string }) => `
  <div role="article">
    ${opts.authorName ? `<span data-ad-rendering-role="profile_name"><a href="${opts.authorHref ?? ''}">${opts.authorName}</a></span>` : ''}
    ${opts.postHref ? `<a href="${opts.postHref}">2 giờ</a>` : ''}
    ${opts.msg ? `<div data-ad-preview="message">${opts.msg}</div>` : ''}
  </div>`;

describe('parseArticle', () => {
  it('bóc đủ field từ 1 article', () => {
    const html = article({
      msg: 'Cần mua data khách hàng, lh 0912345678',
      postHref: 'https://www.facebook.com/groups/x/posts/1722345968791242/',
      authorName: 'Nguyễn Văn A',
      authorHref: 'https://www.facebook.com/nguyenvana.99',
    });
    const r = parseArticle(html)!;
    expect(r.externalPostId).toBe('1722345968791242');
    expect(r.content).toContain('Cần mua data');
    expect(r.authorName).toBe('Nguyễn Văn A');
    expect(r.authorHref).toBe('https://www.facebook.com/nguyenvana.99');
  });

  it('permalink dạng pfbid cũng bóc được', () => {
    const html = article({ msg: 'x', postHref: 'https://facebook.com/groups/x/posts/pfbid0AbC-dEf/' });
    expect(parseArticle(html)!.externalPostId).toBe('pfbid0AbC-dEf');
  });

  it('thiếu content → null (skip)', () => {
    expect(parseArticle(article({ postHref: '/posts/123/' }))).toBeNull();
  });

  it('thiếu permalink → null (skip)', () => {
    expect(parseArticle(article({ msg: 'có nội dung nhưng không có link' }))).toBeNull();
  });

  it('không có author → field author null nhưng vẫn ra record', () => {
    const r = parseArticle(article({ msg: 'x', postHref: '/permalink/999/' }))!;
    expect(r.externalPostId).toBe('999');
    expect(r.authorName).toBeNull();
    expect(r.authorHref).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

Run: `cd backend && npx jest fb-article-parser --silent`
Expected: FAIL (chưa có `parseArticle`).

- [ ] **Step 3: Viết `fb-article-parser.ts`**

```typescript
import * as cheerio from 'cheerio';

// Kết quả parse 1 article FB (field thô, chưa map sang RawPost)
export interface ParsedArticle {
  externalPostId: string;
  content: string;
  authorName: string | null;
  authorHref: string | null;
}

// 4 dạng permalink group FB → nhóm bắt là externalPostId
const POST_ID_RES: RegExp[] = [
  /\/posts\/(pfbid[\w-]+|\d+)/,
  /\/permalink\/(\d+)/,
  /multi_permalinks=(\d+)/,
  /story_fbid=(pfbid[\w-]+|\d+)/,
];

/**
 * Parse 1 article HTML (đã lấy outerHTML từ browser) → field thô.
 * Trả null nếu thiếu content HOẶC externalPostId (bài không dùng được).
 * Thuần cheerio → unit-test được không cần browser/jsdom.
 */
export function parseArticle(html: string): ParsedArticle | null {
  const $ = cheerio.load(html);

  // 1. Nội dung — bắt buộc; thiếu thì bỏ bài
  const content = $('div[data-ad-preview="message"]').first().text().trim();
  if (!content) return null;

  // 2. externalPostId — quét mọi <a href> tìm permalink khớp 1 trong 4 regex
  let externalPostId: string | null = null;
  $('a[href]').each((_i, a) => {
    if (externalPostId) return; // đã có thì thôi
    const href = $(a).attr('href') ?? '';
    for (const re of POST_ID_RES) {
      const m = href.match(re);
      if (m) {
        externalPostId = m[1];
        return;
      }
    }
  });
  if (!externalPostId) return null;

  // 3. Author (có thể vắng) — text = tên, href = link profile
  const authorA = $('[data-ad-rendering-role="profile_name"] a').first();
  const authorName = authorA.text().trim().slice(0, 200) || null;
  const authorHref = authorA.attr('href') || null;

  return { externalPostId, content, authorName, authorHref };
}
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

Run: `cd backend && npx jest fb-article-parser --silent`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/osint/services/facebook/fb-article-parser.ts backend/src/modules/osint/services/facebook/fb-article-parser.spec.ts
git commit -m "feat(osint): parseArticle thuần (cheerio) bóc field 1 article FB — unit test"
```

---

## Task 2: `scrapeGroupFeed` + chuyển `collect()` sang feed-inline

**Files:**
- Modify: `backend/src/modules/osint/services/facebook/facebook.collector.ts`

**Interfaces:**
- Consumes: `parseArticle(html)` (Task 1); `this.extractExternalId(href)` (có sẵn, dòng ~481); `this.sleep(ms)` (dòng ~597); `RawPost` interface.
- Produces: `private async scrapeGroupFeed(context: BrowserContext, entryUrl: string): Promise<RawPost[]>`.

**Cạm bẫy:**
- `page.evaluate` chỉ trả **mảng string outerHTML** (serialize được); KHÔNG trả Element.
- Bấm "Xem thêm/See more" TRƯỚC khi lấy outerHTML (mở nội dung cắt). Nút có thể nhiều → `getByRole('button', {name})` + `.all()`.
- Dedup theo externalPostId qua các vòng cuộn (Map).
- Import `parseArticle` từ `./fb-article-parser`.

- [ ] **Step 1: Thêm import + method `scrapeGroupFeed`**

Thêm đầu file: `import { parseArticle } from './fb-article-parser';`

Thêm method (đặt cạnh `scrapeGroupPostIds`):

```typescript
  /**
   * Bóc inline từ feed group: cuộn + mở "Xem thêm" → lấy outerHTML từng article →
   * parseArticle (cheerio, Node) → RawPost[]. Không vào từng permalink (nhanh + ít fail + OPSEC tốt).
   * Bỏ article thiếu content/id. Dedup theo externalPostId.
   */
  private async scrapeGroupFeed(
    context: BrowserContext,
    entryUrl: string,
  ): Promise<RawPost[]> {
    const page = await context.newPage();
    try {
      await page.goto(entryUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('div[role="article"]', { timeout: 15000 });

      const channel = ''; // group FB không có "channel"; externalGroupId lấy từ url nếu cần sau
      const byId = new Map<string, RawPost>();
      const maxScrolls = Number(this.configService.get('FB_MAX_SCROLLS')) || 8;
      let stale = 0;

      for (let i = 0; i < maxScrolls; i++) {
        const before = byId.size;

        // 1. Mở hết "Xem thêm/See more" đang hiển thị (nội dung bị cắt)
        const moreBtns = await page
          .getByRole('button', { name: /^(Xem thêm|See more)$/i })
          .all();
        for (const b of moreBtns) {
          await b.click().catch(() => undefined); // nút biến mất giữa chừng → bỏ qua
        }

        // 2. Lấy outerHTML từng article (browser chỉ serialize, không parse)
        const htmls: string[] = await page.evaluate(() =>
          Array.from(document.querySelectorAll('div[role="article"]')).map(
            (el) => (el as HTMLElement).outerHTML,
          ),
        );

        // 3. Parse ở Node bằng cheerio → RawPost, dồn Map (dedup theo id)
        for (const html of htmls) {
          const p = parseArticle(html);
          if (!p) continue;
          byId.set(p.externalPostId, {
            externalPostId: p.externalPostId,
            externalGroupId: channel || undefined,
            authorName: p.authorName,
            authorExternalId: this.extractExternalId(p.authorHref),
            content: p.content,
          });
        }

        // 4. Dừng sớm nếu 2 vòng không thêm bài mới
        if (byId.size === before) stale++;
        else stale = 0;
        if (stale >= 2) break;

        // 5. Cuộn + chờ ngẫu nhiên (giống người)
        await page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );
        await page.waitForTimeout(Math.floor(Math.random() * 2000) + 2000);
      }

      const cap = Number(this.configService.get('FB_MAX_POSTS_PER_RUN')) || 40;
      const posts = [...byId.values()].slice(0, cap);
      this.logger.log(`[${entryUrl}] feed-inline thu ${posts.length} post`);
      return posts;
    } finally {
      await page.close();
    }
  }
```

- [ ] **Step 2: Sửa `collect()` dùng feed-inline**

Thay khối trong `try` (dòng ~618-641) — từ `const ids = ...` tới hết vòng `for` — bằng:

```typescript
      const context = await this.getAuthenticatedContext(browser, account);
      const posts = await this.scrapeGroupFeed(context, entryUrl);
      return { ok: true, posts };
```

(Giữ nguyên `catch`/`finally` + xử lý NEEDS_RELOGIN.)

- [ ] **Step 3: Build — xác nhận không vỡ type**

Run: `cd backend && npx tsc --noEmit`
Expected: sạch. (Có thể cảnh báo `scrapePostDetail`/`scrapeGroupPostIds` "declared but never used" — chấp nhận, giữ code cho hybrid; nếu tsc cấu hình noUnusedLocals gây lỗi thì thêm `// eslint-disable` hoặc `void this.scrapePostDetail;` — kiểm khi chạy.)

- [ ] **Step 4: Chạy toàn bộ test — không vỡ suite khác**

Run: `cd backend && npx jest --silent`
Expected: tất cả PASS (66+ cũ + 5 parser mới).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/osint/services/facebook/facebook.collector.ts
git commit -m "feat(osint): FB collect() dùng scrapeGroupFeed (feed-inline) — sản lượng ≫6, điền author"
```

---

## Task 3: Verify thật + đo sản lượng

**Files:** không sửa — chạy thật.

- [ ] **Step 1: Chạy collector trên 1 group FB công khai**

Dùng script sẵn có: `cd backend && npm run test:fb-collector` (cần tài khoản công cụ + Playwright như Sprint 4).
Quan sát log: `feed-inline thu N post` với **N ≫ 6**.

- [ ] **Step 2: Xác minh DB**

```sql
SELECT count(*) tong, count(author_external_id) co_author
FROM osint.osint_posts p JOIN osint.osint_platforms pl ON pl.id=p.platform_id
WHERE pl.name='facebook';
```
Kỳ vọng: `tong` tăng mạnh so với 8; `co_author` > 0 (author được điền).

- [ ] **Step 3: Ghi kết quả** vào memory `project-cnc-focus` (FB feed-inline DONE + số post/author).

---

## Self-Review

**Spec coverage:** §Kiến trúc→Task2 (scrapeGroupFeed, outerHTML, cheerio); §parseArticle thuần→Task1; §Cap 40→Task2 Step1; §Giữ scrapePostDetail→Task2 Step3 (không xóa); §Không đổi ingest→không có task đụng ingest; §Test cheerio→Task1; §Verify thật→Task3; §Engagement best-effort (để null)→Global Constraint + Task1 (parseArticle không trả engagement). Đủ.

**Placeholder scan:** không TBD; mọi step có code/lệnh cụ thể. Điểm "noUnusedLocals" ở Task2 Step3 là lưu ý kiểm-khi-chạy có hướng xử lý rõ, không phải placeholder.

**Type consistency:** `ParsedArticle {externalPostId, content, authorName, authorHref}` nhất quán Task1→Task2; `parseArticle(html): ParsedArticle|null`; `scrapeGroupFeed(context,entryUrl): Promise<RawPost[]>`; dùng `this.extractExternalId` (có sẵn) + `RawPost` (có sẵn). Khớp.

## Tồn đọng
- Engagement từ feed (best-effort) — bổ sung sau nếu gate cần.
- Hybrid deep-scrape (comment) cho bài đáng chú ý — dùng lại `scrapePostDetail`.
- externalGroupId cho group FB (hiện để undefined) — map từ entryUrl/group nếu cần cho actor-group.
