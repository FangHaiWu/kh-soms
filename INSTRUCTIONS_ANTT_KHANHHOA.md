# 🛡️ PROJECT INSTRUCTIONS
## Hệ thống Phần mềm Hỗ trợ Bảo đảm An ninh, Trật tự
### Tỉnh Khánh Hòa (sau sáp nhập) — Phiên bản 1.2

---

## I. TỔNG QUAN DỰ ÁN

### 1.1 Tên dự án
**KH-SOMS** — *Khanh Hoa Security & Order Management System*

### 1.2 Mục tiêu tổng quát
Xây dựng nền tảng phần mềm tích hợp, hỗ trợ lực lượng Công an tỉnh Khánh Hòa trong:
- Thu thập, quản lý, phân tích dữ liệu an ninh trật tự (ANTT)
- Truy vấn nhanh thông tin đối tượng, vụ việc
- Dự báo tình hình, hỗ trợ ra quyết định theo thời gian thực
- Phối hợp, điều phối lực lượng hiệu quả

### 1.3 Phạm vi địa bàn

> **Căn cứ pháp lý:** Nghị quyết số 202/2025/QH15 ngày 12/6/2025 của Quốc hội và Nghị quyết số 1667/NQ-UBTVQH15 ngày 16/6/2025 của Ủy ban Thường vụ Quốc hội. Hiệu lực từ ngày **01/7/2025**: tỉnh Ninh Thuận và tỉnh Khánh Hòa sáp nhập thành **tỉnh Khánh Hòa mới**.

**Thông số địa lý – hành chính tỉnh Khánh Hòa (mới):**

| Chỉ tiêu | Số liệu |
|----------|---------|
| Diện tích tự nhiên | 8.555,86 km² |
| Dân số | ~2.243.554 người |
| Trung tâm hành chính | TP. Nha Trang |
| Đơn vị HC cấp xã | **65** (48 xã + 16 phường + 1 đặc khu) |
| Giảm so với trước sáp nhập | 129 đơn vị cấp xã (↓ 66,49%) |

> ⚠️ **Lưu ý quan trọng về cấp huyện:** Theo mô hình chính quyền địa phương 2 cấp mới, **không còn cấp huyện** sau sáp nhập. Tỉnh Khánh Hòa quản lý trực tiếp 65 đơn vị hành chính cấp xã. Hệ thống phần mềm cần thiết kế phù hợp với cấu trúc **2 cấp: Tỉnh → Xã/Phường/Đặc khu**.

**Địa bàn trọng điểm cần ưu tiên:**
- **Khu vực Khánh Hòa (cũ):** TP. Nha Trang (502.000+ dân), TP. Cam Ranh, TX. Ninh Hòa, vùng Khánh Sơn, Khánh Vĩnh (địa bàn phức tạp)
- **Khu vực Ninh Thuận (cũ):** TP. Phan Rang – Tháp Chàm, huyện Ninh Phước, huyện Ninh Hải
- **Địa bàn đặc thù:** Đặc khu kinh tế Vân Phong, bờ biển dài hơn 380 km, quần đảo Trường Sa

**Đặc điểm ANTT đặc thù sau sáp nhập:**
- Du lịch biển lớn nhất miền Trung → phức tạp về TTXH, tội phạm người nước ngoài
- Vùng đồng bào dân tộc thiểu số (Raglai, Chăm) tại vùng núi → theo dõi ANND
- Cảng biển Cam Ranh, Cảng cá → nguy cơ buôn lậu, ma túy đường biển
- Năng lượng tái tạo (điện gió, điện mặt trời Ninh Thuận) → bảo vệ hạ tầng quan trọng
- Ranh giới mới với Phú Yên (phía Bắc), Đắk Lắk & Lâm Đồng (phía Tây)

### 1.4 Người dùng mục tiêu
| Nhóm | Vai trò | Quyền hạn |
|------|---------|--------------|
| Ban Giám đốc CA tỉnh | Chỉ đạo, ra quyết định chiến lược | Toàn quyền xem báo cáo, dashboard tổng hợp |
| Trưởng phòng nghiệp vụ | Quản lý theo mảng (ANND, CSHS, CSGT...) | Quản lý dữ liệu phòng, phân công |
| Điều tra viên / Trinh sát | Nhập liệu, truy vấn, xử lý hồ sơ | Truy cập theo phân quyền nghiệp vụ |
| Cán bộ CA cấp xã/phường | Nhập liệu sự kiện, báo cáo địa bàn | Phạm vi địa bàn được giao |
| Quản trị hệ thống | Cấu hình, vận hành hệ thống | Quyền admin kỹ thuật |

---

## II. KIẾN TRÚC KỸ THUẬT

### 2.1 Stack công nghệ

```
┌─────────────────────────────────────────────┐
│              FRONTEND (React.js)             │
│  TypeScript | Zustand | React Query          │
│  Recharts | Leaflet.js | Ant Design          │
└──────────────────┬──────────────────────────┘
                   │ REST API / WebSocket
┌──────────────────▼──────────────────────────┐
│             BACKEND (NestJS)                 │
│  TypeScript | TypeORM | JWT Auth             │
│  Bull Queue | Socket.io | Passport.js        │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
┌───────────┐ ┌────────┐ ┌──────────┐
│PostgreSQL │ │ Redis  │ │MinIO/S3  │
│(Primary   │ │(Cache/ │ │(File     │
│ DB)       │ │Queue)  │ │ Storage) │
└───────────┘ └────────┘ └──────────┘
```

### 2.2 Kiến trúc Module NestJS

```
src/
├── modules/
│   ├── auth/              # Xác thực, phân quyền
│   ├── users/             # Quản lý người dùng
│   ├── subjects/          # Quản lý đối tượng
│   ├── incidents/         # Vụ việc, sự kiện ANTT
│   ├── intelligence/      # Thu thập, xử lý tin tức
│   ├── osint/             # Thu thập thông tin nguồn mở ← MỚI
│   ├── analytics/         # Phân tích, thống kê
│   ├── prediction/        # Dự báo, cảnh báo
│   ├── geography/         # Bản đồ, địa bàn
│   ├── reports/           # Báo cáo, xuất dữ liệu
│   ├── notifications/     # Cảnh báo, thông báo
│   └── audit/             # Nhật ký hệ thống
├── common/
│   ├── guards/            # Auth guards, RBAC
│   ├── interceptors/      # Logging, transform
│   ├── filters/           # Exception filters
│   └── decorators/        # Custom decorators
└── config/                # Cấu hình môi trường
```

### 2.3 Cấu trúc Database (PostgreSQL)

**Schema chính:**
- `public` — Dữ liệu nghiệp vụ chung
- `audit` — Nhật ký thao tác
- `spatial` — Dữ liệu địa lý (PostGIS extension)
- `osint` — Dữ liệu thu thập từ nguồn mở

---

## III. CÁC MODULE CHỨC NĂNG CHÍNH

---

### MODULE 1: QUẢN LÝ ĐỐI TƯỢNG + OSINT CÁ NHÂN
*(Subject Management & Personal OSINT)*

#### 1.1 Mục tiêu
Xây dựng CSDL đối tượng toàn diện, kết hợp dữ liệu nội bộ và thông tin từ nguồn mở (OSINT), phục vụ tra cứu, theo dõi, phân tích liên kết.

#### 1.2 Dữ liệu quản lý nội bộ

**Bảng `subjects` — Hồ sơ đối tượng:**
```typescript
{
  id: UUID
  fullName: string
  aliases: string[]           // Tên gọi khác, biệt danh
  dateOfBirth: Date
  gender: enum
  idNumber: string            // CCCD/CMND
  idIssuedDate: Date
  idIssuedPlace: string
  permanentAddress: Address
  currentAddress: Address
  occupation: string
  workplace: string
  phone: string[]
  email: string[]
  socialAccounts: SocialAccount[]

  // Phân loại
  category: enum              // Hình sự, ma túy, ANND, đặc biệt nguy hiểm...
  riskLevel: enum             // Cao, trung bình, thấp
  status: enum                // Đang theo dõi, đã xử lý, đang trốn truy nã...

  // Nhận dạng
  photos: string[]
  physicalDescription: PhysicalInfo
  fingerprints: string[]
  tattoos: TattooInfo[]

  // Lịch sử tư pháp
  criminalHistory: CriminalRecord[]
  imprisonmentHistory: ImprisonmentRecord[]
  caseIds: UUID[]

  // OSINT (tham chiếu sang bảng riêng)
  osintProfile: SubjectOsintProfile  // ← MỚI

  // Metadata
  createdBy: UUID
  updatedBy: UUID
  securityLevel: enum
}
```

#### 1.3 Dữ liệu OSINT cho từng đối tượng *(MỚI)*

**Bảng `subject_osint_profiles` — Thông tin nguồn mở:**
```typescript
{
  subjectId: UUID              // FK → subjects.id
  lastCrawledAt: Date

  // Mạng xã hội
  facebook: {
    profileUrl: string
    displayName: string
    bio: string
    friends: number
    followers: number
    recentPosts: OsintPost[]   // 30 bài gần nhất
    checkins: OsintLocation[]  // Địa điểm check-in
    photos: string[]
    knownAssociates: string[]  // Tên xuất hiện nhiều trong bình luận/tag
    groups: string[]           // Nhóm tham gia công khai
    lastSeen: Date
  }
  tiktok: {
    profileUrl: string
    username: string
    bio: string
    followers: number
    videos: OsintPost[]
    hashtags: string[]
  }
  zalo: {
    phone: string              // Liên kết với số điện thoại
    displayName: string
    lastOnline: Date
  }
  youtube: { ... }
  instagram: { ... }
  telegram: { ... }           // Nếu kênh/nhóm công khai

  // Báo chí & web công khai
  newsAppearances: NewsAppearance[]  // Lần xuất hiện trên báo
  courtRecordsPublic: string[]       // Bản án công khai
  businessRegistrations: BusinessInfo[] // ĐKKD công khai (cục thuế, sở KH&ĐT)
  vehicleRegistrations: VehicleInfo[]   // ĐKXM công khai

  // Thông tin số
  emailBreaches: string[]      // Kiểm tra breach database công khai
  knownDomains: string[]       // Tên miền liên quan
  ipHistory: string[]          // IP công khai (từ forum, comment...)

  // Tổng hợp
  onlineActivitySummary: string   // AI tóm tắt hoạt động mạng
  riskSignals: OsintRiskSignal[]  // Dấu hiệu nguy cơ phát hiện từ OSINT
  osintScore: number              // Điểm hoạt động mạng bất thường (0-100)
}
```

**Quy trình OSINT theo đối tượng:**
```
Nhập thông tin seed (tên, SĐT, CCCD, email, URL MXH)
        ↓
Hệ thống tự động crawl thông tin công khai
        ↓
Làm giàu dữ liệu (data enrichment)
        ↓
AI phân tích, phát hiện dấu hiệu bất thường
        ↓
Cán bộ xem xét, xác nhận & gán nhãn
        ↓
Cập nhật định kỳ tự động (theo lịch)
```

**Công cụ & kỹ thuật OSINT tích hợp:**
| Loại | Phương pháp | Công cụ/API |
|------|-------------|-------------|
| Mạng xã hội | Scraping nội dung công khai | Puppeteer, Playwright |
| Tên miền | Whois, reverse lookup | WHOIS API |
| Email | Xác thực, breach check | HaveIBeenPwned API (miễn phí) |
| Hình ảnh | Reverse image search | SerpAPI (Google Images) |
| Báo chí | Full-text search | Module OSINT Media (xem Module 9) |
| ĐKKD | Tra cứu công khai | Cổng TTĐT quốc gia về ĐKKD |
| Bản đồ | Geo-tagging từ ảnh, post | EXIF extraction, Google Maps |

#### 1.4 Chức năng tra cứu đối tượng

**Tìm kiếm đa chiều:**
```
Tra cứu theo:
✓ Họ tên (fuzzy search, hỗ trợ không dấu)
✓ Số CCCD/CMND
✓ Số điện thoại
✓ Địa chỉ (Tỉnh → Xã/Phường/Đặc khu — 2 cấp mới)
✓ Đặc điểm nhận dạng (mô tả vật lý)
✓ Biệt danh, tên gọi khác
✓ Username / URL mạng xã hội  ← MỚI (OSINT)
✓ Email                        ← MỚI (OSINT)
✓ Biển số xe                   ← MỚI (OSINT)
✓ Phân loại tội phạm
✓ Mức độ nguy hiểm
✓ Khoảng thời gian hoạt động
✓ Liên kết với đối tượng khác
```

**Kết quả truy vấn hiển thị:**
- Hồ sơ đầy đủ với ảnh, thông tin cơ bản
- **Tab OSINT:** Tổng hợp thông tin nguồn mở, hoạt động MXH ← MỚI
- Timeline hoạt động: kết hợp sự kiện nội bộ + hoạt động online
- Sơ đồ liên kết (quan hệ với đối tượng khác, địa điểm, vụ án)
- Bản đồ vị trí thường xuất hiện (nội bộ + check-in MXH)
- Cảnh báo mức độ nguy hiểm + OSINT risk score
- Danh sách vụ việc liên quan
- **Báo cáo tổng hợp OSINT** có thể xuất PDF ← MỚI

#### 1.5 Phân tích mạng lưới liên kết
- Graph visualization: đối tượng — đồng bọn — địa điểm — vụ án
- **Bổ sung node từ OSINT:** bạn bè MXH, thành viên nhóm, người tag ảnh ← MỚI
- Thuật toán phát hiện cộng đồng (community detection)
- Xác định "đối tượng trung tâm" trong mạng lưới tội phạm

---

### MODULE 2: QUẢN LÝ VỤ VIỆC & SỰ KIỆN ANTT + OSINT VỤ VIỆC
*(Incident Management & Incident OSINT)*

#### 2.1 Phân loại sự kiện

| Nhóm | Loại cụ thể |
|------|-------------|
| Hình sự | Giết người, cướp, trộm cắp, lừa đảo, hiếp dâm... |
| Ma túy | Mua bán, tàng trữ, tổ chức sử dụng... |
| ANND | Hoạt động chống phá, tuyên truyền... |
| TTXH | Gây rối, đánh nhau, tụ tập đông người... |
| CSGT | TNGT, vi phạm giao thông nghiêm trọng... |
| Kinh tế | Tham nhũng, buôn lậu, gian lận thương mại... |
| Mạng | Lừa đảo trực tuyến, tấn công mạng... |
| Cháy nổ | Cháy nhà, nổ gas, tai nạn lao động... |

#### 2.2 OSINT cho Vụ việc *(MỚI)*

Mỗi vụ việc có thể được làm giàu bằng thông tin nguồn mở:

**Bảng `incident_osint_data`:**
```typescript
{
  incidentId: UUID

  // Tin tức báo chí
  relatedNews: NewsArticle[]         // Bài báo liên quan tự động khớp
  mediaTimeline: MediaEvent[]        // Timeline đưa tin theo thời gian

  // Mạng xã hội
  socialMentions: SocialPost[]       // Post MXH đề cập vụ việc (theo địa điểm, hashtag, từ khóa)
  viralPosts: SocialPost[]           // Post lan truyền liên quan
  eyewitnessAccounts: SocialPost[]   // Nhân chứng chia sẻ công khai

  // Không gian địa lý công khai
  streetViewCapture: string[]        // Ảnh Street View khu vực hiện trường
  nearbyPlacesPublic: PlaceInfo[]    // Địa điểm công khai gần hiện trường

  // Thông tin bổ sung
  weatherAtTime: WeatherRecord       // Thời tiết tại thời điểm xảy ra
  eventContext: string[]             // Sự kiện công cộng diễn ra cùng thời điểm

  osintSummary: string               // AI tóm tắt thông tin nguồn mở về vụ việc
}
```

#### 2.3 Luồng xử lý vụ việc

```
Tiếp nhận tin báo
      ↓
Tạo hồ sơ vụ việc
      ↓
[TỰ ĐỘNG] Kích hoạt OSINT crawl theo địa điểm + từ khóa
      ↓
Phân loại & Phân công
      ↓
Điều tra, Thu thập chứng cứ (nội bộ + OSINT)
      ↓
Xác định đối tượng
      ↓
Xử lý (khởi tố / hành chính / lưu trữ)
      ↓
Đóng hồ sơ & Thống kê
```

#### 2.4 Tính năng nổi bật
- Upload đa phương tiện: ảnh hiện trường, video, tài liệu
- Chuỗi chứng cứ (chain of custody) số hóa
- Liên kết đối tượng — vụ việc — địa điểm
- **Tự động gợi ý đối tượng liên quan từ OSINT** ← MỚI
- Theo dõi tiến độ xử lý theo thời gian thực
- Thông báo deadline, cảnh báo hồ sơ tồn đọng

---

### MODULE 3: THU THẬP & PHÂN TÍCH THÔNG TIN TÌNH BÁO
*(Intelligence Collection & Analysis)*

#### 3.1 Nguồn thu thập

```
Nguồn tin tức ANTT:
├── Nội bộ
│   ├── Báo cáo từ CA cấp xã/phường
│   ├── Báo cáo tuần tra
│   └── Hệ thống camera giám sát (tích hợp)
├── Quần chúng
│   ├── Đường dây nóng (hotline)
│   ├── Form báo tin online (ẩn danh)
│   └── Ứng dụng mobile công dân
├── Kỹ thuật
│   ├── Tích hợp CSDL quốc gia (dân cư, tư pháp)
│   └── Open Source Intelligence (OSINT) ← Xem Module 9
└── Nguồn mở tự động (Module 9)
    ├── Báo chí điện tử
    └── Mạng xã hội
```

#### 3.2 Quy trình xử lý thông tin
- **Thu thập** → Nhập liệu đa kênh, chuẩn hóa dữ liệu
- **Đánh giá** → Xác minh nguồn tin, độ tin cậy (A-F scale)
- **Phân tích** → Tổng hợp, đối chiếu đa nguồn
- **Phổ biến** → Phân phối thông tin đến đơn vị phù hợp
- **Phản hồi** → Đánh giá hiệu quả sau hành động

#### 3.3 Đánh giá độ tin cậy nguồn tin
```
Nguồn: A (Hoàn toàn tin cậy) → F (Chưa xác định)
Nội dung: 1 (Xác nhận) → 6 (Không thể xác định)

Ví dụ: A1 = Nguồn đáng tin, nội dung đã xác nhận
        F6 = Nguồn mới, chưa kiểm chứng được
```

---

### MODULE 4: PHÂN TÍCH DỮ LIỆU & DỰ BÁO TÌNH HÌNH
*(Analytics & Predictive Intelligence)*

#### 4.1 Dashboard tổng quan (Real-time)

**Các chỉ số hiển thị:**
- Tổng số vụ việc: hôm nay / tuần / tháng / năm
- So sánh cùng kỳ (tăng/giảm theo %)
- Bản đồ nhiệt (heatmap) phân bố tội phạm theo địa bàn
- Biểu đồ xu hướng theo loại tội phạm
- Top địa điểm, khung giờ xảy ra nhiều vụ nhất
- Tỷ lệ phá án, thời gian xử lý trung bình
- **Ticker tin tức ANTT từ báo chí theo dõi (real-time)** ← MỚI

#### 4.2 Phân tích không gian - thời gian

**Hotspot Analysis:**
```
Thuật toán: Kernel Density Estimation (KDE)
Đầu vào: Tọa độ vụ việc + Timestamp
Đầu ra: Bản đồ nhiệt dự báo khu vực nguy cơ cao
Cập nhật: Tự động theo chu kỳ (daily/weekly)
```

**Temporal Pattern:**
- Phân tích khung giờ cao điểm (theo loại tội phạm)
- Phân tích ngày trong tuần, mùa, dịp lễ tết
- Phát hiện chu kỳ bất thường

#### 4.3 Mô hình dự báo (Predictive Modeling)

| Mô hình | Mục tiêu | Phương pháp |
|---------|----------|-------------|
| Crime Forecasting | Dự báo vụ việc theo khu vực/thời gian | Time Series (ARIMA, LSTM) |
| Risk Scoring | Chấm điểm nguy cơ tái phạm | Random Forest, Logistic Regression |
| Network Analysis | Phát hiện nhóm tội phạm mới | Graph Neural Network |
| Anomaly Detection | Cảnh báo bất thường | Isolation Forest |
| **Relevance & Topic Classification** | **Tự động xác định nội dung liên quan ANTT, phân loại chủ đề** ← v1.2 | **PhoBERT fine-tuned (xem 9.3.1, 9.9)** |
| **Sentiment Analysis** | **Phát hiện xu hướng bất ổn từ MXH** ← MỚI | **PhoBERT fine-tuned (cùng microservice trên)** |

#### 4.4 Hệ thống cảnh báo sớm (Early Warning System)

**Ngưỡng cảnh báo tự động:**
```
⚡ KHẨN CẤP (đỏ):   > 3 vụ cùng loại trong 24h tại 1 địa bàn
⚠️  CAO (cam):       Tăng đột biến > 50% so với trung bình 30 ngày
                     HOẶC phát hiện nội dung kích động lan truyền trên MXH
📋 TRUNG BÌNH (vàng): Xu hướng tăng liên tục ≥ 7 ngày
ℹ️  THÔNG TIN (xanh): Thay đổi đáng chú ý cần theo dõi
```

> **Lưu ý (v1.2):** Các ngưỡng trên áp dụng cho cảnh báo *thống kê tổng hợp*. Mức cảnh báo cho **từng bài OSINT** được tính theo công thức scoring tổng hợp tại Mục 9.3.1 (Tầng 2) — không chỉ dựa khớp từ khóa đơn lẻ.

---

### MODULE 5: BẢN ĐỒ SỐ & QUẢN LÝ ĐỊA BÀN
*(Digital Map & Territory Management)*

#### 5.1 Tính năng bản đồ
- Nền bản đồ: OpenStreetMap + tile server nội bộ
- Overlay: Ranh giới hành chính **cập nhật theo cấu trúc 2 cấp mới** (Tỉnh → Xã/Phường/Đặc khu)
- Vẽ vùng phụ trách theo từng cán bộ, đơn vị
- Plot điểm vụ việc, đối tượng, điểm nóng

#### 5.2 Quản lý địa bàn
- Phân vùng phụ trách theo đơn vị CA (65 đơn vị xã/phường/đặc khu)
- Phân công tuần tra, giao nhiệm vụ theo địa bàn
- Tracking lịch sử vi phạm theo từng địa điểm cụ thể
- Quản lý địa điểm nhạy cảm (quán bar, khách sạn, điểm nghi tập kết...)
- **Hiển thị vùng chuyển tiếp Khánh Hòa cũ – Ninh Thuận cũ** ← lưu ý giai đoạn đầu

#### 5.3 Tích hợp Camera AI *(giai đoạn 2)*
- Kết nối với hệ thống camera Thành phố thông minh Nha Trang
- Alert khi phát hiện đối tượng trong danh sách theo dõi (face recognition)
- Nhận diện biển số xe liên quan

---

### MODULE 6: HỖ TRỢ RA QUYẾT ĐỊNH
*(Decision Support System)*

#### 6.1 Báo cáo tự động

| Loại báo cáo | Chu kỳ | Người nhận |
|-------------|--------|------------|
| Tình hình ANTT ngày | Hàng ngày 17:00 | Ban Giám đốc, Trực ban |
| Tổng hợp tuần | Thứ 6 hàng tuần | Trưởng phòng nghiệp vụ |
| Phân tích tháng | Ngày 5 hàng tháng | Ban Giám đốc |
| **Digest tin tức ANTT** ← MỚI | Sáng hàng ngày 7:00 | Trực ban, Trưởng phòng |
| Đột xuất theo chuyên đề | Theo yêu cầu | Tuỳ chỉnh |

#### 6.2 Bộ lọc hỗ trợ ra quyết định

**Gợi ý phân công lực lượng:**
```
Dựa vào: Dự báo hotspot + Lực lượng hiện có + Tính chất vụ việc
→ Gợi ý: Đơn vị nào, bao nhiêu người, địa bàn nào, khung giờ nào
```

**So sánh phương án xử lý:**
- Tra cứu các vụ tương tự đã xử lý
- Trích xuất bài học kinh nghiệm
- Gợi ý quy trình xử lý phù hợp

#### 6.3 Tích hợp AI Chatbot *(hỗ trợ nghiệp vụ)*
```
Cán bộ hỏi: "Tình hình tội phạm ma túy tháng 5 năm nay so với năm ngoái?"
Hệ thống trả lời: Tổng hợp số liệu + Biểu đồ + Nhận định + Gợi ý

Cán bộ hỏi: "Báo chí đưa tin gì về địa bàn Phan Rang tuần này?"
Hệ thống trả lời: Tóm tắt tin tức + Liên kết nguồn + Phân tích liên quan ANTT
```

---

### MODULE 7: QUẢN LÝ LỰC LƯỢNG & PHÂN CÔNG NHIỆM VỤ
*(Force Management & Task Assignment)*

#### 7.1 Quản lý nhân sự tác chiến
- Danh sách cán bộ, chiến sĩ theo đơn vị
- Lịch trực ban, lịch tuần tra
- Theo dõi trạng thái: Sẵn sàng / Đang thực hiện nhiệm vụ / Nghỉ phép

#### 7.2 Điều phối sự kiện
- Phân công nhiệm vụ trực tiếp trên hệ thống
- Push notification đến thiết bị cán bộ
- Xác nhận nhận lệnh, báo cáo hoàn thành
- Lịch sử thực hiện nhiệm vụ của từng cán bộ

---

### MODULE 8: BÁO CÁO, THỐNG KÊ & XUẤT DỮ LIỆU
*(Reporting & Export)*

#### 8.1 Định dạng xuất
- **PDF**: Báo cáo chính thức, có chữ ký điện tử
- **Excel/CSV**: Dữ liệu thô để phân tích ngoài
- **Word**: Văn bản tổng hợp chỉnh sửa được
- **PowerPoint**: Báo cáo trình bày hội nghị

#### 8.2 Biểu đồ & Trực quan hóa
- Line chart, Bar chart, Pie chart: Xu hướng, cơ cấu
- Heatmap: Phân bố không gian-thời gian
- Network graph: Quan hệ liên kết
- Timeline: Diễn biến vụ việc + sự kiện truyền thông

---

### MODULE 9: THU THẬP DỮ LIỆU NGUỒN MỞ (OSINT MEDIA) ← MODULE MỚI
*(Open Source Intelligence — Media & Social)*

#### 9.1 Tổng quan

Module độc lập, chạy nền liên tục, tự động thu thập, xử lý và phân loại thông tin từ:
- Báo chí điện tử Việt Nam
- Mạng xã hội công khai (Facebook, TikTok, YouTube, Zalo)
- Diễn đàn, cộng đồng trực tuyến
- Trang web chính phủ, thông báo công khai

#### 9.2 Nguồn theo dõi

**Báo chí điện tử (News Monitoring):**
```
Danh sách nguồn theo dõi (có thể cấu hình thêm):

Báo địa phương:
  - Báo Khánh Hòa (baokhanhhoa.vn)
  - Đài PT-TH Khánh Hòa
  - Báo Ninh Thuận (baoninhthuan.com.vn)  ← bổ sung sau sáp nhập

Báo quốc gia liên quan ANTT:
  - Công an Nhân dân (cand.com.vn)
  - Pháp luật TP.HCM (plo.vn)
  - VnExpress (pháp luật, xã hội)
  - Tuổi Trẻ Online (tuoitre.vn)
  - Thanh Niên (thanhnien.vn)
  - Dân Trí (dantri.com.vn)
  - VTC News, VOV, VTV...

Chuyên trang pháp luật:
  - Pháp luật Plus, Infonet...
```

**Mạng xã hội (Social Media Monitoring):**
```
Facebook:
  - Groups/Pages địa phương Khánh Hòa, Ninh Thuận
  - Hashtag địa bàn (#NhaTrang, #PhanRang, #KhanhHoa...)
  - Post công khai theo từ khóa + vị trí địa lý

TikTok:
  - Video theo hashtag, địa điểm
  - Trending content liên quan địa bàn

YouTube:
  - Video tin tức, phóng sự địa bàn

Các diễn đàn:
  - Webtretho, OtofunForum, Reddit Vietnam
  - Các group Zalo công khai (nếu có API)
```

#### 9.3 Quy trình xử lý tự động

```
[1] THU THẬP (Crawling)
    │  Crawler theo lịch (15 phút/lần cho báo chí, 1h/lần cho MXH)
    │  Xử lý RSS Feed, Sitemap, Direct Scraping
    ▼
[2] LỌC SƠ BỘ (Pre-filtering)
    │  Loại bỏ nội dung trùng lặp (dedup bằng content hash)
    │  Lọc theo từ khóa địa bàn & chủ đề ANTT
    ▼
[3] PHÂN TÍCH NLP (NLP Processing)
    │  Phát hiện thực thể (NER): người, địa điểm, tổ chức
    │  Phân loại chủ đề (topic classification)
    │  Phân tích cảm xúc (sentiment: tích cực / tiêu cực / trung lập)
    │  Trích xuất từ khóa quan trọng
    ▼
[4] KHỚP & LÀM GIÀU (Matching & Enrichment)
    │  Khớp tên người → đối tượng trong CSDL nội bộ
    │  Khớp địa điểm → địa bàn trong hệ thống
    │  Liên kết với vụ việc đang mở
    ▼
[5] ĐÁNH GIÁ & PHÂN LOẠI (Assessment)
    │  Tính điểm mức độ liên quan ANTT (relevance score)
    │  Phát hiện nội dung nhạy cảm, kích động
    │  Đánh giá khả năng lan truyền (virality prediction)
    ▼
[6] LƯU TRỮ & PHÂN PHỐI (Storage & Distribution)
       Lưu vào schema `osint`
       Push alert đến cán bộ phụ trách (nếu vượt ngưỡng)
       Hiển thị trong dashboard & digest sáng
```

#### 9.3.1 Kiến trúc NLP phân tầng *(bổ sung v1.2)*

Các bước [2], [3], [5] ở trên được triển khai theo **3 tầng** — tầng trước lọc rẻ và nhanh cho tầng sau đắt và chính xác:

```
TẦNG 0 — GATING (rule-based, trong NestJS worker)            [Phase 2 — đã có]
│  Khớp từ khóa + từ lóng theo TỪ ĐÃ TÁCH (underthesea/VnCoreNLP),
│  không khớp chuỗi con (tránh "đá" khớp nhầm trong "đá bóng")
│  Mục tiêu: recall cao, loại nhanh bài chắc chắn không liên quan
▼
TẦNG 1 — NLP MICROSERVICE (Python/FastAPI, đặt trong DMZ)    [Phase 3]
│  PhoBERT fine-tune trên dataset ANTT gán nhãn (xem 9.9), 4 nhiệm vụ
│  theo thứ tự ưu tiên triển khai:
│   a. Phân loại LIÊN QUAN ANTT (binary) → relevance_score 0–1
│   b. Phân loại CHỦ ĐỀ multi-label theo 8 nhóm tại Module 2.1
│   c. NER: người / địa điểm / tổ chức → khớp đối tượng, địa bàn
│   d. Sentiment (ưu tiên thấp nhất)
│  NestJS gọi qua HTTP nội bộ hoặc queue; chỉ bài vượt Tầng 0 mới vào
▼
TẦNG 2 — ALERT SCORING (score tổng hợp + rule, NestJS)       [Phase 3]
   severity = f(relevance_score, chủ đề, priority từ khóa,
                khớp địa bàn Khánh Hòa, trust_level nguồn,
                virality/engagement, từ lóng có ngữ cảnh)
   Cán bộ xác nhận (ack) — AI chỉ HỖ TRỢ, không tự quyết
```

**Nguyên tắc bắt buộc:**
- Từ lóng chỉ kích hoạt cảnh báo khi khớp theo từ đã tách **VÀ** có ngữ cảnh phù hợp trong cùng câu/đoạn (ví dụ "đá" phải đi kèm ngữ cảnh ma túy, giao dịch), hoặc câu chứa từ lóng được Tầng 1 xác nhận liên quan ANTT.
- Model chạy **on-premise** (1 GPU đủ cho PhoBERT-base) — không gọi API cloud.
- LLM local (tóm tắt, hỗ trợ case mơ hồ) là tùy chọn ở Phase 4 — **không** nằm trên đường quyết định cảnh báo.
- Mọi model chỉ lên production khi vượt KPI chất lượng tại Mục 9.9.

#### 9.4 Bộ từ khóa theo dõi (Keyword Dictionary)

**Cấu hình theo danh mục, có thể chỉnh sửa trên UI:**
```yaml
keywords:
  geography:
    - "Khánh Hòa", "Nha Trang", "Cam Ranh", "Ninh Hòa"
    - "Ninh Thuận", "Phan Rang", "Tháp Chàm", "Ninh Phước"
    - "Vân Phong", "Trường Sa"

  crime_types:
    - "giết người", "cướp", "trộm cắp", "hiếp dâm"
    - "ma túy", "buôn bán ma túy", "tàng trữ"
    - "lừa đảo", "chiếm đoạt", "gian lận"
    - "gây rối", "đánh nhau", "hỗn chiến"
    - "tai nạn giao thông nghiêm trọng"
    - "cháy", "nổ", "sập"

  security:
    - "biểu tình", "tụ tập đông người", "kích động"
    - "chống phá", "phản động"
    - "buôn lậu", "hàng cấm"

  alerts:
    - "truy nã", "truy bắt", "bị bắt", "khởi tố"
    - "cảnh báo", "khẩn", "nguy hiểm"
```

#### 9.5 Database Schema OSINT

```sql
-- Schema: osint

CREATE TABLE osint_sources (
  id UUID PRIMARY KEY,
  name VARCHAR(200),           -- Tên nguồn
  url VARCHAR(500),            -- URL nguồn
  type VARCHAR(50),            -- news | facebook | tiktok | forum...
  is_active BOOLEAN,
  crawl_interval INT,          -- Phút
  last_crawled_at TIMESTAMP,
  trust_level INT              -- 1-5: mức tin cậy nguồn
);

CREATE TABLE osint_articles (
  id UUID PRIMARY KEY,
  source_id UUID REFERENCES osint_sources(id),
  title TEXT,
  content TEXT,
  url TEXT UNIQUE,
  author VARCHAR(200),
  published_at TIMESTAMP,
  crawled_at TIMESTAMP,
  content_hash VARCHAR(64),    -- Dedup

  -- NLP results
  language VARCHAR(10),
  topics TEXT[],               -- Phân loại chủ đề
  sentiment VARCHAR(20),       -- positive | negative | neutral
  keywords TEXT[],
  named_entities JSONB,        -- {persons: [], locations: [], orgs: []}

  -- Scoring
  relevance_score FLOAT,       -- 0-1: mức liên quan ANTT
  virality_score FLOAT,        -- 0-1: khả năng lan truyền
  sensitivity_flag BOOLEAN,    -- Nội dung nhạy cảm

  -- Linking
  linked_subject_ids UUID[],   -- Đối tượng liên quan
  linked_incident_ids UUID[],  -- Vụ việc liên quan
  reviewed_by UUID,            -- Cán bộ xem xét
  review_note TEXT
);

CREATE TABLE osint_social_posts (
  id UUID PRIMARY KEY,
  source_id UUID REFERENCES osint_sources(id),
  platform VARCHAR(50),        -- facebook | tiktok | youtube...
  post_id VARCHAR(200),        -- ID gốc trên nền tảng
  author_name VARCHAR(200),
  author_profile_url TEXT,
  content TEXT,
  media_urls TEXT[],
  published_at TIMESTAMP,
  location_tag VARCHAR(200),
  likes INT,
  shares INT,
  comments INT,

  -- NLP results (tương tự articles)
  topics TEXT[],
  sentiment VARCHAR(20),
  keywords TEXT[],
  named_entities JSONB,
  relevance_score FLOAT,
  sensitivity_flag BOOLEAN,
  linked_subject_ids UUID[],
  linked_incident_ids UUID[]
);

CREATE TABLE osint_alerts (
  id UUID PRIMARY KEY,
  created_at TIMESTAMP,
  alert_type VARCHAR(50),      -- keyword_match | anomaly | viral_content...
  severity VARCHAR(20),        -- info | medium | high | critical
  title TEXT,
  description TEXT,
  source_ref_ids UUID[],       -- Các article/post gốc
  is_acknowledged BOOLEAN,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMP
);
```

#### 9.6 API Endpoints OSINT

```
# Thu thập & Nguồn
GET    /osint/sources              # Danh sách nguồn theo dõi
POST   /osint/sources              # Thêm nguồn mới
PATCH  /osint/sources/:id          # Bật/tắt, cập nhật nguồn

# Nội dung
GET    /osint/articles             # Tin tức (filter: date, source, topic, relevance)
GET    /osint/social-posts         # Bài đăng MXH
GET    /osint/feed                 # Feed tổng hợp theo thứ tự thời gian

# Tìm kiếm
GET    /osint/search?q=&type=      # Full-text search trong OSINT corpus
GET    /osint/by-subject/:id       # OSINT liên quan đến đối tượng
GET    /osint/by-incident/:id      # OSINT liên quan đến vụ việc

# Cảnh báo
GET    /osint/alerts               # Danh sách cảnh báo OSINT
PATCH  /osint/alerts/:id/ack       # Xác nhận đã xem

# Từ khóa
GET    /osint/keywords             # Bộ từ khóa hiện tại
PUT    /osint/keywords             # Cập nhật từ khóa

# Thống kê
GET    /osint/stats/trending       # Chủ đề trending
GET    /osint/stats/sentiment      # Xu hướng cảm xúc theo thời gian
```

#### 9.7 Giao diện người dùng OSINT

**Màn hình "Tin tức & Mạng xã hội":**
```
┌─────────────────────────────────────────────────────────┐
│  🔍 Bộ lọc: [Nguồn ▼] [Chủ đề ▼] [Địa bàn ▼] [Ngày ▼]│
│  📊 Sentiment: 🟢 35% | 🟡 45% | 🔴 20%  (7 ngày qua) │
├─────────────────────────────────────────────────────────┤
│ ⚡ CẢNH BÁO: Phát hiện 3 bài viết kích động tại        │
│    Phan Rang, 2 giờ trước — [Xem chi tiết]             │
├─────────────────────────────────────────────────────────┤
│ FEED TIN TỨC                    │ TRENDING KEYWORDS     │
│                                  │ 1. cướp Nha Trang    │
│ [VnExpress] 14:32               │ 2. tai nạn Cam Ranh  │
│ Bắt giữ đường dây ma túy...    │ 3. lừa đảo online    │
│ 🏷️ Ma túy | Nha Trang | ⭐ 0.92 │ 4. gây rối          │
│ [Khớp đối tượng: Nguyễn V.A.]  │ 5. cháy              │
│                                  │                      │
│ [Facebook - Page Khánh Hòa]     │ PHÂN TÍCH NGUỒN      │
│ Video hiện trường vụ tai nạn...│ Báo KH: 42 bài        │
│ 👍 1.2k | 🔄 340 | 💬 89       │ CAND: 28 bài          │
│ 🏷️ CSGT | Cam Ranh | ⭐ 0.78   │ Facebook: 156 post    │
└─────────────────────────────────────────────────────────┘
```

#### 9.8 Tuân thủ pháp lý khi crawl

```
Nguyên tắc bắt buộc:
✓ Chỉ thu thập nội dung CÔNG KHAI, không đăng nhập tài khoản
✓ Tuân thủ robots.txt của từng trang
✓ Rate limiting: không crawl quá 1 request/giây mỗi domain
✓ Lưu URL nguồn, không tái bản nguyên văn
✓ Dữ liệu chỉ dùng nội bộ phục vụ ANTT, không chia sẻ thứ 3
✓ Tuân thủ Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân
✓ Không thu thập, lưu trữ thông tin cá nhân không liên quan ANTT
```

#### 9.9 Bảo đảm chất lượng NLP — Dataset, Đánh giá, Vòng phản hồi *(bổ sung v1.2 — BẮT BUỘC trước production)*

> **Nguyên tắc:** không có dataset gán nhãn và bộ đo thì không có "phân loại chính xác". Đây là **critical path** của toàn bộ năng lực OSINT — model tốt đến đâu cũng phụ thuộc vào chất lượng nhãn, và việc gán nhãn cần thời gian của cán bộ nghiệp vụ (không phải của dev) nên phải khởi động sớm, chạy song song với phát triển.

**a) Xây dựng dataset gán nhãn (khởi động ngay trong Phase 2):**
- Nguồn: chính kho `osint_articles` đang crawl tích lũy hàng ngày
- Khối lượng mục tiêu: **2.000–5.000 bài**, do cán bộ nghiệp vụ gán nhãn
- Nhãn cần gán:
  1. Liên quan ANTT: có / không
  2. Chủ đề (multi-label) theo 8 nhóm tại Module 2.1
  3. Thực thể người / địa điểm / tổ chức (tập con ~500–1.000 bài cho NER)
- Chia tập: train 70% / validation 15% / **test 15% (bộ vàng — khóa lại, không dùng huấn luyện)**
- Công cụ gán nhãn: Label Studio (on-premise) hoặc UI nội bộ đơn giản

**b) KPI chất lượng đầu ra (cổng chặn trước khi lên production):**

| Nhiệm vụ | Chỉ số | Ngưỡng tối thiểu |
|----------|--------|------------------|
| Liên quan ANTT (binary) | Precision / Recall | ≥ 90% / ≥ 85% |
| Phân loại chủ đề | F1 (macro) | ≥ 80% |
| NER (người, địa điểm) | F1 | ≥ 85% |
| Cảnh báo critical sai (false positive) | Tỷ lệ trên bộ vàng | ≤ 5% |

- Chạy đánh giá trên bộ vàng **mỗi lần** thay model, từ điển từ khóa hoặc từ điển lóng; lưu kết quả để phát hiện hồi quy.
- Mọi điểm số model trả về kèm confidence — hiển thị cho cán bộ theo nguyên tắc "AI chỉ hỗ trợ".

**c) Vòng phản hồi (human-in-the-loop):**
- Cán bộ **ack / bác bỏ / sửa nhãn** alert ngay trên UI (tận dụng cột `reviewed_by`, `review_note` có sẵn trong schema)
- Alert bị bác bỏ hoặc sửa nhãn → tự động trở thành mẫu huấn luyện bổ sung
- Chu kỳ retrain: **hàng quý**, hoặc sớm hơn khi precision đo trên phản hồi thực tế tụt > 5 điểm %

---

## IV. YÊU CẦU BẢO MẬT & PHÂN QUYỀN

### 4.1 Kiến trúc bảo mật

```
Authentication: JWT Access Token (15 phút) + Refresh Token (7 ngày)
Authorization:  RBAC (Role-Based Access Control) + ABAC (Attribute-Based)
Mã hóa:        AES-256 cho dữ liệu nhạy cảm
Truyền dữ liệu: HTTPS/TLS 1.3
Audit Log:      Ghi nhận mọi thao tác đọc/ghi dữ liệu nhạy cảm
```

### 4.2 Phân cấp mật độ thông tin

| Cấp độ | Ký hiệu | Mô tả | Quyền truy cập |
|--------|---------|-------|----------------|
| Tối mật | 🔴 TM | Thông tin ANND, nguồn tin nội bộ | Cấp phòng trở lên |
| Mật | 🟠 M | Hồ sơ đối tượng đặc biệt, kế hoạch tác chiến | Điều tra viên + |
| Hạn chế | 🟡 HC | Báo cáo tổng hợp, thống kê chung | Tất cả cán bộ |
| Nội bộ | 🟢 NB | Thông tin hành chính, lịch họp | Toàn đơn vị |

> ⚠️ Dữ liệu OSINT từ nguồn mở được phân loại **Nội bộ (NB)** mặc định, nhưng nếu được liên kết với hồ sơ đối tượng Mật trở lên, tự động nâng cấp độ mật tương ứng.

### 4.3 Audit Trail
- Mọi truy vấn đối tượng được ghi log (ai tra cứu, khi nào, IP nào)
- Mọi thay đổi dữ liệu có lịch sử phiên bản
- Cảnh báo truy cập bất thường (ngoài giờ, tần suất cao bất thường)

---

## V. LỘ TRÌNH PHÁT TRIỂN

### Phase 1 — Nền tảng (Tháng 1-3)
```
✅ Kiến trúc hệ thống, CSDL (bao gồm schema osint)
✅ Auth, phân quyền người dùng
✅ Module quản lý đối tượng (CRUD cơ bản)
✅ Module vụ việc cơ bản
✅ Dashboard tổng quan
✅ Deploy môi trường staging
✅ Cấu hình địa bàn 2 cấp theo đơn vị hành chính mới
```

### Phase 2 — Nghiệp vụ cốt lõi (Tháng 4-6)
```
🔄 Tìm kiếm nâng cao, tra cứu đa chiều
🔄 Phân tích liên kết đối tượng (graph)
🔄 Bản đồ số tích hợp (ranh giới mới sau sáp nhập)
✅ OSINT Media cơ bản: crawl báo chí RSS + gating từ khóa (Tầng 0)
🔄 Nâng cấp matching Tầng 0: tách từ tiếng Việt (underthesea),
   khớp theo ranh giới từ — sửa lỗi khớp chuỗi con (từ lóng "đá"...)
🔄 KHỞI ĐỘNG GÁN NHÃN dataset ANTT (xem 9.9a) — chạy song song,
   do cán bộ nghiệp vụ thực hiện trên dữ liệu đã crawl ← critical path
🔄 Hệ thống cảnh báo sớm
🔄 Báo cáo tự động
🔄 Mobile-responsive UI
```

### Phase 3 — OSINT & Phân tích nâng cao (Tháng 7-9)
```
⏳ NLP Microservice (Tầng 1): PhoBERT fine-tuned, triển khai theo thứ tự
   relevance → topic → NER → sentiment; mỗi model phải vượt KPI 9.9b
   (chuyển từ Phase 2: "phân loại chủ đề" nay là deliverable Tầng 1)
⏳ Alert scoring tổng hợp (Tầng 2) + UI ack/bác bỏ/sửa nhãn của cán bộ
⏳ Vòng phản hồi human-in-the-loop: phản hồi cán bộ → kho mẫu retrain (9.9c)
⏳ OSINT MXH: Facebook, TikTok public
⏳ OSINT cá nhân (subject enrichment)
⏳ Hotspot analysis
⏳ Mô hình dự báo tội phạm + sentiment analysis
⏳ AI Chatbot hỗ trợ nghiệp vụ (tích hợp OSINT)
⏳ Điều phối lực lượng thông minh
⏳ Tích hợp CSDL quốc gia
```

### Phase 4 — Nâng cao & Mở rộng (Tháng 10-12)
```
⏳ Tích hợp camera AI (nếu có hạ tầng)
⏳ App mobile cho cán bộ tuần tra
⏳ API mở cho các đơn vị liên quan
⏳ OSINT: nhận diện hình ảnh, video deepfake detection
⏳ LLM local (tùy chọn): tóm tắt OSINT, hỗ trợ case mơ hồ —
   ngoài đường quyết định cảnh báo (xem 9.3.1)
⏳ Vận hành chu trình retrain định kỳ hàng quý từ phản hồi cán bộ
⏳ Tối ưu hiệu năng, scale
⏳ Đánh giá, điều chỉnh theo thực tế
```

---

## VI. API DESIGN OVERVIEW

### 6.1 Chuẩn API

```
Base URL: /api/v1/
Format:   JSON
Auth:     Bearer Token (JWT)
Docs:     Swagger UI tại /api/docs
```

### 6.2 Các Endpoint chính

```
# Xác thực
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout

# Đối tượng
GET    /subjects              # Danh sách (filter, sort, paginate)
POST   /subjects              # Tạo hồ sơ mới
GET    /subjects/:id          # Chi tiết hồ sơ
PUT    /subjects/:id          # Cập nhật
GET    /subjects/:id/network  # Sơ đồ liên kết
GET    /subjects/:id/osint    # Dữ liệu OSINT đối tượng  ← MỚI
POST   /subjects/:id/osint/refresh  # Kích hoạt crawl lại ← MỚI
GET    /subjects/search       # Tìm kiếm đa chiều

# Vụ việc
GET    /incidents             # Danh sách vụ việc
POST   /incidents             # Tạo vụ việc mới
GET    /incidents/:id         # Chi tiết vụ việc
GET    /incidents/:id/osint   # OSINT liên quan vụ việc ← MỚI
PATCH  /incidents/:id/status  # Cập nhật trạng thái

# OSINT Media                                         ← MỚI
GET    /osint/feed            # Feed tin tức + MXH tổng hợp
GET    /osint/articles        # Tin báo chí
GET    /osint/social-posts    # Bài MXH
GET    /osint/alerts          # Cảnh báo OSINT
GET    /osint/search          # Tìm kiếm OSINT
GET    /osint/stats/trending  # Từ khóa trending
GET    /osint/sources         # Quản lý nguồn theo dõi

# Phân tích
GET    /analytics/dashboard   # Dashboard tổng quan
GET    /analytics/heatmap     # Dữ liệu bản đồ nhiệt
GET    /analytics/trends      # Xu hướng theo thời gian
GET    /analytics/forecast    # Dự báo ngắn hạn
GET    /analytics/sentiment   # Phân tích cảm xúc MXH ← MỚI

# Báo cáo
POST   /reports/generate      # Tạo báo cáo theo yêu cầu
GET    /reports/:id/download  # Tải báo cáo
```

---

## VII. CÁC ĐIỂM CẦN LƯU Ý ĐẶC BIỆT

### 7.1 Pháp lý & Đạo đức
- Mọi truy cập, xử lý dữ liệu cá nhân phải tuân thủ **Nghị định 13/2023/NĐ-CP** về bảo vệ dữ liệu cá nhân
- Dữ liệu tội phạm phải được bảo vệ theo Luật Công an nhân dân và các quy định của Bộ Công an
- Không dùng AI để ra quyết định tự động ảnh hưởng quyền con người — AI chỉ **HỖ TRỢ** ra quyết định
- Mọi dự báo AI phải có kèm độ tin cậy (confidence score) và khuyến nghị xác minh
- **OSINT chỉ thu thập thông tin CÔNG KHAI** — không xâm phạm quyền riêng tư

### 7.2 Lưu ý chuyển đổi địa bàn sau sáp nhập
- Dữ liệu lịch sử từ Ninh Thuận (cũ) cần được **migration và chuẩn hóa** về cấu trúc địa bàn mới
- Một số địa danh, đơn vị hành chính sẽ thay đổi tên → cần bảng mapping tên cũ ↔ tên mới
- Cán bộ CA Ninh Thuận (cũ) cần được tích hợp vào hệ thống với phân quyền địa bàn phù hợp

### 7.3 Hiệu năng
- Tra cứu đối tượng: < 2 giây với CSDL 1 triệu bản ghi
- OSINT crawl: không ảnh hưởng đến hiệu năng hệ thống chính (queue riêng)
- Dashboard: Cập nhật real-time qua WebSocket
- API response: p95 < 500ms
- Khả năng concurrent: ≥ 200 người dùng đồng thời

### 7.4 Độ sẵn sàng
- Uptime mục tiêu: 99.5% (tương đương < 44 giờ downtime/năm)
- Backup: Tự động hàng ngày, lưu trữ 90 ngày
- Phục hồi thảm họa: RTO < 4 giờ, RPO < 1 giờ

### 7.5 Môi trường triển khai
- On-premise (máy chủ nội bộ CA tỉnh) — KHÔNG dùng cloud công cộng
- Mạng nội bộ (intranet), tách biệt Internet
- **Máy chủ OSINT crawler cần kết nối Internet có kiểm soát** (DMZ riêng) ← lưu ý
- VPN cho truy cập từ xa của cán bộ được cấp phép

---

## VIII. HƯỚNG DẪN SỬ DỤNG INSTRUCTIONS NÀY

### Cách làm việc với Claude hiệu quả

**Để khám phá sâu một module:**
> *"Hãy thiết kế chi tiết database schema cho Module Quản lý Đối tượng"*
> *"Thiết kế kiến trúc chi tiết cho Module OSINT Media — crawler, queue, NLP pipeline"*

**Để lập trình:**
> *"Viết NestJS service cho chức năng tìm kiếm đa chiều đối tượng với full-text search PostgreSQL"*
> *"Viết Bull Queue job crawl tin tức từ RSS feed, lưu vào bảng osint_articles"*
> *"Viết NestJS module OSINT crawl Facebook public post theo từ khóa dùng Playwright"*

**Để thiết kế UI:**
> *"Thiết kế màn hình tra cứu đối tượng có tab OSINT, hiển thị thông tin MXH và tin báo chí liên quan"*
> *"Thiết kế màn hình OSINT Feed tổng hợp tin tức + bài MXH với filter và sentiment indicator"*

**Để phân tích nghiệp vụ:**
> *"Phân tích luồng xử lý khi hệ thống phát hiện bài viết MXH kích động tại địa bàn Phan Rang"*
> *"Phân tích cách tích hợp dữ liệu địa bàn Ninh Thuận vào hệ thống sau sáp nhập"*

**Để tư vấn kỹ thuật:**
> *"So sánh các giải pháp NLP tiếng Việt: underthesea vs PhoBERT cho phân loại chủ đề tin tức ANTT"*
> *"Thiết kế kiến trúc DMZ cho máy chủ OSINT crawler tách biệt khỏi mạng nội bộ"*

---

*Tài liệu này là nền tảng sống — cập nhật liên tục theo quá trình phát triển dự án.*
*Phiên bản: 1.2 | Cập nhật: 06/2026 | Thay đổi: Kiến trúc NLP phân tầng (9.3.1), dataset gán nhãn & KPI chất lượng & vòng phản hồi (9.9), điều chỉnh lộ trình Phase 2-4*
*Phiên bản 1.1 | 05/2026: Địa bàn sau sáp nhập, OSINT cá nhân, OSINT Media*
