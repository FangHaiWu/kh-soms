import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { OsintPostNlp } from '@modules/osint/entities/osint-post-nlp.entity';
import { OsintGateConfig } from '@modules/osint/entities/osint-gate-config.entity';

@Injectable()
export class EwmWeightJob {
  constructor(
    @InjectRepository(OsintPostNlp)
    private postNlpRepo: Repository<OsintPostNlp>,
    @InjectRepository(OsintGateConfig)
    private gateConfigRepo: Repository<OsintGateConfig>,
  ) {}

  // Entropy Weight Method: trọng số ∝ độ phân kỳ của mỗi cột feature.
  computeWeights(rows: Record<string, number>[]): Record<string, number> {
    const n = rows.length;
    if (n < 2) return {}; // <2 mẫu: entropy vô nghĩa (ln(1)=0 chia 0) → trả rỗng

    // gom tất cả tên feature xuất hiện
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const divergence: Record<string, number> = {};

    for (const key of keys) {
      const col = rows.map((r) => r[key] ?? 0);
      const min = Math.min(...col),
        max = Math.max(...col);
      if (max === min) {
        divergence[key] = 0;
        continue;
      } // cột hằng → không phân biệt → d=0

      // min-max về [0,1] (xử lý được cả giá trị âm như zEngagement)
      const norm = col.map((v) => (v - min) / (max - min));
      const sum = norm.reduce((a, b) => a + b, 0);
      if (sum === 0) {
        divergence[key] = 0;
        continue;
      }

      const p = norm.map((v) => v / sum); // tỉ lệ, tổng cột = 1
      const k = 1 / Math.log(n);
      // entropy: chú ý 0*ln0 quy ước = 0 (guard pij>0)
      const entropy =
        -k *
        p.reduce((acc, pij) => acc + (pij > 0 ? pij * Math.log(pij) : 0), 0);
      divergence[key] = 1 - entropy;
    }

    const totalDiv = Object.values(divergence).reduce((a, b) => a + b, 0);
    const weights: Record<string, number> = {};
    if (totalDiv === 0) {
      // mọi cột hằng → chia đều
      for (const key of keys) weights[key] = 1 / keys.length;
      return weights;
    }
    for (const key of keys) weights[key] = divergence[key] / totalDiv;
    return weights; // tổng = 1
  }
  // Job định kỳ: lấy N feature gần nhất → tính trọng số → ghi vào hàng gate_config active.
  async run(): Promise<void> {
    const rows = await this.postNlpRepo.find({
      where: { signalFeatures: Not(IsNull()) },
      order: { createdAt: 'DESC' },
      take: 500,
    });
    const featureRows = rows.map((r) => r.signalFeatures).filter(Boolean);
    const weights = this.computeWeights(featureRows);
    if (Object.keys(weights).length === 0) return; // chưa đủ mẫu → giữ nguyên

    const cfg = await this.gateConfigRepo.findOne({
      where: { isActive: true },
    });
    if (!cfg) return; // chưa có config → bỏ qua
    cfg.signalWeights = weights;
    await this.gateConfigRepo.save(cfg);
  }
}
