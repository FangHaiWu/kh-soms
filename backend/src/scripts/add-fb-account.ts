/**
 * Script MỘT-LẦN: đưa 1 tài khoản công cụ FB thật vào DB (password mã hóa AES-256).
 * Đọc credential từ .env (KHÔNG hardcode, KHÔNG commit): FB_TEST_LOGIN / FB_TEST_PASSWORD.
 * Idempotent theo label → chạy lại không tạo trùng (tránh lỗi UNIQUE(label)).
 *
 * Chuẩn bị .env:
 *   FB_TEST_LABEL=tool-acct-01     # tùy chọn, mặc định tool-acct-01
 *   FB_TEST_LOGIN=email_hoac_sdt
 *   FB_TEST_PASSWORD=mat_khau
 *
 * Chạy: npm run add:fb-account   (cần Postgres chạy)
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '@app/app.module';
import { FacebookAccountManager } from '@modules/osint/services/facebook/facebook-account-manager.service';
import { OsintFacebookAccount } from '@modules/osint/entities/osint-facebook-account.entity';

async function main() {
  const label = process.env.FB_TEST_LABEL ?? 'tool-acct-01';
  const loginId = process.env.FB_TEST_LOGIN;
  const password = process.env.FB_TEST_PASSWORD;

  // Fail-fast nếu thiếu cred → tránh tạo account rỗng không login được
  if (!loginId || !password) {
    console.error(
      '❌ Thiếu FB_TEST_LOGIN / FB_TEST_PASSWORD trong .env. Khai báo rồi chạy lại.',
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const manager = app.get(FacebookAccountManager);
  const repo = app.get<Repository<OsintFacebookAccount>>(
    getRepositoryToken(OsintFacebookAccount),
  );

  let exitCode = 0;
  try {
    // Label đã tồn tại → XÓA rồi tạo lại theo .env (để .env là nguồn sự thật khi sửa credential).
    // Tránh lỗi UNIQUE(label) + đảm bảo loginIdentifier/password trong DB khớp .env.
    const existing = await repo.findOneBy({ label });
    if (existing) {
      await repo.delete({ id: existing.id });
      console.log(`♻️  Account "${label}" đã tồn tại → xóa, tạo lại theo .env.`);
    }
    const acc = await manager.create(label, loginId, password);
    console.log(
      `✅ Account "${label}" id=${acc.id} (loginId=${loginId}, password đã mã hóa AES-256).`,
    );
  } catch (err) {
    console.error('❌ Lỗi khi tạo account:', err);
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
