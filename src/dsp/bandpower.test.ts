import { describe, expect, it } from 'vitest';
import { BANDS, TOTAL_RANGE, bandPower, deltaBandPower, integratePsd } from './bandpower';
import { welch } from './welch';
import { add, gaussianNoise, sine } from './testUtils';

const FS = 250;

describe('constants', () => {
  it('defines standard, contiguous band edges', () => {
    expect(BANDS.delta).toEqual([0.5, 4]);
    expect(BANDS.theta).toEqual([4, 8]);
    expect(BANDS.alpha).toEqual([8, 13]);
    expect(BANDS.beta).toEqual([13, 30]);
    expect(TOTAL_RANGE).toEqual([0.5, 30]);
  });
});

describe('integratePsd', () => {
  const freqs = Float64Array.from([0, 1, 2, 3, 4]);
  const psd = Float64Array.from([2, 2, 2, 2, 2]);
  it('integrates a flat PSD exactly, interpolating at edges', () => {
    expect(integratePsd(freqs, psd, 0, 4)).toBeCloseTo(8, 12);
    expect(integratePsd(freqs, psd, 0.5, 3.25)).toBeCloseTo(5.5, 12);
  });
  it('integrates a linear PSD exactly', () => {
    const lin = Float64Array.from([0, 1, 2, 3, 4]);
    expect(integratePsd(freqs, lin, 1.5, 3.5)).toBeCloseTo((3.5 ** 2 - 1.5 ** 2) / 2, 12);
  });
  it('clips to available range and returns 0 for empty ranges', () => {
    expect(integratePsd(freqs, psd, -5, 100)).toBeCloseTo(8, 12);
    expect(integratePsd(freqs, psd, 10, 20)).toBe(0);
    expect(integratePsd(freqs, psd, 3, 3)).toBe(0);
  });
});

describe('bandPower', () => {
  it('a 10 Hz sine of amplitude 10 uV puts ~50 uV^2 in alpha', () => {
    const x = add(sine(FS * 60, FS, 10, 10), gaussianNoise(FS * 60, 0.01, 9));
    const r = bandPower(welch(x, FS));
    expect(r.absolute.alpha).toBeGreaterThan(50 * 0.95);
    expect(r.absolute.alpha).toBeLessThan(50 * 1.05);
    expect(r.relative.alpha).toBeGreaterThan(0.99);
    expect(r.absolute.delta).toBeLessThan(0.01);
    expect(r.absolute.beta).toBeLessThan(0.01);
  });

  it('relative powers sum to 1 over the total range', () => {
    const x = add(sine(FS * 60, FS, 6, 5), add(sine(FS * 60, FS, 20, 3), gaussianNoise(FS * 60, 2, 2)));
    const r = bandPower(welch(x, FS));
    const sum = r.relative.delta + r.relative.theta + r.relative.alpha + r.relative.beta;
    expect(sum).toBeCloseTo(1, 6);
    expect(r.total).toBeCloseTo(r.absolute.delta + r.absolute.theta + r.absolute.alpha + r.absolute.beta, 6);
  });

  it('white noise band power ~ sigma^2 * bandwidth / (fs/2)', () => {
    const sigma = 5;
    const r = bandPower(welch(gaussianNoise(FS * 240, sigma, 8), FS));
    const expected = (sigma ** 2 * (13 - 8)) / (FS / 2);
    expect(r.absolute.alpha / expected).toBeGreaterThan(0.9);
    expect(r.absolute.alpha / expected).toBeLessThan(1.1);
  });

  it('returns zeros (not NaN) for a zero signal', () => {
    const r = bandPower(welch(new Float64Array(FS * 10), FS));
    expect(r.absolute.alpha).toBe(0);
    expect(r.relative.alpha).toBe(0);
  });
});

describe('deltaBandPower', () => {
  it('is B minus A for absolute and relative', () => {
    const a = bandPower(welch(add(sine(FS * 30, FS, 10, 4), gaussianNoise(FS * 30, 1, 1)), FS));
    const b = bandPower(welch(add(sine(FS * 30, FS, 6, 4), gaussianNoise(FS * 30, 1, 2)), FS));
    const d = deltaBandPower(a, b);
    expect(d.absolute.alpha).toBeCloseTo(b.absolute.alpha - a.absolute.alpha, 12);
    expect(d.relative.theta).toBeCloseTo(b.relative.theta - a.relative.theta, 12);
    expect(d.absolute.alpha).toBeLessThan(0);
    expect(d.absolute.theta).toBeGreaterThan(0);
  });
});
