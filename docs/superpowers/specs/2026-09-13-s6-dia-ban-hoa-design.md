# S6 — Địa bàn hóa (gán bài OSINT về xã/phường) — Design

**Ngày:** 2026-09-13
**Sub-project:** S6 của lộ trình S0→S11 (CLAUDE.md §Lộ trình phát triển, chốt 12/09/2026)
**Trạng thái:** chờ writing-plans
**Nhánh:** `main`
**Collaboration:** Claude code trực tiếp (memory `feedback-cnc-claude-codes`), TDD.
**Liên quan:** L1 category+indicator (`2026-07-11-cnc-layer1-category-indicators-design.md`),
S5b NER (`2026-07-10-osint-s5b-ner-service-design.md`), 2-zone (`2026-06-25-osint-2zone-pipeline-design.md`).

## Mục tiêu

Gán mỗi bài OSINT về **một trong 65 xã/phường/đặc khu** tỉnh Khánh Hòa, để S7 tính được
baseline theo địa bàn và S9 vẽ được bản đồ nhiệt. Hiện `osint_posts` không mang bất kỳ
thông tin vị trí nào — đây là **nút thắt chặn toàn bộ nhánh cảnh báo theo địa bàn**.

Phạm vi: bài trong pipeline mới (`osint_posts` → `osint_post_nlp`). Luồng legacy
`osint_articles` không đụng tới.

**Ngoài phạm vi S6:** point-in-polygon (bài OSINT không có toạ độ); gán địa bàn cho
`osint_articles` legacy; phân loại vai trò địa danh bằng LLM (S10); bản đồ (S9).

## Quyết định (đã duyệt)

1. **"Địa bàn của bài" = nơi sự việc xảy ra.** Không suy ra từ nơi nguồn đóng. Không rõ
   thì **để trống**, không đoán.
2. **Một bài một địa bàn.** `ward_id` đơn trị, nullable.
3. **Tên cũ ánh xạ sang tên mới** theo NQ 1667/NQ-UBTVQH15. Tên cấp huyện/TP cũ
   ("Nha Trang", "Ninh Hòa") **để trống**, chỉ giữ `location_text` nguyên văn.
4. **Khớp bằng gazetteer trong TypeScript**, không phụ thuộc NER để ra quyết định.
   NER `LOC` chỉ làm lưới vớt phát hiện alias còn thiếu.
5. **PostGIS không tham gia việc gán.** Polygon phục vụ S9; `geom` nullable, nhánh
   import độc lập, hỏng không chặn S6.
6. **Backfill toàn bộ** ~4.900 bài đã thu — S7 cần lịch sử mới có baseline.
7. **Thang ưu tiên vai trò P1–P4** để chọn khi bài nhắc nhiều xã (§Phân giải).

## Dữ liệu nguồn

| Dữ liệu | Nguồn | Ghi chú |
|---|---|---|
| 65 đơn vị + ánh xạ cũ→mới | [xaydungchinhsach.chinhphu.vn](https://xaydungchinhsach.chinhphu.vn/sap-xep-dvhc-danh-sach-65-xa-phuong-dac-khu-cua-tinh-khanh-hoa-119250622215745256.htm) (NQ 1667/NQ-UBTVQH15) | **Cán bộ phải verify trước khi load.** Claude trích xuất, không có thẩm quyền xác nhận danh mục địa giới. |
| Alias biến thể | Sinh tự động từ danh mục | Bỏ dấu, bỏ tiền tố loại |
| Polygon ranh giới | OSM qua Overpass API (ODbL) | Khảo sát trước: OSM có thể chưa cập nhật đủ sau sáp nhập 01/7/2025 |

Nguồn thương mại (vd diaocthongthai.com bán GeoJSON 130k) **không dùng làm nguồn gốc
danh mục hành chính** — với hệ thống ngành, danh mục phải truy được về văn bản nhà nước.

## Schema (migration 010)

```sql
CREATE SCHEMA IF NOT EXISTS spatial;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE spatial.wards (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        varchar(20) UNIQUE,           -- mã đơn vị HC nhà nước
  name        varchar(150) NOT NULL,        -- "Phường Nha Trang", "Xã Diên Khánh"
  short_name  varchar(150),                 -- bỏ tiền tố loại
  ward_type   varchar(20) NOT NULL,         -- xa | phuong | dac_khu
  region      varchar(20),                  -- khanh_hoa_cu | ninh_thuan_cu (nhãn lọc, KHÔNG phải cấp HC)
  centroid    geography(Point,4326),
  geom        geometry(MultiPolygon,4326),  -- NULL được
  geom_source varchar(50),                  -- 'osm@YYYY-MM-DD'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_wards_geom ON spatial.wards USING GIST(geom);

CREATE TABLE spatial.ward_aliases (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ward_id      uuid NOT NULL REFERENCES spatial.wards(id) ON DELETE CASCADE,
  alias        varchar(150) NOT NULL,       -- dạng hiển thị, có dấu
  alias_norm   varchar(150) NOT NULL,       -- lowercase, bỏ dấu, gộp khoảng trắng
  alias_type   varchar(20) NOT NULL,        -- official | old_ward | nickname
  requires_cue boolean NOT NULL DEFAULT false,
  CONSTRAINT uq_alias UNIQUE (alias_norm, ward_id)
);
CREATE INDEX idx_alias_norm ON spatial.ward_aliases(alias_norm);

CREATE TABLE spatial.unmatched_locations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  text_norm   varchar(200) NOT NULL UNIQUE,
  text_raw    varchar(200),
  occurrences int NOT NULL DEFAULT 1,
  first_seen  timestamptz DEFAULT now(),
  last_seen   timestamptz DEFAULT now()
);

ALTER TABLE osint.osint_post_nlp
  ADD COLUMN ward_id             uuid REFERENCES spatial.wards(id),
  ADD COLUMN location_text       varchar(200),
  ADD COLUMN matched_alias       varchar(150),
  ADD COLUMN location_candidates jsonb;
CREATE INDEX idx_post_nlp_ward ON osint.osint_post_nlp(ward_id);

ALTER TABLE osint.osint_alerts ADD COLUMN ward_id uuid REFERENCES spatial.wards(id);
```

**`UNIQUE (alias_norm, ward_id)` chứ không phải `UNIQUE (alias_norm)`** — cố ý. Một alias
PHẢI được phép trỏ nhiều xã, vì tên trùng là có thật (§Cạm bẫy). Matcher gặp alias trỏ ≥2
xã thì coi là mơ hồ.

**`alias_type` KHÔNG dùng để phá thế mơ hồ.** Một alias trỏ ≥2 ward là mơ hồ kể cả khi một
trong số đó là `official` còn lại là `old_ward` — ví dụ "Ninh Hải" vừa là xã mới ở Ninh
Thuận (official) vừa là phường cũ của Ninh Hòa (old_ward). Ưu tiên `official` nghe hợp lý
nhưng sẽ gán sai mọi bài nói về Ninh Hòa cũ, mà đó lại là cách dùng phổ biến hơn trong dân.
`alias_type` chỉ để truy vết và thống kê.

**`location_candidates` jsonb** — lưu mọi địa danh bắt được kèm vai trò và vị trí:
`[{alias, wardId, role: 'P1'|'P2'|'P3'|'P4', offset}]`. Mục đích: đổi luật chọn về sau
chỉ cần tính lại từ cột này, **không phải quét lại toàn bộ bài**.

## Cạm bẫy trong dữ liệu thật (đã khảo sát)

Ba nhóm dưới đây rút ra từ danh sách NQ 1667, là lý do của phần lớn thiết kế trên.

**1. Xã cũ bị xẻ ra nhiều xã mới (1:N, không phải N:1).** Xã Cam Lâm mới lập từ *"phần
Cam Hiệp Bắc, Cam Hiệp Nam, Cam Hòa, Cam Tân, Suối Tân"*, và đúng những tên đó cũng đi
vào xã Suối Dầu và xã Cam Hiệp. Khoảng 8 tên rơi vào diện này (Cam Hòa, Cam Tân, Suối Tân,
Cam Hiệp Bắc/Nam, Cam An Bắc/Nam, Đông Hải) → alias trỏ nhiều ward → **không gán**.

**2. Tên cũ trùng tên mới nhưng khác vị trí** — nguy hiểm nhất vì gây gán *sai*, không
phải gán *thiếu*:

| Tên | Nghĩa cũ | Nghĩa mới |
|---|---|---|
| Vĩnh Hải | phường ở Nha Trang → nay Bắc Nha Trang | xã Vĩnh Hải (Ninh Thuận) |
| Ninh Hải | phường ở Ninh Hòa → nay Đông Ninh Hòa | xã Ninh Hải (Ninh Thuận) |
| Ninh Phước | phường ở Ninh Hòa → nay Đông Ninh Hòa | xã Ninh Phước (Ninh Thuận) |
| Ninh Sơn | xã ở Ninh Hòa → nay Bắc Ninh Hòa | xã Ninh Sơn (Ninh Thuận) |
| Phước Hải | phường ở Nha Trang → nay Nam Nha Trang | xã cũ Ninh Thuận → nay Ninh Phước |

Hai nơi cách nhau hơn 100km. Không phân giải được bằng tên → NULL.

**3. Tên xã mới trùng từ tiếng Việt thông thường** — Tân Định, Bảo An, Anh Dũng, Hòa Trí,
Mỹ Sơn, Bác Ái, Đại Lãnh. Khớp trần sẽ ra dương tính giả hàng loạt → bắt buộc `requires_cue`.

Ngoài ra "Nha Trang" vừa là **tên phường chính thức**, vừa là tên TP cũ (có cả Bắc/Tây/Nam
Nha Trang) → "tại Nha Trang" trần là mơ hồ; chỉ "phường Nha Trang" mới khớp.

## WardMatcherService (logic thuần)

Tách thuần khỏi worker để test tất định, đúng cách `actor-aggregator.ts` tách khỏi
`actor-aggregate.job.ts`. Nạp bảng alias vào bộ nhớ một lần (65 ward × ~10 alias ≈ 700 mục).

```
Input:  text (normalizedContent), nerLocs?: string[]
Output: { wardId, locationText, matchedAlias, candidates[], reason: 'matched'|'ambiguous'|'none' }
```

**Bước 1 — Chuẩn hóa.** lowercase, bỏ dấu, gộp khoảng trắng.
⚠️ Bỏ dấu bằng NFD làm **lệch chỉ số ký tự**, trong khi ta cần chỉ số để cắt `location_text`
nguyên văn có dấu. Chuẩn hóa theo từng từ và giữ bảng offset; đừng chuẩn hóa cả chuỗi rồi
dò lại vị trí.

**Bước 2 — Quét n-gram, cụm dài nhất trước** (5 từ → 1 từ). "Bắc Nha Trang" phải thắng
"Nha Trang", nếu không mọi phường có hậu tố đều bị nuốt.

**Bước 3 — Cue-gating.** Alias `requires_cue` chỉ nhận khi ngay trước là:
`xã | phường | đặc khu | thị trấn | tại | ở | thuộc | thôn`.

**Bước 4 — Guard tỉnh khác.** Nếu cùng câu có tên một tỉnh/thành khác ("xã Tân Định,
Bình Dương") → loại. Thiếu guard này thì mọi tin toàn quốc có tên trùng đổ vào bản đồ
Khánh Hòa.

## Phân giải (thang vai trò P1–P4)

Đếm tần suất là đoán; thứ phân biệt được là **vai trò của địa danh trong câu**, mà tiếng
Việt hành chính diễn đạt rất khuôn mẫu nên bắt được bằng luật.

```
P1  nơi xảy ra tường minh   "xảy ra tại|trên địa bàn|thuộc địa bàn|tại thôn…xã…"
P2  vị trí trần             "tại X" | "ở X"
P3  đơn vị chức năng        "Công an|UBND|Đồn|Trạm|Ban CHQS … xã X"   (nơi đơn vị đóng)
P4  nơi cư trú              "trú tại|ngụ tại|thường trú|quê ở"        → LOẠI khỏi nơi xảy ra

Lấy xã có cue hạng cao nhất.
Hòa cùng hạng → xã được nhắc nhiều lần nhất → xã xuất hiện sớm nhất.
NULL chỉ khi không có ứng viên nào ở P1-P3 (P4 bị loại, hoặc không khớp gì).
```

Chuỗi phá hòa kết thúc ở "xuất hiện sớm nhất" và luôn cho ra một kết quả, vì hai địa danh
không thể cùng offset. Nói cách khác: đã có ứng viên hợp lệ thì luôn gán, **không có nhánh
"hòa nên bỏ"**.

Ví dụ quyết định: *"Công an **xã Diên Khánh** bắt nhóm đối tượng tại **xã Suối Hiệp**"*
→ P2 thắng P3 → **Suối Hiệp**. Đếm tần suất sẽ ra Diên Khánh, tức là sai.

| Tình huống | Kết quả |
|---|---|
| Khớp đúng 1 xã | gán `ward_id` |
| Alias trỏ ≥2 xã | NULL, giữ `location_text` |
| Nhiều xã khác nhau | theo thang P1–P4 |
| Không khớp | NULL, `location_text` NULL |

**Giới hạn đã biết:** luật cue hợp văn phong báo chí và tin công an — nguồn sạch nhất.
Văn phong Facebook lỏng lẻo hơn ("hôm qua ở ninh hoà nè") nên kém hơn. Nâng cấp bằng LLM
phán vai trò là **S10**, ghi vào `location_candidates`, người vẫn duyệt — không để model
quyết con số trên bản đồ cảnh báo (CLAUDE.md: AI chỉ hỗ trợ).

## Wiring pipeline

Chèn **bước 3.5** trong `nlp-process.processor.ts`: sau NER (b3, để dùng `LOC` làm lưới
vớt), trước khi ghi `post_nlp` (b6, để lưu một lần).

- **KHÔNG bật Gate** — giống `indicators` ở L1. Địa bàn là thuộc tính mô tả, không phải
  tín hiệu notability. Bài không vì có tên xã mà thành đáng chú ý.
- **Null-safe tuyệt đối** — matcher lỗi → `ward_id` NULL, pipeline chạy tiếp, đúng cách
  `nerBridge` trả null khi service Python chết. Một bài không gán được địa bàn không bao
  giờ được làm chết worker.
- Alert ở b7 kế thừa `ward_id` từ post.
- `LOC` không khớp alias nào → upsert `spatial.unmatched_locations` (occurrences++).

## Backfill

Script `src/scripts/backfill-ward.ts`, theo mẫu `run-actor-aggregate.ts`:

- Duyệt `osint_posts` theo trang; **normalize lại** từ `post.content` — `normalizedContent`
  hiện không được lưu (chỉ `contentHash` được lưu). Normalize là hàm thuần nên chạy lại vô
  hại và không cần service Python.
- Chỉ cập nhật bản ghi `post_nlp` **đã tồn tại**; bài chưa qua NLP để worker gán khi tới lượt.
- **Idempotent** — chạy lại đè, không nhân đôi.
- **`--dry-run` bắt buộc chạy trước**: in tỉ lệ khớp mà không ghi. Tỉ lệ thấp nghĩa là
  danh mục alias thiếu — sửa danh mục rẻ hơn nhiều so với ghi sai 4.900 bản ghi rồi sửa.
- Không đụng Redis/queue → không ảnh hưởng pipeline đang chạy.

## Đầu ra (endpoint đọc)

`GET /api/v1/osint/wards/stats` → `[{ ward, postCount }]` + top `unmatched_locations`.
Phục vụ verify sau backfill, và là viên gạch đầu cho bản đồ S9.

## Test

Unit test `WardMatcherService` (thuần), mỗi ca ứng một cạm bẫy thật:

| Ca | Kỳ vọng |
|---|---|
| "Bắc Nha Trang" | phường Bắc Nha Trang, không bị nuốt thành Nha Trang |
| "Tân Định" trần / "xã Tân Định" | NULL / khớp — cue-gating |
| "tại Ninh Hải" | NULL (trỏ 2 xã), `location_text` = "Ninh Hải" |
| "Công an xã Diên Khánh bắt … tại xã Suối Hiệp" | Suối Hiệp — thang P1–P4 |
| "trú tại xã X, gây án tại xã Y" | Y, không phải X |
| "xã Tân Định, Bình Dương" | NULL — guard tỉnh khác |
| "xa dien khanh" (không dấu) | khớp Diên Khánh |

Test worker: post có địa danh → `nlp.wardId` điền; matcher ném lỗi → post vẫn `done`.

**Cổng chất lượng:** bộ đo precision/recall trên **100 bài gán tay**, chạy **trước** khi
backfill thật. Không đạt ngưỡng thì siết luật rồi đo lại, không cho chạy. Không có phép đo
này thì "chính xác" chỉ là ý kiến.

## Ràng buộc

- **Zone A** — địa bàn hóa là xử lý bài công khai vô danh, không nối hồ sơ người thật.
  Subject-linkage vẫn chỉ ở Zone B (spec 2026-06-25).
- **Cấu trúc 2 cấp** — không có `districtId`/`district` trong schema. `region` chỉ là nhãn
  lọc hiển thị (khanh_hoa_cu/ninh_thuan_cu), không phải cấp hành chính.
- **Luật 91/2025 Điều 3** — dữ liệu thu cho mục đích ANTT không dùng sang mục đích khác.
- Danh mục địa giới do **cán bộ verify**, không do Claude khẳng định.

## Thứ tự thực hiện

```
0. Khảo sát Overpass — OSM có đủ 65 ranh giới mới không   [spike, không code]
1. Migration 010 + entity Ward/WardAlias
2. Seed 65 đơn vị + alias từ NQ 1667                       [CÁN BỘ VERIFY trước khi load]
3. WardMatcherService + unit test                          [TDD]
4. Đo precision trên 100 bài mẫu → chốt ngưỡng
5. Cắm vào worker + test null-safe
6. Backfill dry-run → backfill thật
7. Endpoint thống kê + verify E2E trên dữ liệu thật
8. Import polygon OSM                                      [độc lập, không chặn 1-7]
```

## Tồn đọng / phase sau

- Point-in-polygon khi có nguồn dữ liệu mang toạ độ thật (camera, tin báo có GPS).
- Gán địa bàn cho `osint_articles` legacy — hiện không ai đọc ngoài `getArticles`.
- Tách "nơi cư trú đối tượng" (P4) thành trường riêng nếu nghiệp vụ cần — dữ liệu đã có
  sẵn trong `location_candidates`, không phải quét lại.
- LLM phán vai trò địa danh (S10, cần GPU).
