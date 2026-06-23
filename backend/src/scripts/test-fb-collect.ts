/**
 * Verify Chunk 4: collector.collect() — gói luồng 1 group/page FB end-to-end.
 * Gọi THẲNG collect() (bỏ qua Bull/Redis/cron) để kiểm tra code mới ít rủi ro acct nhất.
 *
 * AN TOÀN ACCT: đặt FB_MAX_POSTS_PER_RUN=2 + FB_HEADLESS=false, CHẠY 1 LẦN RỒI NGHỈ.
 * Cần: account đã capture session tay (npm run capture:fb-session) + status='active'.
 * Chạy: npm run test:fb-collect
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '@app/app.module';
import { FacebookCollector } from '@modules/osint/services/facebook/facebook.collector';
import { OsintFacebookAccount } from '@modules/osint/entities/osint-facebook-account.entity';

// Entry URL = trang feed group/page (KHÔNG phải permalink) — collect tự scrape danh sách post ID.
// Override qua biến môi trường FB_ENTRY_URL nếu muốn test group/page khác.
const ENTRY_URL =
  process.env.FB_ENTRY_URL ?? 'https://www.facebook.com/beatkhanhhoa24h';

async function main() {
  // Mặc định acct-02 (memory: acct-02 có session login-tay verified 19/06)
  const label = process.env.FB_TEST_LABEL ?? 'tool-acct-02';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
  const collector = app.get(FacebookCollector);
  const repo = app.get<Repository<OsintFacebookAccount>>(
    getRepositoryToken(OsintFacebookAccount),
  );

  let exitCode = 0;
  try {
    const account = await repo.findOneBy({ label });
    if (!account) {
      console.error(
        `❌ Chưa có account "${label}". Chạy: npm run add:fb-account`,
      );
      exitCode = 1;
    } else if (account.status !== 'active') {
      // Acct checkpoint/retired → collect sẽ thất bại hoặc đốt acct. Dừng sớm.
      console.error(
        `❌ Account "${label}" đang status='${account.status}' (cần 'active'). ` +
          `Chạy: npm run capture:fb-session để hồi session.`,
      );
      exitCode = 1;
    } else {
      console.log(`\n=== collect() acct=${label} entry=${ENTRY_URL} ===`);
      const result = await collector.collect(account, ENTRY_URL);

      console.log('  ok        :', result.ok);
      console.log('  checkpoint :', result.checkpoint ?? '(none)');
      console.log('  error      :', result.error ?? '(none)');
      console.log('  posts      :', result.posts.length);

      // In gọn từng post + số comment để mắt thường verify
      result.posts.forEach((p, i) => {
        console.log(
          `\n  [${i + 1}] id=${p.externalPostId} author=${p.authorName ?? '?'} ` +
            `(extId=${p.authorExternalId ?? 'null'})`,
        );
        console.log('      engagement:', JSON.stringify(p.engagement));
        console.log(
          '      content   :',
          (p.content ?? '').slice(0, 120).replace(/\s+/g, ' '),
        );
        console.log('      comments  :', p.comments?.length ?? 0, 'cái');
      });

      // Sanity: collect phải ok + lấy được ≥1 post có content
      const hasContent = result.posts.some((p) => !!p.content);
      if (!result.ok || result.posts.length === 0 || !hasContent) {
        console.error('\n  ❌ sanity fail (ok/posts/content)');
        exitCode = 1;
      }
    }
  } catch (err) {
    console.error('❌ Lỗi:', err);
    exitCode = 1;
  } finally {
    await app.close();
  }

  console.log(
    `\n${exitCode === 0 ? '🎉 Chunk 4 collect PASS' : '⚠️  CÓ CHECK FAIL'}\n`,
  );
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
