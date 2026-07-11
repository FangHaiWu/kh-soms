# CNC — Hệ phát hiện chủ thể tái phạm — Roadmap (overview)

**Ngày:** 2026-07-10
**Trọng tâm:** An ninh mạng & phòng chống tội phạm công nghệ cao (CNC) — đơn vị triển khai đầu, đa-đơn-vị sau.
**Loại:** Overview/decomposition — chia thành sub-project, mỗi cái spec→plan riêng.
**Liên quan:** S5a spine, S5b NER (`2026-07-07`, `2026-07-10-osint-s5b-*`), 2-zone (`2026-06-25`).

## Mục tiêu

Phát hiện **tài khoản / group / page / website thường xuyên** đăng nội dung:
- **(a) lừa đảo** (scam chuyển khoản, giả danh...),
- **(b) mua bán dữ liệu cá nhân**,
- **(c) kích động / xuyên tạc**.

Phục vụ đơn vị CNC; sẵn sàng mở rộng nhiều đơn vị (route theo category).

## Nguyên tắc kiến trúc

**bài → chủ thể → ngữ nghĩa.** Mỗi lớp làm giàu đầu vào lớp sau. Zone A (ẩn danh, DMZ)
xử lý tới **actor online công khai**; nối actor ↔ hồ sơ người thật CHỈ ở Zone B (OPSEC).

## Ba lớp

### Lớp 1 — Nhận diện & làm giàu từng bài  *(gần xong + 2 việc nhỏ)*
Bám pipeline S5a/S5b sẵn có.
- **Keyword theo `category`**: seed 3 nhóm `lua-dao`, `mua-ban-dlcn`, `kich-dong-xuyen-tac` (data, 0 code).
- **#1 Dẫn `category` xuyên pipeline**: `NlpResult` giữ category của matched keyword →
  `osint_post_nlp` (cột categories) → alert mang category. (Code nhỏ, backbone đa-đơn-vị.)
- **#3 Extractor chỉ dấu CNC** (NestJS/TS regex, inline worker): phone VN, STK/ví (bank/e-wallet/crypto),
  URL/domain/app, handle Zalo/Telegram/MXH — **chuẩn hóa** về dạng chuẩn để khớp chéo.
  Cắm vào khe `entities` (hoặc cột `indicators` riêng — quyết ở spec Lớp 1).
- Tận dụng nguyên: Gate notability, trust, dedup, corroboration.
- **Ra:** mỗi bài = `{categories[], indicators[], notability, actorRef}`.

### Lớp 2 — Gộp theo chủ thể & chấm "tái phạm"  *(MỚI — lõi mục tiêu)*
- **Định danh actor** (chuẩn hóa 1 khóa), 4 loại:
  - Tài khoản MXH = `platform + authorExternalId`
  - Group/Page = `externalGroupId` / `groupId`
  - Website = **domain** bóc từ URL bài
  - **Vân tay chỉ dấu** = phone/STK/handle lặp lại (bắt kẻ đổi account) ← #3 nuôi
- **Job gộp** (cửa sổ trượt vd 30/90 ngày): mỗi actor đếm bài bị gắn cờ **theo category**,
  tần suất, độ mới, số chỉ dấu riêng → **điểm tái phạm**.
- **Lưu:** bảng mới `osint_actor` + `osint_actor_stat`.
- **Ra:** danh sách actor **xếp hạng "thường xuyên"** theo category/đơn vị.

**Source discovery (khám phá nguồn) — thuộc L2:**
Danh sách nguồn tĩnh lỗi thời nhanh (tội phạm đổi kênh liên tục) → hệ thống phải TỰ đề xuất nguồn.
Cùng hạ tầng actor-aggregation, thêm 2 bước:
- **Seed-driven search:** dùng keyword CNC (`seed-osint-keywords-cnc.sql`) tìm trên FB/TG/Reddit/web
  → thu group/page/kênh/domain có nội dung khớp → ứng viên nguồn.
- **Snowball từ nguồn loại A:** cào cộng đồng cảnh báo lừa đảo (NCSC, chongluadao, whitehat...
  `seed-osint-sources-cnc.sql`) → bóc **chỉ dấu (#3)** + link/handle họ tố cáo → ứng viên nguồn loại B.
- Actor nào **thường xuyên** đăng bài khớp category tự nổi lên top → **đề xuất thành nguồn giám sát**.
- **Con người DUYỆT** trước khi đưa vào giám sát thường trực (CLAUDE.md: AI chỉ hỗ trợ). Chỉ không
  gian công khai (Điều 289); KHÔNG group kín/tin nhắn riêng.
- Nguồn loại A (cơ quan/cộng đồng đưa tin) seed sẵn; loại B (nơi tội phạm hoạt động) KHÔNG seed tĩnh
  — chỉ ra từ discovery + duyệt người.

### Lớp 3 — Phân loại ngữ nghĩa (LLM = S5c)  *(cho loại (c) + tăng chính xác)*
- Keyword không đủ bắt kích động/xuyên tạc → **LLM** phán category ngữ nghĩa + tóm tắt +
  re-trích entity sạch, **chỉ trên bài qua Gate** (~5-10%). Tiêu thụ cờ `gate_passed`.
- Kết quả feedback ngược làm chính xác category Lớp 1 → cải thiện gộp Lớp 2.
- **Người kiểm quyết định cuối** (CLAUDE.md: AI chỉ HỖ TRỢ).

## Ràng buộc xuyên suốt (khắc vào mọi spec)

1. **Pháp lý:** nội dung (b) "mua bán DLCN" chính là PII → thu thập chỉ ở không gian công khai
   (Điều 289), xử lý theo NĐ13 mục đích ANTT, **on-prem**, **audit mọi truy vấn**. Actor profiling
   là hồ sơ **danh tính online công khai**; nối sang người thật chỉ ở Zone B.
2. **Đa-đơn-vị:** actor score tách theo category → route đơn vị (bảng category→đơn vị, làm khi có đơn vị thứ 2).
3. **AI chỉ hỗ trợ**, không tự ra quyết định ảnh hưởng quyền con người.

## Decomposition → sub-project (mỗi cái spec+plan riêng)

| # | Sub-project | Trạng thái |
|---|---|---|
| **L1** | Lớp 1: category propagation (#1) + indicator extractor (#3) + seed keyword CNC | **Spec ngay** (đợt này) |
| **L2** | Lớp 2: actor identity + aggregation/scoring + bảng actor | Spec sau L1 |
| **L3** | Lớp 3: LLM ngữ nghĩa (= S5c, đã có khung) | Sau, cần GPU |
| Xcut | Route category→đơn vị | Khi có đơn vị thứ 2 |

**Thứ tự:** L1 → L2 → L3. #3 (chỉ dấu) làm trước vì nó nuôi định danh actor ở L2.

## Collaboration
Hướng CNP: Claude đề xuất + code trực tiếp (vẫn giải thích + TDD + commit từng bước),
xin duyệt ở quyết định thiết kế lớn. (Xem memory `feedback-cnc-claude-codes`.)
