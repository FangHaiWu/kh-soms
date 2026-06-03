import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OsintSlangDictionary } from '../entities/osint-slang-dictionary.entity';
export interface SlangResult {
  hasSlang: boolean;
  detectedSlang: { term: string; meaning: string }[]; // kem nghia de hien thi
}
@Injectable()
export class SlangDictionaryService {
  private readonly logger = new Logger(SlangDictionaryService.name);
  private slangDictionaryCache: OsintSlangDictionary[] = [];
  private cacheExpiresAt = 0;

  constructor(
    @InjectRepository(OsintSlangDictionary)
    private slangRepo: Repository<OsintSlangDictionary>,
  ) {}

  private async getSlangTerm(): Promise<OsintSlangDictionary[]> {
    // Neu cache con hieu luc thi tra ve cache
    if (Date.now() < this.cacheExpiresAt) {
      return this.slangDictionaryCache;
    }

    this.slangDictionaryCache = await this.slangRepo.find({
      where: { isActive: true },
    });
    // Neu cache het hieu luc thi lam moi
    this.cacheExpiresAt = Date.now() + 5 * 60 * 1000; // Them: 5 phut
    this.logger.debug('Lam moi du lieu tu database');
    return this.slangDictionaryCache;
  }
  // Phan tich bai viet de phat hien slang
  // 1. Lay danh sach slang
  // 2. Tim slang trong bai
  // 3. Tra ve ket qua
  async detectSlang(title: string, content: string): Promise<SlangResult> {
    const text = `${title ?? ''} ${content ?? ''}`.toLowerCase();
    try {
      // Lay danh sach slang tu database (co cache)
      const slangTerms = await this.getSlangTerm();
      const detectedSlang: { term: string; meaning: string }[] = [];
      for (const slang of slangTerms) {
        if (text.includes(slang.term.toLowerCase())) {
          detectedSlang.push({ term: slang.term, meaning: slang.meaning });
        }
      }
      return {
        hasSlang: detectedSlang.length > 0,
        detectedSlang,
      };
    } catch (error) {
      this.logger.error(error);
      return {
        hasSlang: false,
        detectedSlang: [],
      };
    }
  }
}
