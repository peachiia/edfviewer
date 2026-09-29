import { useEffect, useRef } from 'react'
import { readColors } from './EegCanvas'
import { clamp, timeToPx } from './math'
import type { MinimapOverlayPainter, Trigger } from './types'

interface Props {
  duration: number
  start: number
  window: number
  triggers: readonly Trigger[]
  showTriggers: boolean
  /** Seek so that the window is centred on time t. */
  onSeek: (centerTime: number) => void
  /** EXTENSION POINT (zones): painted over the overview (zone bands). */
  overlay?: MinimapOverlayPainter
  repaintKey?: unknown
}

export function Minimap({ duration, start, window: win, triggers, showTriggers, onSeek, overlay, repaintKey }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = useRef({ w: 0, h: 0 })
  const raf = useRef(0)
  const latest = useRef({ duration, start, win, triggers, showTriggers, overlay })
  latest.current = { duration, start, win, triggers, showTriggers, overlay }

  const draw = useRef(() => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      const { w, h } = size.current
      if (!canvas || !wrap || w < 2 || h < 2) return
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const c = readColors(wrap)
      const L = latest.current
      const x = (t: number) => timeToPx(t, 0, Math.max(L.duration, 1e-9), w)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = c.bg
      ctx.fillRect(0, 0, w, h)
      L.overlay?.(ctx, { width: w, height: h, duration: L.duration, timeToX: x })
      if (L.showTriggers) {
        ctx.strokeStyle = c.trigger
        ctx.beginPath()
        for (const t of L.triggers) {
          const px = Math.round(x(t.time)) + 0.5
          ctx.moveTo(px, 2)
          ctx.lineTo(px, h - 2)
        }
        ctx.stroke()
      }
      const x0 = x(L.start)
      const x1 = x(Math.min(L.duration, L.start + L.win))
      ctx.fillStyle = c.accent
      ctx.globalAlpha = 0.25
      ctx.fillRect(x0, 0, Math.max(2, x1 - x0), h)
      ctx.globalAlpha = 1
      ctx.strokeStyle = c.accent
      ctx.lineWidth = 1.5
      ctx.strokeRect(x0 + 0.75, 0.75, Math.max(2, x1 - x0) - 1.5, h - 1.5)
      ctx.lineWidth = 1
    })
  })

  useEffect(() => {
    const ro = new ResizeObserver((e) => {
      const r = e[0].contentRect
      size.current = { w: r.width, h: r.height }
      draw.current()
    })
    ro.observe(wrapRef.current!)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf.current)
      raf.current = 0
    }
  }, [])
  useEffect(() => {
    draw.current()
  })
  void repaintKey

  const seekFromEvent = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const frac = clamp((e.clientX - rect.left) / rect.width, 0, 1)
    onSeek(frac * duration)
  }

  return (
    <div className="minimap" ref={wrapRef} title="Click or drag to move through the recording">
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          seekFromEvent(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) seekFromEvent(e)
        }}
      />
    </div>
  )
}
