import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OsintAlert } from '../../entities/osint-alert.entity';
import { NlpResult } from '../nlp/nlp.service';
import { SlangResult } from '../slang-dictionary.service';
import { GateDecision } from '../gate/gate.service';
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  constructor(
    @InjectRepository(OsintAlert)
    private alertRepo: Repository<OsintAlert>,
  ) {}

  /**
   * Alert từ quyết định Gate (S5a — thay các rule NLP rời rạc bằng notability đa tín hiệu).
   * Flow: map severity từ notabilityReasons + priority → dedup 1h (tái dùng isDuplicate) → persist.
   * Trả null nếu không map được loại alert hoặc trùng trong 1h.
   */
  async createAlertFromGate(
    postId: string,
    title: string,
    decision: GateDecision,
    nlp: NlpResult,
    slang: SlangResult,
  ): Promise<OsintAlert | null> {
    try {
      const reasons = decision.notabilityReasons;
      let alertType: string | null = null;
      let severity: string | null = null;

      // Ưu tiên nghiệp vụ: keyword nóng nhất → corroboration → engagement bất thường → nguồn tin cậy.
      // (mỗi bài chỉ sinh 1 alert theo tín hiệu ưu tiên cao nhất, tránh spam nhiều alert/1 bài)
      if (reasons.includes('hot_keyword') && nlp.topKeywordPriority === 1) {
        alertType = 'high_priority_keyword';
        severity = 'critical';
      } else if (reasons.includes('hot_keyword')) {
        alertType = 'relevant_keyword';
        severity = 'warning';
      } else if (reasons.includes('corroboration')) {
        alertType = 'corroboration';
        severity = 'warning';
      } else if (reasons.includes('abnormal_engagement')) {
        alertType = 'abnormal_engagement';
        severity = 'info';
      } else if (reasons.includes('high_source_trust')) {
        alertType = 'trusted_source';
        severity = 'info';
      }

      // Không notable / không map được loại → không tạo alert
      if (!alertType || !severity) return null;

      // Dedup 1h: cùng bài + cùng loại đã có trong 1h qua → bỏ (scheduler chạy lại không nhân đôi)
      if (await this.isDuplicate(postId, alertType)) return null;

      // Mô tả gắn ngữ cảnh để điều tra viên đọc nhanh
      const parts: string[] = [];
      if (nlp.matchedKeywords.length > 0) {
        parts.push(`Từ khóa: ${nlp.matchedKeywords.join(', ')}`);
      }
      if (slang.detectedSlang.length > 0) {
        parts.push(
          `Từ lóng: ${slang.detectedSlang.map((s) => `${s.term} (${s.meaning})`).join('; ')}`,
        );
      }
      parts.push(`Tín hiệu Gate: ${reasons.join(', ')}`);

      const alert = this.alertRepo.create({
        alertType,
        severity,
        title,
        description: parts.join(' | '),
        sourceRefIds: [postId],
        isAcknowledged: false,
      });
      return await this.alertRepo.save(alert);
    } catch (error) {
      this.logger.error(`Lỗi khi tạo alert từ gate: ${error}`);
      return null;
    }
  }

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
      this.logger.error(`Lỗi khi tạo alert: ${error}`);
      return null;
    }
  }

  // Alert vận hành/hệ thống (không gắn NLP) --> Vd: acct FB rơi checkpoint, pool cạn
  // Ghi cùng bảng osint_alerts để admin thấy chung 1 surface, nhưng alert này không liên quan đến bài viết cụ thể nào (không có sourceRefIds)
  async createSystemAlert(params: {
    alertType: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description?: string;
    sourceRefIds?: string[]; // Vd: [accountId] để truy vết account FB nào gặp sự cố
    dedupWindowMinutes?: number; // Nếu đã có alert cùng loại trong khoảng thời gian này thì bỏ qua (tránh spam alert)
  }): Promise<OsintAlert | null> {
    try {
      const { dedupWindowMinutes, ...restParams } = params; // Loại bỏ dedupWindowMinutes khỏi params trước khi tạo alert
      // Chỉ dedup khi caller yêu cầu cầu(alert theo trạng thái như checkpoint KHÔNG cần - đã dedup tự nhiên)
      if (dedupWindowMinutes) {
        const oneWindowAgo = new Date(
          Date.now() - dedupWindowMinutes * 60 * 1000,
        );
        const existing = await this.alertRepo
          .createQueryBuilder('alert')
          .where('alert.alert_type = :t', { t: params.alertType })
          .andWhere('alert.created_at > :oneWindowAgo', { oneWindowAgo })
          .getOne();
        if (existing) {
          this.logger.debug(
            `Alert ${params.alertType} đã có trong ${params.dedupWindowMinutes} phút qua, bỏ qua tạo alert mới (title: ${params.title})`,
          );
          return null;
        }
      }

      const alert = this.alertRepo.create({
        ...restParams,
        isAcknowledged: false,
      });
      return await this.alertRepo.save(alert);
    } catch (error) {
      // Alert lỗi không được làm gãy luồng crawl, chỉ log lỗi và bỏ qua
      this.logger.error(`Lỗi khi tạo system alert: ${error}`);
      return null;
    }
  }
}
