/**
 * Chạy ActorAggregateJob 1 lần trên dữ liệu thật (Lớp 2 CNC) — KHÔNG chờ cron 3AM.
 * Dùng createApplicationContext → không bind port 3000 (tránh EADDRINUSE với backend dev).
 *
 * Chạy:  npx ts-node -r tsconfig-paths/register src/scripts/run-actor-aggregate.ts
 * (cần Postgres + Redis đang chạy)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ActorAggregateJob } from '../modules/osint/services/actor/actor-aggregate.job';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const job = app.get(ActorAggregateJob);
  const n = await job.run();
  console.log(`✅ ActorAggregateJob: cập nhật ${n} actor (cửa sổ 30 ngày)`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
