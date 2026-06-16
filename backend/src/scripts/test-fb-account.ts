/**
 * Smoke test CHẠY THẬT FacebookAccountManager trên Postgres (không mock).
 * Kiểm: create → ciphertext trong DB (KHÔNG plaintext) → pickAvailable →
 *        getCredentials (decrypt khớp) → recordUsage (count++) →
 *        markCheckpoint x3 (checkpoint → retired) → cleanup.
 *
 * Chạy:  npx ts-node -r tsconfig-paths/register src/scripts/test-fb-account.ts
 * (cần Postgres + Redis đang chạy)
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '@app/app.module';
import { FacebookAccountManager } from '@modules/osint/services/facebook/facebook-account-manager.service';
import { OsintFacebookAccount } from '@modules/osint/entities/osint-facebook-account.entity';

// Helper assert nhỏ: in PASS/FAIL, đếm số fail
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`  ${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failed++;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'], // tắt log ồn
  });

  const manager = app.get(FacebookAccountManager);
  const repo = app.get<Repository<OsintFacebookAccount>>(
    getRepositoryToken(OsintFacebookAccount),
  );

  // label duy nhất theo timestamp → chạy lại không đụng UNIQUE(label)
  const label = `test-acct-${Date.now()}`;
  const PLAIN_PW = 'super_secret_pw_!@#_123';
  let createdId: string | null = null;

  try {
    console.log('\n=== 1. create() ===');
    const acc = await manager.create(label, 'tool01@example.com', PLAIN_PW);
    createdId = acc.id;
    check('tạo account, có id', !!acc.id, acc.id);
    check('status mặc định = active', acc.status === 'active');
    check('crawlCountToday mặc định = 0', acc.crawlCountToday === 0);

    console.log('\n=== 2. DB lưu ciphertext, KHÔNG plaintext ===');
    const raw = await repo.findOneBy({ id: createdId });
    check(
      'encrypted_password KHÔNG chứa plaintext',
      !!raw && !raw.encryptedPassword.includes(PLAIN_PW),
    );
    check(
      'ciphertext đúng format iv:cipher:tag (3 phần)',
      !!raw && raw.encryptedPassword.split(':').length === 3,
      raw?.encryptedPassword.slice(0, 40) + '...',
    );

    console.log('\n=== 3. pickAvailable() ===');
    const picked = await manager.pickAvailable();
    check('trả về 1 account active', !!picked && picked.status === 'active');
    check('count < quota (khả dụng)', !!picked && picked.crawlCountToday < 5);

    console.log('\n=== 4. getCredentials() → decrypt khớp ===');
    const cred = await manager.getCredentials(createdId);
    check('password giải mã KHỚP gốc', cred.password === PLAIN_PW);
    check(
      'loginIdentifier đúng',
      cred.loginIdentifier === 'tool01@example.com',
    );

    console.log('\n=== 5. recordUsage() → count tăng ===');
    await manager.recordUsage(createdId);
    const afterUse = await repo.findOneBy({ id: createdId });
    check('crawlCountToday 0 → 1', afterUse?.crawlCountToday === 1);
    check('lastUsedAt được set', !!afterUse?.lastUsedAt);

    console.log('\n=== 6. markCheckpoint() x3 → checkpoint → retired ===');
    await manager.markCheckpoint(createdId);
    let s = await repo.findOneBy({ id: createdId });
    check(
      'lần 1: count=1, status=checkpoint',
      s?.checkpointCount === 1 && s?.status === 'checkpoint',
    );

    await manager.markCheckpoint(createdId);
    s = await repo.findOneBy({ id: createdId });
    check(
      'lần 2: count=2, status=checkpoint',
      s?.checkpointCount === 2 && s?.status === 'checkpoint',
    );

    await manager.markCheckpoint(createdId);
    s = await repo.findOneBy({ id: createdId });
    check(
      'lần 3: count=3, status=RETIRED',
      s?.checkpointCount === 3 && s?.status === 'retired',
    );

    console.log('\n=== 7. account đã retire KHÔNG còn được pick ===');
    // tạo điều kiện: chỉ account test này có thể bị ảnh hưởng — kiểm gián tiếp
    const pickedAfter = await manager.pickAvailable();
    check(
      'pickAvailable KHÔNG trả account đã retire',
      !pickedAfter || pickedAfter.id !== createdId,
    );
  } finally {
    // cleanup: xóa account test dù pass hay fail
    if (createdId) {
      await repo.delete({ id: createdId });
      console.log(`\n🧹 Đã xóa account test ${label}`);
    }
    await app.close();
  }

  console.log(
    `\n${failed === 0 ? '🎉 TẤT CẢ PASS' : `⚠️  ${failed} CHECK FAIL`}\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
