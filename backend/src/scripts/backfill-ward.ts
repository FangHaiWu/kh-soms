/**
 * Gán địa bàn ngược cho bài đã thu (S6 Task 9).
 *
 * normalizedContent KHÔNG được lưu trong DB (chỉ contentHash) → normalize lại
 * từ post.content. Normalize là hàm thuần nên chạy lại vô hại.
 *
 * Chỉ gọi thẳng WardMatcher rồi ghi 4 cột địa bàn — KHÔNG chạy lại Gate/Trust/
 * Alert, để backfill không bắn lại alert cho sự kiện cũ hàng tháng.
 *
 * Chạy thử: npx ts-node -r tsconfig-paths/register src/scripts/backfill-ward.ts --dry-run
 * Chạy thật: npx ts-node -r tsconfig-paths/register src/scripts/backfill-ward.ts
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { OsintPostNlp } from '../modules/osint/entities/osint-post-nlp.entity';
import { OsintPost } from '../modules/osint/entities/osint-post.entity';
import { WardMatcherService } from '../modules/geography/services/ward-matcher.service';
import { NormalizeService } from '../modules/osint/services/normalize/normalize.service';

const PAGE = 500;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const nlpRepo: Repository<OsintPostNlp> = app.get(
    getRepositoryToken(OsintPostNlp),
  );
  const postRepo: Repository<OsintPost> = app.get(
    getRepositoryToken(OsintPost),
  );
  const matcher = app.get(WardMatcherService);
  const normalize = app.get(NormalizeService);

  let offset = 0;
  let seen = 0;
  let matched = 0;
  let ambiguous = 0;
  let none = 0;

  for (;;) {
    // Chỉ đụng bài ĐÃ có bản ghi NLP; bài chưa qua worker sẽ được gán khi tới lượt
    const rows = await nlpRepo.find({
      order: { createdAt: 'ASC' },
      skip: offset,
      take: PAGE,
    });
    if (rows.length === 0) break;

    for (const nlp of rows) {
      const post = await postRepo.findOne({ where: { id: nlp.postId } });
      if (!post) continue;
      const { normalizedContent } = normalize.normalize(post.content ?? '');
      const r = await matcher.match(normalizedContent);
      seen++;
      if (r.reason === 'matched') matched++;
      else if (r.reason === 'ambiguous') ambiguous++;
      else none++;

      if (!dryRun) {
        // Idempotent: ghi đè kết quả cũ, chạy lại không nhân đôi
        nlp.wardId = r.wardId;
        nlp.locationText = r.locationText;
        nlp.matchedAlias = r.matchedAlias;
        nlp.locationCandidates =
          r.candidates.length > 0 ? (r.candidates as unknown) : null;
        await nlpRepo.save(nlp);
      }
    }
    offset += rows.length;
    process.stdout.write(`... ${offset}\r`);
  }

  const pct = (n: number) => (seen ? ((n / seen) * 100).toFixed(1) : '0') + '%';
  console.log(
    `\n${dryRun ? '[DRY-RUN] ' : ''}Tổng ${seen} | gán ${matched} (${pct(matched)}) | mơ hồ ${ambiguous} (${pct(ambiguous)}) | không có ${none} (${pct(none)})`,
  );
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
