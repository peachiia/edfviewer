import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EegOverlayPainter, MinimapOverlayPainter, ViewGeometry } from '../viewer/types'
import {
  autoScrollDelta,
  createZone,
  hitTest,
  moveEdge,
  setBound as setBoundLogic,
  type Zone,
  type ZoneEdge,
  type ZoneId,
  type Zones,
} from './zoneLogic'

export const ZONE_COLORS: Record<ZoneId, string> = { A: '#3ea6ff', B: '#ff6fa8' }

const GRAB_PX = 6
const DRAG_START_PX = 3

export interface ZoneState {
  zones: Zones
  /** Slot that a plain drag on the EEG view creates (Shift-drag always makes B). */
  armed: ZoneId
  setArmed: (id: ZoneId) => void
  clear: (id: ZoneId) => void
  setBound: (id: ZoneId, edge: ZoneEdge, value: number) => void
  /** Pass to Viewer `eegOverlay` (also installs the drag handlers on the EEG canvas). */
  eegOverlay: EegOverlayPainter
  /** Pass to Viewer `minimapOverlay`. */
  minimapOverlay: MinimapOverlayPainter
  /** Pass to Viewer `overlayKey`. */
  overlayKey: unknown
}

type Drag =
  | { kind: 'create'; id: ZoneId; anchor: number; x0: number; active: boolean }
  | { kind: 'edge'; id: ZoneId; edge: ZoneEdge }

export function useZones(duration: number): ZoneState {
  const [zones, setZones] = useState<Zones>({ A: null, B: null })
  const [armed, setArmed] = useState<ZoneId>('A')

  const latest = useRef({ zones, armed, duration })
  latest.current = { zones, armed, duration }
  const geo = useRef<ViewGeometry | null>(null)
  const attached = useRef(new Map<HTMLCanvasElement, () => void>())

  const put = useCallback((id: ZoneId, z: Zone | null) => {
    setZones((prev) => {
      const next = { ...prev, [id]: z }
      latest.current.zones = next
      return next
    })
  }, [])

  const clear = useCallback((id: ZoneId) => put(id, null), [put])
  const setBound = useCallback(
    (id: ZoneId, edge: ZoneEdge, value: number) => {
      const z = latest.current.zones[id]
      if (z) put(id, setBoundLogic(z, edge, value, latest.current.duration))
    },
    [put],
  )

  // Pointer handling lives on the EEG canvas, which the Viewer owns. The painter
  // hands us the canvas (ctx.canvas) on its first call; we attach once per canvas.
  const attach = useRef((canvas: HTMLCanvasElement) => {
    let drag: Drag | null = null
    const toX = (e: PointerEvent) => e.clientX - canvas.getBoundingClientRect().left
    // finite even if the view has no width; pointer capture keeps events flowing past the edge
    const timeAt = (e: PointerEvent) => {
      const t = geo.current ? geo.current.xToTime(toX(e)) : 0
      return Number.isFinite(t) ? t : 0
    }
    const tolSec = () => (GRAB_PX * geo.current!.window) / Math.max(1, geo.current!.width)

    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !geo.current) return
      const t = timeAt(e)
      const { zones: zs, armed: arm } = latest.current
      const hit = hitTest(zs, t, tolSec())
      if (hit && hit.part !== 'body') {
        drag = { kind: 'edge', id: hit.id, edge: hit.part }
      } else {
        drag = { kind: 'create', id: e.shiftKey ? 'B' : arm, anchor: t, x0: toX(e), active: false }
      }
      lastX = toX(e)
      canvas.setPointerCapture(e.pointerId)
      e.preventDefault()
    }
    // Update the dragged zone from the last pointer x and the current view.
    let lastX = 0
    const update = () => {
      if (!drag || !geo.current) return
      const t = geo.current.xToTime(lastX)
      if (!Number.isFinite(t)) return
      const dur = latest.current.duration
      if (drag.kind === 'edge') {
        const z = latest.current.zones[drag.id]
        if (z) put(drag.id, moveEdge(z, drag.edge, t, dur))
      } else {
        if (!drag.active && Math.abs(lastX - drag.x0) < DRAG_START_PX) return
        drag.active = true
        const z = createZone(drag.anchor, t, dur)
        if (z) put(drag.id, z)
      }
    }
    // While the pointer is near/past a view edge, pan every frame (pointer capture
    // keeps pointermove flowing outside the canvas; this loop keeps panning when it is still).
    let raf = 0
    let lastTs = 0
    const tick = (ts: number) => {
      raf = 0
      if (!drag || !geo.current) return
      const d = autoScrollDelta(lastX, geo.current.width, geo.current.window, (ts - lastTs) / 1000)
      lastTs = ts
      if (d !== 0 && drag && (drag.kind === 'edge' || drag.active)) geo.current.panBy?.(d)
      update()
      raf = requestAnimationFrame(tick)
    }
    const startLoop = () => {
      if (raf) return
      lastTs = performance.now()
      raf = requestAnimationFrame(tick)
    }
    const stopLoop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    const move = (e: PointerEvent) => {
      if (!geo.current) return
      if (!drag) {
        const hit = hitTest(latest.current.zones, timeAt(e), tolSec())
        canvas.style.cursor = hit && hit.part !== 'body' ? 'ew-resize' : 'crosshair'
        return
      }
      lastX = toX(e)
      update()
      startLoop()
    }
    const up = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
      drag = null
      stopLoop()
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.style.cursor = 'crosshair'
    return () => {
      stopLoop()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.style.cursor = ''
    }
  })

  useEffect(() => {
    const map = attached.current
    return () => {
      map.forEach((off) => off())
      map.clear()
    }
  }, [])

  const eegOverlay = useMemo<EegOverlayPainter>(
    () => (ctx, g) => {
      geo.current = g
      const canvas = ctx.canvas
      if (!attached.current.has(canvas)) attached.current.set(canvas, attach.current(canvas))
      const zs = latest.current.zones
      for (const id of ['A', 'B'] as const) {
        const z = zs[id]
        if (!z) continue
        const x0 = g.timeToX(z.start)
        const x1 = g.timeToX(z.end)
        if (x1 < 0 || x0 > g.width) continue
        const color = ZONE_COLORS[id]
        ctx.save()
        ctx.globalAlpha = 0.16
        ctx.fillStyle = color
        ctx.fillRect(x0, g.rulerHeight, x1 - x0, g.height - g.rulerHeight)
        ctx.globalAlpha = 1
        ctx.fillStyle = color
        ctx.fillRect(x0, 0, x1 - x0, 3)
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.beginPath()
        for (const x of [x0, x1]) {
          if (x < 0 || x > g.width) continue
          ctx.moveTo(x, 0)
          ctx.lineTo(x, g.height)
        }
        ctx.stroke()
        ctx.font = 'bold 12px system-ui, sans-serif'
        ctx.textBaseline = 'top'
        ctx.fillText(id, Math.max(x0, 0) + 5, 5)
        ctx.restore()
      }
    },
    [],
  )

  const minimapOverlay = useMemo<MinimapOverlayPainter>(
    () => (ctx, g) => {
      const zs = latest.current.zones
      for (const id of ['A', 'B'] as const) {
        const z = zs[id]
        if (!z) continue
        const x0 = g.timeToX(z.start)
        const x1 = g.timeToX(z.end)
        ctx.save()
        ctx.fillStyle = ZONE_COLORS[id]
        ctx.globalAlpha = 0.45
        ctx.fillRect(x0, 0, Math.max(2, x1 - x0), g.height)
        ctx.restore()
      }
    },
    [],
  )

  return { zones, armed, setArmed, clear, setBound, eegOverlay, minimapOverlay, overlayKey: zones }
}
