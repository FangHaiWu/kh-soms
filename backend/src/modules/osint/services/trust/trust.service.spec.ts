import { TrustService } from './trust.service';
import { describe, it, expect, jest } from '@jest/globals';

describe('TrustService', () => {
  const findMock = jest.fn<(...args: any[]) => Promise<any[]>>();
  const svc = new TrustService({ find: findMock } as any); // chỉ cần .find cho assignCluster

  it('sourceTrust: R null → fallback P', () => {
    expect(svc.sourceTrust(2, null, 0.5)).toBeCloseTo(1.7, 5); // .3*2+.5*2+.2*.5
  });
  it('corrobIndep bão hòa', () => {
    expect(svc.corrobIndep(0)).toBe(0);
    expect(svc.corrobIndep(2)).toBeCloseTo(0.7534, 3);
  });
  it('wilson: n=0 → null; small sample kéo xuống', () => {
    expect(svc.wilsonLowerBound(0, 0)).toBeNull();
    expect(svc.wilsonLowerBound(8, 10)!).toBeLessThan(0.8); // p̂=0.8 nhưng cận dưới < 0.8
  });
  it('assignCluster đếm DISTINCT owner, không đếm số bài', async () => {
    findMock.mockResolvedValue([
      { authorExternalId: 'A', groupId: 'g1' },
      { authorExternalId: 'A', groupId: 'g1' }, // cùng người → vẫn k=1
    ]);
    expect((await svc.assignCluster('h', 48)).k).toBe(1);
    findMock.mockResolvedValue([
      { authorExternalId: 'A' },
      { authorExternalId: 'B' }, // 2 người → k=2
    ]);
    expect((await svc.assignCluster('h', 48)).k).toBe(2);
  });
  it('postCredibility tăng theo corrob/official, giảm theo nlpRisk', () => {
    const base = svc.postCredibility(0.4, 0.2, false, 0.1);
    expect(svc.postCredibility(0.4, 0.8, false, 0.1)).toBeGreaterThan(base); // corrob ↑
    expect(svc.postCredibility(0.4, 0.2, false, 0.5)).toBeLessThan(base); // nlpRisk ↑
  });
});
