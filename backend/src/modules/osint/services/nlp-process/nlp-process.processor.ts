import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OsintPost } from '../../entities/osint-post.entity';
import { OsintPostNlp } from '../../entities/osint-post-nlp.entity';
import { OsintPlatform } from '../../entities/osint-platform.entity';
import { OsintGateConfig } from '../../entities/osint-gate-config.entity';
import { NormalizeService } from '../normalize/normalize.service';
import { NlpService } from '../nlp/nlp.service';
import { SlangDictionaryService } from '../slang-dictionary.service';
import { TrustService } from '../trust/trust.service';
import { GateService, GateThresholds } from '../gate/gate.service';
import { AlertService } from '../alert/alert.service';
import { NlpAnalyzerBridgeService } from '@modules/osint/services/nlp-analyzer/nlp-analyzer-bridge.service';
import { IndicatorExtractorService } from '../indicator/indicator-extractor.service';
// Ngưỡng mặc định khi chưa có hàng osint_gate_config active (worker vẫn chạy được).
const DEFAULT_THRESHOLDS: GateThresholds = {
  zScoreCutoff: 2,
  hotPriorityMax: 2,
  minCorrobK: 2,
  highTrustMin: 4,
};

// Cửa sổ gom cụm corroboration (giờ) — cùng nội dung xuất hiện trong khoảng này mới tính chung cụm.
const CORROB_WINDOW_HOURS = 48;

/**
 * NlpProcessProcessor — worker async chạy pipeline phân tích 1 post (Zone A).
 *
 * Ingest chỉ lưu post thô + enqueue; worker này làm phần nặng, tách khỏi hot-path crawl.
 * Flow: load → Normalize → NLP rẻ → Trust → Gate → ghi osint_post_nlp + cache post → alert nếu notable.
 * Idempotent: dùng lại hàng osint_post_nlp theo post_id (BullMQ retry không nhân đôi).
 */
@Processor('osint-nlp')
export class NlpProcessProcessor {
  private readonly logger = new Logger(NlpProcessProcessor.name);

  constructor(
    @InjectRepository(OsintPost) private postRepo: Repository<OsintPost>,
    @InjectRepository(OsintPostNlp)
    private postNlpRepo: Repository<OsintPostNlp>,
    @InjectRepository(OsintPlatform)
    private platformRepo: Repository<OsintPlatform>,
    @InjectRepository(OsintGateConfig)
    private gateConfigRepo: Repository<OsintGateConfig>,
    private normalize: NormalizeService,
    private nlpService: NlpService,
    private slangService: SlangDictionaryService,
    private trust: TrustService,
    private gate: GateService,
    private alert: AlertService,
    private nerBridge: NlpAnalyzerBridgeService,
    private indicatorExtractor: IndicatorExtractorService,
  ) {}

  @Process('process-post')
  async handle(job: Job<{ postId: string }>): Promise<void> {
    const { postId } = job.data;

    // 1. Load post; không có thì bỏ qua (đã bị xóa?) — không throw để job không kẹt
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) {
      this.logger.warn(`Post ${postId} không tồn tại, bỏ qua job`);
      return;
    }

    // Find-or-create hàng nlp (ingest thường đã tạo pending; find-or-create để idempotent + chạy độc lập)
    let nlp = await this.postNlpRepo.findOne({ where: { postId } });
    if (!nlp) nlp = this.postNlpRepo.create({ postId });
    nlp.processingStatus = 'processing';
    await this.postNlpRepo.save(nlp);

    try {
      // 2. Normalize → nội dung sạch + content_hash ổn định (dùng cho cả NLP lẫn gom cụm)
      const { normalizedContent, contentHash } = this.normalize.normalize(
        post.content ?? '',
      );
      post.contentHash = contentHash;

      // 3. NLP rẻ (keyword + slang). NER/sentiment = khe cắm S5b (chưa gọi).
      const nlpResult = await this.nlpService.analyzeArticle(
        '',
        normalizedContent,
      );
      const slang = await this.slangService.detectSlang('', normalizedContent);
      const nerEntities = await this.nerBridge.analyze(normalizedContent);

      // #3 CNC: bóc chỉ dấu (SĐT/STK/ví/URL/handle) bằng regex — không đụng Gate, nuôi vân-tay-actor L2
      const indicators = this.indicatorExtractor.extract(normalizedContent);
      // 4. Trust: platform prior → source trust; gom cụm corroboration theo content_hash → credibility
      const platform = await this.platformRepo.findOne({
        where: { id: post.platformId },
      });
      const P = platform?.trustLevel ?? 3; // prior; profile=0, R=null (chưa có verdict)
      const sourceTrust = this.trust.sourceTrust(P, null, 0);
      const { clusterId, k } = await this.trust.assignCluster(
        contentHash,
        CORROB_WINDOW_HOURS,
      );
      const corrob = this.trust.corrobIndep(k);
      const sNorm = (sourceTrust - 1) / 4; // 1..5 → 0..1
      const credibility = this.trust.postCredibility(sNorm, corrob, false, 0); // nlpRisk=0 (S5b sau)
      post.independentClusterId = clusterId;

      // 5. Gate: dựng input đa tín hiệu → quyết định notability (OR)
      const thresholds = await this.loadThresholds();
      const engagement = this.sumEngagement(post.engagement);
      const { mean, std } = await this.computePageBaseline(
        post.groupId,
        postId,
      );
      const decision = this.gate.evaluate({
        content: normalizedContent,
        matchedKeywords: nlpResult.matchedKeywords,
        topKeywordPriority: nlpResult.topKeywordPriority,
        sentimentScore: null, // khe cắm S5b
        engagement,
        pageMean: mean,
        pageStd: std,
        sourceTrust,
        corrobK: k,
        thresholds,
      });

      // 6. Ghi osint_post_nlp (nguồn sự thật NLP)
      nlp.isRelevant = nlpResult.isRelevant;
      nlp.matchedKeywords = nlpResult.matchedKeywords;
      // #1 CNC: gắn nhãn (các) category nhóm CNC bài thuộc về (route đơn vị + phân tích)
      nlp.matchedCategories = nlpResult.categories;
      nlp.topKeywordPriority = nlpResult.topKeywordPriority ?? null;
      nlp.hasSlang = slang.hasSlang;
      nlp.detectedSlang = slang.detectedSlang;
      nlp.entities = nerEntities ?? null;
      nlp.indicators = indicators.length > 0 ? indicators : null;
      nlp.isNotable = decision.isNotable;
      nlp.notabilityReasons = decision.notabilityReasons;
      nlp.signalFeatures = decision.signalFeatures;
      nlp.gatePassed = decision.isNotable; // cờ cho S5c LLM
      nlp.credibility = credibility;
      nlp.processingStatus = 'done';
      await this.postNlpRepo.save(nlp);

      // Cache denormalized trên post (tiện lọc; hiện chưa ai đọc nhưng giữ nhất quán)
      post.isRelevant = nlpResult.isRelevant;
      post.keywords = nlpResult.matchedKeywords;
      post.riskScore = this.riskFromPriority(nlpResult.topKeywordPriority);
      await this.postRepo.save(post);

      // 7. Alert nếu notable (dời từ ingest sang đây — alert phụ thuộc kết quả NLP async)
      if (decision.isNotable) {
        const title = (post.content ?? '').slice(0, 80);
        await this.alert.createAlertFromGate(
          postId,
          title,
          decision,
          nlpResult,
          slang,
        );
      }
    } catch (e) {
      // 1 bài lỗi không được làm chết worker/các job khác. Đánh dấu failed, không rethrow.
      this.logger.error(
        `Xử lý NLP post ${postId} thất bại: ${e instanceof Error ? e.message : String(e)}`,
      );
      nlp.processingStatus = 'failed';
      await this.postNlpRepo.save(nlp);
    }
  }

  /** Đọc ngưỡng Gate từ config active; thiếu field nào lấy default. */
  private async loadThresholds(): Promise<GateThresholds> {
    const cfg = await this.gateConfigRepo.findOne({
      where: { isActive: true },
    });
    const t = cfg?.thresholds ?? {};
    return {
      zScoreCutoff: t.zScoreCutoff ?? DEFAULT_THRESHOLDS.zScoreCutoff,
      hotPriorityMax: t.hotPriorityMax ?? DEFAULT_THRESHOLDS.hotPriorityMax,
      minCorrobK: t.minCorrobK ?? DEFAULT_THRESHOLDS.minCorrobK,
      highTrustMin: t.highTrustMin ?? DEFAULT_THRESHOLDS.highTrustMin,
    };
  }

  /** Gộp engagement jsonb thành 1 con số cho z-score. */
  private sumEngagement(e: OsintPost['engagement'] | null | undefined): number {
    if (!e) return 0;
    let sum = 0;
    for (const key of [
      'likes',
      'shares',
      'reposts',
      'commentCount',
      'viewCount',
    ]) {
      const v = e[key];
      if (typeof v === 'number') sum += v;
    }
    if (e.reactions) {
      for (const v of Object.values(e.reactions)) {
        if (typeof v === 'number') sum += v;
      }
    }
    return sum;
  }

  /** Baseline μ, σ engagement của page (loại chính bài đang xét). <2 mẫu → std=0 (Gate tự bỏ z-score). */
  private async computePageBaseline(
    groupId: string | null,
    excludePostId: string,
  ): Promise<{ mean: number; std: number }> {
    if (!groupId) return { mean: 0, std: 0 };
    const rows = await this.postRepo.find({
      where: { groupId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const vals = rows
      .filter((r) => r.id !== excludePostId)
      .map((r) => this.sumEngagement(r.engagement));
    if (vals.length < 2) return { mean: 0, std: 0 };
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance =
      vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    return { mean, std: Math.sqrt(variance) };
  }

  /** Cache rủi ro tạm theo priority (giữ tương thích cột osint_posts.risk_score). */
  private riskFromPriority(topPriority: number | null): number {
    switch (topPriority) {
      case 1:
        return 0.9;
      case 2:
        return 0.7;
      case 3:
        return 0.5;
      case 4:
        return 0.3;
      case 5:
        return 0.15;
      default:
        return 0;
    }
  }
}
