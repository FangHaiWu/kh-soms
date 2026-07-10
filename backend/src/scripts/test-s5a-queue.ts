/**
 * Test THỰC TẾ S5a QUA HÀNG ĐỢI BullMQ (Redis) — khác test-s5a-pipeline (gọi thẳng handle).
 *
 * Chứng minh trọn luồng async: enqueue 'process-post' vào queue osint-nlp → BullMQ (Redis)
 * → NlpProcessProcessor tự nhả job → ghi osint_post_nlp. Script POLL tới khi status='done'.
 *
 * Chạy:  npm run test:s5a-queue   (cần Postgres + Redis)
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { OsintPost } from '../modules/osint/entities/osint-post.entity';
import { OsintPostNlp } from '../modules/osint/entities/osint-post-nlp.entity';
import { OsintPlatform } from '../modules/osint/entities/osint-platform.entity';
import { OsintAlert } from '../modules/osint/entities/osint-alert.entity';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  const nlpQueue = app.get<Queue>(getQueueToken('osint-nlp'));
  const postRepo = app.get<Repository<OsintPost>>(
    getRepositoryToken(OsintPost),
  );
  const nlpRepo = app.get<Repository<OsintPostNlp>>(
    getRepositoryToken(OsintPostNlp),
  );
  const platformRepo = app.get<Repository<OsintPlatform>>(
    getRepositoryToken(OsintPlatform),
  );
  const alertRepo = app.get<Repository<OsintAlert>>(
    getRepositoryToken(OsintAlert),
  );

  const platform =
    (await platformRepo.findOne({ where: { name: 'web_news' } })) ??
    (await platformRepo.findOne({ where: {} }));
  if (!platform) {
    console.error('❌ Chưa có platform. Seed trước.');
    await app.close();
    return;
  }

  // 1. Nạp post + hàng nlp pending (giống ingest thật làm)
  await postRepo.delete({
    platformId: platform.id,
    externalPostId: 's5a-queue-test',
  });
  const post = await postRepo.save(
    postRepo.create({
      platformId: platform.id,
      externalPostId: 's5a-queue-test',
      content:
        'Thông báo chính thức về tình hình an ninh trật tự trên địa bàn phường trong tuần qua.',
      engagement: { likes: 2 },
    }),
  );
  await nlpRepo.save(
    nlpRepo.create({ postId: post.id, processingStatus: 'pending' }),
  );

  // 2. ĐẨY JOB VÀO QUEUE THẬT (không gọi handle trực tiếp) → BullMQ + Redis lo phần còn lại
  const job = await nlpQueue.add('process-post', { postId: post.id });
  console.log(`\n✅ Đã enqueue job #${job.id} vào queue 'osint-nlp' (Redis).`);
  console.log('   Đang chờ worker tự nhả job...\n');

  // 3. Poll osint_post_nlp tới khi worker xử lý xong (tối đa ~20s)
  let nlp = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    nlp = await nlpRepo.findOne({ where: { postId: post.id } });
    if (
      nlp &&
      (nlp.processingStatus === 'done' || nlp.processingStatus === 'failed')
    ) {
      console.log(`   → Worker xong sau ~${((i + 1) * 500) / 1000}s`);
      break;
    }
  }

  const alerts = await alertRepo
    .createQueryBuilder('a')
    .where('a.source_ref_ids @> ARRAY[:id]::uuid[]', { id: post.id })
    .getMany();

  console.log('─'.repeat(60));
  console.log('  processing_status :', nlp?.processingStatus);
  console.log('  is_notable        :', nlp?.isNotable);
  console.log('  notability_reasons:', JSON.stringify(nlp?.notabilityReasons));
  console.log('  gate_passed       :', nlp?.gatePassed);
  console.log('  signal_features   :', JSON.stringify(nlp?.signalFeatures));
  console.log('  → số alert        :', alerts.length);
  console.log('─'.repeat(60));

  // 4. Dọn sạch
  await alertRepo
    .createQueryBuilder()
    .delete()
    .where('source_ref_ids @> ARRAY[:id]::uuid[]', { id: post.id })
    .execute();
  await postRepo.delete({
    platformId: platform.id,
    externalPostId: 's5a-queue-test',
  });
  console.log('Đã dọn sạch.\n');

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
