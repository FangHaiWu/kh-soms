import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OsintAlert } from '../../entities/osint-alert.entity';
import { NlpResult } from '../nlp/nlp.service';
import { SlangResult } from '../slang-dictionary.service';
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  constructor(
    @InjectRepository(OsintAlert)
    private alertRepo: Repository<OsintAlert>,
  ) {}

  // Kiem tra bai viet da duoc canh bao chua (tranh lap lai)
  // Scheduler chạy mỗi 15 phút → cùng 1 bài có thể được crawl + phân tích lại nhiều lần.
  // Nếu mỗi lần đều save() 1 alert mới → bảng osint_alerts ngập alert trùng cho cùng 1 bài.
  // Cần: trước khi tạo, kiểm tra đã có alert cho bài này (cùng loại) trong 1 giờ gần đây chưa. Có rồi → bỏ qua.
  private async isDuplicate(
    articleId: string,
    alertType: string,
  ): Promise<boolean> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    // Kiểm tra trong database đã có alert nào cho articleId này với alertType này và createdAt > oneHourAgo chưa
    const existing = await this.alertRepo
      .createQueryBuilder('alert')
      .where('alert.alert_type = :alertType', { alertType })
      .andWhere('alert.created_at > :oneHourAgo', { oneHourAgo })
      .andWhere('alert.source_ref_ids @> ARRAY[:articleId]::uuid[]', {
        articleId,
      }) // Mang source_ref_ids chua articleId
      .getOne();
    return existing !== null; // Tra ve true nếu tìm thấy alert trùng, false nếu không tìm thấy
  }

  async createAlertForArticle(
    articleId: string,
    title: string, // Tieu de bai viet (de hien thi trong alert)
    nlp: NlpResult,
    slang: SlangResult,
  ): Promise<OsintAlert | null> {
    try {
      // 1. Quyet dinh severity va alertType dua tren ket qua NLP + Slang. Neu khong du dieu kien thi return null
      let alertType: string | null = null;
      let severity: string | null = null;

      // Quyet dinh alertType va severity dua tren ket qua NLP
      if (nlp.topKeywordPriority === 1) {
        alertType = 'high_priority_keyword';
        severity = 'critical';
      } else if (slang.hasSlang) {
        // Neu phat hien slang thi alertType la 'slang_detected', severity 'warning'
        alertType = 'slang_detected';
        severity = 'warning';
      } else if (nlp.isRelevant) {
        // Neu bai viet co chua keyword (nhung khong co keyword priority cao nhat = 1) thi alertType la 'relevant_keyword', severity 'info'
        alertType = 'relevant_keyword';
        severity = 'info';
      }

      // Neu khong du dieu kien de tao alert thi return null
      if (!alertType || !severity) {
        this.logger.debug(
          `Bai viet ${articleId} khong du dieu kien de tao alert (nlp: ${JSON.stringify(
            nlp,
          )}, slang: ${JSON.stringify(slang)})`,
        );
        return null;
      }
      // 2. Kiem tra trung lap
      const isDup = await this.isDuplicate(articleId, alertType);
      if (isDup) {
        this.logger.debug(
          `Bai viet ${articleId} da co alert ${alertType} trong 1 gio qua, bo qua tao alert moi`,
        );
        return null;
      }

      // Tao description dua tren ket qua NLP + Slang de hien thi trong alert
      const parts: string[] = [];
      if (nlp.matchedKeywords.length > 0) {
        parts.push(`Từ khóa: ${nlp.matchedKeywords.join(', ')}`);
      }
      if (slang.detectedSlang.length > 0) {
        const listSlang = slang.detectedSlang
          .map((s) => `${s.term} (${s.meaning})`)
          .join('; ');
        parts.push(`Từ lóng: ${listSlang}`);
      }
      const description = parts.join(' | ');
      // 3. Tao alert moi
      const alert = this.alertRepo.create({
        alertType: alertType,
        severity,
        title,
        description,
        sourceRefIds: [articleId],
        isAcknowledged: false,
      });
      return await this.alertRepo.save(alert);
    } catch (error) {
      this.logger.error(`Loi khi tao alert: ${error}`);
      return null;
    }
  }
}
