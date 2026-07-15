import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OsintPost } from '@modules/osint/entities/osint-post.entity';
import { OsintActor } from '@modules/osint/entities/osint-actor.entity';
import { OsintActorStat } from '@modules/osint/entities/osint-actor-stat.entity';
import { aggregatePosts, isRepeatOffender, PostForActor } from './actor-aggregator';

const WINDOW_DAYS = 30;

/**
 * ActorAggregateJob — cron gộp post theo chủ thể (Lớp 2 CNC).
 *
 * Flow: load post+nlp+group trong cửa sổ 30 ngày → map PostForActor → aggregatePosts (thuần)
 * → upsert osint_actor + osint_actor_stat. Đánh dấu is_repeat_offender khi ≥ ngưỡng bài CNC.
 * Idempotent: recompute đè theo (actor_type, actor_key) + (actor_id, window_days).
 */
@Injectable()
export class ActorAggregateJob {
  private readonly logger = new Logger(ActorAggregateJob.name);
  private readonly threshold = Number(process.env.ACTOR_REPEAT_THRESHOLD) || 3;

  constructor(
    @InjectRepository(OsintPost) private postRepo: Repository<OsintPost>,
    @InjectRepository(OsintActor) private actorRepo: Repository<OsintActor>,
    @InjectRepository(OsintActorStat)
    private statRepo: Repository<OsintActorStat>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM) // sau EWM 2AM
  async handleCron() {
    const n = await this.run();
    this.logger.log(
      `ActorAggregate: cập nhật ${n} actor (cửa sổ ${WINDOW_DAYS} ngày)`,
    );
  }

  /** Gộp post trong cửa sổ → upsert actor + stat. Trả số actor cập nhật. */
  async run(): Promise<number> {
    const since = new Date(Date.now() - WINDOW_DAYS * 864e5);

    // 1. Load post + nlp + group trong cửa sổ
    const rows = await this.postRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.nlp', 'nlp')
      .leftJoinAndSelect('p.group', 'g')
      .where('p.created_at >= :since', { since })
      .getMany();

    // 2. Map sang PostForActor (chỉ field cần cho gộp)
    const posts: PostForActor[] = rows.map((p: any) => ({
      groupId: p.groupId ?? null,
      groupName: p.group?.name ?? null,
      platformId: p.platformId ?? null,
      authorExternalId: p.authorExternalId ?? null,
      authorName: p.authorName ?? null,
      matchedCategories: p.nlp?.matchedCategories ?? null,
      isNotable: p.nlp?.isNotable ?? false,
      indicators: p.nlp?.indicators ?? null,
      createdAt: p.createdAt,
    }));

    // 3. Gộp thuần → map actor
    const aggMap = aggregatePosts(posts);

    // 4. Upsert từng actor + stat
    let count = 0;
    for (const agg of aggMap.values()) {
      // 4a. Upsert actor theo (actor_type, actor_key)
      let actor = await this.actorRepo.findOne({
        where: { actorType: agg.actorType, actorKey: agg.actorKey },
      });
      if (!actor) {
        actor = this.actorRepo.create({
          actorType: agg.actorType,
          actorKey: agg.actorKey,
          displayName: agg.displayName,
          platformId: agg.platformId,
          firstSeen: agg.lastPostAt,
        });
      }
      actor.displayName = agg.displayName ?? actor.displayName;
      actor.lastSeen = agg.lastPostAt;
      actor = await this.actorRepo.save(actor);

      // 4b. Upsert stat theo (actor_id, window_days)
      let stat = await this.statRepo.findOne({
        where: { actorId: actor.id, windowDays: WINDOW_DAYS },
      });
      if (!stat) {
        stat = this.statRepo.create({ actorId: actor.id, windowDays: WINDOW_DAYS });
      }
      stat.postCount = agg.postCount;
      stat.notableCount = agg.notableCount;
      stat.categoryCounts = agg.categoryCounts;
      stat.distinctIndicators = agg.indicatorSet.size;
      stat.lastPostAt = agg.lastPostAt;
      stat.isRepeatOffender = isRepeatOffender(agg.categoryCounts, this.threshold);
      stat.computedAt = new Date();
      await this.statRepo.save(stat);
      count++;
    }
    return count;
  }
}
