# CNC Lớp 2 — Mở rộng actor: domain-content + fingerprint — Design

**Ngày:** 2026-07-21
**Sub-project:** phần mở rộng của L2 (`2026-07-15-cnc-layer2-actor-aggregation-design.md`), roadmap `2026-07-10-cnc-actor-detection-roadmap.md`
**Trạng thái:** chờ writing-plans
**Nhánh:** `feature/sprint4-osint-facebook`
**Collaboration:** Claude code trực tiếp (memory `feedback-cnc-claude-codes`), TDD.
**Bối cảnh:** L2 v1 (group+account actor) đã DONE, vừa verify E2E thật trên 6 group FB CNC (21/07, 11 post). Trong lúc chờ cron tích thêm dữ liệu, làm phần mở rộng actor đã để "khe sẵn" trong schema.

## Mục tiêu

Thêm 2 loại actor mới vào bảng generic `osint_actor` (không cần migration):
- **domain-content-actor**: website bị **nhắc tới trong nội dung bài** (vd link web cá độ/lừa đảo quảng bá trong 1 bài FB) — tín hiệu actor thật (site kẻ lừa đảo dẫn dụ nạn nhân).
- **fingerprint-actor**: SĐT/STK/ví crypto/handle **lặp lại** — bắt kẻ đổi tài khoản nhưng dùng lại cùng liên hệ nhận tiền/giao dịch.

## Ngoài phạm vi đợt này

**domain-source-actor** (domain nguồn báo/web hay đăng tin CNC, từ `platform_specific_data.url` của bài RSS/web) — hoãn sang đợt sau vì cần thêm bước lọc "publication vs perpetrator" (danh sách trắng báo chí chính thống) để không gán nhầm VnExpress/NLĐ là actor CNC. Quyết định user 21/07.

## Vì sao domain-content thay vì domain-source

Spec L2 v1 (dòng 100-104) đã cảnh báo: nếu domain-actor lấy từ URL nguồn bài (báo/web) thì báo đưa tin về lừa đảo sẽ bị tính nhầm là actor phạm tội — cần lọc thêm. Nhưng domain lấy từ **nội dung bài** (indicator `type='URL'`, đã bóc sẵn bởi `IndicatorExtractorService`) là domain kẻ xấu chủ động quảng bá/dẫn dụ — không phải domain tờ báo đưa tin. Tự tránh vấn đề publication-vs-perpetrator mà không cần whitelist.

## Thiết kế

### 1. Mở rộng `PostForActor.indicators`

`backend/src/modules/osint/services/actor/actor-aggregator.ts`

```ts
// Trước:
indicators: { normalized: string }[] | null;
// Sau:
indicators: { type: string; normalized: string }[] | null;
```

Dữ liệu `type` đã có sẵn trong cột `osint_post_nlp.indicators` jsonb (`{type,raw,normalized}`, ghi từ L1 #3) — chỉ cần job gộp actor lấy thêm field này khi build `PostForActor` (hiện job chỉ trích `normalized`).

### 2. Mở rộng `resolveActors()` — trả 0..N actor thay vì 0..2

```
Với mỗi indicator trong bài:
  - type === 'URL'                                  → actorType 'domain',      actorKey = normalized (domain)
  - type ∈ {PHONE, BANK_ACCOUNT, CRYPTO_WALLET, HANDLE} → actorType 'fingerprint', actorKey = `${type}:${normalized}`
  - type khác (không có)                             → bỏ qua
```

Tiền tố `type:` trong actorKey của fingerprint để STK và SĐT trùng chuỗi số (hiếm nhưng có thể) không đụng nhau trong bảng `uq_actor(actor_type, actor_key)`.

`displayName` cho domain/fingerprint = chính `normalized` (không có tên hiển thị khác như group/account).
`platformId` = null (domain/fingerprint không gắn 1 platform cụ thể — 1 SĐT có thể xuất hiện trên cả FB lẫn Telegram).

Một bài có thể đóng góp cho: 1 group + 1 account + N domain + M fingerprint cùng lúc — không giới hạn, khác hẳn model cũ (tối đa 2).

### 3. `aggregatePosts` / `isRepeatOffender` — KHÔNG đổi

Cả 2 hàm đã generic theo `actorType`/`actorKey`, vòng lặp `for (const a of resolveActors(p))` đã handle N actor/bài sẵn. `categoryCounts` chỉ cộng khi bài khớp category CNC (logic cũ) → domain/fingerprint xuất hiện ở bài không-CNC sẽ không tự đẩy vào "tái phạm". Không cần lọc gì thêm cho đợt này.

### 4. Job gộp (`actor-aggregate.job.ts`) — sửa 1 chỗ

Chỗ build `PostForActor.indicators` từ query kết quả: lấy thêm `type` cùng `normalized` (hiện chỉ map `normalized`).

### 5. Endpoint — không đổi

`GET /osint/actors?type=domain` / `?type=fingerprint` đã chạy được (param `type` không giới hạn enum ở controller).

### 6. Test

`actor-aggregator.spec.ts` thêm case:
- 1 indicator URL → 1 domain-actor, `actorKey` = domain.
- 2 indicator PHONE khác nhau trong cùng bài → 2 fingerprint-actor riêng.
- 1 indicator BANK_ACCOUNT và 1 PHONE cùng `normalized` (số trùng, type khác) → 2 actor riêng (actorKey có tiền tố type, không đụng).
- Bài đủ group+account+domain+fingerprint → `resolveActors` trả đúng số actor, `aggregatePosts` cộng đúng cho từng cái.
- Indicator không thuộc URL/PHONE/BANK_ACCOUNT/CRYPTO_WALLET/HANDLE (nếu có type khác sau này) → bị bỏ qua, không tạo actor.

`actor-aggregate.job.spec.ts`: cập nhật fixture `indicators` có `type` (hiện chỉ có `normalized`).

## Ràng buộc (kế thừa từ L2 v1)

- Actor = danh tính online công khai; nối sang người thật CHỈ ở Zone B.
- Chỉ dữ liệu công khai (Điều 289), audit truy vấn (NĐ13).
- `is_repeat_offender` dùng chung ngưỡng `ACTOR_REPEAT_THRESHOLD` (mặc định 3) cho mọi actor_type — không tách ngưỡng riêng theo loại ở đợt này (YAGNI, chưa có dữ liệu để hiệu chỉnh riêng).

## Tồn đọng / phase sau

- domain-source-actor (domain nguồn báo/web) + lọc publication-vs-perpetrator (whitelist báo chí).
- Cảnh báo actor mới vượt ngưỡng tái phạm (chưa làm, ghi trong L2 v1).
- Cửa sổ 90 ngày; nối Zone B (actor→subject).
