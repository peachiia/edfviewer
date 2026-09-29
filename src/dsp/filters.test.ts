import { describe, expect, it } from 'vitest';
import { designButterworth, designNotch } from './butterworth';
import { filtfilt } from './filtfilt';
import { applyFilters, type FilterSettings } from './filters';
import { add, argMax, rms, sine } from './testUtils';

const FS = 250;
const N = FS * 20;
const skip = FS * 2; // ignore edges when measuring gain

function gain(x: Float64Array, y: Float64Array): number {
  return rms(y, skip) / rms(x, skip);
}

describe('designButterworth', () => {
  it('returns ceil(order/2) sections', () => {
    expect(designButterworth('lowpass', 4, 30, FS)).toHaveLength(2);
    expect(designButterworth('highpass', 5, 1, FS)).toHaveLength(3);
    expect(designButterworth('lowpass', 8, 30, FS)).toHaveLength(4);
  });

  it('rejects invalid order and cutoff', () => {
    expect(() => designButterworth('lowpass', 1, 30, FS)).toThrow(RangeError);
    expect(() => designButterworth('lowpass', 9, 30, FS)).toThrow(RangeError);
    expect(() => designButterworth('lowpass', 4, 0, FS)).toThrow(RangeError);
    expect(() => designButterworth('lowpass', 4, FS / 2, FS)).toThrow(RangeError);
    expect(() => designNotch(FS / 2, 30, FS)).toThrow(RangeError);
    expect(() => designNotch(50, 0, FS)).toThrow(RangeError);
  });
});

describe('filtfilt lowpass', () => {
  it.each([[2, 0.05], [4, 0.02], [8, 0.02]])('order %i: passes 5 Hz, attenuates 60 Hz', (order, maxStop) => {
    const sos = designButterworth('lowpass', order, 30, FS);
    const pass = sine(N, FS, 5);
    const stop = sine(N, FS, 60);
    expect(gain(pass, filtfilt(sos, pass))).toBeGreaterThan(0.98);
    // forward-backward squares the magnitude response
    expect(gain(stop, filtfilt(sos, stop))).toBeLessThan(maxStop);
  });

  it('is -6 dB (0.5 amplitude) at the cutoff after forward-backward', () => {
    const sos = designButterworth('lowpass', 4, 30, FS);
    const x = sine(N, FS, 30);
    expect(gain(x, filtfilt(sos, x))).toBeCloseTo(0.5, 1);
  });
});

describe('filtfilt highpass', () => {
  it('passes 20 Hz, attenuates 0.1 Hz and removes DC offset', () => {
    const sos = designButterworth('highpass', 4, 1, FS);
    const pass = sine(N, FS, 20);
    const slow = sine(N, FS, 0.1);
    expect(gain(pass, filtfilt(sos, pass))).toBeGreaterThan(0.98);
    expect(gain(slow, filtfilt(sos, slow))).toBeLessThan(0.05);
    const dc = new Float64Array(N).fill(100);
    expect(rms(filtfilt(sos, dc), skip)).toBeLessThan(0.5);
  });

  it('has no large edge transient on a signal with DC offset', () => {
    const sos = designButterworth('highpass', 2, 0.5, FS);
    const x = add(sine(N, FS, 10, 10), new Float64Array(N).fill(500));
    const y = filtfilt(sos, x);
    let maxEdge = 0;
    for (let i = 0; i < 10; i++) maxEdge = Math.max(maxEdge, Math.abs(y[i]));
    expect(maxEdge).toBeLessThan(50);
  });
});

describe('notch', () => {
  it('removes 50 Hz but keeps 10 Hz', () => {
    const sos = designNotch(50, 30, FS);
    const x = add(sine(N, FS, 10), sine(N, FS, 50));
    const y = filtfilt(sos, x);
    const tenOnly = sine(N, FS, 10);
    const fiftyOnly = sine(N, FS, 50);
    expect(rms(filtfilt(sos, fiftyOnly), skip)).toBeLessThan(0.01);
    expect(gain(tenOnly, filtfilt(sos, tenOnly))).toBeGreaterThan(0.99);
    let err = 0;
    for (let i = skip; i < N - skip; i++) err = Math.max(err, Math.abs(y[i] - tenOnly[i]));
    expect(err).toBeLessThan(0.02);
  });

  it('lower Q gives a wider notch', () => {
    const wide = designNotch(50, 5, FS);
    const narrow = designNotch(50, 50, FS);
    const near = sine(N, FS, 47);
    expect(gain(near, filtfilt(wide, near))).toBeLessThan(gain(near, filtfilt(narrow, near)));
  });

  it('works at other sampling rates (60 Hz at 500 Hz)', () => {
    const sos = designNotch(60, 30, 500);
    const x = sine(5000, 500, 60);
    expect(rms(filtfilt(sos, x), 500)).toBeLessThan(0.01);
  });
});

describe('zero phase', () => {
  it('keeps a pulse peak at the same index', () => {
    const x = new Float64Array(N);
    const centre = 2500;
    for (let i = 0; i < N; i++) x[i] = Math.exp(-((i - centre) ** 2) / (2 * 10 ** 2));
    const y = filtfilt(designButterworth('lowpass', 4, 20, FS), x);
    expect(argMax(y)).toBe(centre);
    const z = filtfilt(designButterworth('highpass', 2, 2, FS), x);
    expect(argMax(z)).toBe(centre);
  });

  it('does not shift a sine (cross-correlation peak at lag 0)', () => {
    const x = sine(N, FS, 10);
    const y = filtfilt(designButterworth('lowpass', 6, 40, FS), x);
    let dot0 = 0;
    let dot1 = 0;
    let dotm1 = 0;
    for (let i = skip; i < N - skip; i++) {
      dot0 += x[i] * y[i];
      dot1 += x[i] * y[i + 1];
      dotm1 += x[i] * y[i - 1];
    }
    expect(dot0).toBeGreaterThan(dot1);
    expect(dot0).toBeGreaterThan(dotm1);
  });
});

describe('filtfilt types and edge cases', () => {
  const sos = designButterworth('lowpass', 4, 30, FS);

  it('returns Float32Array for Float32Array input and Float64Array for Float64Array', () => {
    const x64 = sine(1000, FS, 5);
    const x32 = Float32Array.from(x64);
    const y32 = filtfilt(sos, x32);
    const y64 = filtfilt(sos, x64);
    expect(y32).toBeInstanceOf(Float32Array);
    expect(y64).toBeInstanceOf(Float64Array);
    expect(Math.abs(y32[500] - y64[500])).toBeLessThan(1e-4);
  });

  it('does not mutate the input', () => {
    const x = sine(1000, FS, 5);
    const copy = Float64Array.from(x);
    filtfilt(sos, x);
    expect(Array.from(x)).toEqual(Array.from(copy));
  });

  it('handles empty, single-sample and very short input without NaN', () => {
    expect(filtfilt(sos, new Float64Array(0))).toHaveLength(0);
    for (const n of [1, 2, 3, 10]) {
      const y = filtfilt(sos, sine(n, FS, 5));
      expect(y).toHaveLength(n);
      expect(Array.from(y).every(Number.isFinite)).toBe(true);
    }
  });

  it('empty section list is identity', () => {
    const x = sine(100, FS, 5);
    expect(Array.from(filtfilt([], x))).toEqual(Array.from(x));
  });

  it('a constant signal through a lowpass stays constant (edges included)', () => {
    const y = filtfilt(sos, new Float64Array(500).fill(42));
    for (const v of y) expect(v).toBeCloseTo(42, 6);
  });
});

describe('applyFilters', () => {
  const base: FilterSettings = {
    enabled: true,
    highpass: { enabled: true, freq: 1, order: 4 },
    lowpass: { enabled: true, freq: 40, order: 4 },
    notch: { enabled: true, freq: 50, q: 30 },
  };
  const x = add(add(sine(N, FS, 10), sine(N, FS, 50)), add(sine(N, FS, 0.1, 5), sine(N, FS, 100)));
  const onlyNotch: FilterSettings = {
    ...base,
    highpass: { ...base.highpass, enabled: false },
    lowpass: { ...base.lowpass, enabled: false },
  };

  it('combines HP, LP and notch', () => {
    const y = applyFilters(x, FS, base);
    let err = 0;
    const ref = sine(N, FS, 10);
    for (let i = skip; i < N - skip; i++) err = Math.max(err, Math.abs(y[i] - ref[i]));
    expect(err).toBeLessThan(0.1);
  });

  it('master off returns the raw signal untouched', () => {
    expect(applyFilters(x, FS, { ...base, enabled: false })).toBe(x);
  });

  it('individual stages can be disabled', () => {
    expect(rms(applyFilters(sine(N, FS, 50), FS, onlyNotch), skip)).toBeLessThan(0.01);
    // 100 Hz and 0.1 Hz survive when HP/LP are off
    expect(rms(applyFilters(x, FS, onlyNotch), skip)).toBeGreaterThan(rms(sine(N, FS, 10), skip));
  });

  it('nothing enabled returns input as-is', () => {
    const y = applyFilters(x, FS, {
      ...base,
      highpass: { ...base.highpass, enabled: false },
      lowpass: { ...base.lowpass, enabled: false },
      notch: { ...base.notch, enabled: false },
    });
    expect(y).toBe(x);
  });

  it('skips stages whose frequency is at/above Nyquist (low-rate channels)', () => {
    const y = applyFilters(sine(200, 100, 5), 100, base); // notch 50 == Nyquist -> skipped
    expect(y).toHaveLength(200);
    expect(Array.from(y).every(Number.isFinite)).toBe(true);
  });

  it('preserves Float32Array type', () => {
    expect(applyFilters(Float32Array.from(x), FS, base)).toBeInstanceOf(Float32Array);
  });
});
