# Design — Bỏ auto-retire, chuyển alert-escalation + dọn thuật ngữ checkpoint (đóng Sprint 4)

> Ngày: 2026-07-06 · Trạng thái: approved · Liên quan: `sprint4-facebook-spec`, `sprint2-hybrid-osint-plan`

## Bối cảnh & vấn đề

Tính năng **auto-retire sau 3 checkpoint** sinh ra từ kế hoạch gốc "5-10 acct throwaway". Sprint 4 đã pivot sang "**1-2 tài khoản CÔNG CỤ, pool-ready**" (dùng credential của mình). Với tool-account, retire vĩnh viễn một acct là mất mát lớn, và đã có sẵn **đường alert báo admin**.

Ngoài ra, phát hiện lỗ hổng: trong luồng crawl nền thực tế, đường degradation đi qua `markNeedsRelogin` (session hết hạn) — **không tăng `checkpoint_count`**. Cột `checkpoint_count` chỉ tăng ở `markCheckpoint`, mà `markCheckpoint` chỉ gọi từ form-login (đã tắt ở commit `ee3a2b8`). ⇒ điều kiện `>=3 → retire` không bao giờ kích hoạt → auto-retire là dead code.

**Quyết định (đã duyệt):** bỏ auto-retire, `retired` thành hành động thủ công của admin; vẫn đếm `checkpoint_count`, khi ≥ ngưỡng thì leo thang alert lên critical (không tự retire).

## Thiết kế

### 1. Sửa `markCheckpoint` (FacebookAccountManager)

- Vẫn `newCount = checkpointCount + 1`, vẫn ghi `checkpoint_count` + `lastCheckpointedAt`.
- `status` **luôn = `'checkpoint'`** — không bao giờ tự `'retired'`.
- Alert leo thang theo count:
  - `newCount < maxCheckpoints` → `fb_account_checkpoint` / **warning**.
  - `newCount >= maxCheckpoints` → `fb_account_checkpoint` / **critical**, description gợi ý admin cân nhắc retire tay / thay acct.
- Bỏ nhánh alert `fb_account_retired` trong markCheckpoint (retire giờ thủ công).
- `FB_MAX_CHECKPOINTS` giữ tên env (default 3), **đổi ngữ nghĩa → ngưỡng leo thang alert** (không còn ngưỡng retire). Cập nhật comment.

### 2. `retired` = hành động thủ công

Status enum giữ `'retired'`. Admin đặt qua SQL/admin-panel sau (ngoài phạm vi task). Không code auto-path nào tạo `retired`.

### 3. Dọn thuật ngữ checkpoint ↔ needs-relogin

Đường session-death hiện giả dạng checkpoint gây hiểu nhầm. Rename CHỈ đường này (giữ nguyên checkpoint THẬT ở `login()` phát hiện URL `/checkpoint` + `captureSessionManually`):

- `getAuthenticatedContext` throw: message đổi sang có marker rõ `NEEDS_RELOGIN: ...` thay vì chứa chữ "checkpoint".
- `collect()` return type: field `checkpoint?: string` → **`needsRelogin?: string`**; catch match `error.includes('NEEDS_RELOGIN')`.
- `facebook-crawl.processor.ts`: `if (result.checkpoint)` → `if (result.needsRelogin)`, sửa log + comment sai ("auth đã markCheckpoint" → thực ra markNeedsRelogin + đã alert).

### 4. Cập nhật script `test-fb-account.ts`

Assert cũ "markCheckpoint x3 → checkpoint→retired". Đổi: sau 3 lần vẫn `status='checkpoint'`, `checkpoint_count=3`. Đây là đường verify chính.

## Giới hạn (không mở rộng scope)

`markCheckpoint` sau fix vẫn chỉ reachable từ test script + form-login (đã tắt) — hành vi runtime nền KHÔNG đổi. Ta gỡ feature không hợp mô hình + để sẵn đường escalation đúng cho khi nối phát hiện checkpoint thật vào Chunk 3 (việc riêng, lớn hơn, KHÔNG làm ở đây).

## Definition of Done

- `markCheckpoint` không còn tự set `retired`; count vẫn tăng; alert leo thang critical khi ≥ ngưỡng.
- Rename `checkpoint`→`needsRelogin` ở đường session-death (collector + processor); checkpoint thật giữ nguyên.
- `test-fb-account` xanh với assert mới (checkpoint x3 → vẫn checkpoint, count=3).
- typecheck sạch; verify chạy script thật trên DB local.
- Cập nhật progress.md + memory → tuyên bố Sprint 4 DONE.

## Ngoài phạm vi

- Nối phát hiện checkpoint thật vào luồng scrape Chunk 3.
- Admin-panel / endpoint retire thủ công.
