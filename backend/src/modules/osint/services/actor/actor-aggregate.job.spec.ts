import { describe, it, expect, jest } from '@jest/globals';
import { ActorAggregateJob } from './actor-aggregate.job';

describe('ActorAggregateJob', () => {
  it('run() gộp post → upsert actor + stat với is_repeat_offender đúng ngưỡng', async () => {
    // 3 post cùng group g1, đều lua-dao → count 3 ≥ ngưỡng 3 → repeat offender
    const posts = [1, 2, 3].map((i) => ({
      groupId: 'g1',
      platformId: 'pl1',
      authorExternalId: null,
      authorName: null,
      createdAt: new Date(`2026-07-1${i}`),
      group: { name: 'Kênh X' },
      nlp: { matchedCategories: ['lua-dao'], isNotable: true, indicators: null },
    }));
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

    expect(n).toBe(1);
    expect(statSaved[0].isRepeatOffender).toBe(true);
    expect(statSaved[0].categoryCounts['lua-dao']).toBe(3);
    expect(statSaved[0].postCount).toBe(3);
  });
});
