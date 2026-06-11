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

## API Base URL

```
/api/v1/
Docs: /api/docs (Swagger)
Auth: Bearer Token (JWT)
```

## Các module theo lộ trình phát triển

**Phase 1 (Tháng 1-3):** Auth, Users, Subjects CRUD, Incidents cơ bản, Dashboard  
**Phase 2 (Tháng 4-6):** Search nâng cao, Graph liên kết, Map, OSINT Media cơ bản (crawl + gating Tầng 0, tách từ tiếng Việt), khởi động gán nhãn dataset ANTT, Cảnh báo  
**Phase 3 (Tháng 7-9):** NLP Microservice PhoBERT (relevance → topic → NER, phải vượt KPI chất lượng), Alert scoring tổng hợp + vòng phản hồi, OSINT MXH, Subject enrichment, Hotspot, Dự báo AI, Chatbot  
**Phase 4 (Tháng 10-12):** Camera AI, Mobile app, API mở, Deepfake detection, LLM local (chính thức — tóm tắt, chatbot; ngoài đường quyết định cảnh báo), retrain định kỳ, rollout OSINT chuyên biệt theo hệ (ma túy → hình sự → ANM)

### Mở rộng OSINT theo hệ nghiệp vụ (xem 9.10 trong INSTRUCTIONS)
- Một hệ chuyên biệt (hình sự, ma túy, ANM, hành chính) = **một gói cấu hình** (sources, keywords/slang theo `category`, routing rules) chạy trên pipeline chung — **KHÔNG fork code, KHÔNG hard-code logic theo hệ** trong processor/AlertService
- Phase 3 phải thêm: cột `domain` vào `osint_alerts` + bảng `alert_routing_rules` (domain × chủ đề × địa bàn → phòng nhận)
- Nhãn chủ đề Tầng 1 (8 nhóm) chính là khóa định tuyến sang hệ

### Kiến trúc NLP phân tầng cho OSINT (xem 9.3.1, 9.9 trong INSTRUCTIONS)
- **Tầng 0** (NestJS): gating từ khóa/từ lóng theo từ đã tách (underthesea) — KHÔNG khớp chuỗi con
- **Tầng 1** (Python/FastAPI trong DMZ): PhoBERT fine-tuned — relevance score 0-1, topic 8 nhóm, NER, sentiment
- **Tầng 2** (NestJS): alert severity = score tổng hợp (relevance + địa bàn + trust_level nguồn + virality + slang có ngữ cảnh); cán bộ ack
- **Cổng chất lượng:** model chỉ lên production khi vượt KPI trên bộ test vàng (relevance P≥90%/R≥85%, topic F1≥80%, NER F1≥85%, critical FP≤5%)

## Người dùng hệ thống

| Nhóm | Vai trò |
|------|---------|
| Ban Giám đốc CA tỉnh | Toàn quyền dashboard, báo cáo |
| Trưởng phòng nghiệp vụ | Quản lý dữ liệu phòng, phân công |
| Điều tra viên / Trinh sát | Nhập liệu, truy vấn theo phân quyền |
| Cán bộ CA cấp xã/phường | Nhập liệu sự kiện địa bàn |
| Quản trị hệ thống | Admin kỹ thuật |

## Quy tắc OSINT (Pháp lý)

- Chỉ thu thập nội dung **công khai**, không đăng nhập tài khoản
- Tuân thủ robots.txt, rate limit ≤ 1 req/giây mỗi domain
- Tuân thủ Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 (hiệu lực 01/01/2026) + Nghị định 356/2025/NĐ-CP
- AI chỉ **hỗ trợ** ra quyết định — không tự động ra quyết định ảnh hưởng quyền con người

## Nguồn tài liệu

- File yêu cầu đầy đủ: `INSTRUCTIONS_ANTT_KHANHHOA.md`
