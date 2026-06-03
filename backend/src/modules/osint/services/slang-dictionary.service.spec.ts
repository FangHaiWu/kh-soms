import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SlangDictionaryService } from './slang-dictionary.service';
import { OsintSlangDictionary } from '../entities/osint-slang-dictionary.entity';

describe('SlangDictionaryService', () => {
  let service: SlangDictionaryService;

  // Mock cho slangRepo.find() — thay DB thật bằng hàm giả
  const findMock = jest.fn();

  beforeEach(async () => {
    findMock.mockReset();
    // Arrange (mặc định): từ lóng GIẢ — chọn từ đặc trưng ≥3 ký tự để tránh khớp nhầm
    findMock.mockResolvedValue([
      { term: 'đập đá', meaning: 'sử dụng ma túy đá', isActive: true },
      { term: 'hàng trắng', meaning: 'heroin', isActive: true },
      { term: 'tài xỉu', meaning: 'cờ bạc bằng xúc xắc', isActive: true },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlangDictionaryService,
        {
          provide: getRepositoryToken(OsintSlangDictionary),
          useValue: { find: findMock },
        },
      ],
    }).compile();

    service = module.get<SlangDictionaryService>(SlangDictionaryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // 1) HAPPY PATH — bài chứa từ lóng → hasSlang=true, trả đúng term + meaning
  it('bài chứa từ lóng → hasSlang=true và kèm nghĩa thực', async () => {
    const r = await service.detectSlang(
      'Nhóm thanh niên tổ chức đập đá',
      'tụ tập sử dụng và mua bán hàng trắng',
    );

    expect(r.hasSlang).toBe(true);
    expect(r.detectedSlang).toEqual(
      expect.arrayContaining([
        { term: 'đập đá', meaning: 'sử dụng ma túy đá' },
        { term: 'hàng trắng', meaning: 'heroin' },
      ]),
    );
    // 'tài xỉu' không có trong text
    expect(r.detectedSlang).not.toContainEqual({
      term: 'tài xỉu',
      meaning: 'cờ bạc bằng xúc xắc',
    });
  });

  // 2) EDGE — bài không chứa từ lóng → false, mảng rỗng
  it('bài không có từ lóng → hasSlang=false, mảng rỗng', async () => {
    const r = await service.detectSlang(
      'Hội nghị xúc tiến du lịch Khánh Hòa',
      'thu hút nhà đầu tư trong và ngoài nước',
    );

    expect(r.hasSlang).toBe(false);
    expect(r.detectedSlang).toEqual([]);
  });

  // 3) EDGE — input null/undefined → KHÔNG crash, trả kết quả an toàn
  it('title/content null → không ném lỗi, trả hasSlang=false', async () => {
    const r = await service.detectSlang(null as any, null as any);

    expect(r.hasSlang).toBe(false);
    expect(r.detectedSlang).toEqual([]);
  });

  // 4) CACHE — gọi detectSlang 2 lần → repo.find chạy đúng 1 lần
  it('cache từ lóng: gọi detectSlang 2 lần → repo.find chạy đúng 1 lần', async () => {
    await service.detectSlang('bài 1', 'nội dung');
    await service.detectSlang('bài 2', 'nội dung');

    expect(findMock).toHaveBeenCalledTimes(1);
  });
});
