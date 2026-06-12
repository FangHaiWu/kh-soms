import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
// Interface chua thong tin bai viet
export interface ExtractedArticle {
  title: string | null;
  content: string | null;
  author: string | null;
  publishedDate: string | null;
  url: string;
}

@Injectable()
export class NewsExtractorBridgeService {
  private readonly logger = new Logger(NewsExtractorBridgeService.name);
  // Url service python - doc tu env, co default cho dev
  private readonly url = process.env.EXTRACTOR_URL ?? 'http://localhost:8000';

  // Tra ve du lieu bai, hoac null neu bóc thất bại (để collector bỏ qua url này)
  async extract(url: string): Promise<ExtractedArticle | null> {
    try {
      // POST {url} sang Python / extract, timeout de khong treo
      const res = await axios.post(
        `${this.url}/extract`,
        { url },
        {
          timeout: 20000,
        },
      );
      return res.data as ExtractedArticle; // status 2xx thanh cong
    } catch (error) {
      // Non-2xx (422/502/500...) hoặc service python chết
      if (axios.isAxiosError(error)) {
        if (error.response) {
          this.logger.warn(
            `Extract lỗi: ${error.response.status} cho ${url}: ${error.response.data?.detail}`,
          );
        } else {
          // Khong co response = khong ket noi duoc -> service python chet/sai url
          this.logger.error(
            `Không gọi được news-extractor cho ${url}: ${error.message}`,
          );
        }
      } else {
        // Lỗi lạ ngoài axios
        this.logger.error(
          `Lỗi không xác định khi extract ${url}: ${String(error)}`,
        );
      }
      return null;
    }
  }
}
