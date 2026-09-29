/** In-place iterative radix-2 FFT (n must be a power of two). */
function fftPow2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** In-place forward DFT of any length (radix-2 when possible, Bluestein otherwise). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) === 0) {
    fftPow2(re, im);
    return;
  }
  // Bluestein chirp-z: X[k] = conj(w[k]) * sum (x[t] conj(w[t])) w-conv, w[t] = exp(j pi t^2 / n)
  let m = 1;
  while (m < 2 * n - 1) m <<= 1;
  const cr = new Float64Array(n);
  const ci = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const ang = (Math.PI * ((t * t) % (2 * n))) / n;
    cr[t] = Math.cos(ang);
    ci[t] = Math.sin(ang);
  }
  const ar = new Float64Array(m);
  const ai = new Float64Array(m);
  const br = new Float64Array(m);
  const bi = new Float64Array(m);
  for (let t = 0; t < n; t++) {
    ar[t] = re[t] * cr[t] + im[t] * ci[t]; // x * conj(c)
    ai[t] = im[t] * cr[t] - re[t] * ci[t];
    br[t] = cr[t];
    bi[t] = ci[t];
    if (t > 0) {
      br[m - t] = cr[t];
      bi[m - t] = ci[t];
    }
  }
  fftPow2(ar, ai);
  fftPow2(br, bi);
  for (let i = 0; i < m; i++) {
    const r = ar[i] * br[i] - ai[i] * bi[i];
    const q = ar[i] * bi[i] + ai[i] * br[i];
    ar[i] = r;
    ai[i] = q;
  }
  // inverse via conjugation: ifft(x) = conj(fft(conj(x)))/m
  for (let i = 0; i < m; i++) ai[i] = -ai[i];
  fftPow2(ar, ai);
  for (let k = 0; k < n; k++) {
    const r = ar[k] / m;
    const q = -ai[k] / m;
    re[k] = r * cr[k] + q * ci[k]; // * conj(c)
    im[k] = q * cr[k] - r * ci[k];
  }
}
