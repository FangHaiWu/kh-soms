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
});
