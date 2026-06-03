/**
 * Script CHẠY THẬT pipeline NLP + Slang trên dữ liệu DB (không phải unit test mock).
 * Mục đích: XEM output thực tế của NlpService + SlangDictionaryService trên 8 bài thật.
 *
 * Chạy:  npx ts-node src/scripts/test-pipeline.ts
 * (cần Postgres + Redis đang chạy)
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { NlpService } from '../modules/osint/services/nlp/nlp.service';
import { SlangDictionaryService } from '../modules/osint/services/slang-dictionary.service';
import { AlertService } from '../modules/osint/services/alert/alert.service';
import { OsintArticle } from '../modules/osint/entities/osint-article.entity';

async function main() {
  // Bật Nest context (không mở HTTP server) — chỉ để lấy service ra khỏi DI container
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'], // tắt log ồn, chỉ giữ error
  });

  const nlp = app.get(NlpService);
  const slang = app.get(SlangDictionaryService);
  const alertService = app.get(AlertService);
  const articleRepo = app.get<Repository<OsintArticle>>(
    getRepositoryToken(OsintArticle),
  );

  const articles = await articleRepo.find();
  console.log(`\n=== Phân tích ${articles.length} bài THẬT trong DB ===\n`);

  let relevantCount = 0;
  let slangCount = 0;
  let alertCreated = 0;
  let alertSkipped = 0;

  for (const a of articles) {
    const nlpResult = await nlp.analyzeArticle(a.title, a.content);
    const slangResult = await slang.detectSlang(a.title, a.content);
    if (nlpResult.isRelevant) relevantCount++;
    if (slangResult.hasSlang) slangCount++;

    // Gọi AlertService THẬT → chạy chuỗi SQL dedup @> ARRAY[...]::uuid[] trên Postgres
    const alert = await alertService.createAlertForArticle(
      a.id,
      a.title,
      nlpResult,
      slangResult,
    );

    console.log('─'.repeat(72));
    console.log((nlpResult.isRelevant ? '🔴 ' : '⚪ ') + a.title);
    console.log('   isRelevant      :', nlpResult.isRelevant);
    console.log(
      '   matchedKeywords :',
      nlpResult.matchedKeywords.join(', ') || '(không)',
    );
    console.log('   topPriority     :', nlpResult.topKeywordPriority);
    console.log('   hasSlang        :', slangResult.hasSlang);
    console.log(
      '   detectedSlang   :',
      slangResult.detectedSlang
        .map((s) => `${s.term} (${s.meaning})`)
        .join('; ') || '(không)',
    );
    if (alert) {
      alertCreated++;
      console.log(
        `   ✅ ALERT TẠO   : [${alert.severity}] ${alert.alertType} — ${alert.description}`,
      );
    } else if (nlpResult.isRelevant || slangResult.hasSlang) {
      alertSkipped++;
      console.log('   ⏭️  ALERT BỎ QUA: đã có trong 1h (dedup) hoặc không đủ điều kiện');
    }
  }

  console.log('─'.repeat(72));
  console.log(
    `\nTỔNG KẾT: ${relevantCount}/${articles.length} bài liên quan ANTT, ${slangCount} bài có từ lóng`,
  );
  console.log(
    `ALERT: tạo mới ${alertCreated}, bỏ qua ${alertSkipped} (dedup/không đủ điều kiện)\n`,
  );

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
