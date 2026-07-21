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
});

describe('aggregatePosts', () => {
  it('gộp count category CNC + notable + distinct indicator, 1 post đếm cho 2 actor', () => {
    const posts = [
      post({
        groupId: 'g1',
        authorExternalId: 'u9',
        matchedCategories: ['lua-dao', 'Tội phạm'],
        isNotable: true,
        indicators: [{ type: 'PHONE', normalized: '0912345678' }],
        createdAt: new Date('2026-07-11'),
      }),
      post({
        groupId: 'g1',
        matchedCategories: ['lua-dao'],
        indicators: [{ type: 'PHONE', normalized: '0912345678' }],
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
