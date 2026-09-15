import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NlpProcessProcessor } from './nlp-process.processor';
import { NormalizeService } from '../normalize/normalize.service';
import { TrustService } from '../trust/trust.service';
import { GateService } from '../gate/gate.service';
import { IndicatorExtractorService } from '../indicator/indicator-extractor.service';

// Dùng service THẬT cho Normalize/Trust/Gate (thuần logic), mock repo + nlp/slang/alert.
describe('NlpProcessProcessor', () => {
  let processor: NlpProcessProcessor;

  const postSave = jest.fn((x: any) => Promise.resolve(x));
  const postFindOne = jest.fn<() => Promise<any>>();
  const postFind = jest.fn<() => Promise<any[]>>().mockResolvedValue([]); // baseline + cluster rỗng
  const nlpFindOne = jest.fn<() => Promise<any>>();
  const nlpSave = jest.fn((x: any) => Promise.resolve(x));
  const nlpCreate = jest.fn((x: any) => ({ ...x }));
  const platformFindOne = jest
    .fn<() => Promise<any>>()
    .mockResolvedValue({ trustLevel: 2 });
  const gateCfgFindOne = jest.fn<() => Promise<any>>().mockResolvedValue(null); // dùng default thresholds

  const analyzeArticle = jest.fn<() => Promise<any>>();
  const detectSlang = jest
    .fn<() => Promise<any>>()
    .mockResolvedValue({ hasSlang: false, detectedSlang: [] });
  const createAlertFromGate = jest
    .fn<() => Promise<any>>()
    .mockResolvedValue({});

  const analyze = jest
    .fn<() => Promise<any>>()
    .mockResolvedValue([{ text: 'Nha Trang', type: 'LOC' }]);
  const wardMatch = jest.fn<() => Promise<any>>().mockResolvedValue({
    wardId: null,
    locationText: null,
    matchedAlias: null,
    candidates: [],
    reason: 'none',
  });
  const post = {
    id: 'p1',
    content:
      'bắt quả tang một vụ mua bán ma túy lớn tại phường trung tâm hôm nay',
    platformId: 'pl1',
    groupId: 'g1',
    engagement: { likes: 5 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    postFind.mockResolvedValue([]);
    postFindOne.mockResolvedValue({ ...post });
    nlpFindOne.mockResolvedValue(null); // chưa có row → worker tự create
    platformFindOne.mockResolvedValue({ trustLevel: 2 });
    gateCfgFindOne.mockResolvedValue(null);
    analyzeArticle.mockResolvedValue({
      isRelevant: true,
      matchedKeywords: ['ma túy'],
      categories: ['lua-dao'],
      topKeywordPriority: 1,
    });
    wardMatch.mockResolvedValue({
      wardId: null,
      locationText: null,
      matchedAlias: null,
      candidates: [],
      reason: 'none',
    });

    processor = new NlpProcessProcessor(
      { findOne: postFindOne, find: postFind, save: postSave } as any,
      { findOne: nlpFindOne, save: nlpSave, create: nlpCreate } as any,
      { findOne: platformFindOne } as any,
      { findOne: gateCfgFindOne } as any,
      new NormalizeService(),
      { analyzeArticle } as any,
      { detectSlang } as any,
      new TrustService({ find: postFind } as any),
      new GateService(),
      { createAlertFromGate } as any,
      { analyze } as any,
      new IndicatorExtractorService(), // service thật (thuần logic)
      { match: wardMatch } as any,
    );
  });

  const run = () => processor.handle({ data: { postId: 'p1' } } as any);

  it('bài notable (hot keyword) → status done, gatePassed, alert được gọi', async () => {
    await run();
    const saved = nlpSave.mock.calls.at(-1)![0] as any;
    expect(saved.processingStatus).toBe('done');
    expect(saved.isNotable).toBe(true);
    expect(saved.notabilityReasons).toContain('hot_keyword');
    expect(saved.gatePassed).toBe(true);
    expect(saved.signalFeatures).toHaveProperty('zEngagement');
    expect(saved.matchedCategories).toEqual(['lua-dao']); // #1 category dẫn vào osint_post_nlp
    expect(createAlertFromGate).toHaveBeenCalledTimes(1);
  });

  it('bài KHÔNG notable → không gọi alert', async () => {
    analyzeArticle.mockResolvedValue({
      isRelevant: false,
      matchedKeywords: [],
      topKeywordPriority: null,
    });
    await run();
    const saved = nlpSave.mock.calls.at(-1)![0] as any;
    expect(saved.isNotable).toBe(false);
    expect(createAlertFromGate).not.toHaveBeenCalled();
  });

  it('lỗi 1 bước → status failed, KHÔNG throw', async () => {
    analyzeArticle.mockRejectedValue(new Error('NLP sập'));
    await expect(run()).resolves.toBeUndefined(); // không văng ra ngoài
    const saved = nlpSave.mock.calls.at(-1)![0] as any;
    expect(saved.processingStatus).toBe('failed');
    expect(createAlertFromGate).not.toHaveBeenCalled();
  });

  it('idempotent: đã có nlp row → KHÔNG create mới, chỉ update', async () => {
    nlpFindOne.mockResolvedValue({ postId: 'p1', processingStatus: 'pending' });
    await run();
    expect(nlpCreate).not.toHaveBeenCalled();
  });

  it('cache denormalized trên post được cập nhật', async () => {
    await run();
    const savedPost = postSave.mock.calls.at(-1)![0] as any;
    expect(savedPost.isRelevant).toBe(true);
    expect(savedPost.independentClusterId).toBeTruthy();
    expect(savedPost.contentHash).toBeTruthy();
  });
  it('điền entities từ NER bridge vào osint_post_nlp', async () => {
    await run();
    const saved = nlpSave.mock.calls.at(-1)![0] as any;
    expect(saved.entities).toEqual([{ text: 'Nha Trang', type: 'LOC' }]);
  });

  it('NER trả null -> entities null nhưng vẫn done, không throw', async () => {
    analyze.mockResolvedValue(null);
    await run();
    const saved = nlpSave.mock.calls.at(-1)![0] as any;
    expect(saved.entities).toBeNull();
    expect(saved.processingStatus).toBe('done');
  });

  it('#3 điền indicators (SĐT) từ nội dung bài vào osint_post_nlp', async () => {
    // Bài có số điện thoại → IndicatorExtractorService thật bóc ra PHONE
    postFindOne.mockResolvedValue({
      ...post,
      content: 'Sàn đầu tư uy tín, liên hệ 0912.345.678 để nạp tiền',
    });
    await run();
    const saved = nlpSave.mock.calls.at(-1)![0] as any;
    expect(saved.indicators).toEqual([
      { type: 'PHONE', raw: '0912.345.678', normalized: '0912345678' },
    ]);
  });

  it('#3 bài không có chỉ dấu → indicators null', async () => {
    await run(); // post mặc định không có SĐT/URL/…
    const saved = nlpSave.mock.calls.at(-1)![0] as any;
    expect(saved.indicators).toBeNull();
  });

  it('S6: post có địa danh → điền ward_id vào post_nlp', async () => {
    wardMatch.mockResolvedValue({
      wardId: 'w-dk',
      locationText: 'Diên Khánh',
      matchedAlias: 'Diên Khánh',
      candidates: [],
      reason: 'matched',
    });
    await run();
    const savedNlp = nlpSave.mock.calls.at(-1)![0] as any;
    expect(savedNlp.wardId).toBe('w-dk');
    expect(savedNlp.locationText).toBe('Diên Khánh');
  });

  it('S6: matcher ném lỗi → post vẫn done, ward_id NULL', async () => {
    wardMatch.mockImplementation(() => {
      throw new Error('gazetteer chết');
    });
    await run();
    const savedNlp = nlpSave.mock.calls.at(-1)![0] as any;
    expect(savedNlp.processingStatus).toBe('done');
    expect(savedNlp.wardId).toBeNull();
  });
});
