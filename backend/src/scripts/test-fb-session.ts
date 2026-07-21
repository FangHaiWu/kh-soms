/**
 * Verify Chunk 2b+2c: session reuse.
 * Lần 1: chưa có session → login form → LƯU session (mã hóa).
 * Lần 2: đã có session → isSessionAlive pass → TÁI DÙNG, KHÔNG hiện form login.
 * Cuối: kiểm cột encrypted_session trong DB là ciphertext (không phải JSON thô).
 *
 * Quan sát log collector để phân biệt:
 *   "login thành công"        ← đã phải login form (lần 1)
 *   "dùng lại session đã lưu" ← tái dùng session (lần 2, mong đợi)
 *
 * Cần: account đã add + Postgres + Redis. Chạy: npm run test:fb-session
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '@app/app.module';
import { FacebookCollector } from '@modules/osint/services/facebook/facebook.collector';
import { OsintFacebookAccount } from '@modules/osint/entities/osint-facebook-account.entity';

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
      // ── Lần 1: kỳ vọng login form + lưu session ──
      console.log('\n=== LẦN 1 (kỳ vọng: login form → lưu session) ===');
      const ok1 = await collector.verifyAuth(account);
      console.log(
        `Lần 1: ${ok1 ? '✅ đăng nhập (có c_user)' : '❌ không có c_user'}`,
      );

      // ── Lần 2: kỳ vọng tái dùng session, KHÔNG login form ──
      console.log(
        '\n=== LẦN 2 (kỳ vọng: dùng lại session, KHÔNG login form) ===',
      );
      const ok2 = await collector.verifyAuth(account);
      console.log(
        `Lần 2: ${ok2 ? '✅ đăng nhập (có c_user)' : '❌ không có c_user'}`,
      );

      // ── Kiểm DB: encrypted_session là ciphertext, không phải JSON thô ──
      console.log('\n=== KIỂM DB encrypted_session ===');
      const fresh = await repo.findOneBy({ label });
      const sess = fresh?.encryptedSession ?? '';
      const looksEncrypted =
        sess.length > 0 &&
        !sess.startsWith('{') &&
        sess.split(':').length === 3;
      console.log(
        `encrypted_session: ${looksEncrypted ? '✅ ciphertext (iv:cipher:tag)' : '❌ rỗng/JSON thô'} — ${sess.slice(0, 40)}...`,
      );

      if (!ok1 || !ok2 || !looksEncrypted) exitCode = 1;
    }
  } catch (err) {
    console.error('❌ Lỗi khi verify session:', err);
    exitCode = 1;
  } finally {
    await app.close();
  }

  console.log(
    `\n${exitCode === 0 ? '🎉 CHUNK 2 PASS' : '⚠️  CÓ CHECK FAIL'}\n`,
  );
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
