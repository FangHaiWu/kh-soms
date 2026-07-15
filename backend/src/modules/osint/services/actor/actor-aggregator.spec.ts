import { describe, it, expect } from '@jest/globals';
import {
  resolveActors,
  aggregatePosts,
  isRepeatOffender,
  PostForActor,
} from './actor-aggregator';

const post = (o: Partial<PostForActor>): PostForActor => ({
  groupId: null,
  groupName: null,
  platformId: 'pl1',
  authorExternalId: null,
  authorName: null,
  matchedCategories: [],
  isNotable: false,
  indicators: null,
  createdAt: new Date('2026-07-10'),
  ...o,
});

describe('resolveActors', () => {
  it('có groupId + author → 2 actor (group + account)', () => {
    const r = resolveActors(
      post({ groupId: 'g1', groupName: 'Kênh X', authorExternalId: 'u9', authorName: 'A' }),
    );
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
      post({
        groupId: 'g1',
        authorExternalId: 'u9',
        matchedCategories: ['lua-dao', 'Tội phạm'],
        isNotable: true,
        indicators: [{ normalized: '0912345678' }],
        createdAt: new Date('2026-07-11'),
      }),
      post({
        groupId: 'g1',
        matchedCategories: ['lua-dao'],
        indicators: [{ normalized: '0912345678' }],
        createdAt: new Date('2026-07-12'),
      }),
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
