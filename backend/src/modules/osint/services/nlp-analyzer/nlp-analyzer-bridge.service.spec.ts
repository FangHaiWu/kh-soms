import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import axios from 'axios';
import { NlpAnalyzerBridgeService } from './nlp-analyzer-bridge.service';

// Mock toàn bộ axios: test chỉ kiểm logic bridge (bóc entities / xử lỗi), không gọi HTTP thật
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('NlpAnalyzerBridgeService', () => {
  let service: NlpAnalyzerBridgeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NlpAnalyzerBridgeService();
  });

  it('trả mảng entities khi service trả 2xx', async () => {
    // Service Python trả {entities: [...]} → bridge phải bóc đúng field entities
    mockedAxios.post.mockResolvedValue({
      data: { entities: [{ text: 'Nha Trang', type: 'LOC' }] },
    });
    const result = await service.analyze('bất kỳ');
    expect(result).toEqual([{ text: 'Nha Trang', type: 'LOC' }]);
  });

  it('trả null khi non-2xx (có response lỗi)', async () => {
    // 422/500... → axios reject có response → bridge nuốt lỗi, trả null
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.post.mockRejectedValue({
      response: { status: 422, data: { detail: 'x' } },
    });
    const result = await service.analyze('bất kỳ');
    expect(result).toBeNull();
  });

  it('trả null khi không kết nối được (service chết)', async () => {
    // Không có response = service python chết → trả null để worker suy biến
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.post.mockRejectedValue({ message: 'ECONNREFUSED' });
    const result = await service.analyze('bất kỳ');
    expect(result).toBeNull();
  });
});
