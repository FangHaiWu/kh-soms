/**
 * Verify Chunk 3a-i: scrapeGroupPostIds — cuộn feed → thu danh sách {externalPostId, postUrl} distinct.
 * Chạy trên CẢ page lẫn group để chứng minh 1 hàm dùng chung.
 *
 * Cần: account đã add + session (npm run test:fb-session chạy trước) + Postgres + Redis.
 * Chạy: npm run test:fb-scrape-ids
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '@app/app.module';
import { FacebookCollector } from '@modules/osint/services/facebook/facebook.collector';
import { OsintFacebookAccount } from '@modules/osint/entities/osint-facebook-account.entity';

// Hai mục tiêu thật để đối chiếu: 1 page + 1 group
const TARGETS = [
  { kind: 'PAGE', url: 'https://www.facebook.com/khanhhoa.vietnam' },
  { kind: 'GROUP', url: 'https://www.facebook.com/groups/928673574825156' },
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
      console.error(
        `❌ Chưa có account "${label}". Chạy: npm run add:fb-account`,
      );
      exitCode = 1;
    } else {
      for (const t of TARGETS) {
        console.log(`\n=== ${t.kind}: ${t.url} ===`);
        const list = await collector.verifyScrapeIds(account, t.url);
        console.log(`→ thu ${list.length} post distinct. 3 mẫu đầu:`);
        list
          .slice(0, 3)
          .forEach((p, i) =>
            console.log(
              `  [${i + 1}] id=${p.externalPostId.slice(0, 24)}  url=${p.postUrl}`,
            ),
          );
        if (list.length === 0) {
          console.warn(
            '  ⚠️ KHÔNG thu được post nào — kiểm selector / session.',
          );
          exitCode = 1;
        }
      }
    }
  } catch (err) {
    console.error('❌ Lỗi khi scrape ids:', err);
    exitCode = 1;
  } finally {
    await app.close();
  }

  console.log(`\n${exitCode === 0 ? '🎉 3a-i PASS' : '⚠️  CÓ CHECK FAIL'}\n`);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
