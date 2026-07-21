/**
 * Verify Chunk 2a: login tài khoản công cụ FB bằng form.
 * Headful (FB_HEADLESS=false) → bạn THẤY Chromium tự gõ email/pass.
 *
 * Luồng: tìm account theo label → giải mã credential → FacebookCollector.verifyLogin().
 * ⚠️ KHÔNG gọi markCheckpoint() — đang test, tránh retire nhầm account (retire sau 3 checkpoint).
 *
 * Cần: đã chạy `npm run add:fb-account` + Postgres + Redis.
 * Chạy: npm run test:fb-login
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '@app/app.module';
import { FacebookAccountManager } from '@modules/osint/services/facebook/facebook-account-manager.service';
import { FacebookCollector } from '@modules/osint/services/facebook/facebook.collector';
import { OsintFacebookAccount } from '@modules/osint/entities/osint-facebook-account.entity';

async function main() {
  const label = process.env.FB_TEST_LABEL ?? 'tool-acct-01';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'], // giữ 'warn' để thấy log debug của collector
  });
  const manager = app.get(FacebookAccountManager);
  const collector = app.get(FacebookCollector);
  const repo = app.get<Repository<OsintFacebookAccount>>(
    getRepositoryToken(OsintFacebookAccount),
  );

  let exitCode = 0;
  try {
    // 1. Tìm account theo label (xác định, không phụ thuộc pickAvailable)
    const acc = await repo.findOneBy({ label });
    if (!acc) {
      console.error(
        `❌ Chưa có account "${label}" trong DB. Chạy: npm run add:fb-account`,
      );
      exitCode = 1;
    } else {
      // 2. Giải mã credential — chỉ ngay trước login, KHÔNG log password
      const { loginIdentifier, password } = await manager.getCredentials(
        acc.id,
      );
      console.log(`🔐 Đăng nhập "${label}" (${loginIdentifier}) ...`);

      // 3. Login bằng form (headful → quan sát được)
      const result = await collector.verifyLogin(loginIdentifier, password);

      // 4. Báo kết quả + gợi ý xử lý
      const note: Record<typeof result, string> = {
        success: '✅ ĐĂNG NHẬP THÀNH CÔNG (cookie c_user có mặt).',
        checkpoint:
          '⚠️  DÍNH CHECKPOINT — FB chặn. Acct cần warm-up thêm / đổi IP (4G dongle).',
        failed:
          '❌ THẤT BẠI — sai credential, dính 2FA, hoặc FB đổi selector form.',
      };
      console.log(`\nKết quả: ${result}\n${note[result]}`);
      if (result !== 'success') exitCode = 1;
    }
  } catch (err) {
    console.error('❌ Lỗi khi chạy verify login:', err);
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
