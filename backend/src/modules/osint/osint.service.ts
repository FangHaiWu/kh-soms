import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OsintAlert } from './entities/osint-alert.entity';
import { OsintArticle } from './entities/osint-article.entity';
import { OsintSource } from './entities/osint-source.entity';
import { OsintKeyword } from './entities/osint-keyword.entity';
import { OsintActor } from './entities/osint-actor.entity';
import { OsintActorStat } from './entities/osint-actor-stat.entity';

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
    @InjectRepository(OsintActorStat)
    private actorStatRepo: Repository<OsintActorStat>,
  ) {}

  // Lớp 2 CNC: xếp hạng actor theo tổng bài CNC (sum category_counts) giảm dần
  async getActors(opts: { type?: string; repeat?: boolean; limit?: number }) {
    // Tổng bài CNC của mỗi actor = tổng value trong jsonb category_counts
    const cncTotal = `(SELECT COALESCE(SUM((v)::int),0) FROM jsonb_each_text(s.category_counts) AS t(k,v))`;
    const qb = this.actorStatRepo
      .createQueryBuilder('s')
      .innerJoin(OsintActor, 'a', 'a.id = s.actor_id')
      .select([
        'a.actor_type AS actor_type',
        'a.display_name AS display_name',
        's.category_counts AS category_counts',
        's.notable_count AS notable_count',
        's.post_count AS post_count',
        's.distinct_indicators AS distinct_indicators',
        's.is_repeat_offender AS is_repeat_offender',
        's.last_post_at AS last_post_at',
      ])
      .addSelect(cncTotal, 'cnc_total')
      .where('s.window_days = 30');
    if (opts.type) qb.andWhere('a.actor_type = :type', { type: opts.type });
    if (opts.repeat) qb.andWhere('s.is_repeat_offender = true');
    qb.orderBy('cnc_total', 'DESC').limit(opts.limit ?? 50);
    return qb.getRawMany();
  }

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
