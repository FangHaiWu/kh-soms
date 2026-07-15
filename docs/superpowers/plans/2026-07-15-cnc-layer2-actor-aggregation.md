# CNC Lớp 2 — Actor Aggregation Implementation Plan

> **Mô hình:** hướng CNC → Claude code trực tiếp, TDD phần thuần. Checkbox `- [ ]`.

**Goal:** Gộp post theo chủ thể (group/account), đếm bài CNC theo category trong cửa sổ 30 ngày, đánh dấu "tái phạm" (≥3/30d), xếp hạng — phát hiện tài khoản/kênh hay đăng CNC.

**Architecture:** Hàm thuần `resolveActors` + `aggregatePosts` (unit-test không DB) → `ActorAggregateJob` (cron, upsert `osint_actor`/`osint_actor_stat`) → endpoint đọc `GET /osint/actors`.

**Tech Stack:** NestJS, TypeORM, @nestjs/schedule (cron), jest.

**Spec:** `docs/superpowers/specs/2026-07-15-cnc-layer2-actor-aggregation-design.md`

## Global Constraints

- **Đếm minh bạch, không trọng số chủ quan** (triết lý S5a): xếp hạng bằng count, feature phụ chỉ lưu.
- **1 post → cả group-actor lẫn account-actor** (nếu có groupId/authorExternalId).
- **Chỉ nhóm CNC** vào `category_counts`: `lua-dao, mua-ban-dlcn, tan-cong-ma-doc, co-bac-ca-do, tin-dung-den, deepfake-gia-mao, rua-tien, kich-dong-xuyen-tac`.
- **Ngưỡng tái phạm mặc định 3** bài CNC/30 ngày (đọc env `ACTOR_REPEAT_THRESHOLD`, default 3).
- **RSS/web tự loại** (group_id/author null → 0 actor) — không cần lọc riêng.
- Idempotent job: upsert theo (actor_type, actor_key) + (actor_id, window_days).
- Comment tiếng Việt cho logic nghiệp vụ.

## File Structure

- Create: `backend/database/migrations/009-cnc-layer2-actor.sql`
- Create: `backend/src/modules/osint/entities/osint-actor.entity.ts`
- Create: `backend/src/modules/osint/entities/osint-actor-stat.entity.ts`
- Create: `backend/src/modules/osint/services/actor/actor-aggregator.ts` — thuần: hằng CNC, `resolveActors`, `aggregatePosts`, `isRepeatOffender`.
- Create: `backend/src/modules/osint/services/actor/actor-aggregator.spec.ts`
- Create: `backend/src/modules/osint/services/actor/actor-aggregate.job.ts` — cron + upsert.
- Create: `backend/src/modules/osint/services/actor/actor-aggregate.job.spec.ts`
- Modify: `backend/src/modules/osint/osint.service.ts` — `getActors(query)`.
- Modify: `backend/src/modules/osint/osint.controller.ts` — `GET actors`.
- Modify: `backend/src/modules/osint/osint.module.ts` — entities forFeature + provider job.

---

## Task 1: Schema — migration 009 + 2 entity

**Files:**
- Create: `backend/database/migrations/009-cnc-layer2-actor.sql`
- Create: `backend/src/modules/osint/entities/osint-actor.entity.ts`
- Create: `backend/src/modules/osint/entities/osint-actor-stat.entity.ts`

**Interfaces:**
- Produces: entity `OsintActor` (cột: id, actorType, actorKey, displayName, platformId, firstSeen, lastSeen, meta) + `OsintActorStat` (actorId, windowDays, postCount, notableCount, categoryCounts, distinctIndicators, lastPostAt, isRepeatOffender, computedAt). Task 3/4 dùng.

- [ ] **Step 1: Viết migration** `009-cnc-layer2-actor.sql`

```sql
-- Lớp 2 CNC: bảng chủ thể (actor) + thống kê gộp theo cửa sổ
CREATE TABLE IF NOT EXISTS osint.osint_actor (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_type   varchar(20) NOT NULL,
  actor_key    varchar(300) NOT NULL,
  display_name varchar(300),
  platform_id  uuid,
  first_seen   timestamptz,
  last_seen    timestamptz,
  meta         jsonb,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  CONSTRAINT uq_actor UNIQUE (actor_type, actor_key)
);
CREATE TABLE IF NOT EXISTS osint.osint_actor_stat (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id uuid NOT NULL REFERENCES osint.osint_actor(id) ON DELETE CASCADE,
  window_days int NOT NULL,
  post_count int NOT NULL DEFAULT 0,
  notable_count int NOT NULL DEFAULT 0,
  category_counts jsonb,
  distinct_indicators int NOT NULL DEFAULT 0,
  last_post_at timestamptz,
  is_repeat_offender boolean NOT NULL DEFAULT false,
  computed_at timestamptz DEFAULT now(),
  CONSTRAINT uq_actor_stat UNIQUE (actor_id, window_days)
);
```

- [ ] **Step 2: Áp migration DB thật**

Run: `docker exec -i postgres psql -U postgres -d kh_soms < backend/database/migrations/009-cnc-layer2-actor.sql`
Expected: `CREATE TABLE` x2 (chạy lại: NOTICE already exists, không lỗi).

- [ ] **Step 3: Viết entity `osint-actor.entity.ts`**

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'osint_actor', schema: 'osint' })
export class OsintActor {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('varchar', { length: 20, name: 'actor_type' }) actorType: string; // group|account|domain|fingerprint
  @Column('varchar', { length: 300, name: 'actor_key' }) actorKey: string;
  @Column('varchar', { length: 300, name: 'display_name', nullable: true }) displayName: string | null;
  @Column('uuid', { name: 'platform_id', nullable: true }) platformId: string | null;
  @Column('timestamptz', { name: 'first_seen', nullable: true }) firstSeen: Date | null;
  @Column('timestamptz', { name: 'last_seen', nullable: true }) lastSeen: Date | null;
  @Column('jsonb', { nullable: true }) meta: Record<string, unknown> | null;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' }) updatedAt: Date;
}
```

- [ ] **Step 4: Viết entity `osint-actor-stat.entity.ts`**

```typescript
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'osint_actor_stat', schema: 'osint' })
export class OsintActorStat {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid', { name: 'actor_id' }) actorId: string;
  @Column('int', { name: 'window_days' }) windowDays: number;
  @Column('int', { name: 'post_count', default: 0 }) postCount: number;
  @Column('int', { name: 'notable_count', default: 0 }) notableCount: number;
  @Column('jsonb', { name: 'category_counts', nullable: true }) categoryCounts: Record<string, number> | null;
  @Column('int', { name: 'distinct_indicators', default: 0 }) distinctIndicators: number;
  @Column('timestamptz', { name: 'last_post_at', nullable: true }) lastPostAt: Date | null;
  @Column('boolean', { name: 'is_repeat_offender', default: false }) isRepeatOffender: boolean;
  @Column('timestamptz', { name: 'computed_at', default: () => 'now()' }) computedAt: Date;
}
```

- [ ] **Step 5: Đăng ký entity trong `osint.module.ts`**

Thêm `OsintActor, OsintActorStat` vào import + mảng `TypeOrmModule.forFeature([...])`.

- [ ] **Step 6: Build**

Run: `cd backend && npx tsc --noEmit`
Expected: sạch.

- [ ] **Step 7: Commit**

```bash
git add backend/database/migrations/009-cnc-layer2-actor.sql backend/src/modules/osint/entities/osint-actor.entity.ts backend/src/modules/osint/entities/osint-actor-stat.entity.ts backend/src/modules/osint/osint.module.ts
git commit -m "feat(osint): L2 schema — osint_actor + osint_actor_stat (migration 009 + entity)"
```

---

## Task 2: Logic thuần — resolveActors + aggregatePosts + isRepeatOffender

**Files:**
- Create: `backend/src/modules/osint/services/actor/actor-aggregator.ts`
- Create: `backend/src/modules/osint/services/actor/actor-aggregator.spec.ts`

**Interfaces:**
- Produces:
  ```typescript
  export const CNC_CATEGORIES: Set<string>;
  export interface PostForActor {
    groupId: string | null; groupName: string | null;
    platformId: string | null; authorExternalId: string | null; authorName: string | null;
    matchedCategories: string[] | null; isNotable: boolean;
    indicators: { normalized: string }[] | null; createdAt: Date;
  }
  export interface ResolvedActor { actorType: 'group' | 'account'; actorKey: string; displayName: string | null; platformId: string | null }
  export interface ActorAgg {
    actorType: string; actorKey: string; displayName: string | null; platformId: string | null;
    postCount: number; notableCount: number; categoryCounts: Record<string, number>;
    indicatorSet: Set<string>; lastPostAt: Date;
  }
  export function resolveActors(p: PostForActor): ResolvedActor[];
  export function aggregatePosts(posts: PostForActor[]): Map<string, ActorAgg>;
  export function isRepeatOffender(categoryCounts: Record<string, number>, threshold: number): boolean;
  ```
  Task 3 dùng cả ba hàm.

- [ ] **Step 1: Viết test thất bại** (`actor-aggregator.spec.ts`)

```typescript
import { describe, it, expect } from '@jest/globals';
import { resolveActors, aggregatePosts, isRepeatOffender } from './actor-aggregator';

const post = (o: Partial<import('./actor-aggregator').PostForActor>): any => ({
  groupId: null, groupName: null, platformId: 'pl1', authorExternalId: null, authorName: null,
  matchedCategories: [], isNotable: false, indicators: null, createdAt: new Date('2026-07-10'), ...o,
});

describe('resolveActors', () => {
  it('có groupId + author → 2 actor (group + account)', () => {
    const r = resolveActors(post({ groupId: 'g1', groupName: 'Kênh X', authorExternalId: 'u9', authorName: 'A' }));
    expect(r.map((a) => a.actorType).sort()).toEqual(['account', 'group']);
    expect(r.find((a) => a.actorType === 'group')!.actorKey).toBe('g1');
    expect(r.find((a) => a.actorType === 'account')!.actorKey).toBe('pl1:u9');
  });
  it('chỉ groupId → 1 group-actor', () => {
    expect(resolveActors(post({ groupId: 'g1' }))).toHaveLength(1);
  });
  it('không group/author (bài RSS) → 0 actor', () => {
    expect(resolveActors(post({}))).toHaveLength(0);
  });
});

describe('aggregatePosts', () => {
  it('gộp count category CNC + notable + distinct indicator, 1 post đếm cho 2 actor', () => {
    const posts = [
      post({ groupId: 'g1', authorExternalId: 'u9',
        matchedCategories: ['lua-dao', 'Tội phạm'], isNotable: true,
        indicators: [{ normalized: '0912345678' }], createdAt: new Date('2026-07-11') }),
      post({ groupId: 'g1', matchedCategories: ['lua-dao'],
        indicators: [{ normalized: '0912345678' }], createdAt: new Date('2026-07-12') }),
    ];
    const m = aggregatePosts(posts);
    const g = m.get('group:g1')!;
    expect(g.postCount).toBe(2);
    expect(g.categoryCounts['lua-dao']).toBe(2);
    expect(g.categoryCounts['Tội phạm']).toBeUndefined(); // chỉ nhóm CNC
    expect(g.notableCount).toBe(1);
    expect(g.indicatorSet.size).toBe(1); // cùng số ĐT 2 lần → distinct 1
    expect(g.lastPostAt).toEqual(new Date('2026-07-12'));
    expect(m.get('account:pl1:u9')!.postCount).toBe(1); // account chỉ có post 1
  });
});

describe('isRepeatOffender', () => {
  it('đạt ngưỡng ở 1 category CNC → true', () => {
    expect(isRepeatOffender({ 'lua-dao': 3 }, 3)).toBe(true);
    expect(isRepeatOffender({ 'lua-dao': 2, 'co-bac-ca-do': 2 }, 3)).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test — FAIL**

Run: `cd backend && npx jest actor-aggregator --silent`
Expected: FAIL (chưa có module).

- [ ] **Step 3: Viết `actor-aggregator.ts`**

```typescript
// 8 nhóm CNC (khớp seed keyword) — chỉ các nhóm này tính vào category_counts
export const CNC_CATEGORIES = new Set<string>([
  'lua-dao', 'mua-ban-dlcn', 'tan-cong-ma-doc', 'co-bac-ca-do',
  'tin-dung-den', 'deepfake-gia-mao', 'rua-tien', 'kich-dong-xuyen-tac',
]);

export interface PostForActor {
  groupId: string | null; groupName: string | null;
  platformId: string | null; authorExternalId: string | null; authorName: string | null;
  matchedCategories: string[] | null; isNotable: boolean;
  indicators: { normalized: string }[] | null; createdAt: Date;
}
export interface ResolvedActor {
  actorType: 'group' | 'account'; actorKey: string; displayName: string | null; platformId: string | null;
}
export interface ActorAgg {
  actorType: string; actorKey: string; displayName: string | null; platformId: string | null;
  postCount: number; notableCount: number; categoryCounts: Record<string, number>;
  indicatorSet: Set<string>; lastPostAt: Date;
}

// 1 post → 0..2 actor. group nếu có groupId; account nếu có authorExternalId.
export function resolveActors(p: PostForActor): ResolvedActor[] {
  const out: ResolvedActor[] = [];
  if (p.groupId) {
    out.push({ actorType: 'group', actorKey: p.groupId, displayName: p.groupName, platformId: p.platformId });
  }
  if (p.authorExternalId) {
    out.push({
      actorType: 'account',
      actorKey: `${p.platformId ?? ''}:${p.authorExternalId}`,
      displayName: p.authorName, platformId: p.platformId,
    });
  }
  return out;
}

// Gộp list post → map key ("type:actorKey") → ActorAgg
export function aggregatePosts(posts: PostForActor[]): Map<string, ActorAgg> {
  const map = new Map<string, ActorAgg>();
  for (const p of posts) {
    for (const a of resolveActors(p)) {
      const key = `${a.actorType}:${a.actorKey}`;
      let agg = map.get(key);
      if (!agg) {
        agg = {
          actorType: a.actorType, actorKey: a.actorKey, displayName: a.displayName,
          platformId: a.platformId, postCount: 0, notableCount: 0,
          categoryCounts: {}, indicatorSet: new Set(), lastPostAt: p.createdAt,
        };
        map.set(key, agg);
      }
      agg.postCount++;
      if (p.isNotable) agg.notableCount++;
      for (const c of p.matchedCategories ?? []) {
        if (CNC_CATEGORIES.has(c)) agg.categoryCounts[c] = (agg.categoryCounts[c] ?? 0) + 1;
      }
      for (const ind of p.indicators ?? []) agg.indicatorSet.add(ind.normalized);
      if (p.createdAt > agg.lastPostAt) agg.lastPostAt = p.createdAt;
    }
  }
  return map;
}

// Tái phạm = có ≥1 category CNC đạt ngưỡng
export function isRepeatOffender(categoryCounts: Record<string, number>, threshold: number): boolean {
  return Object.values(categoryCounts).some((c) => c >= threshold);
}
```

- [ ] **Step 4: Chạy test — PASS**

Run: `cd backend && npx jest actor-aggregator --silent`
Expected: các test PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/osint/services/actor/actor-aggregator.ts backend/src/modules/osint/services/actor/actor-aggregator.spec.ts
git commit -m "feat(osint): L2 logic thuần — resolveActors + aggregatePosts + isRepeatOffender (unit test)"
```

---

## Task 3: ActorAggregateJob — cron + upsert

**Files:**
- Create: `backend/src/modules/osint/services/actor/actor-aggregate.job.ts`
- Create: `backend/src/modules/osint/services/actor/actor-aggregate.job.spec.ts`
- Modify: `backend/src/modules/osint/osint.module.ts` (provider)

**Interfaces:**
- Consumes: `aggregatePosts`, `isRepeatOffender` (Task 2); repo `OsintPost`, `OsintPostNlp`, `OsintActor`, `OsintActorStat` (Task 1).
- Produces: `ActorAggregateJob.run(): Promise<number>` (số actor cập nhật) — cron gọi.

**Cạm bẫy:**
- Load post trong cửa sổ + JOIN nlp: dùng query builder lấy field cần cho `PostForActor`
  (groupId, group.name, platformId, authorExternalId, authorName, nlp.matched_categories, nlp.is_notable, nlp.indicators, createdAt).
- Upsert actor: tìm theo (actorType, actorKey); có thì update last_seen; không thì insert.
- `distinctIndicators = indicatorSet.size`; lưu `categoryCounts` object.

- [ ] **Step 1: Viết test** (`actor-aggregate.job.spec.ts`) — mock repo, kiểm run() upsert đúng

```typescript
import { describe, it, expect, jest } from '@jest/globals';
import { ActorAggregateJob } from './actor-aggregate.job';

describe('ActorAggregateJob', () => {
  it('run() gộp post → upsert actor + stat với is_repeat_offender đúng ngưỡng', async () => {
    // 3 post cùng group g1, đều lua-dao → count 3 ≥ ngưỡng 3 → repeat offender
    const posts = [1, 2, 3].map((i) => ({
      groupId: 'g1', platformId: 'pl1', authorExternalId: null, authorName: null,
      createdAt: new Date(`2026-07-1${i}`),
      group: { name: 'Kênh X' },
      nlp: { matchedCategories: ['lua-dao'], isNotable: true, indicators: null },
    }));
    const qb: any = {
      leftJoinAndSelect: () => qb, where: () => qb, andWhere: () => qb, getMany: async () => posts,
    };
    const postRepo: any = { createQueryBuilder: () => qb };
    const actorSaved: any[] = [];
    const actorRepo: any = {
      findOne: async () => null,
      create: (x: any) => x,
      save: async (x: any) => { const s = { ...x, id: 'a-' + actorSaved.length }; actorSaved.push(s); return s; },
    };
    const statSaved: any[] = [];
    const statRepo: any = {
      findOne: async () => null, create: (x: any) => x,
      save: async (x: any) => { statSaved.push(x); return x; },
    };
    const job = new ActorAggregateJob(postRepo, actorRepo, statRepo);
    const n = await job.run();
    expect(n).toBe(1);
    expect(statSaved[0].isRepeatOffender).toBe(true);
    expect(statSaved[0].categoryCounts['lua-dao']).toBe(3);
  });
});
```

- [ ] **Step 2: Chạy — FAIL**

Run: `cd backend && npx jest actor-aggregate.job --silent`
Expected: FAIL.

- [ ] **Step 3: Viết `actor-aggregate.job.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OsintPost } from '@modules/osint/entities/osint-post.entity';
import { OsintActor } from '@modules/osint/entities/osint-actor.entity';
import { OsintActorStat } from '@modules/osint/entities/osint-actor-stat.entity';
import { aggregatePosts, isRepeatOffender, PostForActor } from './actor-aggregator';

const WINDOW_DAYS = 30;

@Injectable()
export class ActorAggregateJob {
  private readonly logger = new Logger(ActorAggregateJob.name);
  private readonly threshold = Number(process.env.ACTOR_REPEAT_THRESHOLD) || 3;

  constructor(
    @InjectRepository(OsintPost) private postRepo: Repository<OsintPost>,
    @InjectRepository(OsintActor) private actorRepo: Repository<OsintActor>,
    @InjectRepository(OsintActorStat) private statRepo: Repository<OsintActorStat>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM) // sau EWM 2AM
  async handleCron() {
    const n = await this.run();
    this.logger.log(`ActorAggregate: cập nhật ${n} actor (cửa sổ ${WINDOW_DAYS} ngày)`);
  }

  /** Gộp post trong cửa sổ → upsert actor + stat. Trả số actor cập nhật. */
  async run(): Promise<number> {
    const since = new Date(Date.now() - WINDOW_DAYS * 864e5);
    // 1. Load post + nlp + group trong cửa sổ (chỉ field cần)
    const rows = await this.postRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.nlp', 'nlp')
      .leftJoinAndSelect('p.group', 'g')
      .where('p.created_at >= :since', { since })
      .getMany();

    // 2. Map sang PostForActor
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

    // 3. Gộp thuần
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
          actorType: agg.actorType, actorKey: agg.actorKey,
          displayName: agg.displayName, platformId: agg.platformId,
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
      if (!stat) stat = this.statRepo.create({ actorId: actor.id, windowDays: WINDOW_DAYS });
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
```

- [ ] **Step 4: Chạy — PASS**

Run: `cd backend && npx jest actor-aggregate.job --silent`
Expected: PASS.

- [ ] **Step 5: Đăng ký provider** `ActorAggregateJob` trong `osint.module.ts` providers.

- [ ] **Step 6: Build + full suite**

Run: `cd backend && npx tsc --noEmit && npx jest --silent`
Expected: sạch + tất cả PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/osint/services/actor/actor-aggregate.job.ts backend/src/modules/osint/services/actor/actor-aggregate.job.spec.ts backend/src/modules/osint/osint.module.ts
git commit -m "feat(osint): L2 ActorAggregateJob — cron gộp post→actor stat, upsert, ngưỡng tái phạm"
```

---

## Task 4: Endpoint đọc `GET /osint/actors`

**Files:**
- Modify: `backend/src/modules/osint/osint.service.ts`
- Modify: `backend/src/modules/osint/osint.controller.ts`

**Interfaces:**
- Consumes: repo `OsintActor`, `OsintActorStat`.
- Produces: `GET /api/v1/osint/actors?type=&repeat=&limit=` → list `{actor_type, display_name, category_counts, notable_count, is_repeat_offender, last_post_at, post_count}` xếp theo tổng bài CNC desc.

- [ ] **Step 1: Thêm `getActors` vào `osint.service.ts`**

Inject `@InjectRepository(OsintActor)` + `OsintActorStat`. Thêm:

```typescript
// Xếp hạng actor theo tổng bài CNC (sum category_counts) giảm dần
async getActors(opts: { type?: string; repeat?: boolean; limit?: number }) {
  const qb = this.actorStatRepo
    .createQueryBuilder('s')
    .innerJoin(OsintActor, 'a', 'a.id = s.actor_id')
    .select([
      'a.actor_type AS actor_type', 'a.display_name AS display_name',
      's.category_counts AS category_counts', 's.notable_count AS notable_count',
      's.post_count AS post_count', 's.is_repeat_offender AS is_repeat_offender',
      's.last_post_at AS last_post_at',
    ])
    .where('s.window_days = 30');
  if (opts.type) qb.andWhere('a.actor_type = :type', { type: opts.type });
  if (opts.repeat) qb.andWhere('s.is_repeat_offender = true');
  // Tổng bài CNC = tổng value trong category_counts jsonb → xếp hạng
  qb.orderBy(
    `(SELECT COALESCE(SUM((v)::int),0) FROM jsonb_each_text(s.category_counts) AS t(k,v))`,
    'DESC',
  ).limit(opts.limit ?? 50);
  return qb.getRawMany();
}
```
*(Lưu ý: cần `import { OsintActor } from './entities/osint-actor.entity';` + inject `actorStatRepo`. Kiểm cú pháp orderBy subquery jsonb khi chạy; nếu TypeORM khó, chuyển sang query raw `manager.query(...)`.)*

- [ ] **Step 2: Thêm endpoint** vào `osint.controller.ts`

```typescript
import { Query } from '@nestjs/common';
// ...
@Get('actors')
getActors(
  @Query('type') type?: string,
  @Query('repeat') repeat?: string,
  @Query('limit') limit?: string,
) {
  return this.osintService.getActors({
    type,
    repeat: repeat === 'true',
    limit: limit ? Number(limit) : undefined,
  });
}
```

- [ ] **Step 3: Build + full suite**

Run: `cd backend && npx tsc --noEmit && npx jest --silent`
Expected: sạch + PASS (cập nhật osint.controller.spec nếu constructor service đổi — service tự inject repo mới nên controller spec không đổi; nếu osint.service.spec tồn tại + đổi constructor thì thêm mock repo).

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/osint/osint.service.ts backend/src/modules/osint/osint.controller.ts
git commit -m "feat(osint): L2 endpoint GET /osint/actors — xếp hạng actor theo bài CNC"
```

---

## Task 5: E2E thật trên dữ liệu TG

**Files:** không sửa — chạy thật.

- [ ] **Step 1: Chạy job 1 lần** (script tạm hoặc gọi run() qua ts-node)

Tạo `src/scripts/run-actor-aggregate.ts` (bootstrap AppModule → `app.get(ActorAggregateJob).run()`), chạy `ts-node -r tsconfig-paths/register src/scripts/run-actor-aggregate.ts`.

- [ ] **Step 2: Kiểm DB**

```sql
SELECT a.actor_type, a.display_name, s.post_count, s.category_counts, s.is_repeat_offender
FROM osint.osint_actor a JOIN osint.osint_actor_stat s ON s.actor_id=a.id
ORDER BY s.post_count DESC;
```
Kỳ vọng: actor group "Phốt Việt Nam"/"Hóng biến" có `post_count` (~194/184); `category_counts` phản ánh nhóm CNC nếu bài khớp (kênh gossip → có thể ít/không CNC → is_repeat_offender false — ĐÚNG, chờ nguồn CNC).

- [ ] **Step 3:** `curl 'http://localhost:3000/api/v1/osint/actors?limit=10'` → xếp hạng.

- [ ] **Step 4:** Ghi kết quả vào memory `project-cnc-focus` (L2 DONE + số actor).

---

## Self-Review

**Spec coverage:** §Schema→Task1; §ActorResolver→Task2 (resolveActors); §Job gộp→Task3; §Chấm điểm minh bạch→Task2 (aggregate)+Task4 (orderBy count, không cột score); §Đầu ra endpoint→Task4; §RSS tự loại→Task2 (resolveActors trả [] khi null); §Test→Task2/3/4/5; §Ngưỡng 3/30d→Global+Task3 (env). Đủ.

**Placeholder scan:** không TBD; code đầy đủ cho hàm thuần + job + endpoint. Lưu ý "orderBy subquery jsonb" ở Task4 có phương án dự phòng (raw query) — không phải placeholder.

**Type consistency:** `PostForActor`/`ResolvedActor`/`ActorAgg` nhất quán Task2→Task3; `aggregatePosts`/`isRepeatOffender`/`resolveActors` signature khớp; entity `OsintActor`/`OsintActorStat` field khớp Task1→Task3→Task4; key map `"type:actorKey"` nhất quán.

## Tồn đọng
- domain-actor + fingerprint-actor (đổ vào bảng generic).
- Cảnh báo actor tái phạm mới; cửa sổ 90 ngày; lọc publication khi thêm domain-actor.
- Kết quả "đắt" chỉ có sau khi crawl nguồn CNC (hiện 2 kênh TG gossip → ít CNC).
