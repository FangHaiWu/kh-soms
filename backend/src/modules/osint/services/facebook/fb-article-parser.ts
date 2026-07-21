import * as cheerio from 'cheerio';

// Kết quả parse 1 article FB (field thô, chưa map sang RawPost)
export interface ParsedArticle {
  externalPostId: string;
  content: string;
  authorName: string | null;
  authorHref: string | null;
}

// 4 dạng permalink group FB → nhóm bắt (group 1) là externalPostId
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
  // FB đổi attribute (phát hiện 21/07): data-ad-preview="message" cũ đã lỗi thời
  // → dùng data-ad-rendering-role="story_message" (xác nhận qua DOM thật).
  const content = $('div[data-ad-rendering-role="story_message"]')
    .first()
    .text()
    .trim();
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
