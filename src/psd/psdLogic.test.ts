import { describe, expect, it } from 'vitest'
import { computeZonePsd, prepareSeries, sampleRange, sharedYRange, yRangeOf } from './psdLogic'

describe('sampleRange', () => {
  it('maps seconds to indices per sampling rate', () => {
    expect(sampleRange(2, 6, 250, 10000)).toEqual([500, 1500])
    expect(sampleRange(2, 6, 512, 100000)).toEqual([1024, 3072])
  })
  it('clamps to the array length', () => {
    expect(sampleRange(8, 20, 100, 1000)).toEqual([800, 1000])
    expect(sampleRange(-3, 1, 100, 1000)).toEqual([0, 100])
  })
})

describe('prepareSeries', () => {
  const freqs = Float64Array.from([0, 1, 2, 3, 4, 5])
  const psd = Float64Array.from([9, 8, 7, 6, 5, 4])
  it('clips to the frequency range', () => {
    const s = prepareSeries({ freqs, psd }, 1, 4, false)
    expect(Array.from(s.freqs)).toEqual([1, 2, 3, 4])
    expect(s.values).toEqual([8, 7, 6, 5])
  })
  it('replaces non-positive values with null for log scale', () => {
    const s = prepareSeries({ freqs, psd: Float64Array.from([0, 1, 1, 1, 1, 1]) }, 0, 5, true)
    expect(s.values[0]).toBeNull()
    expect(s.values[1]).toBe(1)
  })
  it('handles fmax beyond Nyquist', () => {
    expect(prepareSeries({ freqs, psd }, 0, 999, false).freqs.length).toBe(6)
  })
})

describe('y ranges', () => {
  it('yRangeOf finds min/max ignoring nulls', () => {
    expect(yRangeOf([[3, null, 1, 7]], false)).toEqual([1, 7])
  })
  it('log scale ignores non-positive and snaps outward', () => {
    const [lo, hi] = yRangeOf([[0, 0.5, 20]], true)!
    expect(lo).toBeLessThanOrEqual(0.5)
    expect(hi).toBeGreaterThanOrEqual(20)
    expect(lo).toBeGreaterThan(0)
  })
  it('returns null with no data', () => {
    expect(yRangeOf([[null]], false)).toBeNull()
  })
  it('sharedYRange unions both series', () => {
    expect(sharedYRange([[1, 2]], [[5, 9]], false)).toEqual([1, 9])
    expect(sharedYRange(null, [[5, 9]], false)).toEqual([5, 9])
    expect(sharedYRange(null, null, false)).toBeNull()
  })
})

describe('computeZonePsd', () => {
  const fs = 100
  const x = new Float32Array(fs * 60)
  for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * 10 * i) / fs)
  const get = async () => x

  it('computes a PSD peaking at the tone from the zone slice', async () => {
    const r = await computeZonePsd(get, 0, { start: 10, end: 30 }, fs, 4)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    let k = 0
    for (let i = 0; i < r.psd.psd.length; i++) if (r.psd.psd[i] > r.psd.psd[k]) k = i
    expect(r.psd.freqs[k]).toBeCloseTo(10, 0)
    expect(r.bands.total).toBeGreaterThan(0)
  })
  it('reports too-short zones as a readable message', async () => {
    const r = await computeZonePsd(get, 0, { start: 10, end: 12 }, fs, 4)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/too short/i)
  })
  it('reports getter failures', async () => {
    const r = await computeZonePsd(async () => Promise.reject(new Error('boom')), 0, { start: 0, end: 10 }, fs, 4)
    expect(r).toEqual({ ok: false, error: 'boom' })
  })
})
