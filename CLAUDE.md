# KH-SOMS — Khanh Hoa Security & Order Management System

Hệ thống phần mềm hỗ trợ bảo đảm an ninh, trật tự tỉnh Khánh Hòa (sau sáp nhập với Ninh Thuận từ 01/7/2025). Phục vụ lực lượng Công an tỉnh Khánh Hòa.

## Stack công nghệ

- **Frontend:** React.js, TypeScript, Zustand, React Query, Recharts, Leaflet.js, Ant Design
- **Backend:** NestJS, TypeScript, TypeORM, JWT, Bull Queue, Socket.io, Passport.js
- **Database:** PostgreSQL (PostGIS), Redis, MinIO/S3
- **OSINT:** Puppeteer, Playwright, NLP (underthesea / PhoBERT)

## Cấu trúc dự án (Backend NestJS)

```
src/
├── modules/
│   ├── auth/          # JWT + RBAC/ABAC
│   ├── users/         # Quản lý người dùng, phân quyền
│   ├── subjects/      # Quản lý đối tượng + OSINT cá nhân
│   ├── incidents/     # Vụ việc, sự kiện ANTT
│   ├── intelligence/  # Thu thập, xử lý thông tin tình báo
│   ├── osint/         # OSINT Media: crawl báo chí + MXH
│   ├── analytics/     # Thống kê, phân tích, dự báo
│   ├── prediction/    # Mô hình dự báo tội phạm (ARIMA, LSTM, RF)
│   ├── geography/     # Bản đồ, quản lý địa bàn (Leaflet + PostGIS)
│   ├── reports/       # Báo cáo tự động (PDF, Excel, Word, PPT)
│   ├── notifications/ # Push notification, WebSocket alert
│   └── audit/         # Nhật ký thao tác toàn hệ thống
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

## Các module theo lộ trình phát triển

**Phase 1 (Tháng 1-3):** Auth, Users, Subjects CRUD, Incidents cơ bản, Dashboard  
**Phase 2 (Tháng 4-6):** Search nâng cao, Graph liên kết, Map, OSINT Media cơ bản, Cảnh báo  
**Phase 3 (Tháng 7-9):** OSINT MXH, Subject enrichment, Hotspot, Dự báo AI, Chatbot  
**Phase 4 (Tháng 10-12):** Camera AI, Mobile app, API mở, Deepfake detection

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

### BẮT BUỘC giữ — vì là LUẬT VN, KHÔNG nới được:
- **Nghị định 13/2023/NĐ-CP:** xử lý dữ liệu cá nhân theo cơ sở "phục vụ ANTT của cơ quan có thẩm quyền" (Điều 17 — không cần đồng ý từng đối tượng). Phải **đúng mục đích** + **bảo mật dữ liệu**.
- **On-premise — KHÔNG đẩy PII đối tượng ra cloud/bên thứ 3** (Apify, Bright Data, social-listening nước ngoài…). Vừa NĐ13 vừa an ninh nội bộ.
- **Lằn ranh Điều 289 BLHS (xâm nhập trái phép):** chỉ thu thập ở **không gian công khai/cộng đồng**. ⛔ KHÔNG truy cập nội dung sau **mật khẩu/quyền riêng tư của một cá nhân cụ thể** (tài khoản riêng, tin nhắn riêng, group bí mật). Được dùng **tài khoản công cụ của hệ thống** để xem nội dung **công khai** mà nền tảng bắt đăng nhập mới hiển thị — vì đó là dùng credential của CHÍNH MÌNH, không vượt mật khẩu của người khác.
- **AI chỉ HỖ TRỢ** ra quyết định — không tự động ra quyết định ảnh hưởng quyền con người.
- **Mọi truy vấn đối tượng phải ghi audit log.**

### ĐƯỢC PHÉP — nới so với bản cũ, vì không phải luật VN:
- ✅ **Đăng nhập bằng tài khoản công cụ** để truy cập nội dung **công khai** bị login-wall (FB group/page công khai…). Credential mã hóa AES-256 trong DB.
- ✅ **Kỹ thuật giảm bị chặn:** account rotation, randomize delay/viewport/UA, ẩn dấu hiệu automation, proxy/IP rotation. Chấp nhận rủi ro ToS + khóa account.

### KHUYẾN NGHỊ giữ — OPSEC nghiệp vụ, không bắt buộc:
- UA không lộ danh tính cơ quan (OPSEC).
- Rate limit hợp lý (mặc định ≤ 1 req/s/domain) để không gây tải bất thường lên nguồn + giảm bị phát hiện.

## Nguồn tài liệu

- File yêu cầu đầy đủ: `INSTRUCTIONS_ANTT_KHANHHOA.md`
