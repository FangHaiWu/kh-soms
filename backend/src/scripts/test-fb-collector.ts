import { NestFactory } from '@nestjs/core';
import { AppModule } from '@app/app.module';
import { FacebookCollector } from '@modules/osint/services/facebook/facebook.collector';

/**
 * Smoke test Chunk 1: FacebookCollector mở Chromium anti-detect.
 * Kỳ vọng: cửa sổ Chromium bật lên (headful) → log navigator.webdriver = false.
 * Chạy: npm run test:fb-collector  (cần Redis chạy vì AppModule boot BullMQ)
 */

async function main() {
  // 1. Boot Nest context (Không LISTEN HTTP) -> có ConfigService đọc .env + DI
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'log'],
  });
  try {
    // 2. Lấy collector ra khỏi DI container (đã inject sẵn ConfigService)
    const collector = app.get(FacebookCollector);
    // 3. Chạy smoke - browser mở/đóng gọn trọng method này
    await collector.smokeTest();
  } finally {
    // 4, Đóng app context (ngắt Redis/DB) - nếu không, tiến trình treo
    await app.close();
  }
  process.exit(0);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
