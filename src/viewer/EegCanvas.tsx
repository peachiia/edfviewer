import { useEffect, useRef } from 'react'
import { drawEeg, type EegRenderOptions } from './renderer'
import type { ViewColors } from './types'

export type EegCanvasProps = Omit<EegRenderOptions, 'width' | 'height' | 'dpr' | 'colors'> & {
  /** Bump to force a repaint when external state (e.g. theme, overlay contents) changed. */
  repaintKey?: unknown
  /** Pan by dt seconds (positive = later). */
  onPan: (dt: number) => void
  /** Zoom by factor keeping anchorFrac (0..1 across the view) fixed. */
  onZoom: (factor: number, anchorFrac: number) => void
}

export function readColors(el: HTMLElement): ViewColors {
  const cs = getComputedStyle(el)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  return {
    bg: v('--plot-bg'),
    grid: v('--plot-grid'),
    gridStrong: v('--plot-grid-strong'),
    text: v('--text'),
    textDim: v('--text-dim'),
    trace: v('--trace'),
    accent: v('--accent'),
    trigger: v('--trigger'),
    triggerSpan: v('--trigger-span'),
  }
}

/**
 * Owns the <canvas>. React only passes props; drawing is imperative and
 * scheduled with requestAnimationFrame, coalescing bursts of updates.
 */
export function EegCanvas(props: EegCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const rafRef = useRef(0)
  const sizeRef = useRef({ w: 0, h: 0 })

  const schedule = useRef(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      if (!canvas || !wrap) return
      const { w, h } = sizeRef.current
      if (w < 2 || h < 2) return
      const dpr = window.devicePixelRatio || 1
      const pw = Math.round(w * dpr)
      const ph = Math.round(h * dpr)
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw
        canvas.height = ph
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { onPan: _p, onZoom: _z, repaintKey: _k, ...rest } = propsRef.current
      void _p
      void _z
      void _k
      drawEeg(ctx, { ...rest, width: w, height: h, dpr, colors: readColors(wrap) })
    })
  })

  // resize
  useEffect(() => {
    const wrap = wrapRef.current!
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      sizeRef.current = { w: r.width, h: r.height }
      schedule.current()
    })
    ro.observe(wrap)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [])

  // repaint whenever props change
  useEffect(() => {
    schedule.current()
  })

  // wheel: pan, Ctrl+wheel zoom (native listener so preventDefault works)
  useEffect(() => {
    const el = canvasRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { w } = sizeRef.current
      if (w < 2) return
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? sizeRef.current.h : 1
      const p = propsRef.current
      if (e.ctrlKey) {
        const rect = el.getBoundingClientRect()
        const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        // deltaY > 0 = zoom out (longer window)
        p.onZoom(Math.exp((e.deltaY * unit) / 300), frac)
      } else {
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        p.onPan(((d * unit) / w) * propsRef.current.window)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className="eeg-canvas-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="eeg-canvas" />
    </div>
  )
}
