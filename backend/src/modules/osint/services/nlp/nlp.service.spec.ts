import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NlpService } from './nlp.service';
import { OsintKeyword } from '../../entities/osint-keyword.entity';
import { beforeEach, jest } from '@jest/globals';
import { describe, expect, it } from '@jest/globals';

describe('NlpService', () => {
  let service: NlpService;

  // Mock cho keywordRepo.find() — thay DB thật bằng hàm giả
  const findMock = jest.fn<() => Promise<OsintKeyword[]>>();

  beforeEach(async () => {
    findMock.mockReset();
    // Arrange (mặc định): danh sách keyword GIẢ dùng chung cho các test
    const baseKeyword = {
      scope: 'global',
      groupIds: null,
      region: null,
      notes: null,
      updatedAt: new Date(),
    };
    findMock.mockResolvedValue([
      { ...baseKeyword, id: '1', keyword: 'bắt', priority: 1, isActive: true, category: 'annt', createdAt: new Date() },
      { ...baseKeyword, id: '2', keyword: 'giang hồ', priority: 2, isActive: true, category: 'annt', createdAt: new Date() },
      { ...baseKeyword, id: '3', keyword: 'cướp', priority: 1, isActive: true, category: 'annt', createdAt: new Date() },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NlpService,
        // Cung cấp mock repo cho đúng token mà @InjectRepository(OsintKeyword) cần
        {
          provide: getRepositoryToken(OsintKeyword),
          useValue: { find: findMock },
        },
      ],
    }).compile();

    service = module.get<NlpService>(NlpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // 1) HAPPY PATH — bài chứa keyword → isRelevant=true, trả đúng matchedKeywords
  it('bài chứa keyword ANTT → isRelevant=true và liệt kê đúng từ khớp', async () => {
    // Act
    const r = await service.analyzeArticle("Dũng 'Kỷ' bị bắt", 'cướp tài sản');

    // Assert
    expect(r.isRelevant).toBe(true);
    expect(r.matchedKeywords).toContain('bắt');
    expect(r.matchedKeywords).toContain('cướp');
    expect(r.matchedKeywords).not.toContain('giang hồ'); // không có trong text
  });

  // 2) REGRESSION Bug 2 — topKeywordPriority = MIN, không phải phần tử khớp đầu tiên
  it('topKeywordPriority lấy MIN priority các từ khớp (1, không phải 2)', async () => {
    // 'giang hồ'(p2) đứng trước 'bắt'(p1) trong mock → nếu lấy matched[0] sẽ ra 2 (SAI)
    const r = await service.analyzeArticle('giang hồ bị bắt', '');

    expect(r.matchedKeywords).toEqual(
      expect.arrayContaining(['giang hồ', 'bắt']),
    );
    expect(r.topKeywordPriority).toBe(1); // min(2, 1) = 1
  });

  // 3a) EDGE — bài không chứa keyword → false, [], null
  it('bài không liên quan → isRelevant=false, mảng rỗng, priority null', async () => {
    const r = await service.analyzeArticle(
      'Thực phẩm vàng cho thận',
      'ăn uống lành mạnh',
    );

    expect(r.isRelevant).toBe(false);
    expect(r.matchedKeywords).toEqual([]);
    expect(r.topKeywordPriority).toBeNull();
  });

  // 3b) EDGE — input null/undefined → KHÔNG crash, trả kết quả an toàn
  it('title/content null → không ném lỗi, trả isRelevant=false', async () => {
    const r = await service.analyzeArticle(null as any, null as any);

    expect(r.isRelevant).toBe(false);
    expect(r.matchedKeywords).toEqual([]);
    expect(r.topKeywordPriority).toBeNull();
  });

  // 4) REGRESSION Bug 1 — cache 5 phút: gọi 2 lần chỉ query DB 1 lần
  it('cache keyword: gọi analyzeArticle 2 lần → repo.find chạy đúng 1 lần', async () => {
    await service.analyzeArticle('bài 1', 'nội dung');
    await service.analyzeArticle('bài 2', 'nội dung');

    expect(findMock).toHaveBeenCalledTimes(1);
  });
});
