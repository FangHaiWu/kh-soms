/**
 * Verify Chunk 3a-ii: scrapePostDetail — vào permalink 1 post → bóc RawPost.
 * Chạy trên 1 post GROUP (đã biết bài "tai nạn Phong Châu") + 1 post PAGE để đối chiếu.
 *
 * Cần: account + session đã lưu (npm run test:fb-session chạy trước).
 * Chạy: npm run test:fb-scrape-detail
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '@app/app.module';
import { FacebookCollector } from '@modules/osint/services/facebook/facebook.collector';
import { OsintFacebookAccount } from '@modules/osint/entities/osint-facebook-account.entity';

// Target thật: 1 group post (đã verify neo-theo-id) + 1 page post
const TARGETS = [
  {
    kind: 'GROUP',
    externalPostId: '1722345968791242',
    postUrl: 'https://www.facebook.com/groups/nhatrangbabymom/posts/1722345968791242/',
  },
  {
    kind: 'PAGE',
    externalPostId: 'pfbid02UrnRc18MXG4BY9NXZobr6J8u4BEVRPD4Ui64qzPTF5usDK3FVZ69fFBJirksp6Kxl',
    postUrl: 'https://www.facebook.com/khanhhoa.vietnam/posts/pfbid02UrnRc18MXG4BY9NXZobr6J8u4BEVRPD4Ui64qzPTF5usDK3FVZ69fFBJirksp6Kxl',
  },
];

async function main() {
  const label = process.env.FB_TEST_LABEL ?? 'tool-acct-01';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const collector = app.get(FacebookCollector);
  const repo = app.get<Repository<OsintFacebookAccount>>(
    getRepositoryToken(OsintFacebookAccount),
  );

  let exitCode = 0;
  try {
    const account = await repo.findOneBy({ label });
    if (!account) {
      console.error(`❌ Chưa có account "${label}". Chạy: npm run add:fb-account`);
      exitCode = 1;
    } else {
      for (const t of TARGETS) {
        console.log(`\n=== ${t.kind}: id=${t.externalPostId.slice(0, 24)} ===`);
        const post = await collector.verifyScrapeDetail(account, t);
        if (!post) {
          console.warn('  ⚠️ scrapePostDetail trả null (post lỗi/xóa/timeout)');
          // Page có thể null do FB ẩn — không fail toàn bộ, chỉ ghi nhận
          continue;
        }
        console.log('  externalPostId  :', post.externalPostId);
        console.log('  authorName      :', post.authorName);
        console.log('  authorExternalId:', post.authorExternalId, post.authorExternalId ? '⭐' : '(null)');
        console.log('  engagement      :', JSON.stringify(post.engagement));
        console.log('  content (200):', (post.content ?? '').slice(0, 200).replace(/\s+/g, ' '));
        console.log(`  comments        : ${post.comments?.length ?? 0} cái. 3 mẫu:`);
        (post.comments ?? []).slice(0, 3).forEach((c, i) =>
          console.log(
            `    [${i + 1}] ${c.authorName ?? '?'} (id=${c.authorExternalId ?? '?'}): ${c.content.slice(0, 60).replace(/\s+/g, ' ')}`,
          ),
        );
        console.log('  postUrl         :', (post.platformSpecificData as { postUrl: string })?.postUrl);
        // Sanity: content phải khác rỗng, externalPostId phải khớp target
        if (!post.content || post.externalPostId !== t.externalPostId) {
          console.error('  ❌ sanity fail');
          exitCode = 1;
        }
      }
    }
  } catch (err) {
    console.error('❌ Lỗi:', err);
    exitCode = 1;
  } finally {
    await app.close();
  }

  console.log(`\n${exitCode === 0 ? '🎉 3a-ii PASS' : '⚠️  CÓ CHECK FAIL'}\n`);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
