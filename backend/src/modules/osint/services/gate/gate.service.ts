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
    const reasons: string[] = [];
    // --- Tín hiệu 1: keyword nóng (Lớp B negation lồng vào đây) ---
    features.hotPriority = input.topKeywordPriority ?? 0;
    const hotByPriority =
      input.topKeywordPriority !== null &&
      input.topKeywordPriority <= t.hotPriorityMax;
    // Chỉ tính nóng nếu có ít nhất 1 keyword khớp mà không nằm trong ngữ cảnh negation
    const hasRealHit = input.matchedKeywords.some(
      (kw) => !this.hasNegationContext(input.content, kw),
    );
    if (hotByPriority && hasRealHit) {
      reasons.push('hot_keyword');
    }

    // --- Tín hiệu 2: engagement bất thường ---
    const z = this.zScore(input.engagement, input.pageMean, input.pageStd);
    features.zEngagement = z;
    if (z > t.zScoreCutoff) {
      reasons.push('abnormal_engagement');
    }
    // --- Tín hiệu 3: nguồn trust cao ---
    features.sourceTrust = input.sourceTrust;
    if (input.sourceTrust >= (t.highTrustMin ?? 4))
      reasons.push('high_source_trust');

    // --- Tín hiệu 4: corroboration ---
    features.corrobK = input.corrobK;
    if (input.corrobK >= t.minCorrobK) reasons.push('corroboration');

    // --- Tín hiệu 5: sentiment (S5b — chỉ chạy khi có điểm) ---
    if (input.sentimentScore != null) {
      features.sentiment = input.sentimentScore;
      // (ngưỡng negativeSentimentMax để pha S5b; giờ chưa bật)
    }

    return {
      isNotable: reasons.length > 0,
      notabilityReasons: reasons,
      signalFeatures: features,
    };
  }
}
