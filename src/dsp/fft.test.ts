import { describe, expect, it } from 'vitest';
import { fft } from './fft';
import { gaussianNoise } from './testUtils';

function naiveDft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  const or = new Float64Array(n);
  const oi = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * ((k * t) % n)) / n;
      or[k] += re[t] * Math.cos(a) - im[t] * Math.sin(a);
      oi[k] += re[t] * Math.sin(a) + im[t] * Math.cos(a);
    }
  }
  return { re: or, im: oi };
}

describe('fft', () => {
  it.each([1, 2, 8, 12, 100, 125, 250, 1000])('matches naive DFT for n=%i', (n) => {
    const re = gaussianNoise(n, 1, 3);
    const im = gaussianNoise(n, 1, 4);
    const expected = naiveDft(re, im);
    const r = Float64Array.from(re);
    const i = Float64Array.from(im);
    fft(r, i);
    for (let k = 0; k < n; k++) {
      expect(r[k]).toBeCloseTo(expected.re[k], 6);
      expect(i[k]).toBeCloseTo(expected.im[k], 6);
    }
  });
});
