import { fft } from './fft';
import type { FloatArray } from './filtfilt';

export const MIN_SEGMENT_SECONDS = 1;
export const MAX_SEGMENT_SECONDS = 8;
export const DEFAULT_SEGMENT_SECONDS = 4;

export interface WelchOptions {
  /** Segment length in seconds, 1-8 (default 4). */
  segmentSeconds?: number;
}

export interface Psd {
  /** Frequencies in Hz, 0 .. fs/2 (one-sided). */
  freqs: Float64Array;
  /** Power spectral density in unit^2/Hz (µV²/Hz for µV input). */
  psd: Float64Array;
}

/** Thrown when the signal has fewer samples than one Welch segment. */
export class SignalTooShortError extends Error {
  constructor(
    readonly samples: number,
    readonly requiredSamples: number,
    readonly fs: number,
  ) {
    super(
      `Signal too short for PSD: ${(samples / fs).toFixed(2)} s available, need at least ${(requiredSamples / fs).toFixed(2)} s (one segment). Select a longer zone or use a shorter segment length.`,
    );
    this.name = 'SignalTooShortError';
  }
}

/**
 * Welch PSD: Hann (periodic) window, 50% overlap, per-segment mean removal,
 * one-sided density scaling. Segment length is round(segmentSeconds * fs) samples.
 */
export function welch(x: FloatArray, fs: number, opts: WelchOptions = {}): Psd {
  const seconds = opts.segmentSeconds ?? DEFAULT_SEGMENT_SECONDS;
  if (!(fs > 0) || !Number.isFinite(fs)) throw new RangeError(`Sampling rate must be positive (got ${fs})`);
  if (!(seconds >= MIN_SEGMENT_SECONDS && seconds <= MAX_SEGMENT_SECONDS)) {
    throw new RangeError(`Segment length must be ${MIN_SEGMENT_SECONDS}-${MAX_SEGMENT_SECONDS} s (got ${seconds})`);
  }
  const nper = Math.max(2, Math.round(seconds * fs));
  if (x.length < nper) throw new SignalTooShortError(x.length, nper, fs);

  const win = new Float64Array(nper);
  let sumSq = 0;
  for (let i = 0; i < nper; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nper);
    sumSq += win[i] * win[i];
  }
  const scale = 1 / (fs * sumSq);
  const nfreq = Math.floor(nper / 2) + 1;
  const psd = new Float64Array(nfreq);
  const re = new Float64Array(nper);
  const im = new Float64Array(nper);
  const hop = Math.max(1, Math.floor(nper / 2));

  let count = 0;
  for (let start = 0; start + nper <= x.length; start += hop) {
    let mean = 0;
    for (let i = 0; i < nper; i++) mean += x[start + i];
    mean /= nper;
    for (let i = 0; i < nper; i++) re[i] = (x[start + i] - mean) * win[i];
    im.fill(0);
    fft(re, im);
    for (let k = 0; k < nfreq; k++) psd[k] += re[k] * re[k] + im[k] * im[k];
    count++;
  }

  const nyquistBin = nper % 2 === 0 ? nfreq - 1 : -1;
  for (let k = 0; k < nfreq; k++) {
    const oneSided = k === 0 || k === nyquistBin ? 1 : 2;
    psd[k] = (psd[k] * scale * oneSided) / count;
  }
  const freqs = new Float64Array(nfreq);
  for (let k = 0; k < nfreq; k++) freqs[k] = (k * fs) / nper;
  return { freqs, psd };
}
