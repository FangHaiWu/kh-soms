/**
 * Bắt session FB bằng LOGIN TAY (né auto form-login bị FB checkpoint).
 * Mở browser headed → user tự đăng nhập (giải cả checkpoint) → script export storageState → lưu DB.
 *
 * YÊU CẦU: FB_HEADLESS=false (không thì cửa sổ ẩn, không login tay được).
 * Chạy: FB_HEADLESS=false FB_TEST_LABEL=tool-acct-02 npm run capture:fb-session
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
      console.error(`❌ Chưa có account "${label}". Chạy: npm run add:fb-account`);
      exitCode = 1;
    } else {
      const ok = await collector.captureManualSession(account);
      if (ok) {
        // Bắt được session → trả acct về active để được pick lại (gỡ trạng thái checkpoint).
        await repo.update({ id: account.id }, { status: 'active' });
        console.log(`🎉 [${label}] session đã lưu, status='active'.`);
      } else {
        console.error(`⚠️  [${label}] không bắt được session (hết giờ chờ login tay).`);
        exitCode = 1;
      }
    }
  } catch (err) {
    console.error('❌ Lỗi:', err);
    exitCode = 1;
  } finally {
    await app.close();
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
