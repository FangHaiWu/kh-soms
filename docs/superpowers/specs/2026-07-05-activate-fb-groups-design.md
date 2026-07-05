# Design — Kích hoạt 7 group Facebook đã seed (Sprint 4)

> Ngày: 2026-07-05 · Trạng thái: approved · Liên quan: `sprint4-facebook-spec`, `legal-finalization-checklist`, `sprint2-hybrid-osint-plan`

## Bối cảnh

Sprint 4 đã dựng xong adapter Facebook (collector + account-manager + processor + alert, verified). 7 group/page FB đã được seed trong `osint_groups` từ Sprint 2 nhưng để `is_active=false` (chờ adapter). Scheduler @Cron chỉ enqueue group `is_active=true`, nên các group này chưa được crawl.

Mục tiêu: **kích hoạt cả 7 group FB đã seed** để scheduler bắt đầu crawl. Chiến lược vận hành: "bật hết, monitor sau" — bật toàn bộ, theo dõi qua crawl_logs + hệ alert, group nào lỗi/không ra data thì tắt tay.

Phạm vi task: **KHÔNG thêm group mới**, chỉ bật 7 group hiện có + một chỉnh phân loại (Beat Khánh Hòa).

## Quyết định đã chốt

1. **Phạm vi:** chỉ kích hoạt 7 group FB đã seed, không thêm mới.
2. **Profile "Beat Khánh Hòa":** vẫn kích hoạt, đồng thời **reclassify từ cá nhân → cộng đồng** (gỡ vùng xám phân loại CA-NHAN).
3. **Chiến lược:** bật hết ngay, monitor sau (không verify-then-activate, không bật theo đợt).
4. **Cơ chế:** migration một chiều để bật + vá seed chống footgun (Hướng A).

## Vấn đề phát hiện trong code hiện tại

File seed `backend/database/seeds/seed-osint-groups-kh.sql` có mệnh đề:

```sql
ON CONFLICT (platform_id, url) DO UPDATE SET
  ..., is_active = EXCLUDED.is_active, ...
```

với `EXCLUDED.is_active = false` (giá trị trong INSERT). Hệ quả: **mỗi lần chạy lại seed sẽ ép mọi group về `is_active=false`**, vô hiệu hóa việc kích hoạt và đạp lên trạng thái bật/tắt admin chỉnh tay sau này. Đây là footgun trực tiếp ảnh hưởng mục tiêu task → xử lý trong task này.

## Thiết kế

### Thành phần 1 — Migration `006-sprint4-activate-fb-groups.sql`

Migration một chiều, chạy 1 lần, ghi vào lịch sử migration như một mốc "kích hoạt FB ngày 2026-07-05".

```sql
-- Kích hoạt group/page Facebook đã seed (Sprint 4): is_active false -> true.
-- Adapter FB đã sẵn sàng (collector + processor + alert verified). Chiến lược: bật hết, monitor sau.
UPDATE osint.osint_groups
SET is_active = true, updated_at = now()
WHERE platform_id = (SELECT id FROM osint.osint_platforms WHERE name = 'facebook')
  AND is_active = false;   -- chỉ đụng dòng đang tắt -> idempotent, chạy lại vô hại, không đạp group admin đã bật/tắt
```

Đặc điểm:
- Lọc theo `platform=facebook` (không hard-code URL) → tự bao trọn 7 group FB, kể cả khi thêm/bớt.
- Không đụng group Telegram (adapter TG thuộc Sprint 3, ngoài phạm vi).
- Điều kiện `AND is_active=false` → chạy lại an toàn.

### Thành phần 2 — Vá seed `seed-osint-groups-kh.sql`

**2a. Chống footgun:** bỏ `is_active = EXCLUDED.is_active` khỏi **cả hai** khối `ON CONFLICT DO UPDATE` (Facebook + Telegram). Giữ `is_active` trong danh sách cột INSERT (trạng thái khởi tạo khi tạo mới). Từ đó re-run seed cập nhật metadata (name/tags/description/trust/platform_specific_data) nhưng **không đạp trạng thái bật/tắt** của group đã tồn tại.

**2b. Reclassify "Beat Khánh Hòa"** (dòng target_type=profile) sang cộng đồng:

| Field | Cũ | Mới |
|-------|-----|-----|
| `description` | "Cá nhân - admin nhóm Hóng biến" | "Trang cộng đồng" |
| `tags` | `CA-NHAN, KHANH-HOA, UU-TIEN-THAP, CHUA-XAC-MINH` | `CONG-DONG, KHANH-HOA, UU-TIEN-CAO, CHUA-XAC-MINH` |
| `trust_level` | 1 | 2 |
| `platform_specific_data.target_type` | `"profile"` | **giữ nguyên `"profile"`** (URL vẫn là profile.php; collector cần đúng target_type để scrape đúng layout) |

### Thành phần 3 — Vận hành & giám sát (không code thêm)

- Sau kích hoạt, scheduler @Cron (2–3h) tự enqueue 7 group.
- Theo dõi qua `osint_crawl_logs` + hệ alert đã dựng (checkpoint / pool-exhausted).
- Group nào crawl lỗi / không ra data (URL hỏng, group thực chất kín) → **tắt tay**: `UPDATE osint.osint_groups SET is_active=false WHERE url='...'`.
- Không auto-deactivate theo số lần fail (YAGNI cho giai đoạn này).

## Caveat pháp lý

"Bật hết" bao gồm các group đang gắn tag `CHUA-XAC-MINH` (chưa xác minh công khai). Collector dùng tài khoản công cụ chỉ đọc **nội dung công khai**: group thực chất kín mà acct không phải thành viên → không thấy nội dung → không phát sinh truy cập trái phép (Điều 289 BLHS). Do đó "monitor sau" không vi phạm về mặt kỹ thuật.

Tuy vậy, **trước khi vận hành thật phải trình pháp chế đơn vị duyệt** (theo `legal-finalization-checklist`). Khuyến nghị xác minh trạng thái công khai từng URL sớm nhất có thể dù đã chọn monitor-sau, và đổi tag `CHUA-XAC-MINH` → `DA-XAC-MINH` khi xác minh xong.

## Definition of Done

- Migration 006 chạy → đủ 7 group FB có `is_active=true` (verify bằng `SELECT count(*) ... WHERE platform=facebook AND is_active=true` = 7).
- Seed đã vá: re-run seed trên DB đã kích hoạt **không** làm group nào về `is_active=false` (verify count trước/sau bằng nhau).
- "Beat Khánh Hòa" sau re-run seed: tags/trust/description = cộng đồng như bảng 2b (verify bằng query dòng đó).
- Không đụng code TS (chỉ SQL) → verify bằng chạy migration + seed thật trên DB local.

## Ngoài phạm vi

- Thêm group mới ngoài 7 group đã seed.
- Auto-deactivate group fail; verify-then-activate; admin API CRUD group.
- Constraint `uq_groups_platform_url` chưa nằm trong migration nào (chỉ là comment "CẦN" trong seed) — latent reproducibility gap trên fresh DB, ghi nhận nhưng không xử lý trong task này.
