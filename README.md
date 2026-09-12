# KH-SOMS — Khanh Hoa Security & Order Management System

Hệ thống phần mềm hỗ trợ bảo đảm an ninh, trật tự tỉnh Khánh Hòa (sau sáp nhập với Ninh Thuận
từ 01/7/2025 — 65 xã/phường/đặc khu, cấu trúc hành chính 2 cấp).

**Trọng tâm hiện tại:** OSINT phục vụ an ninh mạng & phòng chống tội phạm công nghệ cao (CNC) —
phát hiện chủ thể (tài khoản / group / page / website) **thường xuyên** đăng nội dung lừa đảo,
mua bán dữ liệu cá nhân, kích động — xuyên tạc; tiến tới cảnh báo sớm theo địa bàn.

> ⚠️ Hệ thống nghiệp vụ nội bộ, triển khai **on-premise**. Không đẩy dữ liệu cá nhân ra
> cloud/bên thứ 3. Xem mục "Quy tắc OSINT" trong [CLAUDE.md](CLAUDE.md) trước khi chạm vào
> phần thu thập.

## Cấu trúc repo

| Thư mục | Nội dung |
|---|---|
| `backend/` | NestJS + TypeORM + BullMQ — toàn bộ code nghiệp vụ hiện có (module `osint/`) |
| `backend/database/migrations/` | Migration SQL forward-only, đánh số `000` → `009` |
| `backend/database/seeds/` | Seed platform, nguồn, group, keyword CNC, từ lóng |
| `services/nlp-analyzer/` | FastAPI + underthesea — NER tiếng Việt (`/ner`), cổng 8001 |
| `services/news-extractor/` | FastAPI — bóc nội dung bài báo, cổng 8000 |
| `docs/superpowers/specs/` | Spec thiết kế từng hạng mục (đọc trước khi code) |
| `docs/superpowers/plans/` | Plan triển khai TDD theo từng task |
| `frontend/` | React — **chưa khởi tạo** |

## Yêu cầu môi trường

- Node.js 22+, PostgreSQL 15+ (PostGIS khi làm phần địa bàn), Redis 7+
- Python 3.10+ cho 2 service trong `services/`

## Chạy local

```bash
cd backend && npm ci && cp .env.example .env   # điền giá trị thật vào .env
```

Áp migration theo đúng thứ tự số thứ tự file trong `backend/database/migrations/`, rồi:

```bash
cd backend && npm run dev
```

API: `http://localhost:3000/api/v1` · Swagger: `http://localhost:3000/api/docs`

Hai service Python chạy riêng (mỗi cái `uvicorn main:app --port <8000|8001>` trong venv của nó).

## Kiểm thử

```bash
cd backend && npm test && npm run build
```

CI (`.github/workflows/ci.yml`) chạy lint + build + test trên mọi pull request.

## Quy ước phát triển

Mọi hạng mục đi theo **spec → plan → TDD → review** (`docs/superpowers/`). Quy tắc viết code,
phân cấp mật độ thông tin, ràng buộc pháp lý OSINT: xem [CLAUDE.md](CLAUDE.md).
Đặc tả nghiệp vụ đầy đủ: [INSTRUCTIONS_ANTT_KHANHHOA.md](INSTRUCTIONS_ANTT_KHANHHOA.md).
