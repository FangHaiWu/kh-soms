import { WardMatcherService } from './ward-matcher.service';

describe('WardMatcherService', () => {
  const aliasRows = [
    { wardId: 'w-dk', alias: 'Diên Khánh', requiresCue: false },
  ];

  function make() {
    const aliasRepo: any = { find: async () => aliasRows };
    const unmatchedSaved: any[] = [];
    const unmatchedRepo: any = {
      findOne: async () => null,
      create: (x: any) => x,
      save: async (x: any) => {
        unmatchedSaved.push(x);
        return x;
      },
    };
    return {
      svc: new WardMatcherService(aliasRepo, unmatchedRepo),
      unmatchedSaved,
    };
  }

  it('nạp index từ DB rồi khớp được', async () => {
    const { svc } = make();
    const r = await svc.match('Bắt giữ tại Diên Khánh');
    expect(r.wardId).toBe('w-dk');
  });

  it('LOC của NER không khớp alias nào → ghi unmatched_locations', async () => {
    const { svc, unmatchedSaved } = make();
    await svc.match('Tin tức', ['Hòn Rớ']);
    expect(unmatchedSaved).toHaveLength(1);
    expect(unmatchedSaved[0].textNorm).toBe('hon ro');
  });

  it('LOC khớp alias đã có → KHÔNG ghi unmatched', async () => {
    const { svc, unmatchedSaved } = make();
    await svc.match('tại Diên Khánh', ['Diên Khánh']);
    expect(unmatchedSaved).toHaveLength(0);
  });

  it('DB chết khi nạp gazetteer → match() trả reason "none", KHÔNG ném lỗi', async () => {
    // aliasRepo.find() ném lỗi mô phỏng bảng ward_aliases chưa tồn tại / mất kết nối DB
    const aliasRepo: any = {
      find: async () => {
        throw new Error('relation "spatial.ward_aliases" does not exist');
      },
    };
    const unmatchedRepo: any = {
      findOne: async () => null,
      create: (x: any) => x,
      save: async (x: any) => x,
    };
    const svc = new WardMatcherService(aliasRepo, unmatchedRepo);

    const r = await svc.match('Bắt giữ tại Diên Khánh');

    expect(r).toEqual({
      wardId: null,
      locationText: null,
      matchedAlias: null,
      candidates: [],
      reason: 'none',
    });
  });

  it('nạp lỗi lần đầu, DB sống lại → lần match() sau tự phục hồi và khớp được', async () => {
    // Lần gọi find() đầu tiên lỗi, các lần sau trả dữ liệu bình thường —
    // mô phỏng DB chết rồi sống lại mà KHÔNG restart app.
    let callCount = 0;
    const aliasRepo: any = {
      find: async () => {
        callCount++;
        if (callCount === 1) throw new Error('connection refused');
        return aliasRows;
      },
    };
    const unmatchedRepo: any = {
      findOne: async () => null,
      create: (x: any) => x,
      save: async (x: any) => x,
    };
    const svc = new WardMatcherService(aliasRepo, unmatchedRepo);

    const first = await svc.match('Bắt giữ tại Diên Khánh');
    expect(first.reason).toBe('none');

    const second = await svc.match('Bắt giữ tại Diên Khánh');
    expect(second.wardId).toBe('w-dk');
  });
});
