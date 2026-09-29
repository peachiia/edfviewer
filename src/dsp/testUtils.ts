// Test helpers for DSP specs (synthetic signals, deterministic noise).

export function sine(n: number, fs: number, freq: number, amp = 1, phase = 0): Float64Array {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / fs + phase);
  return x;
}

export function add(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
}

/** RMS over the central portion (skips `skip` samples each side). */
export function rms(x: ArrayLike<number>, skip = 0): number {
  let s = 0;
  let n = 0;
  for (let i = skip; i < x.length - skip; i++) {
    s += x[i] * x[i];
    n++;
  }
  return Math.sqrt(s / n);
}

/** Deterministic Gaussian noise with the given standard deviation. */
export function gaussianNoise(n: number, sigma: number, seed = 1): Float64Array {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const x = new Float64Array(n);
  for (let i = 0; i < n; i += 2) {
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    const r = Math.sqrt(-2 * Math.log(u1));
    x[i] = sigma * r * Math.cos(2 * Math.PI * u2);
    if (i + 1 < n) x[i + 1] = sigma * r * Math.sin(2 * Math.PI * u2);
  }
  return x;
}

export function argMax(x: ArrayLike<number>, from = 0, to = x.length): number {
  let best = from;
  for (let i = from; i < to; i++) if (x[i] > x[best]) best = i;
  return best;
}
