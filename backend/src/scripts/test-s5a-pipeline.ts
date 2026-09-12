/**
 * Smoke test E2E cho S5a pipeline spine (KHÔNG mock — chạy service thật trên Postgres).
 *
 * Nạp 2 post giả (1 "đáng chú ý", 1 rác) → gọi thẳng NlpProcessProcessor.handle()
 * (bỏ qua BullMQ) → in osint_post_nlp + alert sinh ra → dọn sạch dữ liệu test.
 *
 * Chạy:  npx ts-node -r tsconfig-paths/register src/scripts/test-s5a-pipeline.ts
 * (cần Postgres đang chạy; Redis không bắt buộc vì gọi handle trực tiếp)
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { NlpProcessProcessor } from '../modules/osint/services/nlp-process/nlp-process.processor';
import { OsintPost } from '../modules/osint/entities/osint-post.entity';
import { OsintPostNlp } from '../modules/osint/entities/osint-post-nlp.entity';
import { OsintPlatform } from '../modules/osint/entities/osint-platform.entity';
import { OsintAlert } from '../modules/osint/entities/osint-alert.entity';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  const processor = app.get(NlpProcessProcessor);
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

  // Dùng platform trust cao (web_news=5) → tín hiệu high_source_trust bảo đảm "notable"
  // mà không phụ thuộc keyword nào đã seed.
  const platform =
    (await platformRepo.findOne({ where: { name: 'web_news' } })) ??
    (await platformRepo.findOne({ where: {} }));
  if (!platform) {
    console.error('❌ Chưa có platform nào trong DB — seed platform trước.');
    await app.close();
    return;
  }
  console.log(
    `\nPlatform test: ${platform.name} (trust=${platform.trustLevel})\n`,
  );

  const cases = [
    {
      tag: 'NOTABLE (nguồn trust cao)',
      externalPostId: 's5a-smoke-notable',
      content:
        'Thông báo chính thức về tình hình an ninh trật tự trên địa bàn phường trung tâm trong tuần qua.',
    },
    {
      tag: 'JUNK (chỉ emoji)',
      externalPostId: 's5a-smoke-junk',
      content: '👍👍👍🔥',
    },
  ];

  const createdPostIds: string[] = [];

  for (const c of cases) {
    // dọn lần chạy trước nếu còn
    await postRepo.delete({
      platformId: platform.id,
      externalPostId: c.externalPostId,
    });

    const saved = await postRepo.save(
      postRepo.create({
        platformId: platform.id,
        externalPostId: c.externalPostId,
        content: c.content,
        engagement: { likes: 1 },
      }),
    );
    createdPostIds.push(saved.id);
    await nlpRepo.save(
      nlpRepo.create({ postId: saved.id, processingStatus: 'pending' }),
    );

    // Gọi thẳng worker (bỏ qua queue)
    await processor.handle({ data: { postId: saved.id } } as any);

    const nlp = await nlpRepo.findOne({ where: { postId: saved.id } });
    const alerts = await alertRepo
      .createQueryBuilder('a')
      .where('a.source_ref_ids @> ARRAY[:id]::uuid[]', { id: saved.id })
      .getMany();

    console.log('─'.repeat(72));
    console.log(`${c.tag}`);
    console.log('  processing_status :', nlp?.processingStatus);
    console.log('  is_notable        :', nlp?.isNotable);
    console.log(
      '  notability_reasons:',
      JSON.stringify(nlp?.notabilityReasons),
    );
    console.log('  gate_passed       :', nlp?.gatePassed);
    console.log('  credibility       :', nlp?.credibility);
    console.log('  signal_features   :', JSON.stringify(nlp?.signalFeatures));
    console.log('  → số alert sinh ra:', alerts.length);
  }

  // Dọn sạch: xóa post test (cascade xóa osint_post_nlp) + alert test
  console.log('\n' + '='.repeat(72));
  for (const id of createdPostIds) {
    await alertRepo
      .createQueryBuilder()
      .delete()
      .where('source_ref_ids @> ARRAY[:id]::uuid[]', { id })
      .execute();
  }
  await postRepo.delete({
    platformId: platform.id,
    externalPostId: 's5a-smoke-notable',
  });
  await postRepo.delete({
    platformId: platform.id,
    externalPostId: 's5a-smoke-junk',
  });
  console.log('Đã dọn sạch dữ liệu test.\n');

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
