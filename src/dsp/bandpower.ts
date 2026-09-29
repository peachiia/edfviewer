import type { Psd } from './welch';

export type BandName = 'delta' | 'theta' | 'alpha' | 'beta';
export type BandEdges = readonly [lowHz: number, highHz: number];

/** Standard EEG band edges in Hz (contiguous; each band is [low, high)). */
export const BANDS: Readonly<Record<BandName, BandEdges>> = {
  delta: [0.5, 4],
  theta: [4, 8],
  alpha: [8, 13],
  beta: [13, 30],
};

export const BAND_NAMES: readonly BandName[] = ['delta', 'theta', 'alpha', 'beta'];

/** Denominator range for relative power: delta low edge to beta high edge. */
export const TOTAL_RANGE: BandEdges = [0.5, 30];

export interface BandPowers {
  /** Absolute power per band, unit² (µV²). */
  absolute: Record<BandName, number>;
  /** Fraction of `total` per band (0 when total is 0). */
  relative: Record<BandName, number>;
  /** Power over TOTAL_RANGE. */
  total: number;
}

/**
 * Trapezoidal integral of the PSD over [lo, hi] Hz, with linear interpolation at the
 * edges. Range is clipped to the available frequencies; empty ranges give 0.
 */
export function integratePsd(freqs: ArrayLike<number>, psd: ArrayLike<number>, lo: number, hi: number): number {
  const n = freqs.length;
  if (n < 2) return 0;
  const a = Math.max(lo, freqs[0]);
  const b = Math.min(hi, freqs[n - 1]);
  if (!(b > a)) return 0;
  const at = (i: number, f: number) => {
    const t = (f - freqs[i]) / (freqs[i + 1] - freqs[i]);
    return psd[i] + t * (psd[i + 1] - psd[i]);
  };
  let sum = 0;
  for (let i = 0; i < n - 1; i++) {
    const f0 = Math.max(freqs[i], a);
    const f1 = Math.min(freqs[i + 1], b);
    if (f1 <= f0) continue;
    sum += 0.5 * (at(i, f0) + at(i, f1)) * (f1 - f0);
  }
  return sum;
}

/** Absolute and relative delta/theta/alpha/beta power of a PSD. */
export function bandPower(
  { freqs, psd }: Psd,
  bands: Readonly<Record<BandName, BandEdges>> = BANDS,
  totalRange: BandEdges = TOTAL_RANGE,
): BandPowers {
  const total = integratePsd(freqs, psd, totalRange[0], totalRange[1]);
  const absolute = {} as Record<BandName, number>;
  const relative = {} as Record<BandName, number>;
  for (const name of BAND_NAMES) {
    const p = integratePsd(freqs, psd, bands[name][0], bands[name][1]);
    absolute[name] = p;
    relative[name] = total > 0 ? p / total : 0;
  }
  return { absolute, relative, total };
}

/** Δ = B − A for absolute and relative band power (and total). */
export function deltaBandPower(a: BandPowers, b: BandPowers): BandPowers {
  const absolute = {} as Record<BandName, number>;
  const relative = {} as Record<BandName, number>;
  for (const name of BAND_NAMES) {
    absolute[name] = b.absolute[name] - a.absolute[name];
    relative[name] = b.relative[name] - a.relative[name];
  }
  return { absolute, relative, total: b.total - a.total };
}
