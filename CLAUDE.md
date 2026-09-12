# KH-SOMS — Khanh Hoa Security & Order Management System

Hệ thống phần mềm hỗ trợ bảo đảm an ninh, trật tự tỉnh Khánh Hòa (sau sáp nhập với Ninh Thuận từ 01/7/2025). Phục vụ lực lượng Công an tỉnh Khánh Hòa.

## Phạm vi giai đoạn hiện tại (chốt 12/09/2026)

Tài liệu gốc thiết kế 9 module, OSINT xếp thứ 9 "bổ sung". **Thực tế đã khác và văn bản này ghi nhận đúng thực tế:**

- **Mục tiêu giai đoạn này:** OSINT phục vụ an ninh mạng & tội phạm công nghệ cao (CNC) → **phát hiện bất thường và cảnh báo sớm theo địa bàn**. `osint/` là module **lõi**, không phải bổ sung.
- **KHÔNG cam kết "dự báo tội phạm"** kiểu ARIMA/LSTM ở giai đoạn này. Dữ liệu vụ việc lịch sử do công an nhập hiện bằng 0, và OSINT không thay thế được. Thứ làm được thật là *phát hiện bất thường + cảnh báo sớm điểm nóng dư luận/tội phạm mạng*. Mô hình chuỗi thời gian chỉ bật khi đã tích lũy ≥ 6–12 tháng dữ liệu.
- **Hoãn tường minh** (ngoài phạm vi, không phải quên): `subjects/`, `reports/`, `intelligence/`, `users/` (đầy đủ), camera AI, mobile app, chatbot, tích hợp CSDL quốc gia.

Bối cảnh và cơ sở của quyết định: `docs/2026-07-27-de-an-danh-gia-dinh-huong-phat-trien.docx`.

## Stack công nghệ

- **Frontend:** React.js, TypeScript, Zustand, React Query, Recharts, Leaflet.js, Ant Design
- **Backend:** NestJS, TypeScript, TypeORM, JWT, Bull Queue, Socket.io, Passport.js
- **Database:** PostgreSQL (PostGIS), Redis, MinIO/S3
- **OSINT:** Puppeteer, Playwright, NLP (underthesea / PhoBERT)

## Cấu trúc dự án (Backend NestJS)

```
src/
├── modules/
│   ├── osint/         # [LÕI] Thu thập + pipeline NLP/Gate/trust + actor CNC
│   ├── geography/     # [S6] Địa bàn 65 xã/phường, PostGIS, geo-tagging bài viết
│   ├── analytics/     # [S7] Baseline + phát hiện bất thường + cảnh báo 4 mức
│   ├── auth/          # [S8] TỐI THIỂU: JWT + role. RBAC/ABAC đầy đủ để sau
│   ├── audit/         # [S8] TỐI THIỂU: log truy vấn dữ liệu OSINT/PII
│   ├── notifications/ # [S8] Kênh phát cảnh báo: WebSocket + Telegram/email
│   ├── incidents/     # [S11+] Event store (loại × địa bàn × thời điểm) nuôi dự báo
│   ├── prediction/    # [S11+] Chuỗi thời gian — CHỈ khi đã đủ dữ liệu vụ việc
│   ├── users/         # [HOÃN] Quản lý người dùng đầy đủ
│   ├── subjects/      # [HOÃN] Quản lý đối tượng + OSINT cá nhân (Zone B)
│   ├── intelligence/  # [HOÃN] Thu thập, xử lý thông tin tình báo
│   └── reports/       # [HOÃN] Báo cáo tự động (PDF, Excel, Word, PPT)
├── common/
│   ├── guards/        # AuthGuard, RolesGuard
│   ├── interceptors/  # Logging, response transform
│   ├── filters/       # Exception filters
│   └── decorators/    # Custom decorators (Roles, SecurityLevel...)
└── config/            # Biến môi trường, cấu hình module
```

## Database Schemas

| Schema | Nội dung |
|--------|----------|
| `public` | Dữ liệu nghiệp vụ chính (subjects, incidents, users...) |
| `audit` | Nhật ký toàn bộ thao tác đọc/ghi |
| `spatial` | Dữ liệu địa lý PostGIS (ranh giới hành chính, điểm vụ việc) |
| `osint` | Dữ liệu thu thập từ nguồn mở (articles, social_posts, alerts) |

## Quy tắc thiết kế quan trọng

### Cấu trúc hành chính 2 cấp (BẮT BUỘC)
Sau sáp nhập, **không còn cấp huyện**. Chỉ có 2 cấp:
- **Tỉnh** → **Xã/Phường/Đặc khu** (65 đơn vị)
- Mọi query địa bàn, phân quyền, phân công đều dùng cấu trúc này
- Không dùng `districtId` hay `district` trong schema

### Phân cấp mật độ thông tin
| Cấp | Ký hiệu | Quyền truy cập |
|-----|---------|----------------|
| Tối mật | TM | Cấp phòng trở lên |
| Mật | M | Điều tra viên trở lên |
| Hạn chế | HC | Tất cả cán bộ |
| Nội bộ | NB | Toàn đơn vị |

Dữ liệu OSINT mặc định NB — tự động nâng cấp khi liên kết với hồ sơ Mật.

### Bảo mật
- JWT Access Token: 15 phút | Refresh Token: 7 ngày
- Mã hóa AES-256 cho dữ liệu nhạy cảm
- Mọi truy vấn đối tượng phải ghi audit log
- Triển khai on-premise, không dùng cloud công cộng
- OSINT crawler chạy trong DMZ riêng, có kiểm soát Internet

### Hiệu năng
- Tra cứu đối tượng: < 2 giây với 1 triệu bản ghi
- API response: p95 < 500ms
- Concurrent: ≥ 200 người dùng đồng thời
- OSINT queue riêng, không ảnh hưởng hệ thống chính

### Quy tắc viết code (BẮT BUỘC)

**Comment giải thích logic:**
- Trước mỗi hàm/method: comment mô tả mục đích, input/output nếu không rõ từ tên
- Trước các câu lệnh quan trọng (query DB, throw exception, transform data): comment 1 dòng giải thích **tại sao**, không chỉ **làm gì**
- Các điều kiện phức tạp (`if/else` nhiều nhánh, regex, bitwise): bắt buộc có comment

**Comment pipeline/flow cho hàm có nhiều bước:**
```typescript
// Flow: validate input → check DB → transform → save → return
async create(dto: CreateDto): Promise<Entity> {
  // 1. Kiểm tra dependency tồn tại (platform phải có trước khi tạo group)
  const platform = await this.platformRepo.findOne(...);
  if (!platform) throw new NotFoundException(...);

  // 2. Tạo entity instance trong memory (chưa INSERT)
  const entity = this.repo.create({ ...dto });

  // 3. Persist vào DB, TypeORM tự gán id + timestamps
  return this.repo.save(entity);
}
```

**Ngôn ngữ comment:** Tiếng Việt cho logic nghiệp vụ, tiếng Anh cho technical detail.

### Cách cộng tác mặc định: "hướng dẫn → user code → Claude review" (BẮT BUỘC)

Trừ khi user nói rõ "bạn code luôn", Claude **KHÔNG tự viết code triển khai**. Quy trình:

1. **Claude hướng dẫn từng bước**: giải thích mục đích, chỉ rõ file/vị trí, mô tả logic + pseudocode/skeleton, nêu cạm bẫy cần tránh. KHÔNG dán code hoàn chỉnh để user chỉ copy-paste.
2. **User tự viết code** theo hướng dẫn.
3. **Claude review**: đọc code user viết, chỉ ra bug/thiếu sót/vi phạm quy tắc, gợi ý sửa — rồi user sửa.

**Lý do:** user muốn HIỂU và tự kiểm soát codebase, không muốn nhận code "hộp đen". Mục tiêu là user nắm được từng dòng.

**Ngoại lệ** (Claude được tự code): scaffold/boilerplate lặp lại, file demo/script tạm để verify, hoặc khi user nói rõ "viết hộ/code luôn".

## API Base URL

```
/api/v1/
Docs: /api/docs (Swagger)
Auth: Bearer Token (JWT)
```

## Lộ trình phát triển (chốt 12/09/2026)

Thay cho lộ trình Phase 1-4 theo tháng trong `INSTRUCTIONS_ANTT_KHANHHOA.md` §V — bản đó viết cho phạm vi 9 module đầy đủ, không còn khớp phạm vi hiện tại.

| GĐ | Nội dung | Trạng thái |
|----|----------|-----------|
| S1-S5 | Pipeline OSINT: thu thập (RSS/Telegram/Facebook) → Normalize → NLP → Trust → Gate; NER tiếng Việt | ✅ DONE |
| CNC L1 | Category xuyên pipeline + 129 keyword/8 nhóm + IndicatorExtractor (phone/STK/ví/domain/handle) | ✅ DONE |
| CNC L2 | `osint_actor` + 4 loại định danh (account/group/domain/vân tay chỉ dấu) + job gộp + alert tái phạm | ✅ DONE |
| **S0** | Đóng việc dở + vệ sinh nền (`.env.example`, CI, README, lint) + rà pháp lý | 🔄 đang làm |
| **S6** | **Địa bàn hóa** — PostGIS + gazetteer 65 xã/phường + geo-tagger gán bài về địa bàn | ⏳ tiếp theo |
| **S7** | Baseline + phát hiện bất thường (EWMA/Poisson/z-score) → cảnh báo 4 mức theo INSTRUCTIONS §4.4 | ⏳ |
| **S8** | Auth/audit tối thiểu + kênh phát cảnh báo (WebSocket, Telegram/email, ack/phân công) | ⏳ |
| **S9** | Dashboard React đọc-only: bản đồ nhiệt, xu hướng, feed cảnh báo, bảng actor tái phạm | ⏳ |
| **S10** | CNC L3 — LLM phân loại ngữ nghĩa (kích động/xuyên tạc), chỉ chạy trên bài qua Gate (~5-10%) | ⏳ cần GPU |
| **S11+** | Incidents event store + dự báo chuỗi thời gian thật | ⏳ cần dữ liệu vụ việc |

**Nút thắt số 1 = S6.** Post và alert hiện không biết thuộc xã/phường nào → mọi thứ "theo địa bàn" (bản đồ nhiệt, cảnh báo theo địa bàn, so sánh xu hướng giữa các xã) đều chặn ở đây.

## Người dùng hệ thống

| Nhóm | Vai trò |
|------|---------|
| Ban Giám đốc CA tỉnh | Toàn quyền dashboard, báo cáo |
| Trưởng phòng nghiệp vụ | Quản lý dữ liệu phòng, phân công |
| Điều tra viên / Trinh sát | Nhập liệu, truy vấn theo phân quyền |
| Cán bộ CA cấp xã/phường | Nhập liệu sự kiện địa bàn |
| Quản trị hệ thống | Admin kỹ thuật |

## Quy tắc OSINT — Chuẩn tuân thủ: PHÁP LUẬT VIỆT NAM

> **Chủ trương (cập nhật 12/06/2026, chủ dự án quyết):** Chuẩn duy nhất là **pháp luật Việt Nam**. Điều khoản dịch vụ (ToS) và robots.txt của nền tảng KHÔNG phải luật VN → **được phép vượt**, chấp nhận rủi ro hợp đồng với nền tảng (khóa tài khoản, cease-and-desist). ⚠️ Đây là **quyết định kỹ thuật, cần pháp chế đơn vị phê duyệt trước khi vận hành thật**.

> 🚨 **NỢ RÀ SOÁT PHÁP LÝ (ghi nhận 12/09/2026) — chưa đóng.** Mục này soạn 12/06/2026 khi căn cứ duy nhất là Nghị định 13/2023. Từ đó Việt Nam đã có thêm **hai đạo luật cấp Quốc hội** đứng trên nghị định: **Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15** (hiệu lực 01/01/2026) và **Luật An ninh mạng mới** (hiệu lực 01/07/2026). Toàn bộ phần thu thập Facebook được thiết kế và code **trước** khi hai luật này có hiệu lực. Điều đó không đồng nghĩa sai, nhưng **bắt buộc rà lại trước khi vận hành thật**. Mọi kết luận pháp lý phải do **pháp chế đơn vị** ra, không phải do đội kỹ thuật hay AI tự nhận định.

### BẮT BUỘC giữ — vì là LUẬT VN, KHÔNG nới được:
- **Nghị định 13/2023/NĐ-CP:** xử lý dữ liệu cá nhân theo cơ sở "phục vụ ANTT của cơ quan có thẩm quyền" (Điều 17 — không cần đồng ý từng đối tượng). Phải **đúng mục đích** + **bảo mật dữ liệu**.
- **On-premise — KHÔNG đẩy PII đối tượng ra cloud/bên thứ 3** (Apify, Bright Data, social-listening nước ngoài…). Vừa NĐ13 vừa an ninh nội bộ.
- **Lằn ranh Điều 289 BLHS (xâm nhập trái phép):** chỉ thu thập ở **không gian công khai/cộng đồng**. ⛔ KHÔNG truy cập nội dung sau **mật khẩu/quyền riêng tư của một cá nhân cụ thể** (tài khoản riêng, tin nhắn riêng, group bí mật). Được dùng **tài khoản công cụ của hệ thống** để xem nội dung **công khai** mà nền tảng bắt đăng nhập mới hiển thị — vì đó là dùng credential của CHÍNH MÌNH, không vượt mật khẩu của người khác.
- **AI chỉ HỖ TRỢ** ra quyết định — không tự động ra quyết định ảnh hưởng quyền con người.
- **Mọi truy vấn đối tượng phải ghi audit log.**
- **Ranh giới chấm điểm chủ thể:** `osint_actor_stat` là **đếm minh bạch hành vi đăng bài công khai** trên danh tính online (bao nhiêu bài, category nào, trong cửa sổ bao nhiêu ngày) — KHÁC với "risk scoring dự đoán khả năng phạm tội của một cá nhân". Giữ đúng ranh giới này: công thức minh bạch, ngưỡng ghi rõ trong cấu hình, có audit, và **người duyệt quyết định cuối**. Nối actor ↔ hồ sơ người thật CHỈ ở Zone B.

### ĐƯỢC PHÉP — nới so với bản cũ, vì không phải luật VN — ⏳ CHỜ RÀ LẠI theo 2 luật mới:
- ⏳ **Đăng nhập bằng tài khoản công cụ** để truy cập nội dung **công khai** bị login-wall (FB group/page công khai…). Credential mã hóa AES-256 trong DB.
- ⏳ **Kỹ thuật giảm bị chặn:** account rotation, randomize delay/viewport/UA, ẩn dấu hiệu automation, proxy/IP rotation. Chấp nhận rủi ro ToS + khóa account.

Hai mục trên **vẫn đang dùng trong code** (Sprint 4) nhưng phải nằm trong danh mục trình pháp chế, cùng với việc **lưu PII trích từ bài rao bán dữ liệu** (số điện thoại, STK, ví crypto trong `osint_post_nlp.indicators`) — thu làm bằng chứng, không phát tán, và thuộc phạm vi Luật 91/2025.

### KHUYẾN NGHỊ giữ — OPSEC nghiệp vụ, không bắt buộc:
- UA không lộ danh tính cơ quan (OPSEC).
- Rate limit hợp lý (mặc định ≤ 1 req/s/domain) để không gây tải bất thường lên nguồn + giảm bị phát hiện.

## Nguồn tài liệu

- File yêu cầu đầy đủ: `INSTRUCTIONS_ANTT_KHANHHOA.md` — ⚠️ viết cho phạm vi 9 module đầy đủ. Khi mâu thuẫn với mục "Phạm vi giai đoạn hiện tại" ở đầu file này, **lấy CLAUDE.md làm chuẩn**.
- Đánh giá hiện trạng + cơ sở của quyết định thu hẹp phạm vi: `docs/2026-07-27-de-an-danh-gia-dinh-huong-phat-trien.docx`
- Spec + plan từng hạng mục: `docs/superpowers/specs/` và `docs/superpowers/plans/`
