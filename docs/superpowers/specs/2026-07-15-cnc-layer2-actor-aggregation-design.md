# CNC Lớp 2 — Actor Aggregation — Design

**Ngày:** 2026-07-15
**Sub-project:** L2 của roadmap `2026-07-10-cnc-actor-detection-roadmap.md`
**Trạng thái:** chờ writing-plans
**Nhánh:** `feature/sprint4-osint-facebook`
**Collaboration:** Claude code trực tiếp (memory `feedback-cnc-claude-codes`), TDD.
**Liên quan:** Lớp 1 (`2026-07-11-cnc-layer1-category-indicators-design.md`), FB feed-inline (thu author).

## Mục tiêu

Phát hiện **chủ thể (tài khoản/group/kênh) thường xuyên đăng nội dung CNC** — gộp post
theo actor, đếm theo category, đánh dấu "tái phạm", xếp hạng. Trả lời trực tiếp câu hỏi
nghiệp vụ: *"account/group nào hay đăng lừa đảo / mua bán DLCN / cá độ?"*.

**Chạy được ngay** trên dữ liệu hiện có (group/channel — 2 kênh TG có lượng). Account-actor
thưa giờ, dày khi FB crawl chạy (feed-inline đã điền `authorExternalId`).

**Ngoài phạm vi v1:** domain-actor + fingerprint-actor (khe sẵn, đổ sau); cảnh báo actor
tái phạm mới (phase sau); nối actor→hồ sơ người thật (Zone B).

## Quyết định (đã duyệt)

1. **Bảng actor generic đa loại** — `actor_type` (group|account|domain|fingerprint) + `actor_key`.
   v1 đổ group + account; domain/fingerprint thêm sau KHÔNG cần migration.
2. **Chấm điểm minh bạch theo count** — không trọng số chủ quan (đúng triết lý S5a). Xếp hạng
   theo số bài CNC/category; feature phụ log để pha sau học.
3. **1 post → cả group-actor lẫn account-actor** (đếm cho cả hai).
4. **Ngưỡng tái phạm mặc định ≥3 bài CNC/30 ngày** (config qua `osint_gate_config` hoặc env).
5. **v1 chỉ endpoint đọc**, chưa alert.

## Schema (migration 009)

```sql
CREATE TABLE osint.osint_actor (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_type   varchar(20) NOT NULL,       -- group | account | domain | fingerprint
  actor_key    varchar(300) NOT NULL,      -- group: groupId | account: platformId:authorExternalId
  display_name varchar(300),
  platform_id  uuid,
  first_seen   timestamptz,
  last_seen    timestamptz,
  meta         jsonb,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  CONSTRAINT uq_actor UNIQUE (actor_type, actor_key)
);

CREATE TABLE osint.osint_actor_stat (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id uuid NOT NULL REFERENCES osint.osint_actor(id) ON DELETE CASCADE,
  window_days int NOT NULL,                 -- 30 (v1)
  post_count int NOT NULL DEFAULT 0,
  notable_count int NOT NULL DEFAULT 0,
  category_counts jsonb,                    -- {"lua-dao":5,"co-bac-ca-do":2,...} chỉ nhóm CNC
  distinct_indicators int NOT NULL DEFAULT 0,
  last_post_at timestamptz,
  is_repeat_offender boolean NOT NULL DEFAULT false,
  computed_at timestamptz DEFAULT now(),
  CONSTRAINT uq_actor_stat UNIQUE (actor_id, window_days)
);
```

## Phân giải actor (ActorResolver)

Từ 1 `osint_posts` row → 0..2 khóa actor:
- **group:** nếu `groupId` không null → `{ type:'group', key: groupId, displayName: group.name, platformId }`.
- **account:** nếu `authorExternalId` không null → `{ type:'account', key: platformId + ':' + authorExternalId, displayName: authorName, platformId }`.
- (domain/fingerprint: null ở v1.)

Chỉ nhóm CNC tính vào `category_counts`: giao `matched_categories` với tập CNC
(`lua-dao, mua-ban-dlcn, tan-cong-ma-doc, co-bac-ca-do, tin-dung-den, deepfake-gia-mao, rua-tien, kich-dong-xuyen-tac`).

## Job gộp (ActorAggregateJob — cron)

`@Cron` (vd EVERY_DAY_AT_3AM, sau EWM 2AM). Flow:
1. Lấy post trong cửa sổ (30 ngày) `osint_posts ⋈ osint_post_nlp`.
2. Với mỗi post → resolve actor(s) → gộp vào map theo actor_key:
   - `post_count++`; nếu `is_notable` → `notable_count++`;
   - mỗi category CNC khớp → `category_counts[cat]++`;
   - gom `indicators.normalized` vào set (đếm distinct cuối);
   - cập nhật `last_post_at` max.
3. Upsert `osint_actor` (first_seen/last_seen), rồi upsert `osint_actor_stat` (window_days=30):
   - `is_repeat_offender = max(category_counts CNC) >= threshold` (mặc định 3).
4. Idempotent: recompute đè theo (actor_id, window_days).

**Chấm điểm/xếp hạng:** không cột "score" tổng hợp — xếp hạng bằng ORDER BY tại query
(vd tổng bài CNC = sum category_counts). Giữ minh bạch, tránh trọng số chủ quan.

## Đầu ra (endpoint đọc)

`GET /api/v1/osint/actors?category=&type=&window=30&limit=` →
actor xếp theo tổng bài CNC giảm dần (hoặc theo `category` nếu lọc), kèm
`{actor_type, display_name, category_counts, notable_count, is_repeat_offender, last_post_at}`.

## Ràng buộc

- Actor = **danh tính online công khai**; nối sang người thật CHỈ ở Zone B (OPSEC).
- Chỉ dữ liệu công khai (Điều 289), audit truy vấn (NĐ13).
- **Báo RSS/web KHÔNG lọt xếp hạng actor** (đã xác minh dữ liệu thật): post rss/web_news có
  `group_id=NULL` và `author_external_id=NULL` → resolve ra **0 actor** → tự loại. Actor v1 chỉ
  gồm: kênh TG (group-actor, 2 kênh có lượng) + group/tác giả FB (group+account). Mối lo
  "báo đưa tin lừa đảo bị tính là actor phạm tội" gần như **không xảy ra ở v1**.
  *(Khi bổ sung domain-actor phase sau — lúc đó mới cần lọc publication vs perpetrator.)*

## Test

- **ActorResolver** (unit): post có groupId+author → 2 actor; chỉ groupId → 1; không cả hai → 0.
- **Aggregation logic** (unit, hàm thuần nhận list post+nlp → map actor stat): đếm category,
  notable, distinct indicators, is_repeat_offender theo ngưỡng; 1 post đếm cho 2 actor.
- **Endpoint** (unit): xếp hạng + lọc category/type.
- **E2E thật:** chạy job trên dữ liệu TG hiện có → actor "Phốt VN"/"Hóng biến" có stat;
  kiểm `GET /osint/actors`.

## Tồn đọng / phase sau
- domain-actor (báo/web) + fingerprint-actor (phone/bank/handle lặp) — đổ vào bảng generic.
- Cảnh báo actor tái phạm mới vượt ngưỡng.
- Lọc "publication vs perpetrator" tinh hơn (báo đưa tin ≠ tội phạm).
- Cửa sổ 90 ngày; nối Zone B (actor→subject).
