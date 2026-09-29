/**
 * Pure viewer logic: time<->pixel mapping, clamping, sensitivity steps,
 * robust auto-scale and min/max envelopes. No DOM, no React.
 */

export const WINDOW_MIN = 1
export const WINDOW_MAX = 60
export const DEFAULT_WINDOW = 10
export const STEP_MIN = 0.1
export const STEP_MAX = 3600

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export function clampWindow(w: number): number {
  if (!Number.isFinite(w)) return DEFAULT_WINDOW
  return clamp(w, WINDOW_MIN, WINDOW_MAX)
}

export function clampStep(s: number): number {
  if (!Number.isFinite(s)) return DEFAULT_WINDOW
  return clamp(s, STEP_MIN, STEP_MAX)
}

/** Keep the window inside [0, duration]. A recording shorter than the window pins to 0. */
export function clampStart(start: number, window: number, duration: number): number {
  const max = Math.max(0, duration - window)
  if (!Number.isFinite(start)) return 0
  return clamp(start, 0, max)
}

export const timeToPx = (t: number, start: number, window: number, widthPx: number): number =>
  ((t - start) / window) * widthPx

export const pxToTime = (px: number, start: number, window: number, widthPx: number): number =>
  start + (px / widthPx) * window

/** Scale the window by `factor` keeping the time under `anchorFrac` (0..1 across the view) fixed. */
export function zoomWindow(
  start: number,
  window: number,
  factor: number,
  anchorFrac: number,
  duration: number,
): { start: number; window: number } {
  const w = clampWindow(window * factor)
  const anchorT = start + window * anchorFrac
  return { window: w, start: clampStart(anchorT - w * anchorFrac, w, duration) }
}

// ---- sensitivity (µV per row) -------------------------------------------

export const SENSITIVITY_STEPS: readonly number[] = [
  1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 2000, 5000, 10000,
]
export const DEFAULT_SENSITIVITY = 70

/** Next listed step above (dir=1) or below (dir=-1) `current`; works for unlisted values; saturates. */
export function stepSensitivity(current: number, dir: 1 | -1): number {
  const s = SENSITIVITY_STEPS
  if (dir === 1) {
    for (const v of s) if (v > current + 1e-9) return v
    return s[s.length - 1]
  }
  for (let i = s.length - 1; i >= 0; i--) if (s[i] < current - 1e-9) return s[i]
  return s[0]
}

// ---- auto-scale ---------------------------------------------------------

/** Linear-interpolated percentile (p in 0..100) of `values`. NaN for empty input. */
export function percentile(values: ArrayLike<number>, p: number): number {
  const n = values.length
  if (n === 0) return NaN
  const a = Float64Array.from(values as ArrayLike<number>).sort()
  const pos = (clamp(p, 0, 100) / 100) * (n - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return a[lo] + (a[hi] - a[lo]) * (pos - lo)
}

/**
 * Robust amplitude of a sample range: 95th percentile (default) of |x - mean|.
 * Ignores non-finite samples. NaN if the range is empty.
 */
export function robustAmplitude(data: ArrayLike<number>, i0: number, i1: number, p = 95): number {
  const lo = Math.max(0, Math.floor(i0))
  const hi = Math.min(data.length, Math.ceil(i1))
  let sum = 0
  let n = 0
  for (let i = lo; i < hi; i++) {
    const v = data[i]
    if (Number.isFinite(v)) {
      sum += v
      n++
    }
  }
  if (n === 0) return NaN
  const mean = sum / n
  const dev = new Float64Array(n)
  let k = 0
  for (let i = lo; i < hi; i++) {
    const v = data[i]
    if (Number.isFinite(v)) dev[k++] = Math.abs(v - mean)
  }
  return percentile(dev, p)
}

/**
 * Global µV-per-row from per-channel robust amplitudes (peak, i.e. one-sided).
 * Uses the median across channels so one noisy channel does not dominate, then
 * picks the smallest listed step >= peak-to-peak (2 x amplitude).
 */
export function autoScaleSensitivity(amplitudes: readonly number[]): number | undefined {
  const good = amplitudes.filter((a) => Number.isFinite(a) && a > 0)
  if (good.length === 0) return undefined
  const target = 2 * percentile(good, 50)
  for (const v of SENSITIVITY_STEPS) if (v >= target - 1e-9) return v
  return SENSITIVITY_STEPS[SENSITIVITY_STEPS.length - 1]
}

// ---- envelopes ----------------------------------------------------------

export interface Envelope {
  min: Float32Array
  max: Float32Array
}

/** Sample index (fractional-safe) for time t. */
export const timeToSample = (t: number, fs: number): number => Math.floor(t * fs + 1e-9)

/**
 * Per-pixel-column min/max over a window. Column c covers samples
 * [floor((start + c*dt)*fs), floor((start + (c+1)*dt)*fs)). Columns with no
 * samples (before/after the data, or fewer than one sample per column) are NaN.
 */
export function computeEnvelope(
  data: ArrayLike<number>,
  fs: number,
  start: number,
  window: number,
  columns: number,
): Envelope {
  const min = new Float32Array(columns).fill(NaN)
  const max = new Float32Array(columns).fill(NaN)
  const dt = window / columns
  for (let c = 0; c < columns; c++) {
    const i0 = Math.max(0, timeToSample(start + c * dt, fs))
    const i1 = Math.min(data.length, timeToSample(start + (c + 1) * dt, fs))
    if (i1 <= i0) continue
    let lo = Infinity
    let hi = -Infinity
    for (let i = i0; i < i1; i++) {
      const v = data[i]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    if (lo <= hi) {
      min[c] = lo
      max[c] = hi
    }
  }
  return { min, max }
}

// ---- time text ----------------------------------------------------------

/** Parse "12.5", "m:ss", "h:mm:ss" (seconds may be fractional) into seconds. */
export function parseTime(text: string): number | undefined {
  const s = text.trim()
  if (s === '') return undefined
  const parts = s.split(':')
  if (parts.length > 3) return undefined
  let total = 0
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim()
    if (!/^\d+(\.\d+)?$|^\.\d+$/.test(p)) return undefined
    total = total * 60 + Number(p)
  }
  return total
}

export function formatTime(sec: number, decimals = 0): string {
  const s = Math.max(0, sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const rs = decimals > 0 ? r.toFixed(decimals).padStart(decimals + 3, '0') : String(Math.floor(r)).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rs}` : `${m}:${rs}`
}

// ---- layout -------------------------------------------------------------

export interface RowLayout {
  rowHeight: number
  /** Vertical centre of row i (canvas CSS px). */
  centerY: (i: number) => number
}

/** `rulerHeight` px at the top for the time axis, remaining height split evenly across `rows`. */
export function rowLayout(height: number, rulerHeight: number, rows: number): RowLayout {
  const rowHeight = rows > 0 ? Math.max(0, height - rulerHeight) / rows : 0
  return { rowHeight, centerY: (i) => rulerHeight + rowHeight * (i + 0.5) }
}

/** Smallest 1/2/5 x 10^k that is >= x (x > 0). */
export function niceCeil(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 1
  const e = Math.floor(Math.log10(x))
  const base = 10 ** e
  for (const m of [1, 2, 5, 10]) if (m * base >= x * (1 - 1e-12)) return m * base
  return 10 * base
}

/**
 * Which channels start hidden: non-EEG channels (battery, accelerometer, counter…),
 * unless the file has no EEG channel at all (then show everything).
 */
export function defaultHidden(channels: readonly { isEeg: boolean }[]): boolean[] {
  const anyEeg = channels.some((c) => c.isEeg)
  return channels.map((c) => anyEeg && !c.isEeg)
}
