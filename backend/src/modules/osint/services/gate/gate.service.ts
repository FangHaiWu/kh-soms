export interface GateThresholds {
  zScoreCutoff: number; // engagement bất thường khi z > cái này
  hotPriorityMax: number; // keyword "nóng" khi priority <= cái này
  minCorrobK: number; // corroboration khi số cụm độc lập  >= cái này
  highTrustMin?: number; // trust cao khi >= cái này
}

export interface GateInput {
  content: string; // đã normalize
  matchedKeywords: string[]; // từ NlpService
  topKeywordPriority: number | null;
  sentimentScore: number | null; // S5b - null = tắt tín hiệu sentiment

  engagement: number; // Một con số tổng hợp (likes + shares + comments) từ platform-specific data
  pageMean: number; // baseline μ của page
  pageStd: number; // baseline σ của page
  sourceTrust: number; // 1..5
  corrobK: number; // số cụm độc lập
  thresholds: GateThresholds;
}
export interface GateDecision {
  isNotable: boolean;
  notabilityReasons: string[];
  signalFeatures: Record<string, number>;
}

import { Injectable } from '@nestjs/common';

// Từ báo hiệu "chỉ nhắc đến, không phải nội dung nóng" (bài tuyên truyền, bài trích dẫn, bài tổng hợp)
const NEGATION_TERMS = [
  'phòng chống',
  'phòng, chống',
  'tuyên truyền',
  'cai nghiện',
  'hội thảo',
  'cảnh báo',
  'phòng ngừa',
];
@Injectable()
export class GateService {
  // Rác hiển nhiên: quá ngắn, chỉ link/emoji/không có chữ
  isJunkPost(content: string): boolean {
    const t = content.trim();
    if (t.length < 15) return true; // quá ngắn
    if (!/\p{L}/u.test(t)) return true; // không có chữ
    const noUrl = t.replace(/https?:\/\/\S+/g, '').trim();
    if (noUrl.length < 15) return true; // chỉ link
    return false;
  }

  // Trong cửa số +- N ký tự quanh keyword có từ negation không
  hasNegationContext(content: string, keyword: string): boolean {
    const lc = content.toLowerCase();
    const idx = lc.indexOf(keyword.toLowerCase());
    if (idx === -1) return false; // không tìm thấy keyword
    const window = lc.slice(Math.max(0, idx - 40), idx + keyword.length + 40); // +-40 ký tự
    return NEGATION_TERMS.some((term) => window.includes(term));
  }

  zScore(value: number, mean: number, std: number): number {
    return std === 0 ? 0 : (value - mean) / std; // std=0 → (page mới)
  }

  evaluate(input: GateInput): GateDecision {
    const t = input.thresholds;
    const features: Record<string, number> = {};

    // Lớp A: rác -> dừng luôn
    if (this.isJunkPost(input.content)) {
      return {
        isNotable: false,
        notabilityReasons: ['junk'],
        signalFeatures: features,
      };
    }
    // Ghi TẤT CẢ feature trước (kể cả khi không notable) — mẫu cho pha 2 Logistic.
    features.hotPriority = input.topKeywordPriority ?? 0;
    const z = this.zScore(input.engagement, input.pageMean, input.pageStd);
    features.zEngagement = z;
    features.sourceTrust = input.sourceTrust;
    features.corrobK = input.corrobK;
    if (input.sentimentScore != null) features.sentiment = input.sentimentScore;

    // ── CÒ NOTABILITY (tự bật) — chỉ tín hiệu NỘI DUNG mới được tự quyết định ──
    // Bài học từ dữ liệu thật: trust cao / viral đơn thuần KHÔNG phải "đáng chú ý"
    // (mọi bài báo trust=5 hoặc clip giật gân đều lọt). Trust/engagement là ĐIỀU BIẾN.
    const hotByPriority =
      input.topKeywordPriority !== null &&
      input.topKeywordPriority <= t.hotPriorityMax;
    // Chỉ tính "khớp thật" nếu có keyword không nằm trong ngữ cảnh negation
    const hasRealHit = input.matchedKeywords.some(
      (kw) => !this.hasNegationContext(input.content, kw),
    );
    const abnormal = z > t.zScoreCutoff;

    const triggers: string[] = [];
    // 1. keyword nóng (sau negation)
    if (hotByPriority && hasRealHit) triggers.push('hot_keyword');
    // 2. corroboration nhiều cụm độc lập
    if (input.corrobK >= t.minCorrobK) triggers.push('corroboration');
    // 3. engagement bất thường CHỈ khi kèm nội dung liên quan (viral + dính keyword) —
    //    né viral rác (clip hài, quảng cáo) vốn không có keyword ANTT.
    if (abnormal && hasRealHit) triggers.push('abnormal_engagement');

    const isNotable = triggers.length > 0;
    const reasons: string[] = [...triggers];

    // ── ĐIỀU BIẾN — chỉ ghi khi ĐÃ notable (làm giàu severity/xếp hạng, KHÔNG tự bật) ──
    if (isNotable) {
      if (input.sourceTrust >= (t.highTrustMin ?? 4)) {
        reasons.push('high_source_trust');
      }
      // engagement bất thường nhưng không đủ điều kiện làm cò → vẫn ghi làm ngữ cảnh
      if (abnormal && !reasons.includes('abnormal_engagement')) {
        reasons.push('abnormal_engagement');
      }
    }

    return {
      isNotable,
      notabilityReasons: reasons,
      signalFeatures: features,
    };
  }
}
