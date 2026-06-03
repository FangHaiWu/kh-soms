import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AlertService } from './alert.service';
import { OsintAlert } from '../../entities/osint-alert.entity';
import { NlpResult } from '../nlp/nlp.service';
import { SlangResult } from '../slang-dictionary.service';

describe('AlertService', () => {
  let service: AlertService;

  // --- Mocks cho repository ---
  // getOne của QueryBuilder → điều khiển kết quả dedup từng test
  const getOneMock = jest.fn();
  // QueryBuilder giả: where/andWhere trả về chính nó (chainable), getOne dùng mock trên
  const qbMock = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: getOneMock,
  };
  const createQueryBuilderMock = jest.fn(() => qbMock);
  // create() trả lại nguyên dto; save() trả lại entity kèm id giả
  const createMock = jest.fn((dto) => dto);
  const saveMock = jest.fn((entity) =>
    Promise.resolve({ id: 'new-alert-id', ...entity }),
  );

  // --- Helper dựng input nhanh ---
  const nlp = (over: Partial<NlpResult> = {}): NlpResult => ({
    isRelevant: false,
    matchedKeywords: [],
    topKeywordPriority: null,
    ...over,
  });
  const slang = (over: Partial<SlangResult> = {}): SlangResult => ({
    hasSlang: false,
    detectedSlang: [],
    ...over,
  });

  beforeEach(async () => {
    getOneMock.mockReset();
    createMock.mockClear();
    saveMock.mockClear();
    qbMock.where.mockClear();
    qbMock.andWhere.mockClear();
    createQueryBuilderMock.mockClear();
    // Mặc định: KHÔNG có alert trùng
    getOneMock.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertService,
        {
          provide: getRepositoryToken(OsintAlert),
          useValue: {
            createQueryBuilder: createQueryBuilderMock,
            create: createMock,
            save: saveMock,
          },
        },
      ],
    }).compile();

    service = module.get<AlertService>(AlertService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // 1) priority=1 → critical / high_priority_keyword (ưu tiên cao nhất, kể cả có slang)
  it('topKeywordPriority=1 → tạo alert critical, kể cả khi có slang', async () => {
    const r = await service.createAlertForArticle(
      'art-1',
      'Giang hồ bị bắt',
      nlp({ isRelevant: true, matchedKeywords: ['bắt'], topKeywordPriority: 1 }),
      slang({
        hasSlang: true,
        detectedSlang: [{ term: 'cá độ', meaning: 'cờ bạc' }],
      }),
    );

    expect(r).not.toBeNull();
    expect(r!.severity).toBe('critical');
    expect(r!.alertType).toBe('high_priority_keyword');
    expect(r!.sourceRefIds).toEqual(['art-1']);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  // 2) không priority=1 nhưng có slang → warning / slang_detected
  it('có slang (priority≠1) → tạo alert warning', async () => {
    const r = await service.createAlertForArticle(
      'art-2',
      'Bài có từ lóng',
      nlp({
        isRelevant: true,
        matchedKeywords: ['trộm'],
        topKeywordPriority: 2,
      }),
      slang({
        hasSlang: true,
        detectedSlang: [{ term: 'đập đá', meaning: 'ma túy đá' }],
      }),
    );

    expect(r!.severity).toBe('warning');
    expect(r!.alertType).toBe('slang_detected');
  });

  // 3) chỉ relevant (priority≥2, không slang) → info / relevant_keyword
  it('relevant priority≥2, không slang → tạo alert info', async () => {
    const r = await service.createAlertForArticle(
      'art-3',
      'Bài liên quan nhẹ',
      nlp({
        isRelevant: true,
        matchedKeywords: ['vụ án'],
        topKeywordPriority: 3,
      }),
      slang(),
    );

    expect(r!.severity).toBe('info');
    expect(r!.alertType).toBe('relevant_keyword');
  });

  // 4) không liên quan, không slang → KHÔNG tạo alert, save không được gọi
  it('không liên quan + không slang → trả null, không gọi save', async () => {
    const r = await service.createAlertForArticle(
      'art-4',
      'Thực phẩm cho thận',
      nlp(),
      slang(),
    );

    expect(r).toBeNull();
    expect(saveMock).not.toHaveBeenCalled();
  });

  // 5) DEDUP — đã có alert trùng trong 1h → trả null, không tạo mới
  it('đã có alert trùng (getOne trả về bản ghi) → trả null, không gọi save', async () => {
    getOneMock.mockResolvedValue({ id: 'existing-alert' }); // giả lập đã tồn tại

    const r = await service.createAlertForArticle(
      'art-5',
      'Bài đã cảnh báo',
      nlp({ isRelevant: true, matchedKeywords: ['cướp'], topKeywordPriority: 1 }),
      slang(),
    );

    expect(r).toBeNull();
    expect(saveMock).not.toHaveBeenCalled();
  });

  // 6) DESCRIPTION — ghép cả keyword lẫn slang
  it('description ghép cả từ khóa lẫn từ lóng', async () => {
    const r = await service.createAlertForArticle(
      'art-6',
      'Bài đủ cả 2',
      nlp({
        isRelevant: true,
        matchedKeywords: ['bắt', 'giang hồ'],
        topKeywordPriority: 1,
      }),
      slang({
        hasSlang: true,
        detectedSlang: [{ term: 'cá độ', meaning: 'cờ bạc' }],
      }),
    );

    expect(r!.description).toContain('bắt, giang hồ');
    expect(r!.description).toContain('cá độ (cờ bạc)');
  });
});
