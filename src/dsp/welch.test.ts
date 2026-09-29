import { describe, expect, it } from 'vitest';
import { SignalTooShortError, welch } from './welch';
import { add, argMax, gaussianNoise, sine } from './testUtils';

const FS = 250;

function integrate(freqs: Float64Array, psd: Float64Array): number {
  let s = 0;
  for (let i = 1; i < freqs.length; i++) s += 0.5 * (psd[i] + psd[i - 1]) * (freqs[i] - freqs[i - 1]);
  return s;
}

describe('welch', () => {
  it('has default 4 s segments: 0.25 Hz resolution, 0..Nyquist', () => {
    const { freqs, psd } = welch(sine(FS * 30, FS, 10), FS);
    expect(freqs[0]).toBe(0);
    expect(freqs[1]).toBeCloseTo(0.25, 10);
    expect(freqs[freqs.length - 1]).toBeCloseTo(FS / 2, 10);
    expect(freqs).toHaveLength(FS * 2 + 1);
    expect(psd).toHaveLength(freqs.length);
  });

  it.each([[10], [7.5], [23]])('peak at %f Hz', (f) => {
    const { freqs, psd } = welch(sine(FS * 30, FS, f, 20), FS);
    expect(freqs[argMax(psd)]).toBeCloseTo(f, 1);
  });

  it('segmentSeconds controls resolution', () => {
    const x = sine(FS * 30, FS, 10);
    expect(welch(x, FS, { segmentSeconds: 2 }).freqs[1]).toBeCloseTo(0.5, 10);
    expect(welch(x, FS, { segmentSeconds: 8 }).freqs[1]).toBeCloseTo(0.125, 10);
  });

  it('works with non power-of-two segment lengths and odd fs', () => {
    const { freqs, psd } = welch(sine(300 * 30, 300, 12, 5), 300, { segmentSeconds: 3.3 });
    expect(freqs[argMax(psd)]).toBeCloseTo(12, 0);
  });

  it('white noise: integral equals variance (Parseval), density = sigma^2/(fs/2)', () => {
    const sigma = 7;
    const { freqs, psd } = welch(gaussianNoise(FS * 120, sigma, 42), FS);
    const ratio = integrate(freqs, psd) / sigma ** 2;
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
    let mid = 0;
    let c = 0;
    for (let i = 0; i < freqs.length; i++) {
      if (freqs[i] > 5 && freqs[i] < 100) {
        mid += psd[i];
        c++;
      }
    }
    const level = mid / c / (sigma ** 2 / (FS / 2));
    expect(level).toBeGreaterThan(0.95);
    expect(level).toBeLessThan(1.05);
  });

  it('sine of amplitude A carries power A^2/2', () => {
    const A = 10;
    const x = add(sine(FS * 60, FS, 10, A), gaussianNoise(FS * 60, 0.01, 5));
    const { freqs, psd } = welch(x, FS);
    let p = 0;
    for (let i = 1; i < freqs.length; i++) {
      if (freqs[i] >= 9 && freqs[i] <= 11) p += 0.5 * (psd[i] + psd[i - 1]) * (freqs[i] - freqs[i - 1]);
    }
    expect(p / (A ** 2 / 2)).toBeGreaterThan(0.97);
    expect(p / (A ** 2 / 2)).toBeLessThan(1.03);
  });

  it('ignores DC offset', () => {
    const x = add(sine(FS * 30, FS, 10, 5), new Float64Array(FS * 30).fill(1000));
    const { freqs, psd } = welch(x, FS);
    expect(freqs[argMax(psd)]).toBeCloseTo(10, 1);
  });

  it('accepts Float32Array', () => {
    const { freqs, psd } = welch(Float32Array.from(sine(FS * 30, FS, 10)), FS);
    expect(freqs[argMax(psd)]).toBeCloseTo(10, 1);
  });

  it('works with exactly one segment', () => {
    const { psd } = welch(sine(FS * 4, FS, 10), FS);
    expect(psd.every(Number.isFinite)).toBe(true);
  });

  it('throws SignalTooShortError when shorter than one segment', () => {
    expect(() => welch(sine(FS * 3, FS, 10), FS)).toThrow(SignalTooShortError);
    expect(() => welch(new Float64Array(0), FS)).toThrow(/too short/i);
  });

  it('rejects segment lengths outside 1-8 s and bad fs', () => {
    const x = sine(FS * 30, FS, 10);
    expect(() => welch(x, FS, { segmentSeconds: 0.5 })).toThrow(RangeError);
    expect(() => welch(x, FS, { segmentSeconds: 9 })).toThrow(RangeError);
    expect(() => welch(x, 0)).toThrow(RangeError);
  });
});
