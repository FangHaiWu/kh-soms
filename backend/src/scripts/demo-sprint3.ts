/**
 * DEMO SPRINT 3 — RSS + Telegram → hợp nhất vào osint_posts (chạy THẬT, không mock).
 *
 * Chứng minh kết quả cuối Sprint 3:
 *   1. Crawl THẬT 2 channel Telegram public qua t.me/s (không đăng nhập).
 *   2. Hợp nhất bài RSS đã có (osint_articles) vào cùng bảng osint_posts.
 *   3. Cả 2 nguồn đi qua cùng pipeline NLP → Slang → Alert.
 *   4. Query osint_posts in báo cáo: thống kê theo platform + post nóng nhất + alert.
 *
 * Chạy:  npm run demo:sprint3   (cần Postgres + Redis đang chạy)
 */
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';

import { OsintPlatform } from '../modules/osint/entities/osint-platform.entity';
import { OsintGroup } from '../modules/osint/entities/osint-group.entity';
import { OsintPost } from '../modules/osint/entities/osint-post.entity';
import { OsintArticle } from '../modules/osint/entities/osint-article.entity';
import { TelegramPublicCollector } from '../modules/osint/services/collectors/telegram-public.collector';
import {
  PostIngestService,
  IngestSummary,
} from '../modules/osint/services/ingest/post-ingest.service';
import { RawPost } from '../modules/osint/services/collectors/raw-post.interface';

// Helper: chờ ms — dùng để giữ rate limit ≤ 1 req/s/domain (ràng buộc pháp lý OSINT)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'], // tắt log ồn, chỉ giữ error
  });

  // Lấy service + repo ra khỏi DI container
  const collector = app.get(TelegramPublicCollector);
  const ingest = app.get(PostIngestService);
  const platformRepo = app.get<Repository<OsintPlatform>>(
    getRepositoryToken(OsintPlatform),
  );
  const groupRepo = app.get<Repository<OsintGroup>>(
    getRepositoryToken(OsintGroup),
  );
  const postRepo = app.get<Repository<OsintPost>>(
    getRepositoryToken(OsintPost),
  );
  const articleRepo = app.get<Repository<OsintArticle>>(
    getRepositoryToken(OsintArticle),
  );

  console.log(
    '\n========== DEMO SPRINT 3 — RSS + TELEGRAM → osint_posts ==========\n',
  );

  // ---------------------------------------------------------------------------
  // PHẦN 1: TELEGRAM — crawl thật qua t.me/s
  // ---------------------------------------------------------------------------
  const tgPlatform = await platformRepo.findOne({
    where: { name: 'telegram' },
  });
  if (!tgPlatform) throw new Error('Thiếu platform telegram — chạy seed trước');

  // Lấy các group telegram (seed Sprint 2). Kích hoạt để demo (adapter Sprint 3 đã sẵn sàng).
  const tgGroups = await groupRepo.find({
    where: { platformId: tgPlatform.id },
  });

  console.log(`🔵 TELEGRAM: ${tgGroups.length} channel sẽ crawl qua t.me/s\n`);
  const tgTotals: IngestSummary = {
    collected: 0,
    skipped: 0,
    relevant: 0,
    alertsCreated: 0,
  };

  for (const group of tgGroups) {
    // external_group_id = username channel (vd "photvietnam")
    const channel = group.externalGroupId;
    const result = await collector.collect(channel);
    if (!result.ok) {
      console.log(`   ❌ ${channel}: ${result.error}`);
      continue;
    }
    // Đánh dấu group đã active + cập nhật last_crawled_at (chứng tỏ adapter hoạt động)
    group.isActive = true;
    group.lastCrawledAt = new Date();
    await groupRepo.save(group);

    const s = await ingest.ingest(result.posts, {
      platformId: tgPlatform.id,
      crawlType: tgPlatform.crawlerType,
      groupId: group.id,
    });
    tgTotals.collected += s.collected;
    tgTotals.skipped += s.skipped;
    tgTotals.relevant += s.relevant;
    tgTotals.alertsCreated += s.alertsCreated;
    console.log(
      `   ✅ ${group.name} (@${channel}): +${s.collected} mới, ${s.skipped} trùng, ` +
        `${s.relevant} liên quan ANTT, ${s.alertsCreated} alert`,
    );
    await sleep(1500); // giữ ≥1s giữa các request tới cùng domain t.me
  }

  // ---------------------------------------------------------------------------
  // PHẦN 2: RSS — hợp nhất bài báo đã crawl (osint_articles) vào osint_posts
  // ---------------------------------------------------------------------------
  const rssPlatform = await platformRepo.findOne({ where: { name: 'rss' } });
  if (!rssPlatform) throw new Error('Thiếu platform rss — chạy seed trước');

  // Lấy tối đa 30 bài RSS gần nhất để minh hoạ hợp nhất (KHÔNG re-crawl, dùng data sẵn có)
  const articles = await articleRepo.find({ take: 30 });
  console.log(
    `\n🟢 RSS: hợp nhất ${articles.length} bài từ osint_articles → osint_posts\n`,
  );

  // Map osint_articles → RawPost. external_post_id = id bài; source_ref_ids truy vết về bài gốc.
  const rssRaw: RawPost[] = articles.map((a) => ({
    externalPostId: a.id,
    externalGroupId: null, // RSS không có khái niệm group
    authorName: a.author || null,
    content: `${a.title}\n${a.content ?? ''}`.trim(),
    publishedAt: a.publishedAt,
    sourceRefIds: [a.id],
    platformSpecificData: { url: a.url },
  }));

  const rssSummary = await ingest.ingest(rssRaw, {
    platformId: rssPlatform.id,
    crawlType: rssPlatform.crawlerType,
    groupId: null,
  });
  console.log(
    `   ✅ RSS: +${rssSummary.collected} mới, ${rssSummary.skipped} trùng, ` +
      `${rssSummary.relevant} liên quan ANTT, ${rssSummary.alertsCreated} alert`,
  );

  // ---------------------------------------------------------------------------
  // PHẦN 3: BÁO CÁO — query osint_posts để chứng minh dữ liệu đã nằm trong DB
  // ---------------------------------------------------------------------------
  console.log('\n================== BÁO CÁO osint_posts ==================\n');

  // Thống kê theo platform (join để lấy tên platform)
  const byPlatform = await postRepo
    .createQueryBuilder('p')
    .innerJoin('p.platform', 'pl')
    .select('pl.display_name', 'platform')
    .addSelect('COUNT(*)', 'total')
    .addSelect('SUM(CASE WHEN p.is_relevant THEN 1 ELSE 0 END)', 'relevant')
    .groupBy('pl.display_name')
    .getRawMany();

  console.log('📊 Tổng post theo nền tảng:');
  for (const row of byPlatform) {
    console.log(
      `   • ${row.platform}: ${row.total} post (${row.relevant} liên quan ANTT)`,
    );
  }

  // Top 5 post rủi ro cao nhất (risk_score giảm dần) — bằng chứng pipeline NLP đã chấm điểm
  const topRisk = await postRepo.find({
    where: { isRelevant: true },
    order: { riskScore: 'DESC' },
    take: 5,
  });

  console.log('\n🔥 Top post liên quan ANTT (rủi ro cao nhất):');
  if (topRisk.length === 0) {
    console.log('   (chưa có post nào dính keyword ANTT trong mẻ này)');
  }
  for (const p of topRisk) {
    const snippet = p.content.replace(/\s+/g, ' ').slice(0, 90);
    console.log(`   [risk ${p.riskScore}] ${snippet}…`);
    console.log(`        keywords: ${p.keywords?.join(', ') || '(none)'}`);
  }

  console.log('\n========================================================');
  console.log(
    `TELEGRAM: +${tgTotals.collected} post mới | RSS: +${rssSummary.collected} post mới | ` +
      `alert mới: ${tgTotals.alertsCreated + rssSummary.alertsCreated}`,
  );
  console.log('========================================================\n');

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
