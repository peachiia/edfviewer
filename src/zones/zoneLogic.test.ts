import { describe, expect, it } from 'vitest'
import {
  AUTOSCROLL_MARGIN_PX,
  MIN_ZONE_SECONDS,
  autoScrollDelta,
  createZone,
  hitTest,
  isTooShort,
  moveEdge,
  normalizeZone,
  setBound,
  zoneFromTrigger,
} from './zoneLogic'

const D = 100

describe('normalizeZone', () => {
  it('orders and clamps to the recording', () => {
    expect(normalizeZone(50, 10, D)).toEqual({ start: 10, end: 50 })
    expect(normalizeZone(-5, 200, D)).toEqual({ start: 0, end: D })
  })
})

describe('createZone', () => {
  it('builds from drag anchor and current time in either direction', () => {
    expect(createZone(20, 30, D)).toEqual({ start: 20, end: 30 })
    expect(createZone(30, 20, D)).toEqual({ start: 20, end: 30 })
  })
  it('returns null for a zero-length drag', () => {
    expect(createZone(20, 20, D)).toBeNull()
  })
  it('clamps beyond the ends', () => {
    expect(createZone(90, 150, D)).toEqual({ start: 90, end: D })
  })
})

describe('dragging past the recording edges', () => {
  it('clamps a create-drag beyond either end', () => {
    expect(createZone(5, 500, 60)).toEqual({ start: 5, end: 60 })
    expect(createZone(5, -30, 60)).toEqual({ start: 0, end: 5 })
    expect(createZone(-10, 70, 60)).toEqual({ start: 0, end: 60 })
  })
  it('a drag entirely outside the recording yields no zone instead of throwing', () => {
    expect(createZone(80, 90, 60)).toBeNull()
  })
})

describe('isTooShort', () => {
  it('flags zones under the minimum', () => {
    expect(isTooShort({ start: 0, end: MIN_ZONE_SECONDS - 0.1 })).toBe(true)
    expect(isTooShort({ start: 0, end: MIN_ZONE_SECONDS })).toBe(false)
  })
})

describe('moveEdge', () => {
  const z = { start: 20, end: 40 }
  it('moves the chosen edge', () => {
    expect(moveEdge(z, 'start', 25, D)).toEqual({ start: 25, end: 40 })
    expect(moveEdge(z, 'end', 60, D)).toEqual({ start: 20, end: 60 })
  })
  it('clamps to the recording', () => {
    expect(moveEdge(z, 'start', -3, D).start).toBe(0)
    expect(moveEdge(z, 'end', 500, D).end).toBe(D)
  })
  it('never crosses the opposite edge', () => {
    const a = moveEdge(z, 'start', 70, D)
    expect(a.start).toBeLessThan(a.end)
    expect(a.end).toBe(40)
    const b = moveEdge(z, 'end', 5, D)
    expect(b.end).toBeGreaterThan(b.start)
    expect(b.start).toBe(20)
  })
})

describe('setBound', () => {
  const z = { start: 20, end: 40 }
  it('applies a valid number', () => {
    expect(setBound(z, 'end', 55, D)).toEqual({ start: 20, end: 55 })
  })
  it('ignores NaN by returning the zone unchanged', () => {
    expect(setBound(z, 'end', NaN, D)).toBe(z)
  })
})

describe('hitTest', () => {
  const zones = { A: { start: 20, end: 40 }, B: { start: 60, end: 80 } }
  it('hits edges within tolerance', () => {
    expect(hitTest(zones, 20.3, 0.5)).toEqual({ id: 'A', part: 'start' })
    expect(hitTest(zones, 79.8, 0.5)).toEqual({ id: 'B', part: 'end' })
  })
  it('hits body when not near an edge', () => {
    expect(hitTest(zones, 30, 0.5)).toEqual({ id: 'A', part: 'body' })
  })
  it('misses empty space and null zones', () => {
    expect(hitTest(zones, 50, 0.5)).toBeNull()
    expect(hitTest({ A: null, B: null }, 50, 0.5)).toBeNull()
  })
  it('prefers the nearer edge when both are in tolerance', () => {
    const z2 = { A: { start: 10, end: 20 }, B: { start: 20.2, end: 30 } }
    expect(hitTest(z2, 20.15, 0.5)).toEqual({ id: 'B', part: 'start' })
  })
})

describe('autoScrollDelta', () => {
  const W = 800
  it('is 0 while the pointer is comfortably inside', () => {
    expect(autoScrollDelta(400, W, 10, 1 / 60)).toBe(0)
    expect(autoScrollDelta(AUTOSCROLL_MARGIN_PX + 1, W, 10, 1 / 60)).toBe(0)
  })
  it('pans left near/past the left edge and right near/past the right edge', () => {
    expect(autoScrollDelta(5, W, 10, 1 / 60)).toBeLessThan(0)
    expect(autoScrollDelta(-200, W, 10, 1 / 60)).toBeLessThan(0)
    expect(autoScrollDelta(W - 5, W, 10, 1 / 60)).toBeGreaterThan(0)
    expect(autoScrollDelta(W + 200, W, 10, 1 / 60)).toBeGreaterThan(0)
  })
  it('speeds up the further the pointer is out, and caps', () => {
    const near = autoScrollDelta(W - 10, W, 10, 1 / 60)
    const far = autoScrollDelta(W + 60, W, 10, 1 / 60)
    const farther = autoScrollDelta(W + 600, W, 10, 1 / 60)
    expect(far).toBeGreaterThan(near)
    expect(farther).toBeCloseTo(autoScrollDelta(W + 6000, W, 10, 1 / 60), 10)
  })
  it('scales with the window length and ignores bad input', () => {
    expect(autoScrollDelta(W + 200, W, 20, 1 / 60)).toBeCloseTo(2 * autoScrollDelta(W + 200, W, 10, 1 / 60), 10)
    expect(autoScrollDelta(NaN, W, 10, 1 / 60)).toBe(0)
    expect(autoScrollDelta(W + 200, 0, 10, 1 / 60)).toBe(0)
    expect(autoScrollDelta(W + 200, W, 10, 0)).toBe(0)
  })
  it('caps a stalled frame', () => {
    expect(autoScrollDelta(W + 200, W, 10, 5)).toBeCloseTo(autoScrollDelta(W + 200, W, 10, 0.1), 10)
  })
})

describe('zoneFromTrigger', () => {
  const trigs = [{ time: 10 }, { time: 40 }, { time: 40 }, { time: 70 }]
  it('runs from the trigger to the next trigger of any kind', () => {
    expect(zoneFromTrigger(trigs, 0, D)).toEqual({ start: 10, end: 40 })
  })
  it('skips triggers at the same time', () => {
    expect(zoneFromTrigger(trigs, 1, D)).toEqual({ start: 40, end: 70 })
  })
  it('runs to the end of the recording for the last trigger', () => {
    expect(zoneFromTrigger(trigs, 3, D)).toEqual({ start: 70, end: D })
  })
  it('uses the trigger duration when it has one', () => {
    expect(zoneFromTrigger([{ time: 5, duration: 12 }, { time: 8 }], 0, D)).toEqual({ start: 5, end: 17 })
  })
  it('ignores a zero duration', () => {
    expect(zoneFromTrigger([{ time: 5, duration: 0 }, { time: 8 }], 0, D)).toEqual({ start: 5, end: 8 })
  })
  it('clamps a duration that runs past the recording', () => {
    expect(zoneFromTrigger([{ time: 95, duration: 30 }], 0, D)).toEqual({ start: 95, end: D })
  })
  it('trims both ends', () => {
    expect(zoneFromTrigger(trigs, 0, D, 2)).toEqual({ start: 12, end: 38 })
  })
  it('returns null when trimming leaves nothing, or for a bad index', () => {
    expect(zoneFromTrigger(trigs, 0, D, 15)).toBeNull()
    expect(zoneFromTrigger(trigs, 9, D)).toBeNull()
    expect(zoneFromTrigger([], 0, D)).toBeNull()
  })
  it('treats a negative or NaN trim as 0', () => {
    expect(zoneFromTrigger(trigs, 0, D, -5)).toEqual({ start: 10, end: 40 })
    expect(zoneFromTrigger(trigs, 0, D, NaN)).toEqual({ start: 10, end: 40 })
  })
  it('returns null for a trigger at the very end', () => {
    expect(zoneFromTrigger([{ time: D }], 0, D)).toBeNull()
  })
})
