import { EwmWeightJob } from './ewm-weight.job';
import { describe, it, expect, jest } from '@jest/globals';

describe('EwmWeightJob', () => {
  const job = new EwmWeightJob({} as any, {} as any); // computeWeights không đụng repo

  it('cột hằng có trọng số ~0; cột biến thiên chiếm trọng số; tổng ≈ 1', () => {
    const rows = [
      { A: 0, B: 5 },
      { A: 100, B: 5 },
      { A: 0, B: 5 },
      { A: 80, B: 5 },
      //                        ^ B hằng tuyệt đối [5,5,5,5]
    ];
    const w = job.computeWeights(rows);
    expect(w.B).toBeCloseTo(0, 5); // cột hằng → không phân biệt → trọng số 0
    expect(w.A).toBeGreaterThan(w.B); // A mang toàn bộ thông tin
    expect(w.A + w.B).toBeCloseTo(1, 5);
  });

  it('mọi trọng số ≥ 0 và tổng ≈ 1', () => {
    const w = job.computeWeights([
      { x: 1, y: 2 },
      { x: 3, y: 1 },
      { x: 2, y: 9 },
    ]);
    Object.values(w).forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('rỗng/1 mẫu → {} (không throw)', () => {
    expect(job.computeWeights([])).toEqual({});
    expect(job.computeWeights([{ A: 1 }])).toEqual({});
  });

  it('run() ghi signalWeights vào hàng active', async () => {
    const nlpFind = jest
      .fn<() => Promise<any[]>>()
      .mockResolvedValue([
        { signalFeatures: { A: 0 } },
        { signalFeatures: { A: 100 } },
      ]);
    const cfg = { isActive: true, signalWeights: null };
    const cfgFindOne = jest.fn<() => Promise<any>>().mockResolvedValue(cfg);
    const cfgSave = jest.fn();
    const j = new EwmWeightJob(
      { find: nlpFind } as any,
      { findOne: cfgFindOne, save: cfgSave } as any,
    );
    await j.run();
    expect(cfgSave).toHaveBeenCalled();
    expect(cfg.signalWeights).toBeTruthy();
  });
});
