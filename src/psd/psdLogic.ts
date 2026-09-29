/** Pure PSD preparation: slicing, series prep, y-range sharing, zone PSD compute. */
import { SignalTooShortError, bandPower, welch, type BandPowers, type Psd } from '../dsp'
import type { Zone } from '../zones/zoneLogic'

export type FilteredGetter = (channel: number) => Promise<Float32Array | Float64Array>

/** [i0, i1) sample indices for the time span at this channel's sampling rate. */
export function sampleRange(start: number, end: number, fs: number, length: number): [number, number] {
  const i0 = Math.min(length, Math.max(0, Math.round(start * fs)))
  const i1 = Math.min(length, Math.max(i0, Math.round(end * fs)))
  return [i0, i1]
}

export interface Series {
  freqs: Float64Array
  values: (number | null)[]
}

/** Clip a PSD to [fmin, fmax] Hz; on log scale, non-positive values become null (gaps). */
export function prepareSeries(p: Psd, fmin: number, fmax: number, log: boolean): Series {
  const f: number[] = []
  const v: (number | null)[] = []
  for (let i = 0; i < p.freqs.length; i++) {
    if (p.freqs[i] < fmin || p.freqs[i] > fmax) continue
    f.push(p.freqs[i])
    v.push(log && !(p.psd[i] > 0) ? null : p.psd[i])
  }
  return { freqs: Float64Array.from(f), values: v }
}

/** [min, max] over the value arrays; log mode ignores <= 0 and snaps outward to a tidy bound. */
export function yRangeOf(arrays: (number | null)[][], log: boolean): [number, number] | null {
  let lo = Infinity
  let hi = -Infinity
  for (const a of arrays)
    for (const v of a) {
      if (v == null || !Number.isFinite(v) || (log && v <= 0)) continue
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  if (!(hi >= lo)) return null
  if (log) return [Math.pow(10, Math.floor(Math.log10(lo) * 4) / 4), Math.pow(10, Math.ceil(Math.log10(hi) * 4) / 4)]
  return [lo, hi]
}

/** Union of the A and B ranges (either may be missing). */
export function sharedYRange(
  a: (number | null)[][] | null,
  b: (number | null)[][] | null,
  log: boolean,
): [number, number] | null {
  return yRangeOf([...(a ?? []), ...(b ?? [])], log)
}

export type ZonePsdResult =
  | { ok: true; psd: Psd; bands: BandPowers; fs: number }
  | { ok: false; error: string }

/** PSD of the zone slice of a filtered channel. Never throws for expected failures. */
export async function computeZonePsd(
  getFiltered: FilteredGetter,
  channel: number,
  zone: Zone,
  fs: number,
  segmentSeconds: number,
): Promise<ZonePsdResult> {
  try {
    const data = await getFiltered(channel)
    const [i0, i1] = sampleRange(zone.start, zone.end, fs, data.length)
    const psd = welch(data.subarray(i0, i1), fs, { segmentSeconds })
    return { ok: true, psd, bands: bandPower(psd), fs }
  } catch (e) {
    if (e instanceof SignalTooShortError) return { ok: false, error: e.message }
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
