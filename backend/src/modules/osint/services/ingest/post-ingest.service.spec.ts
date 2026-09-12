import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PostIngestService, IngestContext } from './post-ingest.service';
import { RawPost } from '../collectors/raw-post.interface';

// S5a: ingest chỉ "lưu thô + enqueue". Không còn NLP/alert inline → mock repo + queue là đủ.
describe('PostIngestService (S5a slim)', () => {
  let svc: PostIngestService;

  const postFindOne = jest.fn<() => Promise<any>>();
  const postCreate = jest.fn((x: any) => ({ ...x }));
  const postSave = jest.fn((x: any) => Promise.resolve({ ...x, id: 'post-1' }));
  const nlpCreate = jest.fn((x: any) => ({ ...x }));
  const nlpSave = jest.fn((x: any) => Promise.resolve(x));
  const logCreate = jest.fn((x: any) => ({ ...x }));
  const logSave = jest.fn((x: any) => Promise.resolve(x));
  const commentCreate = jest.fn((x: any) => ({ ...x }));
  const commentSave = jest.fn((x: any) => Promise.resolve(x));
  const queueAdd = jest.fn<() => Promise<any>>().mockResolvedValue({});

  const ctx: IngestContext = {
    platformId: 'pl1',
    crawlType: 'facebook',
    groupId: 'g1',
  };
  const raw: RawPost = {
    externalPostId: 'ext-1',
    content: 'một bài viết công khai về an ninh trật tự khu phố',
    engagement: { likes: 3 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    postFindOne.mockResolvedValue(null); // mặc định: post chưa tồn tại
    svc = new PostIngestService(
      { findOne: postFindOne, create: postCreate, save: postSave } as any,
      { create: nlpCreate, save: nlpSave } as any,
      { create: logCreate, save: logSave } as any,
      { create: commentCreate, save: commentSave } as any,
      { add: queueAdd } as any,
    );
  });

  it('post mới → lưu post + tạo osint_post_nlp(pending) + enqueue process-post', async () => {
    const summary = await svc.ingest([raw], ctx);

    expect(postSave).toHaveBeenCalledTimes(1);
    // tạo hàng nlp trạng thái pending
    const nlpArg = nlpCreate.mock.calls[0][0] as any;
    expect(nlpArg.processingStatus).toBe('pending');
    expect(nlpArg.postId).toBe('post-1');
    // enqueue đúng job + payload
    expect(queueAdd).toHaveBeenCalledWith('process-post', { postId: 'post-1' });
    expect(summary.collected).toBe(1);
  });

  it('dedup: post đã tồn tại → KHÔNG enqueue, skipped++', async () => {
    postFindOne.mockResolvedValue({ id: 'cũ' });
    const summary = await svc.ingest([raw], ctx);

    expect(queueAdd).not.toHaveBeenCalled();
    expect(postSave).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
    expect(summary.collected).toBe(0);
  });

  it('ingest KHÔNG tự tạo alert (alertsCreated luôn 0 — alert do worker/Gate)', async () => {
    const summary = await svc.ingest([raw], ctx);
    expect(summary.alertsCreated).toBe(0);
    expect(summary.relevant).toBe(0);
  });
});
