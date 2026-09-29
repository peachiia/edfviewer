/** Pure zone logic: no React, no DOM. Times are seconds from recording start. */

export type ZoneId = 'A' | 'B'
export interface Zone {
  start: number
  end: number
}
export type Zones = Record<ZoneId, Zone | null>
export type ZoneEdge = 'start' | 'end'
export interface ZoneHit {
  id: ZoneId
  part: ZoneEdge | 'body'
}

/** Zones shorter than this get a warning (not blocked). */
export const MIN_ZONE_SECONDS = 2
/** Smallest gap kept between the two edges while dragging. */
export const EDGE_EPSILON = 0.01

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function normalizeZone(a: number, b: number, duration: number): Zone {
  const lo = clamp(Math.min(a, b), 0, duration)
  const hi = clamp(Math.max(a, b), 0, duration)
  return { start: lo, end: hi }
}

/** Zone from a drag anchor and current time; null when it has no length. */
export function createZone(anchor: number, current: number, duration: number): Zone | null {
  const z = normalizeZone(anchor, current, duration)
  return z.end > z.start ? z : null
}

export const zoneLength = (z: Zone) => z.end - z.start
export const isTooShort = (z: Zone) => zoneLength(z) < MIN_ZONE_SECONDS

/** Move one edge to t; clamps to the recording and never crosses the other edge. */
export function moveEdge(z: Zone, edge: ZoneEdge, t: number, duration: number): Zone {
  if (edge === 'start') return { start: clamp(t, 0, Math.max(0, z.end - EDGE_EPSILON)), end: z.end }
  return { start: z.start, end: clamp(t, Math.min(duration, z.start + EDGE_EPSILON), duration) }
}

/** Numeric-field edit: ignores non-finite input (returns the same object). */
export function setBound(z: Zone, edge: ZoneEdge, value: number, duration: number): Zone {
  if (!Number.isFinite(value)) return z
  return moveEdge(z, edge, value, duration)
}

/**
 * Which zone part is under time t. `tolSec` is the edge grab tolerance in
 * seconds (caller converts from pixels). Edges beat bodies; the nearest edge wins.
 */
export function hitTest(zones: Zones, t: number, tolSec: number): ZoneHit | null {
  let best: { hit: ZoneHit; d: number } | null = null
  for (const id of ['A', 'B'] as const) {
    const z = zones[id]
    if (!z) continue
    for (const part of ['start', 'end'] as const) {
      const d = Math.abs(t - z[part])
      if (d <= tolSec && (!best || d < best.d)) best = { hit: { id, part }, d }
    }
  }
  if (best) return best.hit
  for (const id of ['A', 'B'] as const) {
    const z = zones[id]
    if (z && t >= z.start && t <= z.end) return { id, part: 'body' }
  }
  return null
}

/** Pointer this close to a view edge (px) starts auto-scrolling during a zone drag. */
export const AUTOSCROLL_MARGIN_PX = 28
/** Distance beyond the margin (px) at which auto-scroll reaches full speed. */
const AUTOSCROLL_RAMP_PX = 80
/** Full speed, in windows per second. */
const AUTOSCROLL_WINDOWS_PER_SEC = 0.6

/**
 * Seconds to pan the view this frame while dragging a zone: 0 when the pointer is
 * comfortably inside, negative near/past the left edge, positive near/past the right.
 * Speed ramps with how far the pointer is into the margin or beyond the edge.
 */
export function autoScrollDelta(x: number, width: number, windowSec: number, dtSec: number): number {
  if (!(width > 0) || !(windowSec > 0) || !(dtSec > 0) || !Number.isFinite(x)) return 0
  const margin = Math.min(AUTOSCROLL_MARGIN_PX, width / 3)
  let depth = 0
  if (x < margin) depth = -(margin - x)
  else if (x > width - margin) depth = x - (width - margin)
  if (depth === 0) return 0
  const intensity = Math.min(1, Math.abs(depth) / AUTOSCROLL_RAMP_PX)
  // dt is capped so a stalled frame cannot jump the view
  return Math.sign(depth) * intensity * AUTOSCROLL_WINDOWS_PER_SEC * windowSec * Math.min(dtSec, 0.1)
}

/**
 * The zone a trigger implies: its own duration when it has one, otherwise from it to the
 * next trigger of ANY kind (strictly later in time), otherwise to the end of the recording.
 * `trim` seconds are then cut from both ends (to skip settling time after a state change).
 * Returns null for a bad index or when nothing is left after trimming.
 */
export function zoneFromTrigger(
  triggers: readonly { time: number; duration?: number }[],
  index: number,
  duration: number,
  trim = 0,
): Zone | null {
  const trig = triggers[index]
  if (!trig || !Number.isFinite(trig.time)) return null
  let end = duration
  if (trig.duration && trig.duration > 0) {
    end = trig.time + trig.duration
  } else {
    const next = triggers.find((t, i) => i > index && t.time > trig.time)
    if (next) end = next.time
  }
  const cut = Math.max(0, Number.isFinite(trim) ? trim : 0)
  const z = normalizeZone(trig.time + cut, end - cut, duration)
  return end - cut > trig.time + cut && z.end > z.start ? z : null
}
