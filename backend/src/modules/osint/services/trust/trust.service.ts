import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { OsintPost } from '@modules/osint/entities/osint-post.entity';

@Injectable()
export class TrustService {
  constructor(
    @InjectRepository(OsintPost)
    private postRepo: Repository<OsintPost>,
  ) {}

  private clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(x, hi)); // Math.min(x, hi);
  }

  // S = clamp(0.3*P + 0.5*R + 0.2*Profile, 1, 5). R null (chua co verdict) -> R = P

  sourceTrust(P: number, R: number | null, profile: number): number {
    const track = R ?? P; // chưa có verdict → về baseline platform
    return this.clamp(0.3 * P + 0.5 * track + 0.2 * profile, 1, 5);
  }

  // 1 - e^(-0.7·k): k cụm độc lập càng nhiều càng gần 1, bão hòa dần.
  corrobIndep(k: number): number {
    return 1 - Math.exp(-0.7 * k);
  }

  // Cận dưới Wilson: nguồn ít mẫu (n nhỏ) tự bị kéo xuống dù chưa sai. n=0 → null (chưa đánh giá được, "F").
  wilsonLowerBound(pos: number, n: number, z = 1.96): number | null {
    if (n === 0) return null;
    const p = pos / n;
    const denom = 1 + (z * z) / n;
    const center = p + (z * z) / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return (center - margin) / denom;
  }
  // Gom bài cùng content_hash trong cửa sổ → đếm SỐ CHỦ SỞ HỮU KHÁC NHAU (chống circular reporting).
  // clusterId = chính content_hash. KHÔNG đếm số bài — 50 bài 1 người vẫn là k=1.
  async assignCluster(
    contentHash: string,
    windowHours: number,
  ): Promise<{ clusterId: string; k: number }> {
    const since = new Date(Date.now() - windowHours * 3600 * 1000);
    const rows = await this.postRepo.find({
      where: { contentHash, createdAt: MoreThanOrEqual(since) },
    });
    // Chủ sở hữu = author_external_id; nếu null (bài không có author) fallback group_id
    const owners = new Set(rows.map((r) => r.authorExternalId ?? r.groupId));
    return { clusterId: contentHash, k: owners.size };
  }
  // C = clamp(w1·sNorm + w2·corrob + w3·official + w4·contentSignal − w5·nlpRisk, 0, 1)
  // w1=.25 w2=.35 w3=.20 w4=.10 w5=.10. S5a: contentSignal tạm 0 (media presence để pha sau).
  postCredibility(
    sNorm: number,
    corrob: number,
    officialHit: boolean,
    nlpRisk: number,
  ): number {
    const contentSignal = 0;
    const c =
      0.25 * sNorm +
      0.35 * corrob +
      0.2 * (officialHit ? 1 : 0) +
      0.1 * contentSignal -
      0.1 * nlpRisk;
    return this.clamp(c, 0, 1);
  }
}
