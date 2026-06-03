import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OsintAlert } from './entities/osint-alert.entity';
import { OsintArticle } from './entities/osint-article.entity';
import { OsintSource } from './entities/osint-source.entity';
import { OsintKeyword } from './entities/osint-keyword.entity';

@Injectable()
export class OsintService {
  constructor(
    @InjectRepository(OsintArticle)
    private articleRepo: Repository<OsintArticle>,
    @InjectRepository(OsintSource)
    private sourceRepo: Repository<OsintSource>,
    @InjectRepository(OsintAlert)
    private alertRepo: Repository<OsintAlert>,
    @InjectRepository(OsintKeyword)
    private keywordRepo: Repository<OsintKeyword>,
  ) {}

  // Lay danh sach cac nguon theo doi
  async getSources(): Promise<OsintSource[]> {
    return this.sourceRepo.find({ order: { trustLevel: 'DESC' } });
  }

  // Lay danh sach article

  async getArticles(): Promise<OsintArticle[]> {
    return this.articleRepo.find({
      order: { publishedAt: 'DESC' },
    });
  }

  // Lay danh sach canh bao chua doc
  async getAlerts(): Promise<OsintAlert[]> {
    return this.alertRepo.find({
      where: { isAcknowledged: false },
      order: { createdAt: 'DESC' },
    });
  }

  // Lay danh sach tu khoa dang active (isACtive = true), sap xep theo priority tang dan (1 la uu tien cao nhat)
  async getKeywords(): Promise<OsintKeyword[]> {
    return this.keywordRepo.find({
      where: { isActive: true },
      order: { priority: 'ASC' },
    });
  }
}
