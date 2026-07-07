# OSINT S5a — Pipeline Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **⚠️ Model cộng tác của repo (CLAUDE.md):** mặc định là **"Claude hướng dẫn → user tự code → Claude review"**. Plan này cố tình KHÔNG dán lời giải đầy đủ: mỗi task nêu file/vị trí, **test spec** (hợp đồng hành vi), **skeleton + pseudocode**, và **cạm bẫy**. User viết implementation, Claude review. Chỉ auto-code khi user nói "code luôn".

**Goal:** Tách NLP khỏi hot-path ingest sang worker async (BullMQ `osint-nlp`), làm `osint_post_nlp` sống lại làm nguồn sự thật, thêm Normalize + Trust + OR-Gate (lọc rác/giảm false-positive/drive alert), với trọng số khách quan (z-score + EWM) và feature-log cho pha sau.

**Architecture:** `PostIngestService` mỏng lại (dedup → lưu thô `osint_posts` → tạo `osint_post_nlp{pending}` → enqueue). Worker `NlpProcessProcessor` chạy pipeline 4 bước Normalize → NLP rẻ → Trust → Gate, ghi `osint_post_nlp`, rồi drive `AlertService`. Tất cả Zone A, self-host, không SaaS.

**Tech Stack:** NestJS 10, TypeORM, `@nestjs/bull` (BullMQ trên Redis), PostgreSQL, Jest.

## Global Constraints

- **Chuẩn tuân thủ:** pháp luật VN (NĐ13/2023, Điều 289 BLHS). KHÔNG gọi SaaS bên thứ 3 trong toàn pipeline.
- **Comment:** tiếng Việt cho logic nghiệp vụ, tiếng Anh cho technical detail. Comment "tại sao" trước query DB / throw / transform. Hàm nhiều bước: comment pipeline flow.
- **Cấu trúc DB:** schema `osint`. Raw SQL phải dùng **tên cột thật** (`@Column({name})`), không suy từ property TypeORM.
- **Queue mới:** `osint-nlp`, job name `process-post`, payload `{ postId: string }`. Tách khỏi `osint-crawl` để không chặn crawl.
- **Không phá dữ liệu đang đọc:** cột NLP trên `osint_posts` hiện không ai đọc → được tái dùng làm cache denormalized.

---

## File Structure (khóa quyết định phân rã)

**Tạo mới:**
- `src/modules/osint/entities/osint-gate-config.entity.ts` — config trọng số/ngưỡng Gate (1 hàng active).
- `database/migrations/007-sprint5a-pipeline-spine.sql` — **file SQL thủ công** (mẫu 000-006, KHÔNG phải TypeORM migration): cột mới + bảng gate_config + seed trust baseline.
- `src/modules/osint/services/normalize/normalize.service.ts` (+ `.spec.ts`) — NFC, bóc HTML, content_hash.
- `src/modules/osint/services/trust/trust.service.ts` (+ `.spec.ts`) — platform prior, source trust, corroboration cluster, credibility, Wilson stub.
- `src/modules/osint/services/gate/gate.service.ts` (+ `.spec.ts`) — 3 lớp Gate, z-score, feature log.
- `src/modules/osint/services/gate/ewm-weight.job.ts` (+ `.spec.ts`) — job EWM tính trọng số xếp hạng.
- `src/modules/osint/services/nlp-process/nlp-process.processor.ts` (+ `.spec.ts`) — worker BullMQ nối pipeline.

**Sửa:**
- `src/modules/osint/entities/osint-post-nlp.entity.ts` — thêm 8 cột.
- `src/modules/osint/entities/osint-post.entity.ts` — thêm `verdict`, `independentClusterId`.
- `src/modules/osint/services/ingest/post-ingest.service.ts` — mỏng lại: enqueue + tạo pending row, bỏ NLP/alert inline.
- `src/modules/osint/services/alert/alert.service.ts` — thêm method nhận quyết định Gate.
- `src/modules/osint/osint.module.ts` — registerQueue `osint-nlp` + providers mới.

---

## Task 1: Schema migration + entity cột mới

**Files:**
- Create: `src/modules/osint/entities/osint-gate-config.entity.ts`
- Create: `database/migrations/007-sprint5a-pipeline-spine.sql` (file SQL thủ công)
- Modify: `src/modules/osint/entities/osint-post-nlp.entity.ts`
- Modify: `src/modules/osint/entities/osint-post.entity.ts`

**Interfaces:**
- Produces: cột `osint_post_nlp`: `sentiment_score float null`, `entities jsonb null`, `is_notable bool default false`, `notability_score float null`, `notability_reasons jsonb null`, `gate_passed bool default false`, `credibility float null`, `signal_features jsonb null`. Cột `osint_posts`: `verdict varchar(20) default 'unverified'`, `independent_cluster_id varchar(64) null`. Bảng `osint_gate_config(id uuid, signal_weights jsonb, thresholds jsonb, is_active bool)`.

- [ ] **Step 1: Đọc entity hiện tại để lấy tên cột/schema thật**

Đọc `osint-post-nlp.entity.ts`, `osint-post.entity.ts` xác nhận `@Entity({ schema: 'osint' })` và style `@Column({ name: ... })`. Xem `database/migrations/006-sprint4-activate-fb-groups.sql` để copy convention (comment tiếng Việt đầu file, SQL thuần, tham chiếu `SELECT id FROM osint.osint_platforms WHERE name=...`).

- [ ] **Step 2: Thêm cột vào 2 entity + tạo entity gate-config**

Skeleton `osint-gate-config.entity.ts`:
```ts
@Entity({ name: 'osint_gate_config', schema: 'osint' })
export class OsintGateConfig {
  @PrimaryGeneratedColumn('uuid') id: string;
  // Trọng số mỗi tín hiệu do job EWM ghi; đọc lúc chấm notability_score
  @Column('jsonb', { name: 'signal_weights', nullable: true }) signalWeights: Record<string, number>;
  // Ngưỡng OR mỗi tín hiệu (zScoreCutoff, hotPriorityMax, minCorrobK...)
  @Column('jsonb', { name: 'thresholds', nullable: true }) thresholds: Record<string, number>;
  @Column('boolean', { name: 'is_active', default: true }) isActive: boolean;
  @UpdateDateColumn(...) updatedAt: Date;
}
```
Thêm cột tương ứng vào `OsintPostNlp` và `OsintPost` (đúng `name` snake_case như bảng Interfaces).

**Cạm bẫy:** entity chỉ khai báo mapping — KHÔNG tự tạo cột DB. Phải có migration (Step 3). Đừng bật `synchronize`.

- [ ] **Step 3: Viết file SQL `007-sprint5a-pipeline-spine.sql`**

Dùng `ADD COLUMN IF NOT EXISTS` (idempotent, chạy lại không lỗi). Nội dung: `ALTER TABLE osint.osint_post_nlp ADD COLUMN ...` cho 8 cột; `ALTER TABLE osint.osint_posts ADD COLUMN verdict/independent_cluster_id`; `CREATE TABLE IF NOT EXISTS osint.osint_gate_config (...)`; seed trust baseline:
```sql
-- Seed baseline trust đúng phương pháp (thay default=3). Match theo osint_platforms.name THỰC TẾ.
UPDATE osint.osint_platforms SET trust_level = 5 WHERE name IN ('web_news','rss');
UPDATE osint.osint_platforms SET trust_level = 3 WHERE name = 'youtube';
UPDATE osint.osint_platforms SET trust_level = 2 WHERE name IN ('facebook','reddit','threads','instagram');
UPDATE osint.osint_platforms SET trust_level = 1 WHERE name IN ('telegram','tiktok');
INSERT INTO osint.osint_gate_config (id, signal_weights, thresholds, is_active)
VALUES (gen_random_uuid(), NULL, '{"zScoreCutoff":2,"hotPriorityMax":2,"minCorrobK":2}'::jsonb, true);
```
File SQL không có `down` (giống 000-006 — one-way). Rollback thủ công nếu cần.

**Cạm bẫy:** ⚠️ **Trước khi viết UPDATE, chạy `SELECT DISTINCT name FROM osint.osint_platforms;`** — sửa danh sách `IN (...)` cho khớp tên THẬT trong DB của bạn. Sai tên → UPDATE 0 hàng (im lặng), trust đứng ở 3.

- [ ] **Step 4: Áp file SQL + verify**

Áp `007-...sql` bằng cách bạn vẫn dùng cho 000-006 (psql/công cụ). 
Expected: chạy không lỗi. Kiểm: `\d osint.osint_post_nlp` thấy cột mới; `SELECT name, trust_level FROM osint.osint_platforms;` thấy baseline đúng.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: PASS (entity cột mới hợp lệ).

- [ ] **Step 6: Commit**
```bash
git add src/modules/osint/entities/ src/database/migrations/
git commit -m "feat(osint): schema S5a — cột osint_post_nlp/posts + gate_config + seed trust baseline"
```

---

## Task 2: NormalizeService

**Files:**
- Create: `src/modules/osint/services/normalize/normalize.service.ts`
- Test: `src/modules/osint/services/normalize/normalize.service.spec.ts`

**Interfaces:**
- Produces: `normalize(raw: string): { normalizedContent: string; contentHash: string }`. `contentHash` = sha256 của `normalizedContent`.

- [ ] **Step 1: Viết test thất bại (hợp đồng hành vi)**

Các case bắt buộc (Jest, `describe('NormalizeService')`):
1. **NFC:** input chứa ký tự tổ hợp (vd `"cà phê"` dạng NFD) → `normalizedContent` bằng bản NFC; và 2 input NFD/NFC cùng nội dung → **cùng `contentHash`**.
2. **Bóc HTML:** `"<p>xin&nbsp;chào</p>"` → `"xin chào"` (không còn tag, entity giải mã).
3. **Whitespace:** nhiều space/newline/tab → gom 1 space, trim 2 đầu.
4. **Hash ổn định:** cùng nội dung khác format (thừa space, hoa/thường tùy quyết định) → cùng hash; nội dung khác → khác hash.

Assert chính: `expect(a.contentHash).toBe(b.contentHash)` cho case 1; `expect(out.normalizedContent).toBe('xin chào')` case 2.

- [ ] **Step 2: Chạy test → FAIL**

Run: `npx jest normalize.service.spec -t Normalize`
Expected: FAIL ("normalize is not a function" / service chưa tồn tại).

- [ ] **Step 3: Implement tối thiểu (skeleton — user viết)**

```ts
@Injectable()
export class NormalizeService {
  // Flow: NFC → bóc HTML/entity → gom whitespace → hash
  normalize(raw: string): { normalizedContent: string; contentHash: string } {
    // 1. NFC để "cùng nội dung khác dạng Unicode" hội tụ 1 chuỗi (quan trọng cho hash + clustering)
    // 2. Bóc HTML: dùng regex tag + giải entity (cân nhắc lib nhẹ có sẵn, tránh thêm dep nặng)
    // 3. Gom whitespace: /\s+/g → ' ', trim
    // 4. createHash('sha256').update(normalizedContent).digest('hex')
  }
}
```
**Quyết định cần chốt khi code:** có lowercase trước hash không? Nếu có → "Ma Túy" và "ma túy" cùng cụm corroboration (tốt cho gom tin); nhưng normalizedContent dùng lại cho NLP keyword (NlpService tự lowercase rồi) nên an toàn. Khuyến nghị: **lowercase cho hash**, giữ nguyên hoa/thường cho normalizedContent trả về (tách 2 mục đích). Ghi rõ trong test.

**Cạm bẫy:** đừng bóc mất dấu tiếng Việt khi xử lý entity/emoji. Test case có dấu để chặn.

- [ ] **Step 4: Chạy test → PASS.** Run: `npx jest normalize.service.spec`. Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/modules/osint/services/normalize/
git commit -m "feat(osint): NormalizeService — NFC + bóc HTML + content_hash ổn định"
```

---

## Task 3: TrustService (corroboration + source trust + Wilson stub)

**Files:**
- Create: `src/modules/osint/services/trust/trust.service.ts`
- Test: `src/modules/osint/services/trust/trust.service.spec.ts`

**Interfaces:**
- Consumes: `OsintPost` repo (query theo `contentHash`), `OsintGroup`/`OsintPlatform` `trust_level`.
- Produces:
  - `sourceTrust(platformTrust: number, trackRecord: number | null, profile: number): number` → `clamp(0.3*P + 0.5*R + 0.2*Profile, 1, 5)`; `R = trackRecord ?? platformTrust` (baseline khi null).
  - `assignCluster(contentHash: string, windowHours: number): Promise<{ clusterId: string; k: number }>` → clusterId = contentHash; `k` = số **chủ sở hữu khác nhau** (author/group) trong cửa sổ.
  - `corrobIndep(k: number): number` → `1 - Math.exp(-0.7 * k)`.
  - `wilsonLowerBound(pos: number, n: number, z=1.96): number | null` → `null` khi `n===0` (stub-friendly: chưa có verdict).
  - `postCredibility(sNorm: number, corrob: number, officialHit: boolean, nlpRisk: number): number` → công thức [[trust_level_methodology]] tầng 3, bỏ trống nhánh track record (dùng phần tính được), clamp 0..1.

- [ ] **Step 1: Viết test thất bại**

Cases:
1. `sourceTrust(2, null, 0.5)` = `clamp(0.3*2 + 0.5*2 + 0.2*0.5,1,5)` = `clamp(1.7,1,5)=1.7`. (R fallback = P khi null.)
2. `corrobIndep(0)=0`; `corrobIndep(2)=1-e^{-1.4}≈0.7534` (toBeCloseTo).
3. `wilsonLowerBound(0,0)` → `null`; `wilsonLowerBound(8,10)` → số trong (0,1) và **< 0.8** (small-sample kéo xuống).
4. `assignCluster`: seed 2 post cùng `contentHash` khác `authorExternalId` → `k=2`; đổi thành cùng author → `k=1`. (Dùng repo mock hoặc test DB.)
5. `postCredibility(0.4, 0.75, true, 0.1)` → giá trị trong (0,1), tăng khi corrob/official tăng, giảm khi nlpRisk tăng (2 assert so sánh).

- [ ] **Step 2: Chạy test → FAIL.** Run: `npx jest trust.service.spec`. Expected FAIL.

- [ ] **Step 3: Implement (skeleton)**

```ts
@Injectable()
export class TrustService {
  constructor(@InjectRepository(OsintPost) private postRepo: Repository<OsintPost>) {}

  sourceTrust(P: number, R: number | null, profile: number): number {
    const track = R ?? P;               // chưa có verdict → về baseline platform
    return this.clamp(0.3*P + 0.5*track + 0.2*profile, 1, 5);
  }
  corrobIndep(k: number): number { return 1 - Math.exp(-0.7 * k); }
  wilsonLowerBound(pos: number, n: number, z = 1.96): number | null {
    if (n === 0) return null;           // stub: nguồn chưa đánh giá được ("F")
    // công thức Wilson lower bound chuẩn
  }
  async assignCluster(contentHash: string, windowHours: number) {
    // Query post cùng content_hash trong cửa sổ → đếm DISTINCT chủ sở hữu (author_external_id, fallback group_id)
    // clusterId = contentHash; k = distinctOwners
  }
  postCredibility(sNorm, corrob, officialHit, nlpRisk): number {
    // w1*sNorm + w2*corrob + w3*(officialHit?1:0) + w4*contentSignal - w5*nlpRisk, clamp 0..1
    // S5a: contentSignal tạm 0 hoặc từ media presence; nhánh track-record để trống
  }
  private clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
}
```

**Cạm bẫy:** đếm "chủ sở hữu độc lập" (chống circular reporting) — KHÔNG đếm số bài. 50 bài cùng 1 author = k=1. Test case 4 chặn lỗi này.

- [ ] **Step 4: PASS.** Run: `npx jest trust.service.spec`. Expected PASS.
- [ ] **Step 5: Commit** `feat(osint): TrustService — source trust + corroboration cluster + Wilson stub`

---

## Task 4: GateService (3 lớp + z-score + feature log)

**Files:**
- Create: `src/modules/osint/services/gate/gate.service.ts`
- Test: `src/modules/osint/services/gate/gate.service.spec.ts`

**Interfaces:**
- Consumes: `NlpResult` (`{isRelevant, matchedKeywords, topKeywordPriority}`), slang result, trust signals (sourceTrust, corrobK), engagement + page baseline, `OsintGateConfig.thresholds`.
- Produces: `GateDecision { isNotable: boolean; notabilityReasons: string[]; signalFeatures: Record<string, number>; }` (score tính ở Task 5 hoặc để `notabilityScore` null tới khi EWM có trọng số).
  - `isJunkPost(content: string): boolean`
  - `hasNegationContext(content: string, keyword: string): boolean`
  - `zScore(value: number, mean: number, std: number): number`
  - `evaluate(input: GateInput): GateDecision`

- [ ] **Step 1: Viết test thất bại**

Cases:
1. **Lớp A junk:** post `"👍👍"` / chỉ 1 link → `isJunkPost=true` → `evaluate` trả `isNotable=false, reasons=['junk']`. (Tái dùng logic `isJunkComment` ở post-ingest, nâng cấp post.)
2. **Lớp B negation:** content `"hội thảo tuyên truyền phòng chống ma túy"`, keyword `"ma túy"` → `hasNegationContext=true`; `evaluate` KHÔNG bật tín hiệu keyword nóng → `isNotable=false` (nếu không tín hiệu khác).
3. **Lớp C OR pass:** keyword priority=1 (nóng) → `isNotable=true`, reasons chứa `'hot_keyword'`.
4. **z-score:** engagement=100, mean=10, std=5 → `zScore=18 > cutoff(2)` → reasons chứa `'abnormal_engagement'`, `isNotable=true`.
5. **Corroboration:** `corrobK>=minCorrobK` → reasons chứa `'corroboration'`.
6. **signalFeatures luôn được ghi** kể cả khi không notable (để log học sau): `expect(decision.signalFeatures).toHaveProperty('zEngagement')`.
7. **Sentiment/entity off (S5b):** truyền `sentimentScore=null` → không throw, không bật tín hiệu sentiment.

- [ ] **Step 2: FAIL.** Run: `npx jest gate.service.spec`.

- [ ] **Step 3: Implement (skeleton)**

```ts
@Injectable()
export class GateService {
  // Flow: lọc rác → luật ngữ cảnh → chấm đa tín hiệu (OR) → luôn ghi signalFeatures
  evaluate(input: GateInput): GateDecision {
    const features: Record<string, number> = {};
    // Lớp A
    if (this.isJunkPost(input.content)) return { isNotable: false, notabilityReasons: ['junk'], signalFeatures: features };
    // Lớp C tín hiệu (mỗi tín hiệu: tính giá trị → set feature → so ngưỡng → push reason)
    const reasons: string[] = [];
    // hot keyword: priority <= thresholds.hotPriorityMax, TRỪ KHI hasNegationContext (Lớp B)
    // abnormal engagement: zScore(...) > thresholds.zScoreCutoff
    // high source trust: sourceTrust >= ngưỡng
    // corroboration: corrobK >= thresholds.minCorrobK
    // sentiment (S5b): if sentimentScore != null && < ngưỡng
    return { isNotable: reasons.length > 0, notabilityReasons: reasons, signalFeatures: features };
  }
  isJunkPost(c: string): boolean { /* quá ngắn / chỉ link-emoji / spam lặp */ }
  hasNegationContext(c: string, kw: string): boolean {
    // cửa sổ ±N từ quanh kw chứa từ trong NEGATION_TERMS (phòng chống, tuyên truyền, cai nghiện, hội thảo...)
  }
  zScore(v, mean, std) { return std === 0 ? 0 : (v - mean) / std; } // std=0 → tránh chia 0
}
```

**Cạm bẫy:**
- Pass/fail là **OR** — chạm 1 tín hiệu là notable, KHÔNG cần trọng số. Trọng số chỉ để xếp hạng (Task 5).
- `signalFeatures` phải ghi **cả khi không notable** — nếu chỉ ghi khi notable thì pha 2 mất mẫu âm, không học Logistic được.
- `std===0` (page mới, 1 bài) → zScore=0, không false-positive.

- [ ] **Step 4: PASS.** Run: `npx jest gate.service.spec`.
- [ ] **Step 5: Commit** `feat(osint): GateService — lọc rác + negation + z-score OR-gate + feature log`

---

## Task 5: EWM weight job

**Files:**
- Create: `src/modules/osint/services/gate/ewm-weight.job.ts`
- Test: `src/modules/osint/services/gate/ewm-weight.job.spec.ts`

**Interfaces:**
- Consumes: `signal_features` từ `osint_post_nlp` (mẫu quan sát), `OsintGateConfig` repo.
- Produces: `computeWeights(featureRows: Record<string, number>[]): Record<string, number>` (Entropy Weight Method, tổng chuẩn hóa = 1); `run(): Promise<void>` ghi vào `osint_gate_config.signal_weights`.

- [ ] **Step 1: Viết test thất bại**

Cases:
1. **EWM cơ bản:** cho ma trận feature 2 cột — cột A phân tán mạnh, cột B gần như hằng → `weight(A) > weight(B)`; tổng ≈ 1 (toBeCloseTo).
2. **Chuẩn hóa:** mọi weight ≥ 0, `sum ≈ 1`.
3. **Rỗng:** không có feature row → trả `{}` hoặc trọng số đều, KHÔNG throw (job chạy sớm khi chưa có data).
4. `run()` ghi hàng `is_active=true` (mock repo, verify `save` gọi với `signalWeights`).

- [ ] **Step 2: FAIL.** Run: `npx jest ewm-weight.job.spec`.

- [ ] **Step 3: Implement (skeleton)** — các bước EWM chuẩn:
```
1. Chuẩn hóa từng cột (min-max) → p_ij
2. Entropy mỗi tiêu chí: e_j = -k * Σ p_ij ln p_ij, k = 1/ln(n)
3. Độ phân kỳ d_j = 1 - e_j
4. Trọng số w_j = d_j / Σ d_j
```
`run()`: query N `signal_features` gần nhất → `computeWeights` → update `osint_gate_config`. Lịch chạy: đăng ký `@Cron` (định kỳ, vd hằng ngày) trong scheduler — tần suất cấu hình, không cần realtime.

**Cạm bẫy:** `p_ij=0` làm `ln(0)` = -Infinity → quy ước `0*ln0=0`. Test case cột hằng chặn lỗi này. Cần ≥2 mẫu để entropy có nghĩa (n=1 → k=1/ln1 chia 0) → guard trả trọng số đều khi n<2.

- [ ] **Step 4: PASS.** Run: `npx jest ewm-weight.job.spec`.
- [ ] **Step 5: Commit** `feat(osint): EWM weight job — trọng số xếp hạng khách quan từ signal_features`

---

## Task 6: NlpProcessProcessor (worker nối pipeline)

**Files:**
- Create: `src/modules/osint/services/nlp-process/nlp-process.processor.ts`
- Test: `src/modules/osint/services/nlp-process/nlp-process.processor.spec.ts`
- Modify: `src/modules/osint/osint.module.ts` (registerQueue `osint-nlp` + providers)

**Interfaces:**
- Consumes: `{ postId }` job; `OsintPost`+`OsintPostNlp` repo; `NormalizeService`, `NlpService`, `SlangDictionaryService`, `TrustService`, `GateService`, `AlertService`.
- Produces: `@Process('process-post')` handler cập nhật `osint_post_nlp` (từ `pending` → `done`/`failed`) + ghi kết quả pipeline; gọi alert khi `isNotable`.

- [ ] **Step 1: Viết test thất bại (integration nhẹ, mock services)**

Cases:
1. **Vòng đời status:** job chạy xong → `osint_post_nlp.processing_status='done'`, các cột (`matched_keywords`, `is_notable`, `notability_reasons`, `signal_features`, `credibility`, `independent_cluster_id` trên post) được set.
2. **Idempotent:** chạy job 2 lần cùng `postId` → không tạo bản ghi trùng (UNIQUE post_id), chỉ update.
3. **Lỗi 1 bước:** cho `TrustService` throw → status='failed', KHÔNG throw ra ngoài làm chết worker; các job khác vẫn chạy.
4. **Alert:** `GateService` trả `isNotable=true` → `AlertService` được gọi đúng 1 lần; `isNotable=false` → KHÔNG gọi.
5. **Cache denormalized:** `osint_posts.isRelevant/riskScore` được cập nhật từ kết quả (không phá code cũ đọc — hiện không ai đọc, nhưng giữ nhất quán).

- [ ] **Step 2: FAIL.** Run: `npx jest nlp-process.processor.spec`.

- [ ] **Step 3: Implement (skeleton)** — theo pattern `news-crawl.processor.ts`:
```ts
@Processor('osint-nlp')
export class NlpProcessProcessor {
  @Process('process-post')
  async handle(job: Job<{ postId: string }>): Promise<void> {
    // 1. Load post + nlp row; set status='processing'
    // 2. Normalize → normalizedContent + content_hash (cập nhật post.contentHash)
    // 3. NLP rẻ: nlpService.analyzeArticle('', normalized) + slangService.detectSlang(...)
    // 4. Trust: assignCluster(contentHash) → k; sourceTrust; corrobIndep; credibility
    // 5. Gate: evaluate({...}) → decision
    // 6. Ghi osint_post_nlp (matched_keywords, has_slang, is_notable, notability_reasons,
    //    signal_features, credibility...) + osint_posts (independent_cluster_id, verdict giữ default,
    //    isRelevant/riskScore cache); status='done'
    // 7. if decision.isNotable → alertService.createAlertFromGate(post.id, decision, nlp, slang)
    //    Bọc toàn bộ try/catch: lỗi → status='failed' + log, KHÔNG rethrow
  }
}
```
Module: thêm `BullModule.registerQueue({ name: 'osint-nlp' })` + provider `NlpProcessProcessor`, `NormalizeService`, `TrustService`, `GateService`.

**Cạm bẫy:** BullMQ retry sẽ chạy lại handler — phải idempotent (Step test 2). Set `status='processing'` bằng update có điều kiện hoặc chấp nhận ghi đè; đừng INSERT mới `osint_post_nlp` ở đây (ingest đã tạo pending row — Task 7).

- [ ] **Step 4: PASS.** Run: `npx jest nlp-process.processor.spec`.
- [ ] **Step 5: Commit** `feat(osint): NlpProcessProcessor — worker async nối Normalize→NLP→Trust→Gate`

---

## Task 7: Ingest slim-down (enqueue + pending row, bỏ NLP/alert inline)

**Files:**
- Modify: `src/modules/osint/services/ingest/post-ingest.service.ts`

**Interfaces:**
- Consumes: `@InjectQueue('osint-nlp')`.
- Produces: sau khi save `osint_posts`, tạo `osint_post_nlp{processing_status:'pending', post_id}` và `queue.add('process-post', { postId })`. `IngestSummary` giữ nguyên hình dạng (`relevant`/`alertsCreated` giờ luôn 0 ở ingest — cập nhật comment).

- [ ] **Step 1: Cập nhật/điều chỉnh test ingest hiện có**

Sửa test (nếu có) + thêm case:
1. Sau ingest 1 post mới → `postRepo.save` gọi, `osintPostNlpRepo.save` với `processing_status='pending'`, `queue.add('process-post',{postId})` gọi đúng 1 lần.
2. Dedup: post đã tồn tại → KHÔNG enqueue, `skipped++`.
3. **KHÔNG gọi** `nlpService`/`alertService` trong ingest nữa (spy assert not called).

- [ ] **Step 2: FAIL.** Run: `npx jest post-ingest.service.spec`.

- [ ] **Step 3: Implement — cắt bỏ + thêm enqueue**

Bỏ trong vòng lặp: gọi `nlpService.analyzeArticle`, `slangService`, `riskFromPriority`, nhánh `createAlertForArticle`, xử lý comment NLP inline (comment vẫn lưu nhưng NLP comment có thể để worker/sau — giữ tối giản: lưu comment thô, bỏ NLP comment inline). Thêm:
```ts
const saved = await this.postRepo.save(post); // post thô, chưa phân tích
await this.postNlpRepo.save(this.postNlpRepo.create({ postId: saved.id, processingStatus: 'pending' }));
await this.nlpQueue.add('process-post', { postId: saved.id });
```
Constructor: inject `@InjectQueue('osint-nlp') private nlpQueue: Queue` + `OsintPostNlp` repo. Bỏ inject `NlpService`/`SlangDictionaryService`/`AlertService` nếu không còn dùng.

**Cạm bẫy (double-alert):** đây là chỗ dễ sót — phải chắc nhánh `if (ctx.createAlerts !== false)` gọi alert bị **xóa hẳn** khỏi ingest (alert giờ ở worker). Nếu để lại → mỗi post alert 2 lần.

- [ ] **Step 4: PASS.** Run: `npx jest post-ingest.service.spec`.
- [ ] **Step 5: Commit** `refactor(osint): ingest mỏng — enqueue osint-nlp thay NLP/alert inline`

---

## Task 8: Alert từ Gate + integration test (no double-alert)

**Files:**
- Modify: `src/modules/osint/services/alert/alert.service.ts`
- Test: `src/modules/osint/services/alert/alert.service.spec.ts` (+ integration ingest→worker)

**Interfaces:**
- Produces: `createAlertFromGate(postId: string, decision: GateDecision, nlp: NlpResult, slang: SlangResult): Promise<OsintAlert | null>` — severity map từ `decision.notabilityReasons`/`topKeywordPriority`; giữ dedup 1h (tái dùng logic hiện có).

- [ ] **Step 1: Viết test thất bại**

Cases:
1. `notabilityReasons` chứa `'hot_keyword'` & priority=1 → severity cao (`high_priority_keyword`/critical).
2. reasons chỉ `'abnormal_engagement'` → severity thấp hơn (info/warning) — map rõ ràng.
3. **Dedup 1h:** gọi 2 lần cùng post trong 1h → alert thứ 2 = null.
4. **Integration (no double):** chạy ingest 1 post notable → CHỈ worker tạo alert → tổng đúng **1** alert cho post đó.

- [ ] **Step 2: FAIL.** Run: `npx jest alert.service.spec`.

- [ ] **Step 3: Implement — thêm `createAlertFromGate`**

Tái dùng phần dedup + persist của `createAlertForArticle`; thay phần quyết định `alertType/severity` bằng map từ `decision.notabilityReasons` (bảng ưu tiên: hot_keyword > corroboration > abnormal_engagement > slang...). Giữ `createAlertForArticle` cho RSS article (Sprint 1) — KHÔNG xóa (crawler.processor vẫn dùng cấp article).

**Cạm bẫy:** đừng đổi chữ ký `createAlertForArticle` đang được `crawler.processor.ts` dùng — thêm method mới, không sửa cũ.

- [ ] **Step 4: PASS.** Run: `npx jest alert.service.spec` + integration. Expected: đúng 1 alert.
- [ ] **Step 5: Commit** `feat(osint): alert driven by Gate + integration no-double-alert`

---

## Task 9: Verify end-to-end + Wilson stub scheduled

**Files:**
- Modify: `src/modules/osint/scheduler/osint-scheduler.service.ts` (đăng ký EWM job + Wilson stub theo `@Cron`)

- [ ] **Step 1: Đăng ký cron**

Thêm `@Cron` gọi `ewmWeightJob.run()` (vd hằng ngày) và `trustService` recompute source trust (Wilson stub — chạy nhưng trả baseline khi chưa verdict). Tần suất cấu hình.

- [ ] **Step 2: Smoke test toàn luồng (thủ công)**

Chạy app + Redis + PG. Trigger 1 crawl (hoặc seed 1 RawPost) → verify:
- `osint_posts` có post thô; `osint_post_nlp` từ `pending` → `done`.
- Post notable → đúng 1 `osint_alerts`.
- Post junk (`"👍"`) → `is_notable=false`, không alert.
- `signal_features` có dữ liệu; `independent_cluster_id` set.

- [ ] **Step 3: Full test + build**

Run: `npm run build && npx jest src/modules/osint`
Expected: PASS toàn bộ.

- [ ] **Step 4: Commit** `feat(osint): S5a scheduler — EWM + Wilson stub cron; verify end-to-end`

---

## Self-Review (đã chạy khi viết plan)

**Spec coverage:** §2 kiến trúc→Task 6/7; §3 component→Task 2-6; §4 trọng số khách quan→Task 4(z-score/OR)+5(EWM)+feature log (Task 4 signalFeatures); §5 schema→Task 1; §6 resilience→Task 6 (status/idempotent/try-catch); §7 test→mỗi task; §8 ranh giới (khe cắm null/gate_passed)→Task 1 cột + Task 4 sentiment-off. DoD §9 phủ hết. ✅

**Placeholder scan:** không có "TBD/handle edge cases" trần — mỗi bước có case/skeleton/cạm bẫy cụ thể. Impl để skeleton **có chủ đích** theo model cộng tác repo (user code), không phải placeholder lười.

**Type consistency:** `GateDecision{isNotable,notabilityReasons,signalFeatures}` dùng nhất quán Task 4/6/8; `createAlertFromGate` khớp Task 6↔8; `assignCluster→{clusterId,k}` khớp Task 3↔6; queue `osint-nlp`/job `process-post` nhất quán Task 6/7.

---

## Ngoài phạm vi (sub-project khác)
S5b (NLP Python: NER/sentiment thật), S5c (LLM Ollama+GPU), verdict UI + Wilson thật, Logistic Regression, Zone B entity-resolution, dashboard/report.
