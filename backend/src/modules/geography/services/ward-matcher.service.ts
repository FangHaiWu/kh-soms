import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WardAlias } from '../entities/ward-alias.entity';
import { UnmatchedLocation } from '../entities/unmatched-location.entity';
import {
  AliasIndex,
  buildIndex,
  matchWard,
  normalizeAlias,
  WardMatchResult,
} from './ward-matcher';

/**
 * Bọc logic thuần ward-matcher bằng tầng Nest: nạp gazetteer từ DB (cache trong
 * bộ nhớ) và ghi lưới vớt LOC chưa biết. Mọi quyết định khớp nằm ở hàm thuần.
 */
@Injectable()
export class WardMatcherService {
  private readonly logger = new Logger(WardMatcherService.name);
  private index: AliasIndex | null = null;

  constructor(
    @InjectRepository(WardAlias) private aliasRepo: Repository<WardAlias>,
    @InjectRepository(UnmatchedLocation)
    private unmatchedRepo: Repository<UnmatchedLocation>,
  ) {}

  // Nạp lại index (gọi sau khi seed/sửa gazetteer mà không restart app)
  async reloadIndex(): Promise<void> {
    const rows = await this.aliasRepo.find();
    this.index = buildIndex(
      rows.map((r) => ({
        wardId: r.wardId,
        alias: r.alias,
        requiresCue: r.requiresCue,
      })),
    );
  }

  async match(text: string, nerLocs?: string[]): Promise<WardMatchResult> {
    // Gazetteer chỉ ~290 mục và đổi rất hiếm → nạp 1 lần, giữ trong bộ nhớ
    if (!this.index) await this.reloadIndex();
    const result = matchWard(text, this.index!);

    // Lưới vớt: LOC nào NER thấy mà gazetteer không biết → ghi lại để bổ sung alias
    for (const loc of nerLocs ?? []) {
      const norm = normalizeAlias(loc);
      if (!norm || this.index!.has(norm)) continue;
      await this.recordUnmatched(norm, loc);
    }
    return result;
  }

  // Upsert đếm số lần gặp. Lỗi ở đây không được ảnh hưởng kết quả khớp
  // (nguyên tắc null-safe của dự án: lưới vớt là phụ trợ, không phải luồng chính).
  private async recordUnmatched(norm: string, raw: string): Promise<void> {
    try {
      const existing = await this.unmatchedRepo.findOne({
        where: { textNorm: norm },
      });
      if (existing) {
        existing.occurrences++;
        existing.lastSeen = new Date();
        await this.unmatchedRepo.save(existing);
        return;
      }
      await this.unmatchedRepo.save(
        this.unmatchedRepo.create({
          textNorm: norm,
          textRaw: raw,
          occurrences: 1,
          firstSeen: new Date(),
          lastSeen: new Date(),
        }),
      );
    } catch (e) {
      // Chỉ log warn — KHÔNG throw, vì lưới vớt không được làm hỏng kết quả match()
      this.logger.warn(`Không ghi được unmatched_location "${norm}": ${e}`);
    }
  }
}
