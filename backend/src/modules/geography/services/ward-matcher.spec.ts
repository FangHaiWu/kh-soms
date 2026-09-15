import {
  buildIndex,
  findHits,
  matchWard,
  normalizeAlias,
  tokenizeVi,
} from './ward-matcher';

// Index nhỏ dựng tay — test thuần, không đụng DB
const INDEX = buildIndex([
  { wardId: 'w-nt', alias: 'Nha Trang', requiresCue: false },
  { wardId: 'w-bnt', alias: 'Bắc Nha Trang', requiresCue: false },
  { wardId: 'w-dk', alias: 'Diên Khánh', requiresCue: false },
]);

describe('buildIndex', () => {
  // Invariant cốt lõi của S6: một alias có thể trỏ NHIỀU ward (trùng tên khác
  // địa bàn, vd "Ninh Hải" vừa là xã ở Ninh Thuận vừa là phường cũ Ninh Hòa).
  // Task 5 dựa vào entries.length > 1 để nhận biết mơ hồ và BỎ GÁN — nếu
  // buildIndex lỡ đổi thành ghi đè (index.set thay vì push) thì hệ thống sẽ
  // lặng lẽ gán sai địa bàn thay vì bỏ trống, nên bắt buộc phải test riêng.
  it('một alias trỏ nhiều ward → gộp thành mảng, không ghi đè', () => {
    const idx = buildIndex([
      { wardId: 'w-nh-nt', alias: 'Ninh Hải', requiresCue: false },
      { wardId: 'w-dnh', alias: 'Ninh Hải', requiresCue: false },
    ]);
    const entries = idx.get('ninh hai');
    expect(entries).toHaveLength(2);
    expect(entries?.map((e) => e.wardId).sort()).toEqual(['w-dnh', 'w-nh-nt']);
  });
});

describe('normalizeAlias', () => {
  it('bỏ dấu, lowercase, gộp khoảng trắng', () => {
    expect(normalizeAlias('  Diên   Khánh ')).toBe('dien khanh');
    expect(normalizeAlias('Đặc khu Trường Sa')).toBe('dac khu truong sa');
  });
});

describe('tokenizeVi', () => {
  it('giữ offset gốc để cắt được text nguyên văn có dấu', () => {
    const toks = tokenizeVi('Tại xã Diên Khánh');
    const dien = toks.find((t) => t.norm === 'dien')!;
    expect('Tại xã Diên Khánh'.slice(dien.start, dien.end)).toBe('Diên');
  });
});

describe('findHits', () => {
  it('khớp cụm dài nhất trước — "Bắc Nha Trang" không bị nuốt thành "Nha Trang"', () => {
    const hits = findHits('Vụ việc ở Bắc Nha Trang hôm qua', INDEX);
    expect(hits).toHaveLength(1);
    expect(hits[0].entries[0].wardId).toBe('w-bnt');
  });

  it('cắt được location_text nguyên văn CÓ DẤU từ offset', () => {
    const text = 'Bắt giữ tại Diên Khánh';
    const hits = findHits(text, INDEX);
    expect(text.slice(hits[0].start, hits[0].end)).toBe('Diên Khánh');
  });

  it('khớp cả khi viết không dấu', () => {
    const hits = findHits('cong an dien khanh', INDEX);
    expect(hits[0].entries[0].wardId).toBe('w-dk');
  });

  // Bài báo nhắc nhiều xã/phường trong 1 đoạn là chuyện thường — đây là chỗ
  // dễ lộ bug ở logic nhảy con trỏ (i += n) giữa các hit nếu cài sai.
  it('khớp nhiều địa danh trong cùng một đoạn, đúng thứ tự xuất hiện', () => {
    // Index riêng cho test này (thêm 'Suối Hiệp' cạnh 'Diên Khánh')
    const multiIndex = buildIndex([
      { wardId: 'w-dk', alias: 'Diên Khánh', requiresCue: false },
      { wardId: 'w-sh', alias: 'Suối Hiệp', requiresCue: false },
    ]);
    const text = 'Công an xã Diên Khánh phối hợp xã Suối Hiệp';
    const hits = findHits(text, multiIndex);

    expect(hits).toHaveLength(2);
    // Đúng thứ tự xuất hiện trong text, không bị đảo hay trùng lặp
    expect(hits[0].entries[0].wardId).toBe('w-dk');
    expect(hits[1].entries[0].wardId).toBe('w-sh');
    // start/end của từng hit phải cắt ra đúng tên nguyên văn CÓ DẤU
    expect(text.slice(hits[0].start, hits[0].end)).toBe('Diên Khánh');
    expect(text.slice(hits[1].start, hits[1].end)).toBe('Suối Hiệp');
  });
});

// Index riêng cho cue-gating: 'Tân Định' trùng cụm tiếng Việt thông thường
// ("tân định cư") nên requiresCue=true; 'Diên Khánh' không mơ hồ nên false.
const CUE_INDEX = buildIndex([
  { wardId: 'w-td', alias: 'Tân Định', requiresCue: true },
  { wardId: 'w-dk', alias: 'Diên Khánh', requiresCue: false },
]);

describe('cue-gating', () => {
  it('alias trùng từ thông thường KHÔNG khớp khi thiếu cue', () => {
    expect(findHits('anh ấy tân định cư ở đây', CUE_INDEX)).toHaveLength(0);
  });

  it('khớp khi có cue "xã"', () => {
    const hits = findHits('bắt tại xã Tân Định', CUE_INDEX);
    expect(hits[0].entries[0].wardId).toBe('w-td');
  });

  it('khớp khi có cue "tại"', () => {
    expect(findHits('xảy ra tại Tân Định', CUE_INDEX)).toHaveLength(1);
  });
});

describe('guard tỉnh khác', () => {
  it('bỏ qua địa danh khi cùng câu có tên tỉnh khác', () => {
    expect(
      findHits('Công an xã Tân Định, Bình Dương triệt phá', CUE_INDEX),
    ).toHaveLength(0);
  });

  it('KHÔNG bỏ khi tỉnh nhắc tới là Khánh Hòa', () => {
    const hits = findHits('tại Diên Khánh, Khánh Hòa', CUE_INDEX);
    expect(hits).toHaveLength(1);
  });

  it('câu khác không ảnh hưởng nhau', () => {
    const hits = findHits(
      'Tin từ Bình Dương. Vụ việc tại Diên Khánh.',
      CUE_INDEX,
    );
    expect(hits).toHaveLength(1);
  });

  // Ràng buộc quan trọng nhất của guard: Ninh Thuận đã là một phần của
  // Khánh Hòa mới (sáp nhập 01/7/2025) nên KHÔNG được coi là "tỉnh khác".
  // Nếu sau này ai đó "sửa cho đủ 34 tỉnh" mà lỡ thêm nhầm Ninh Thuận vào
  // OTHER_PROVINCES, test này phải đỏ ngay để chặn lại.
  it('KHÔNG bỏ khi tỉnh nhắc tới là Ninh Thuận — đã sáp nhập vào Khánh Hòa', () => {
    const hits = findHits('tại Diên Khánh, Ninh Thuận', CUE_INDEX);
    expect(hits).toHaveLength(1);
  });
});

// Index riêng cho fix round 2: các alias đụng cue cũ ('tran' trong họ "Trần",
// và 2 trường hợp cần bigram "thị trấn"/"đặc khu").
const CUE_INDEX_BIGRAM = buildIndex([
  { wardId: 'w-ba', alias: 'Bảo An', requiresCue: true },
  { wardId: 'w-vg', alias: 'Vạn Giã', requiresCue: true },
  { wardId: 'w-ts', alias: 'Trường Sa', requiresCue: true },
]);

describe('cue-gating — họ "Trần" không được coi là cue, bigram thị trấn/đặc khu', () => {
  // Test quan trọng nhất của cả Task 4: cue cũ 'tran' (bỏ dấu từ cả "Trần" lẫn
  // "trấn") từng khiến MỌI người tên "Trần ..." bị khớp nhầm vào ward trùng
  // tên đệm/tên. Hồ sơ ANTT đầy "Trần Văn X" nên đây là gán sai quy mô lớn.
  it('họ "Trần" KHÔNG bị coi là cue — "Trần Bảo An" không khớp nhầm ward Bảo An', () => {
    expect(
      findHits('đối tượng Trần Bảo An khai nhận', CUE_INDEX_BIGRAM),
    ).toHaveLength(0);
  });

  it('bigram "thị trấn" thay thế đúng chức năng của cue "tran" vừa bỏ', () => {
    const hits = findHits('thị trấn Vạn Giã', CUE_INDEX_BIGRAM);
    expect(hits[0].entries[0].wardId).toBe('w-vg');
  });

  it('bigram "đặc khu" thay thế đúng chức năng của cue "khu" vừa bỏ', () => {
    const hits = findHits('đặc khu Trường Sa', CUE_INDEX_BIGRAM);
    expect(hits[0].entries[0].wardId).toBe('w-ts');
  });
});

describe('guard tỉnh khác — cắt câu đối xứng cả 2 phía', () => {
  // Trước fix, phần lùi về trước chỉ dò '.'/'\n' còn phần tiến tới sau dò cả
  // '!'/'?' → câu trước kết bằng "!" bị nối nhầm vào câu sau, guard ăn lan
  // sang câu không liên quan.
  it('câu trước kết bằng "!" không nuốt câu sau — Diên Khánh vẫn khớp được', () => {
    const hits = findHits(
      'Bắt giữ tại Bình Dương! Xảy ra tại Diên Khánh.',
      CUE_INDEX,
    );
    expect(hits).toHaveLength(1);
  });
});

describe('cue-gating — bỏ cue đơn "ban" (đụng "bạn"/"bán"), giữ bigram "địa bàn"', () => {
  // Lặp lại đúng dạng bug "Trần Bảo An" nhưng ở cue 'ban': bỏ dấu thì
  // "bạn"/"bán"/"ban" cùng ra 'ban' nên "đi cùng bạn Bảo An" từng khớp nhầm
  // ward "Bảo An" nếu 'ban' còn là cue đơn.
  it('"bạn" KHÔNG bị coi là cue — "đi cùng bạn Bảo An về quê" không khớp nhầm', () => {
    expect(
      findHits('đi cùng bạn Bảo An về quê', CUE_INDEX_BIGRAM),
    ).toHaveLength(0);
  });

  it('bigram "địa bàn" thay thế đúng chức năng của cue "ban" vừa bỏ', () => {
    const hits = findHits('trên địa bàn Bảo An', CUE_INDEX_BIGRAM);
    expect(hits[0].entries[0].wardId).toBe('w-ba');
  });
});

describe('guard tỉnh khác — thêm cách gọi khác của TP.HCM', () => {
  // "Tân Định" là tên phường/chợ nổi tiếng nhất Sài Gòn — chắc chắn xuất
  // hiện dày trong dữ liệu OSINT toàn quốc dưới tên "Sài Gòn"/"TP.HCM"
  // chứ không chỉ tên hành chính "Hồ Chí Minh".
  it('bỏ qua khi cùng câu có "TP.HCM"', () => {
    expect(
      findHits('Vụ cháy xảy ra tại Tân Định, TP.HCM', CUE_INDEX),
    ).toHaveLength(0);
  });

  it('bỏ qua khi cùng câu có "Sài Gòn"', () => {
    expect(
      findHits('Vụ cháy xảy ra tại Tân Định, Sài Gòn', CUE_INDEX),
    ).toHaveLength(0);
  });
});

describe('guard tỉnh khác — so khớp theo ranh giới từ, không phải substring', () => {
  // 'hue' là substring của 'thue' (bỏ dấu của "thuê") — includes() thường sẽ
  // tưởng nhầm "thuê phòng trọ" là đang nhắc Huế. "Thuê phòng", "thuê xe" là
  // văn phong hằng ngày của hồ sơ công an nên đây là mất mát tần suất cao.
  it('"thuê phòng trọ" KHÔNG bị tưởng nhầm là Huế — xã Vạn Ninh vẫn khớp được', () => {
    const hits = findHits(
      'đối tượng thuê phòng trọ tại xã Vạn Ninh',
      buildIndex([{ wardId: 'w-vn', alias: 'Vạn Ninh', requiresCue: false }]),
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].entries[0].wardId).toBe('w-vn');
  });
});

// Index riêng cho Task 5 — thang vai trò P1-P4.
// "Ninh Hải" trỏ 2 ward — thế mơ hồ có thật trong NQ 1667 (xã mới Ninh Thuận
// vs phường cũ Ninh Hòa, cách nhau >100km, KHÔNG được phá bằng alias_type).
const RES_INDEX = buildIndex([
  { wardId: 'w-dk', alias: 'Diên Khánh', requiresCue: false },
  { wardId: 'w-sh', alias: 'Suối Hiệp', requiresCue: false },
  { wardId: 'w-nh-nt', alias: 'Ninh Hải', requiresCue: true },
  { wardId: 'w-dnh', alias: 'Ninh Hải', requiresCue: true },
]);

describe('matchWard — thang vai trò', () => {
  it('P2 "tại" thắng P3 "Công an xã"', () => {
    const r = matchWard(
      'Công an xã Diên Khánh bắt nhóm đối tượng tại xã Suối Hiệp',
      RES_INDEX,
    );
    expect(r.wardId).toBe('w-sh');
    expect(r.reason).toBe('matched');
  });

  it('P4 nơi cư trú bị loại, lấy nơi gây án', () => {
    const r = matchWard(
      'Đối tượng trú tại xã Diên Khánh, gây án tại xã Suối Hiệp',
      RES_INDEX,
    );
    expect(r.wardId).toBe('w-sh');
    expect(r.reason).toBe('matched');
  });

  it('alias trỏ 2 ward → mơ hồ, KHÔNG gán nhưng giữ location_text', () => {
    const r = matchWard('Vụ việc xảy ra tại Ninh Hải', RES_INDEX);
    expect(r.wardId).toBeNull();
    expect(r.reason).toBe('ambiguous');
    expect(r.locationText).toBe('Ninh Hải');
  });

  it('không khớp gì → none, mọi trường null', () => {
    const r = matchWard('Hôm nay trời đẹp', RES_INDEX);
    expect(r).toEqual({
      wardId: null,
      locationText: null,
      matchedAlias: null,
      candidates: [],
      reason: 'none',
    });
  });

  it('chỉ có P4 → không gán (nơi cư trú không phải nơi xảy ra)', () => {
    const r = matchWard('Đối tượng thường trú tại xã Diên Khánh', RES_INDEX);
    expect(r.wardId).toBeNull();
    expect(r.reason).toBe('none');
  });

  it('candidates giữ mọi địa danh kèm vai trò để tính lại sau', () => {
    const r = matchWard(
      'Công an xã Diên Khánh bắt tại xã Suối Hiệp',
      RES_INDEX,
    );
    expect(r.candidates.map((c) => c.role).sort()).toEqual(['P2', 'P3']);
  });

  // Phát hiện khi viết pattern P3: 'tram' (bỏ dấu từ "trạm") trùng tên riêng
  // "Trâm" — tên nữ rất phổ biến trong hồ sơ ANTT. Nếu còn 'tram' trong
  // P3_PATTERNS, "Nguyễn Văn Trâm" đứng trước "tại xã Suối Hiệp" sẽ bị đọc
  // nhầm "Trâm" thành cue "trạm" → Suối Hiệp bị gán sai P3, hòa với "Công an
  // xã Diên Khánh" (P3 thật) rồi chọn nhầm Diên Khánh (xuất hiện sớm hơn).
  it('tên riêng "Trâm" không bị đọc nhầm thành cue "trạm" (P3)', () => {
    const r = matchWard(
      'Công an xã Diên Khánh bắt Nguyễn Văn Trâm tại xã Suối Hiệp',
      RES_INDEX,
    );
    expect(r.wardId).toBe('w-sh');
  });

  // Fix round 1 — Critical: ứng viên mơ hồ ở hạng vai trò CAO NHẤT (P1) không
  // được phép "thua" một ứng viên rõ ràng nhưng vai trò yếu hơn (P2). Trước
  // fix, thuật toán chỉ xét mơ hồ khi KHÔNG còn ứng viên rõ ràng nào, nên
  // "Ninh Hải" (P1, mơ hồ) bị loại thẳng và "Suối Hiệp" (P2, chỉ là nơi đưa
  // về trụ sở) thắng — gán CHẮC NỊCH vào nơi KHÔNG xảy ra vụ việc. Test này
  // phải đỏ nếu ai hoàn nguyên về logic cũ (xét mơ hồ chỉ khi usable rỗng).
  it('mơ hồ ở hạng cao nhất (P1) không được tụt xuống chọn hạng thấp hơn dù nó rõ ràng', () => {
    const r = matchWard(
      'Vụ việc xảy ra tại Ninh Hải, sau đó đưa về trụ sở ở xã Suối Hiệp',
      RES_INDEX,
    );
    expect(r.wardId).toBeNull();
    expect(r.reason).toBe('ambiguous');
    expect(r.locationText).toBe('Ninh Hải');
  });

  // Fix round 1 — Important: hit mơ hồ mang role P4 (nơi cư trú) phải trả
  // 'none', không phải 'ambiguous' — P4 bị loại TRƯỚC khi xét mơ hồ, nên
  // "mơ hồ" của một nơi không phải nơi xảy ra là vô nghĩa, không đáng báo.
  it('hit mơ hồ nhưng mang role P4 (nơi cư trú) → none, không phải ambiguous', () => {
    const r = matchWard('Đối tượng trú tại Ninh Hải', RES_INDEX);
    expect(r.reason).toBe('none');
    expect(r.wardId).toBeNull();
  });

  // Fix round 2 — chiều NGƯỢC của test round-1 ở trên (rất quan trọng):
  // ở đó "Ninh Hải" mơ hồ nằm ở hạng CAO NHẤT (P1) nên phải trả 'ambiguous'.
  // Ở đây "Ninh Hải" mơ hồ chỉ ở hạng THẤP (P2), còn "Suối Hiệp" rõ ràng lại
  // ở hạng CAO hơn (P1) — hạng cao nhất KHÔNG có mơ hồ nên phải chọn được,
  // trả 'matched'. Hai test này BẮT BUỘC ra hai kết quả khác nhau: nếu ai
  // "đơn giản hoá" hàm chọn thành "hễ text có bất kỳ hit mơ hồ nào là trả
  // ambiguous" (bỏ qua việc chỉ xét mơ hồ TRONG nhóm hạng cao nhất) thì test
  // này sẽ đỏ ngay — đây là kiểu rút gọn sai dễ mắc phải nhất.
  it('mơ hồ ở hạng THẤP không cản hạng CAO rõ ràng — vẫn matched (đối xứng với test mơ hồ-ở-hạng-cao)', () => {
    const r = matchWard(
      'Đối tượng khai từng ở Ninh Hải, xảy ra tại xã Suối Hiệp',
      RES_INDEX,
    );
    expect(r.wardId).toBe('w-sh');
    expect(r.reason).toBe('matched');
  });

  // Fix round 2 — phá hòa bằng số lần nhắc, nhánh có từ bản gốc Task 5
  // nhưng chưa từng có test nào chạm tới: 2 ward cùng hạng rõ ràng (P2),
  // một ward được nhắc 2 lần phải thắng ward chỉ nhắc 1 lần.
  it('phá hòa bằng số lần nhắc — ward nhắc 2 lần thắng ward nhắc 1 lần cùng hạng', () => {
    const r = matchWard(
      'Vụ việc tại xã Suối Hiệp. Rồi lại tại xã Suối Hiệp lần nữa. Còn tại xã Diên Khánh cũng được nhắc.',
      RES_INDEX,
    );
    expect(r.wardId).toBe('w-sh');
  });
});
