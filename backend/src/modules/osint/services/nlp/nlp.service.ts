import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OsintKeyword } from '../../entities/osint-keyword.entity';

export interface NlpResult {
  isRelevant: boolean; // Co lien quan ANTT hay khong (gating)
  matchedKeywords: string[]; // keywords tim thay trong bai
  topKeywordPriority: number | null; // Keyword co priority cao nhat (so nho = nong) -> alertService se dung de xac dinh do uu tien canh bao
}
@Injectable()
export class NlpService {
  private readonly logger = new Logger(NlpService.name);
  private keywordCache: OsintKeyword[] = [];
  private cacheExpiresAt = 0; // Timestamp de xac dinh khi nao can refresh cache

  constructor(
    @InjectRepository(OsintKeyword)
    private keywordRepo: Repository<OsintKeyword>,
  ) {}

  // Lay danh sach tu khoa
  private async getKeywords(): Promise<OsintKeyword[]> {
    // Neu cache con hieu luc thi tra ve cache
    if (Date.now() < this.cacheExpiresAt) {
      return this.keywordCache;
    }
    // Neu cache het hieu luc thi lam moi
    this.cacheExpiresAt = Date.now() + 5 * 60 * 1000; // THEM : 5 phut
    // Nguoc lai thi lay tu database va cap nhat cache
    this.logger.debug('Lam moi du lieu tu database');
    this.keywordCache = await this.keywordRepo.find({
      where: { isActive: true },
    });
    return this.keywordCache;
  }
  // Phan tich bai viet
  // 1. Lay danh sach tu khoa
  // 2. Tim tu khoa trong bai
  // 3. Tra ve ket qua

  async analyzeArticle(title: string, content: string): Promise<NlpResult> {
    try {
      // Lay danh sach tu khoa
      const keywords = await this.getKeywords();
      // Lay ten va noi dung bai viet
      const text = `${title ?? ''} ${content ?? ''}`.toLowerCase();
      // Tim tu khoa trong bai viet
      const matched = keywords.filter((kw) =>
        text.includes(kw.keyword.toLowerCase()),
      );
      // Tra ve ket qua
      const isRelevant: boolean = matched.length > 0;
      const matchedKeywords: string[] = matched.map((kw) => kw.keyword);
      // Neu matched.length > 0 thi lay so nho nhat trong mang matched.map(kw => kw.priority)
      const topKeywordPriority: number | null =
        matched.length > 0
          ? Math.min(...matched.map((kw) => kw.priority))
          : null;

      return {
        isRelevant: isRelevant,
        matchedKeywords: matchedKeywords,
        topKeywordPriority: topKeywordPriority,
      };
    } catch (error) {
      this.logger.error(error);
      return {
        isRelevant: false,
        matchedKeywords: [],
        topKeywordPriority: null,
      };
    }
  }
}
