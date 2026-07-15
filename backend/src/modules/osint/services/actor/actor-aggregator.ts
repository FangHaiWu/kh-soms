// 8 nhóm CNC (khớp seed keyword) — chỉ các nhóm này tính vào category_counts
export const CNC_CATEGORIES = new Set<string>([
  'lua-dao',
  'mua-ban-dlcn',
  'tan-cong-ma-doc',
  'co-bac-ca-do',
  'tin-dung-den',
  'deepfake-gia-mao',
  'rua-tien',
  'kich-dong-xuyen-tac',
]);

// Field 1 post cần cho gộp actor (map từ osint_posts ⋈ osint_post_nlp)
export interface PostForActor {
  groupId: string | null;
  groupName: string | null;
  platformId: string | null;
  authorExternalId: string | null;
  authorName: string | null;
  matchedCategories: string[] | null;
  isNotable: boolean;
  indicators: { normalized: string }[] | null;
  createdAt: Date;
}

export interface ResolvedActor {
  actorType: 'group' | 'account';
  actorKey: string;
  displayName: string | null;
  platformId: string | null;
}

export interface ActorAgg {
  actorType: string;
  actorKey: string;
  displayName: string | null;
  platformId: string | null;
  postCount: number;
  notableCount: number;
  categoryCounts: Record<string, number>;
  indicatorSet: Set<string>;
  lastPostAt: Date;
}

// 1 post → 0..2 actor. group nếu có groupId; account nếu có authorExternalId.
// Bài RSS/web (groupId + author đều null) → [] (tự loại khỏi xếp hạng).
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
  return out;
}

// Gộp list post → map key ("type:actorKey") → ActorAgg. 1 post đếm cho MỌI actor của nó.
export function aggregatePosts(posts: PostForActor[]): Map<string, ActorAgg> {
  const map = new Map<string, ActorAgg>();
  for (const p of posts) {
    for (const a of resolveActors(p)) {
      const key = `${a.actorType}:${a.actorKey}`;
      let agg = map.get(key);
      if (!agg) {
        agg = {
          actorType: a.actorType,
          actorKey: a.actorKey,
          displayName: a.displayName,
          platformId: a.platformId,
          postCount: 0,
          notableCount: 0,
          categoryCounts: {},
          indicatorSet: new Set(),
          lastPostAt: p.createdAt,
        };
        map.set(key, agg);
      }
      agg.postCount++;
      if (p.isNotable) agg.notableCount++;
      // Chỉ đếm nhóm CNC (bỏ nhóm chung như "Tội phạm"/"ANTT")
      for (const c of p.matchedCategories ?? []) {
        if (CNC_CATEGORIES.has(c)) {
          agg.categoryCounts[c] = (agg.categoryCounts[c] ?? 0) + 1;
        }
      }
      for (const ind of p.indicators ?? []) agg.indicatorSet.add(ind.normalized);
      if (p.createdAt > agg.lastPostAt) agg.lastPostAt = p.createdAt;
    }
  }
  return map;
}

// Tái phạm = có ≥1 category CNC đạt ngưỡng (đếm minh bạch, không trọng số)
export function isRepeatOffender(
  categoryCounts: Record<string, number>,
  threshold: number,
): boolean {
  return Object.values(categoryCounts).some((c) => c >= threshold);
}
