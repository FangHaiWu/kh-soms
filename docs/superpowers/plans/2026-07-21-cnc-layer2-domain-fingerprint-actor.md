# CNC Lớp 2 — domain-content-actor + fingerprint-actor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mở rộng `resolveActors()` để 1 bài CNC có thể sinh thêm actor kiểu `domain` (từ indicator URL trong nội dung bài) và `fingerprint` (từ indicator PHONE/BANK_ACCOUNT/CRYPTO_WALLET/HANDLE lặp lại), tận dụng bảng `osint_actor`/`osint_actor_stat` generic sẵn có — không migration, không sửa job/endpoint.

**Architecture:** Toàn bộ thay đổi nằm trong 1 hàm thuần `resolveActors()` (`actor-aggregator.ts`) — hàm nhận 1 `PostForActor`, trả mảng `ResolvedActor[]`. `aggregatePosts()`, `ActorAggregateJob`, endpoint `GET /osint/actors` đã generic theo `actorType`/`actorKey` nên không cần đổi.

**Tech Stack:** TypeScript thuần (không phụ thuộc NestJS/DB) cho `actor-aggregator.ts`; Jest cho test.

## Global Constraints

- Chỉ 4 type indicator tính vào fingerprint-actor: `PHONE`, `BANK_ACCOUNT`, `CRYPTO_WALLET`, `HANDLE`. `URL` → domain-actor riêng. Type khác (nếu có sau này) → bỏ qua, không tạo actor.
- `actorKey` của fingerprint PHẢI có tiền tố `${type}:` để tránh đụng giữa 2 loại indicator có cùng chuỗi `normalized`.
- Domain-actor lấy từ indicator trong NỘI DUNG bài (`p.indicators`), KHÔNG từ URL nguồn bài (`platform_specific_data.url`) — domain-source-actor nằm ngoài phạm vi plan này.
- `platformId` của domain/fingerprint actor luôn `null` (không gắn 1 platform cụ thể).
- Không sửa schema, không sửa `actor-aggregate.job.ts` (đã generic, indicators đã có `type` sẵn ở runtime qua cột jsonb `any` — chỉ interface TypeScript đang khai hẹp hơn thực tế).

---

## Task 1: Domain-content-actor — resolve từ indicator URL

**Files:**
- Modify: `backend/src/modules/osint/services/actor/actor-aggregator.ts:14-31` (interface `PostForActor`, `ResolvedActor`)
- Modify: `backend/src/modules/osint/services/actor/actor-aggregator.ts:45-66` (`resolveActors`)
- Test: `backend/src/modules/osint/services/actor/actor-aggregator.spec.ts`

**Interfaces:**
- Consumes: không có (thay đổi type nội bộ file).
- Produces: `PostForActor.indicators: { type: string; normalized: string }[] | null` (trước: `{ normalized: string }[] | null`) — Task 4 (job spec) dựa vào field `type` này.

- [ ] **Step 1: Sửa interface `PostForActor.indicators` và `ResolvedActor.actorType`**

Trong `actor-aggregator.ts`, sửa dòng 14-31:

```ts
// Field 1 post cần cho gộp actor (map từ osint_posts ⋈ osint_post_nlp)
export interface PostForActor {
  groupId: string | null;
  groupName: string | null;
  platformId: string | null;
  authorExternalId: string | null;
  authorName: string | null;
  matchedCategories: string[] | null;
  isNotable: boolean;
  indicators: { type: string; normalized: string }[] | null;
  createdAt: Date;
}

export interface ResolvedActor {
  actorType: 'group' | 'account' | 'domain' | 'fingerprint';
  actorKey: string;
  displayName: string | null;
  platformId: string | null;
}
```

- [ ] **Step 2: Viết test thất bại cho domain-actor**

Thêm vào `actor-aggregator.spec.ts`, trong khối `describe('resolveActors', ...)` (sau case "không group/author (bài RSS) → 0 actor"):

```ts
  it('có indicator URL → domain-actor, actorKey = domain', () => {
    const r = resolveActors(
      post({ indicators: [{ type: 'URL', normalized: 'scam-site.com' }] }),
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({
      actorType: 'domain',
      actorKey: 'scam-site.com',
      displayName: 'scam-site.com',
      platformId: null,
    });
  });
```

Vì fixture `post()` (đầu file) khai `indicators: null` mặc định — cast kiểu cũ `{ normalized: string }[]` sẽ báo lỗi biên dịch nếu Step 1 làm đúng. Không cần sửa fixture `post()` ở bước này (test tự truyền `indicators` khớp type mới).

- [ ] **Step 3: Chạy test, xác nhận FAIL**

```bash
cd backend && npx jest actor-aggregator.spec.ts -t "domain-actor" --silent
```

Kỳ vọng: FAIL — `resolveActors` trả `[]` (0 actor) vì chưa xử lý nhánh URL.

- [ ] **Step 4: Implement — thêm nhánh domain trong `resolveActors`**

Sửa `resolveActors` (dòng 45-66):

```ts
// 1 post → 0..N actor. group nếu có groupId; account nếu có authorExternalId;
// domain cho mỗi indicator URL; fingerprint cho mỗi indicator PHONE/BANK_ACCOUNT/CRYPTO_WALLET/HANDLE.
// Bài RSS/web (groupId + author đều null, không indicator) → [] (tự loại khỏi xếp hạng).
export function resolveActors(p: PostForActor): ResolvedActor[] {
  const out: ResolvedActor[] = [];
  if (p.groupId) {
    out.push({
      actorType: 'group',
      actorKey: p.groupId,
      displayName: p.groupName,
      platformId: p.platformId,
    });
  }
  if (p.authorExternalId) {
    out.push({
      actorType: 'account',
      actorKey: `${p.platformId ?? ''}:${p.authorExternalId}`,
      displayName: p.authorName,
      platformId: p.platformId,
    });
  }
  for (const ind of p.indicators ?? []) {
    if (ind.type === 'URL') {
      out.push({
        actorType: 'domain',
        actorKey: ind.normalized,
        displayName: ind.normalized,
        platformId: null,
      });
    }
  }
  return out;
}
```

- [ ] **Step 5: Chạy test, xác nhận PASS**

```bash
cd backend && npx jest actor-aggregator.spec.ts --silent
```

Kỳ vọng: PASS toàn bộ (test cũ + test mới).

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/modules/osint/services/actor/actor-aggregator.ts src/modules/osint/services/actor/actor-aggregator.spec.ts
git commit -m "feat(osint): L2 domain-content-actor — resolve từ indicator URL trong bài"
```

---

## Task 2: Fingerprint-actor — resolve từ indicator PHONE/BANK_ACCOUNT/CRYPTO_WALLET/HANDLE

**Files:**
- Modify: `backend/src/modules/osint/services/actor/actor-aggregator.ts` (thêm hằng số + nhánh trong `resolveActors`, ngay sau nhánh domain của Task 1)
- Test: `backend/src/modules/osint/services/actor/actor-aggregator.spec.ts`

**Interfaces:**
- Consumes: `PostForActor.indicators` (Task 1), `ResolvedActor` (Task 1).
- Produces: `actorKey` dạng `${indicatorType}:${normalized}` cho fingerprint — Task 3 dựa vào format này khi viết test tích hợp.

- [ ] **Step 1: Viết test thất bại — 1 indicator PHONE → 1 fingerprint-actor**

Thêm vào `actor-aggregator.spec.ts`, sau test domain-actor:

```ts
  it('có indicator PHONE → fingerprint-actor, actorKey có tiền tố type', () => {
    const r = resolveActors(
      post({ indicators: [{ type: 'PHONE', normalized: '0912345678' }] }),
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({
      actorType: 'fingerprint',
      actorKey: 'PHONE:0912345678',
      displayName: '0912345678',
      platformId: null,
    });
  });

  it('2 indicator PHONE khác nhau trong cùng bài → 2 fingerprint-actor riêng', () => {
    const r = resolveActors(
      post({
        indicators: [
          { type: 'PHONE', normalized: '0912345678' },
          { type: 'PHONE', normalized: '0987654321' },
        ],
      }),
    );
    expect(r).toHaveLength(2);
    expect(r.map((a) => a.actorKey).sort()).toEqual([
      'PHONE:0912345678',
      'PHONE:0987654321',
    ]);
  });

  it('PHONE và BANK_ACCOUNT cùng chuỗi normalized → actorKey KHÔNG đụng nhau (tiền tố type)', () => {
    const r = resolveActors(
      post({
        indicators: [
          { type: 'PHONE', normalized: '1234567890' },
          { type: 'BANK_ACCOUNT', normalized: '1234567890' },
        ],
      }),
    );
    expect(r).toHaveLength(2);
    expect(r.map((a) => a.actorKey).sort()).toEqual([
      'BANK_ACCOUNT:1234567890',
      'PHONE:1234567890',
    ]);
  });

  it('indicator type không nằm trong danh sách (vd MISC lạ) → bỏ qua, không tạo actor', () => {
    const r = resolveActors(
      post({ indicators: [{ type: 'MISC_UNKNOWN', normalized: 'x' }] }),
    );
    expect(r).toHaveLength(0);
  });
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

```bash
cd backend && npx jest actor-aggregator.spec.ts -t "fingerprint-actor" --silent
```

Kỳ vọng: FAIL — chưa có nhánh PHONE/BANK_ACCOUNT/CRYPTO_WALLET/HANDLE nên `resolveActors` trả `[]`.

- [ ] **Step 3: Implement — thêm hằng số + nhánh fingerprint**

Thêm hằng số ngay dưới `CNC_CATEGORIES` (đầu file, sau dòng 11):

```ts
// 4 loại indicator tính vào fingerprint-actor (vân tay chỉ dấu lặp — bắt kẻ đổi account).
// URL không nằm trong này — URL đi vào domain-actor riêng (nhánh khác trong resolveActors).
const FINGERPRINT_INDICATOR_TYPES = new Set<string>([
  'PHONE',
  'BANK_ACCOUNT',
  'CRYPTO_WALLET',
  'HANDLE',
]);
```

Sửa vòng lặp indicator trong `resolveActors` (thêm nhánh `else if` sau nhánh `URL` từ Task 1):

```ts
  for (const ind of p.indicators ?? []) {
    if (ind.type === 'URL') {
      out.push({
        actorType: 'domain',
        actorKey: ind.normalized,
        displayName: ind.normalized,
        platformId: null,
      });
    } else if (FINGERPRINT_INDICATOR_TYPES.has(ind.type)) {
      out.push({
        actorType: 'fingerprint',
        actorKey: `${ind.type}:${ind.normalized}`,
        displayName: ind.normalized,
        platformId: null,
      });
    }
  }
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

```bash
cd backend && npx jest actor-aggregator.spec.ts --silent
```

Kỳ vọng: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/modules/osint/services/actor/actor-aggregator.ts src/modules/osint/services/actor/actor-aggregator.spec.ts
git commit -m "feat(osint): L2 fingerprint-actor — resolve từ indicator PHONE/BANK_ACCOUNT/CRYPTO_WALLET/HANDLE"
```

---

## Task 3: `aggregatePosts` — xác nhận 1 bài đóng góp cho ≥4 actor cùng lúc

**Files:**
- Test: `backend/src/modules/osint/services/actor/actor-aggregator.spec.ts` (khối `describe('aggregatePosts', ...)`)

Không cần sửa `aggregatePosts` (đã generic, vòng lặp `for (const a of resolveActors(p))` tự xử lý N actor). Task này CHỈ thêm test tích hợp xác nhận hành vi đúng qua Task 1+2.

**Interfaces:**
- Consumes: `resolveActors` (Task 1+2), `aggregatePosts` (không đổi).
- Produces: không có (test-only).

- [ ] **Step 1: Viết test — 1 bài có group+account+domain+fingerprint → 4 actor riêng trong map**

Thêm vào `describe('aggregatePosts', ...)` trong `actor-aggregator.spec.ts`:

```ts
  it('1 bài có group+account+domain+fingerprint → 4 actor riêng, mỗi actor postCount=1', () => {
    const posts = [
      post({
        groupId: 'g1',
        authorExternalId: 'u9',
        matchedCategories: ['lua-dao'],
        indicators: [
          { type: 'URL', normalized: 'scam-site.com' },
          { type: 'PHONE', normalized: '0912345678' },
        ],
        createdAt: new Date('2026-07-11'),
      }),
    ];
    const m = aggregatePosts(posts);
    expect([...m.keys()].sort()).toEqual([
      'account:pl1:u9',
      'domain:scam-site.com',
      'fingerprint:PHONE:0912345678',
      'group:g1',
    ]);
    for (const agg of m.values()) {
      expect(agg.postCount).toBe(1);
      expect(agg.categoryCounts['lua-dao']).toBe(1);
    }
  });
```

- [ ] **Step 2: Chạy test, xác nhận PASS ngay (không cần sửa code)**

```bash
cd backend && npx jest actor-aggregator.spec.ts --silent
```

Kỳ vọng: PASS — nếu FAIL, nghĩa là `aggregatePosts` có giả định cứng về số lượng actor/bài (khả năng thấp, nhưng phải xác minh trước khi coi Task 1+2 hoàn tất).

- [ ] **Step 3: Commit**

```bash
cd backend
git add src/modules/osint/services/actor/actor-aggregator.spec.ts
git commit -m "test(osint): L2 xác nhận aggregatePosts gộp đúng khi 1 bài có 4 actor"
```

---

## Task 4: Xác nhận wiring qua `ActorAggregateJob` + chạy full suite + verify dữ liệu thật

**Files:**
- Modify: `backend/src/modules/osint/services/actor/actor-aggregate.job.spec.ts` (thêm 1 test case, KHÔNG sửa `actor-aggregate.job.ts` — job đã generic, cột DB `indicators` đã có `type` ở runtime)

**Interfaces:**
- Consumes: `ActorAggregateJob.run()` (không đổi chữ ký), `PostForActor` (Task 1).
- Produces: không có (task cuối, chỉ verify).

- [ ] **Step 1: Viết test thất bại — post có indicator PHONE (kèm `type`) → job upsert được fingerprint-actor**

Thêm vào `actor-aggregate.job.spec.ts`, sau test hiện có (dòng 53), CÙNG trong `describe('ActorAggregateJob', ...)`:

```ts
  it('post có indicator PHONE → upsert thêm fingerprint-actor (không chỉ group)', async () => {
    const posts = [
      {
        groupId: null,
        platformId: 'pl1',
        authorExternalId: null,
        authorName: null,
        createdAt: new Date('2026-07-11'),
        group: null,
        nlp: {
          matchedCategories: ['lua-dao'],
          isNotable: true,
          indicators: [{ type: 'PHONE', normalized: '0912345678' }],
        },
      },
    ];
    const qb: any = {
      leftJoinAndSelect: () => qb,
      where: () => qb,
      getMany: async () => posts,
    };
    const postRepo: any = { createQueryBuilder: () => qb };
    const actorSaved: any[] = [];
    const actorRepo: any = {
      findOne: async () => null,
      create: (x: any) => x,
      save: async (x: any) => {
        const s = { ...x, id: 'a-' + actorSaved.length };
        actorSaved.push(s);
        return s;
      },
    };
    const statSaved: any[] = [];
    const statRepo: any = {
      findOne: async () => null,
      create: (x: any) => x,
      save: async (x: any) => {
        statSaved.push(x);
        return x;
      },
    };

    const job = new ActorAggregateJob(postRepo, actorRepo, statRepo);
    const n = await job.run();

    expect(n).toBe(1); // post không group/author → chỉ actor fingerprint
    expect(actorSaved[0].actorType).toBe('fingerprint');
    expect(actorSaved[0].actorKey).toBe('PHONE:0912345678');
    expect(statSaved[0].categoryCounts['lua-dao']).toBe(1);
  });
```

- [ ] **Step 2: Chạy test, xác nhận PASS ngay (job không cần sửa code)**

```bash
cd backend && npx jest actor-aggregate.job.spec.ts --silent
```

Kỳ vọng: PASS. Nếu FAIL vì `p.nlp?.indicators` không mang `type` qua được `PostForActor` — kiểm tra lại dòng `indicators: p.nlp?.indicators ?? null,` trong `actor-aggregate.job.ts` (dòng 60): cột entity khai `indicators: any` nên toàn bộ object `{type,raw,normalized}` đã đi qua nguyên vẹn, không cần sửa.

- [ ] **Step 3: Chạy toàn bộ test suite OSINT, xác nhận không có regression**

```bash
cd backend && npx jest src/modules/osint --silent
```

Kỳ vọng: tất cả suite PASS (90 test cũ + ~7 test mới từ Task 1-4 ≈ 97).

- [ ] **Step 4: Commit**

```bash
cd backend
git add src/modules/osint/services/actor/actor-aggregate.job.spec.ts
git commit -m "test(osint): L2 xác nhận ActorAggregateJob upsert đúng fingerprint-actor"
```

- [ ] **Step 5: Verify trên dữ liệu thật (E2E, không phải test tự động)**

Chạy script gộp actor thật đã có sẵn (không cần sửa) để xem domain/fingerprint-actor có nổi lên từ 11 post CNC vừa crawl (21/07) không:

```bash
cd backend && npx ts-node -r tsconfig-paths/register src/scripts/run-actor-aggregate.ts
```

Sau đó kiểm tra qua API:

```bash
curl -s "http://localhost:3000/api/v1/osint/actors?type=domain" | jq
curl -s "http://localhost:3000/api/v1/osint/actors?type=fingerprint" | jq
```

Kỳ vọng: có thể trả mảng RỖNG (11 post hiện tại chưa chắc có indicator PHONE/URL/BANK_ACCOUNT trong nội dung) — đây là kết quả HỢP LỆ, không phải lỗi. Mục đích bước này là xác nhận pipeline chạy không lỗi trên dữ liệu thật, không phải kỳ vọng thấy actor cụ thể. Nếu có indicator trong dữ liệu thật, phải thấy actor `domain`/`fingerprint` xuất hiện trong kết quả.

---

## Self-Review Notes (đã chạy khi viết plan)

- **Spec coverage:** Task 1 = domain-content-actor (mục 2 spec); Task 2 = fingerprint-actor (mục 2 spec); Task 3 = xác nhận `aggregatePosts`/`isRepeatOffender` không cần đổi (mục 3 spec); Task 4 = xác nhận job (mục 4 spec, phát hiện job KHÔNG cần sửa vì cột đã `any`) + endpoint (mục 5 spec, không cần sửa, verify qua curl). Toàn bộ mục trong spec đã có task tương ứng.
- **Placeholder scan:** không còn "TBD"/"tương tự task N" — mọi step có code đầy đủ.
- **Type consistency:** `ResolvedActor.actorType` mở rộng nhất quán ở Task 1 (`'group' | 'account' | 'domain' | 'fingerprint'`), dùng xuyên suốt Task 2-4. `actorKey` fingerprint luôn `${type}:${normalized}` — khớp giữa Task 2 (định nghĩa) và Task 3/4 (test dùng lại).
