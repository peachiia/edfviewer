import { describe, expect, it } from 'vitest'
import {
  autoScaleSensitivity,
  clampStart,
  clampStep,
  clampWindow,
  computeEnvelope,
  formatTime,
  niceCeil,
  parseTime,
  percentile,
  pxToTime,
  rowLayout,
  SENSITIVITY_STEPS,
  stepSensitivity,
  timeToPx,
  zoomWindow,
} from './math'

describe('time <-> pixel mapping', () => {
  it('maps window edges to canvas edges', () => {
    expect(timeToPx(5, 5, 10, 1000)).toBe(0)
    expect(timeToPx(15, 5, 10, 1000)).toBe(1000)
    expect(timeToPx(10, 5, 10, 1000)).toBe(500)
  })
  it('round-trips', () => {
    expect(pxToTime(timeToPx(7.3, 2, 20, 800), 2, 20, 800)).toBeCloseTo(7.3, 9)
  })
})

describe('clamping', () => {
  it('clamps window to 1..60 s', () => {
    expect(clampWindow(0.2)).toBe(1)
    expect(clampWindow(300)).toBe(60)
    expect(clampWindow(10)).toBe(10)
    expect(clampWindow(NaN)).toBe(10)
  })
  it('clamps step to a sane positive range', () => {
    expect(clampStep(0)).toBeGreaterThan(0)
    expect(clampStep(-5)).toBeGreaterThan(0)
    expect(clampStep(5)).toBe(5)
    expect(clampStep(1e9)).toBeLessThanOrEqual(3600)
  })
  it('clamps start so the window stays inside the recording', () => {
    expect(clampStart(-3, 10, 100)).toBe(0)
    expect(clampStart(95, 10, 100)).toBe(90)
    expect(clampStart(40, 10, 100)).toBe(40)
    expect(clampStart(5, 10, 4)).toBe(0) // recording shorter than window
  })
})

describe('zoomWindow', () => {
  it('keeps the anchor time fixed', () => {
    const before = { start: 20, window: 10 }
    const anchorFrac = 0.25
    const anchorT = before.start + before.window * anchorFrac
    const r = zoomWindow(before.start, before.window, 2, anchorFrac, 1000)
    expect(r.window).toBe(20)
    expect(r.start + r.window * anchorFrac).toBeCloseTo(anchorT, 9)
  })
  it('respects window limits and recording bounds', () => {
    expect(zoomWindow(0, 50, 4, 0.5, 1000).window).toBe(60)
    expect(zoomWindow(0, 2, 0.1, 0.5, 1000).window).toBe(1)
    expect(zoomWindow(0, 10, 2, 0.9, 1000).start).toBe(0)
  })
})

describe('sensitivity steps', () => {
  it('is strictly increasing', () => {
    for (let i = 1; i < SENSITIVITY_STEPS.length; i++) {
      expect(SENSITIVITY_STEPS[i]).toBeGreaterThan(SENSITIVITY_STEPS[i - 1])
    }
  })
  it('steps up and down from a listed value', () => {
    expect(stepSensitivity(50, 1)).toBe(70)
    expect(stepSensitivity(50, -1)).toBe(30)
  })
  it('steps from an unlisted value to the next neighbour', () => {
    expect(stepSensitivity(60, 1)).toBe(70)
    expect(stepSensitivity(60, -1)).toBe(50)
  })
  it('saturates at the ends', () => {
    const lo = SENSITIVITY_STEPS[0]
    const hi = SENSITIVITY_STEPS[SENSITIVITY_STEPS.length - 1]
    expect(stepSensitivity(lo, -1)).toBe(lo)
    expect(stepSensitivity(hi, 1)).toBe(hi)
  })
})

describe('percentile and auto-scale', () => {
  it('computes percentiles with interpolation', () => {
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1)
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5)
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3)
    expect(percentile([], 50)).toBeNaN()
  })
  it('is robust to a single huge artifact', () => {
    const v = new Float32Array(1000).map((_, i) => Math.sin(i / 5) * 20)
    v[500] = 1e6
    const p = percentile(Array.from(v, Math.abs), 95)
    expect(p).toBeLessThan(25)
  })
  it('picks a step that fits the typical amplitude across channels', () => {
    // typical peak amplitude ~40 uV -> ~80 uV peak-to-peak -> next step >= 80
    const s = autoScaleSensitivity([40, 38, 42, 900])
    expect(SENSITIVITY_STEPS).toContain(s)
    expect(s).toBeGreaterThanOrEqual(70)
    expect(s).toBeLessThanOrEqual(150)
  })
  it('returns undefined with no usable amplitudes', () => {
    expect(autoScaleSensitivity([])).toBeUndefined()
    expect(autoScaleSensitivity([NaN, 0])).toBeUndefined()
  })
})

describe('computeEnvelope', () => {
  it('gives per-column min and max', () => {
    // fs=10, 4 s window, 4 columns -> 10 samples per column
    const data = new Float32Array(40)
    for (let i = 0; i < 40; i++) data[i] = i
    const { min, max } = computeEnvelope(data, 10, 0, 4, 4)
    expect(Array.from(min)).toEqual([0, 10, 20, 30])
    expect(Array.from(max)).toEqual([9, 19, 29, 39])
  })
  it('honours a non-zero start', () => {
    const data = new Float32Array(40).map((_, i) => i)
    const { min, max } = computeEnvelope(data, 10, 1, 2, 2)
    expect(Array.from(min)).toEqual([10, 20])
    expect(Array.from(max)).toEqual([19, 29])
  })
  it('marks columns outside the data as NaN', () => {
    const data = new Float32Array(20).map((_, i) => i)
    const { min, max } = computeEnvelope(data, 10, 1, 2, 2)
    expect(Array.from(min)).toEqual([10, NaN])
    expect(Array.from(max)).toEqual([19, NaN])
  })
  it('catches a spike inside a column', () => {
    const data = new Float32Array(1000)
    data[503] = 99
    const { max } = computeEnvelope(data, 100, 0, 10, 10)
    expect(max[5]).toBe(99)
  })
})

describe('time parsing/formatting', () => {
  it('parses seconds, m:ss and h:mm:ss', () => {
    expect(parseTime('12.5')).toBe(12.5)
    expect(parseTime('1:30')).toBe(90)
    expect(parseTime('1:02:03')).toBe(3723)
    expect(parseTime(' 2:05.5 ')).toBe(125.5)
  })
  it('rejects garbage', () => {
    expect(parseTime('')).toBeUndefined()
    expect(parseTime('abc')).toBeUndefined()
    expect(parseTime('1:2:3:4')).toBeUndefined()
    expect(parseTime('-4')).toBeUndefined()
  })
  it('formats', () => {
    expect(formatTime(5)).toBe('0:05')
    expect(formatTime(90)).toBe('1:30')
    expect(formatTime(3723)).toBe('1:02:03')
    expect(formatTime(5.5, 1)).toBe('0:05.5')
  })
})

describe('rowLayout', () => {
  it('splits height evenly after the ruler', () => {
    const l = rowLayout(420, 20, 4)
    expect(l.rowHeight).toBe(100)
    expect(l.centerY(0)).toBe(70)
    expect(l.centerY(3)).toBe(370)
  })
  it('handles zero rows', () => {
    expect(rowLayout(200, 20, 0).rowHeight).toBe(0)
  })
})

describe('niceCeil', () => {
  it('rounds up to 1/2/5 x 10^k', () => {
    expect(niceCeil(0.7)).toBe(1)
    expect(niceCeil(1.2)).toBe(2)
    expect(niceCeil(3)).toBe(5)
    expect(niceCeil(5)).toBe(5)
    expect(niceCeil(6)).toBe(10)
    expect(niceCeil(0.03)).toBeCloseTo(0.05, 12)
    expect(niceCeil(120)).toBe(200)
  })
})
