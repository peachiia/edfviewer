import type { Sos } from './butterworth';

export type FloatArray = Float32Array | Float64Array;

export interface FiltfiltOptions {
  /** Samples of odd-reflection padding at each end. Default 3 * (2 * sections + 1) * 10, capped at n - 1. */
  padlen?: number;
}

/** Run the cascade over `buf` in place. Sections start at steady state for a constant input equal to buf[0]. */
function cascade(sos: Sos, buf: Float64Array): void {
  const n = buf.length;
  if (n === 0) return;
  for (const s of sos) {
    const g = (s.b0 + s.b1 + s.b2) / (1 + s.a1 + s.a2); // DC gain
    const x0 = buf[0];
    let z2 = (s.b2 - s.a2 * g) * x0;
    let z1 = (s.b1 - s.a1 * g) * x0 + z2;
    for (let i = 0; i < n; i++) {
      const x = buf[i];
      const y = s.b0 * x + z1;
      z1 = s.b1 * x - s.a1 * y + z2;
      z2 = s.b2 * x - s.a2 * y;
      buf[i] = y;
    }
  }
}

/**
 * Zero-phase filtering: forward then backward pass through the SOS cascade.
 * Edges use odd-reflection padding plus steady-state initial conditions (as in
 * scipy.signal.sosfiltfilt), so DC offsets do not create start-up transients.
 * Returns a new array of the same type as the input; the input is not modified.
 */
export function filtfilt(sos: Sos, x: Float32Array, opts?: FiltfiltOptions): Float32Array;
export function filtfilt(sos: Sos, x: Float64Array, opts?: FiltfiltOptions): Float64Array;
export function filtfilt(sos: Sos, x: FloatArray, opts?: FiltfiltOptions): FloatArray;
export function filtfilt(sos: Sos, x: FloatArray, opts: FiltfiltOptions = {}): FloatArray {
  const n = x.length;
  const out = x instanceof Float32Array ? new Float32Array(n) : new Float64Array(n);
  if (n === 0) return out;
  if (sos.length === 0) {
    out.set(x);
    return out;
  }

  const defaultPad = 30 * (2 * sos.length + 1);
  const pad = Math.max(0, Math.min(n - 1, Math.floor(opts.padlen ?? defaultPad)));

  const buf = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i++) {
    buf[i] = 2 * x[0] - x[pad - i]; // odd reflection about x[0]
    buf[pad + n + i] = 2 * x[n - 1] - x[n - 2 - i]; // about x[n-1]
  }
  for (let i = 0; i < n; i++) buf[pad + i] = x[i];

  cascade(sos, buf);
  buf.reverse();
  cascade(sos, buf);
  buf.reverse();

  for (let i = 0; i < n; i++) out[i] = buf[pad + i];
  return out;
}
