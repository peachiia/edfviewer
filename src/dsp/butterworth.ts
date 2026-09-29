/** One second-order section (biquad), a0 normalised to 1: y = b0 x + b1 x1 + b2 x2 - a1 y1 - a2 y2. */
export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Cascade of biquads. */
export type Sos = Biquad[];

export type PassType = 'lowpass' | 'highpass';

export const MIN_ORDER = 2;
export const MAX_ORDER = 8;

function checkFreq(freq: number, fs: number, what: string): void {
  if (!(fs > 0) || !Number.isFinite(fs)) throw new RangeError(`Sampling rate must be positive (got ${fs})`);
  if (!(freq > 0) || !(freq < fs / 2)) {
    throw new RangeError(`${what} frequency must be in (0, ${fs / 2}) Hz (got ${freq})`);
  }
}

/**
 * Butterworth low/high-pass as second-order sections via the bilinear transform
 * (with frequency pre-warping). Odd orders yield one first-order section
 * (stored as a biquad with b2 = a2 = 0). Orders 2-8.
 */
export function designButterworth(type: PassType, order: number, cutoffHz: number, fs: number): Sos {
  if (!Number.isInteger(order) || order < MIN_ORDER || order > MAX_ORDER) {
    throw new RangeError(`Order must be an integer in ${MIN_ORDER}-${MAX_ORDER} (got ${order})`);
  }
  checkFreq(cutoffHz, fs, 'Cutoff');

  const c = 1 / Math.tan((Math.PI * cutoffHz) / fs); // s/wc = c (1 - z^-1)/(1 + z^-1)
  const lp = type === 'lowpass';
  const sos: Sos = [];

  // Analog prototype poles: exp(j pi (2k + n + 1) / 2n); pair k with its conjugate.
  for (let k = 0; k < Math.floor(order / 2); k++) {
    const theta = (Math.PI * (2 * k + order + 1)) / (2 * order);
    const d1 = -2 * Math.cos(theta); // s^2 + d1 s + 1
    const a0 = c * c + d1 * c + 1;
    const a1 = (2 * (1 - c * c)) / a0;
    const a2 = (c * c - d1 * c + 1) / a0;
    if (lp) {
      sos.push({ b0: 1 / a0, b1: 2 / a0, b2: 1 / a0, a1, a2 });
    } else {
      const g = (c * c) / a0;
      sos.push({ b0: g, b1: -2 * g, b2: g, a1, a2 });
    }
  }
  if (order % 2 === 1) {
    // Real pole s = -1: 1/(s+1) or s/(s+1)
    const a0 = c + 1;
    const a1 = (1 - c) / a0;
    sos.push(lp ? { b0: 1 / a0, b1: 1 / a0, b2: 0, a1, a2: 0 } : { b0: c / a0, b1: -c / a0, b2: 0, a1, a2: 0 });
  }
  return sos;
}

/** Single-frequency notch (RBJ biquad), quality factor `q` = f0 / bandwidth. */
export function designNotch(freqHz: number, q: number, fs: number): Sos {
  checkFreq(freqHz, fs, 'Notch');
  if (!(q > 0) || !Number.isFinite(q)) throw new RangeError(`Q must be positive (got ${q})`);
  const w0 = (2 * Math.PI * freqHz) / fs;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  return [{ b0: 1 / a0, b1: (-2 * cos) / a0, b2: 1 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 }];
}
