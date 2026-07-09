import { GateService } from './gate.service';
import { describe, it, expect } from '@jest/globals';
describe('GateService', () => {
  const svc = new GateService();
  const TH = {
    zScoreCutoff: 2,
    hotPriorityMax: 2,
    minCorrobK: 2,
    highTrustMin: 4,
  };
  const base = {
    content: 'một bài viết bình thường về an ninh trật tự khu phố',
    thresholds: TH,
    matchedKeywords: [],
    topKeywordPriority: null,
    engagement: 5,
    pageMean: 5,
    pageStd: 1,
    sourceTrust: 2,
    corrobK: 0,
    sentimentScore: null,
  };
  // Lớp A — rác
  it('junk: chỉ emoji → không notable, lý do junk', () => {
    const d = svc.evaluate({ ...base, content: '👍👍👍' });
    expect(d.isNotable).toBe(false);
    expect(d.notabilityReasons).toEqual(['junk']);
  });

  // Lớp B — negation nuốt keyword nóng
  it('negation: bài tuyên truyền phòng chống → keyword nóng bị bỏ', () => {
    const d = svc.evaluate({
      ...base,
      content: 'hội thảo tuyên truyền phòng chống ma túy tại phường',
      matchedKeywords: ['ma túy'],
      topKeywordPriority: 1,
    });
    expect(d.isNotable).toBe(false); // không tín hiệu nào bật
    expect(d.notabilityReasons).not.toContain('hot_keyword');
  });

  // Lớp C.1 — keyword nóng THẬT
  it('hot keyword thật (không negation) → notable', () => {
    const d = svc.evaluate({
      ...base,
      content: 'bắt quả tang một vụ mua bán ma túy lớn ở khu vực',
      matchedKeywords: ['ma túy'],
      topKeywordPriority: 1,
    });
    expect(d.isNotable).toBe(true);
    expect(d.notabilityReasons).toContain('hot_keyword');
  });

  // Lớp C.2 — engagement bất thường (z-score)
  it('engagement vọt so baseline page → abnormal_engagement', () => {
    const d = svc.evaluate({
      ...base,
      engagement: 100,
      pageMean: 10,
      pageStd: 5,
    });
    // z = (100-10)/5 = 18 > 2
    expect(d.notabilityReasons).toContain('abnormal_engagement');
    expect(d.isNotable).toBe(true);
  });

  // z-score KHÔNG false positive khi page mới (std=0)
  it('std=0 (page mới) → không bật abnormal_engagement', () => {
    const d = svc.evaluate({
      ...base,
      engagement: 100,
      pageMean: 0,
      pageStd: 0,
    });
    expect(d.notabilityReasons).not.toContain('abnormal_engagement');
  });

  // Lớp C.3 — nguồn trust cao
  it('sourceTrust cao → high_source_trust', () => {
    const d = svc.evaluate({ ...base, sourceTrust: 5 });
    expect(d.notabilityReasons).toContain('high_source_trust');
  });

  // Lớp C.4 — corroboration
  it('nhiều cụm độc lập → corroboration', () => {
    const d = svc.evaluate({ ...base, corrobK: 2 });
    expect(d.notabilityReasons).toContain('corroboration');
  });

  // Feature log LUÔN ghi kể cả khi không notable (cần cho pha 2)
  it('signalFeatures luôn có mặt khi không notable', () => {
    const d = svc.evaluate(base);
    expect(d.isNotable).toBe(false);
    expect(d.signalFeatures).toHaveProperty('zEngagement');
    expect(d.signalFeatures).toHaveProperty('sourceTrust');
    expect(d.signalFeatures).toHaveProperty('corrobK');
  });

  // Khe cắm S5b — sentiment null không được làm vỡ
  it('sentimentScore null → không throw, không bật sentiment', () => {
    expect(() => svc.evaluate(base)).not.toThrow();
  });
});
