/**
 * Imperative Canvas 2D renderer for the EEG stack. Stateless apart from a
 * per-array DC-offset cache; React never runs inside the draw path.
 */
import { computeEnvelope, formatTime, rowLayout, timeToPx, timeToSample } from './math'
import type {
  ChannelDataAccessor,
  EegOverlayPainter,
  Trigger,
  ViewChannel,
  ViewColors,
  ViewGeometry,
} from './types'

export const RULER_HEIGHT = 22

export interface EegRenderOptions {
  width: number
  height: number
  dpr: number
  start: number
  window: number
  duration: number
  channels: ViewChannel[]
  /** Recording channel indices to draw, top to bottom. */
  visible: number[]
  getData: ChannelDataAccessor
  /** Global units per row. */
  sensitivity: number
  /** Per-channel units-per-row overrides, keyed by recording channel index. */
  scaleOverrides: ReadonlyMap<number, number>
  triggers: readonly Trigger[]
  showTriggers: boolean
  colors: ViewColors
  overlay?: EegOverlayPainter
}

const dcCache = new WeakMap<object, number>()

/** Mean of the whole channel, subtracted so DC offsets don't push traces off their row. */
export function channelDc(data: ArrayLike<number>): number {
  const key = data as unknown as object
  const hit = dcCache.get(key)
  if (hit !== undefined) return hit
  let sum = 0
  let n = 0
  for (let i = 0; i < data.length; i++) {
    const v = data[i]
    if (Number.isFinite(v)) {
      sum += v
      n++
    }
  }
  const dc = n ? sum / n : 0
  dcCache.set(key, dc)
  return dc
}

const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600]

export function tickInterval(window: number, widthPx: number, minPx = 70): number {
  const want = (window / Math.max(1, widthPx)) * minPx
  return TICK_STEPS.find((s) => s >= want) ?? TICK_STEPS[TICK_STEPS.length - 1]
}

export function makeGeometry(o: EegRenderOptions): ViewGeometry {
  const lay = rowLayout(o.height, RULER_HEIGHT, o.visible.length)
  return {
    width: o.width,
    height: o.height,
    rulerHeight: RULER_HEIGHT,
    rowHeight: lay.rowHeight,
    start: o.start,
    window: o.window,
    duration: o.duration,
    visible: o.visible,
    timeToX: (t) => timeToPx(t, o.start, o.window, o.width),
    xToTime: (x) => o.start + (x / o.width) * o.window,
  }
}

export function drawEeg(ctx: CanvasRenderingContext2D, o: EegRenderOptions): void {
  const { width: W, height: H, colors: c } = o
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0)
  ctx.fillStyle = c.bg
  ctx.fillRect(0, 0, W, H)
  const g = makeGeometry(o)
  const lay = rowLayout(H, RULER_HEIGHT, o.visible.length)
  const x = g.timeToX
  const end = o.start + o.window

  // grid + ruler
  const ti = tickInterval(o.window, W)
  ctx.font = '11px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.strokeStyle = c.grid
  for (let t = Math.ceil(o.start / ti - 1e-9) * ti; t <= end + 1e-9; t += ti) {
    const px = Math.round(x(t)) + 0.5
    ctx.moveTo(px, RULER_HEIGHT)
    ctx.lineTo(px, H)
  }
  ctx.stroke()
  ctx.fillStyle = c.textDim
  for (let t = Math.ceil(o.start / ti - 1e-9) * ti; t <= end + 1e-9; t += ti) {
    ctx.fillText(formatTime(t, ti < 1 ? 1 : 0), x(t) + 3, RULER_HEIGHT / 2)
  }
  ctx.strokeStyle = c.gridStrong
  ctx.beginPath()
  ctx.moveTo(0, RULER_HEIGHT - 0.5)
  ctx.lineTo(W, RULER_HEIGHT - 0.5)
  ctx.stroke()
  // row separators
  ctx.strokeStyle = c.grid
  ctx.beginPath()
  for (let i = 1; i < o.visible.length; i++) {
    const y = Math.round(RULER_HEIGHT + lay.rowHeight * i) + 0.5
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
  }
  ctx.stroke()

  // trigger spans (under traces)
  if (o.showTriggers) {
    ctx.fillStyle = c.triggerSpan
    for (const tr of o.triggers) {
      if (tr.source !== 'annotation' || !tr.duration || tr.duration <= 0) continue
      if (tr.time > end || tr.time + tr.duration < o.start) continue
      const x0 = Math.max(0, x(tr.time))
      const x1 = Math.min(W, x(tr.time + tr.duration))
      ctx.fillRect(x0, RULER_HEIGHT, Math.max(1, x1 - x0), H - RULER_HEIGHT)
    }
  }

  // traces
  ctx.strokeStyle = c.trace
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  for (let row = 0; row < o.visible.length; row++) {
    const ci = o.visible[row]
    const ch = o.channels[ci]
    const data = o.getData(ci)
    if (!ch || !data || data.length === 0) continue
    const sens = o.scaleOverrides.get(ci) ?? o.sensitivity
    const k = lay.rowHeight / sens // px per unit
    const cy = lay.centerY(row)
    const dc = channelDc(data)
    const lim = lay.rowHeight * 1.5
    const yOf = (v: number) => cy - Math.max(-lim, Math.min(lim, (v - dc) * k))
    const fs = ch.samplingRate
    const spp = (o.window * fs) / W
    ctx.beginPath()
    if (spp >= 2) {
      const env = computeEnvelope(data, fs, o.start, o.window, Math.ceil(W))
      let last = NaN
      let pen = false
      for (let col = 0; col < env.min.length; col++) {
        const lo = env.min[col]
        if (Number.isNaN(lo)) {
          pen = false
          continue
        }
        const yHi = yOf(env.max[col]) // smaller y = higher value
        const yLo = yOf(lo)
        const px = col + 0.5
        // enter the column at the end nearest the previous pen position
        const [a, b] = pen && Math.abs(last - yHi) > Math.abs(last - yLo) ? [yLo, yHi] : [yHi, yLo]
        if (pen) ctx.lineTo(px, a)
        else ctx.moveTo(px, a)
        if (b !== a) ctx.lineTo(px, b)
        last = b
        pen = true
      }
    } else {
      const i0 = Math.max(0, timeToSample(o.start, fs) - 1)
      const i1 = Math.min(data.length - 1, timeToSample(end, fs) + 1)
      for (let i = i0; i <= i1; i++) {
        const px = x(i / fs)
        const py = yOf(data[i])
        if (i === i0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
    }
    ctx.stroke()
  }

  // trigger lines + labels
  if (o.showTriggers) {
    ctx.strokeStyle = c.trigger
    ctx.fillStyle = c.trigger
    ctx.textBaseline = 'top'
    let lastLabelEnd = -Infinity
    ctx.beginPath()
    const visibleTriggers = o.triggers.filter((t) => t.time >= o.start && t.time <= end)
    for (const tr of visibleTriggers) {
      const px = Math.round(x(tr.time)) + 0.5
      ctx.moveTo(px, RULER_HEIGHT)
      ctx.lineTo(px, H)
    }
    ctx.stroke()
    for (const tr of visibleTriggers) {
      const px = x(tr.time)
      const label = tr.text
      if (!label || px < lastLabelEnd) continue
      const w = ctx.measureText(label).width
      ctx.fillText(label, px + 3, RULER_HEIGHT + 2)
      lastLabelEnd = px + 3 + w + 6
    }
  }

  o.overlay?.(ctx, g)
}
