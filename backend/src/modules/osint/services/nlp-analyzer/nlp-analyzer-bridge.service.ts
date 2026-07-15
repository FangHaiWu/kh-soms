import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

// Một thực thể NER trả về từ service Python: text đầy đủ + loại (chỉ PER/ORG/LOC, MISC đã bị lọc phía Python)
export interface NerEntity {
  text: string;
  type: 'PER' | 'ORG' | 'LOC';
}

/**
 * Bridge gọi service Python nlp-analyzer (underthesea NER).
 *
 * Trả mảng entities khi thành công, hoặc null khi service chết/timeout/lỗi — worker dựa
 * vào null để suy biến an toàn (một bài thiếu entities không được làm chết pipeline).
 */
@Injectable()
export class NlpAnalyzerBridgeService {
  private readonly logger = new Logger(NlpAnalyzerBridgeService.name);
  // Url service python — đọc từ env, có default cho dev (khác news-extractor: port 8001)
  private readonly url =
    process.env.NLP_ANALYZER_URL ?? 'http://localhost:8001';

  // Trả entities NER, hoặc null nếu lỗi (để worker gán entities = null và chạy tiếp)
  async analyze(text: string): Promise<NerEntity[] | null> {
    try {
      // POST {text} sang Python /ner. Timeout 5s: NER nhanh, quá 5s coi như service kẹt
      const res = await axios.post(
        `${this.url}/ner`,
        { text },
        { timeout: 5000 },
      );
      // Response dạng {entities: [...]} → bóc đúng field entities (không phải cả res.data)
      return res.data.entities as NerEntity[];
    } catch (error) {
      // Non-2xx (422/500...) hoặc service python chết → log rồi trả null
      if (axios.isAxiosError(error)) {
        if (error.response) {
          this.logger.warn(
            `NER lỗi: ${error.response.status} — ${error.response.data?.detail}`,
          );
        } else {
          // Không có response = không kết nối được → service python chết/sai url
          this.logger.error(`Không gọi được nlp-analyzer: ${error.message}`);
        }
      } else {
        // Lỗi lạ ngoài axios
        this.logger.error(`Lỗi không xác định khi gọi NER: ${String(error)}`);
      }
      return null;
    }
  }
}
