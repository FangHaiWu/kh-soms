import { describe, it, expect } from '@jest/globals';
import { parseArticle } from './fb-article-parser';

// Dựng HTML 1 article FB giả (đủ/thiếu field) để test parser thuần — không cần browser
const article = (opts: {
  msg?: string;
  postHref?: string;
  authorName?: string;
  authorHref?: string;
}) => `
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
    const html = article({
      msg: 'x',
      postHref: 'https://facebook.com/groups/x/posts/pfbid0AbC-dEf/',
    });
    expect(parseArticle(html)!.externalPostId).toBe('pfbid0AbC-dEf');
  });

  it('thiếu content → null (skip)', () => {
    expect(parseArticle(article({ postHref: '/posts/123/' }))).toBeNull();
  });

  it('thiếu permalink → null (skip)', () => {
    expect(
      parseArticle(article({ msg: 'có nội dung nhưng không có link' })),
    ).toBeNull();
  });

  it('không có author → field author null nhưng vẫn ra record', () => {
    const r = parseArticle(article({ msg: 'x', postHref: '/permalink/999/' }))!;
    expect(r.externalPostId).toBe('999');
    expect(r.authorName).toBeNull();
    expect(r.authorHref).toBeNull();
  });
});
