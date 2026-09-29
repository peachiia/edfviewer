import { useEffect, useRef, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { BANDS, BAND_NAMES } from '../dsp'
import { yRangeOf } from './psdLogic'

export interface ChartSeries {
  label: string
  color: string
  values: (number | null)[]
}

interface Props {
  title: string
  freqs: Float64Array
  series: ChartSeries[]
  fmin: number
  fmax: number
  log: boolean
  /** Fixed y range (shared A/B scale). Null = fit own data. */
  yRange: [number, number] | null
  /** Re-create when the theme changes. */
  theme: string
}

const SYMBOL: Record<string, string> = { delta: 'δ', theta: 'θ', alpha: 'α', beta: 'β' }

function fmtY(v: number): string {
  if (v === 0) return '0'
  const a = Math.abs(v)
  return a >= 1e4 || a < 1e-2 ? v.toExponential(0) : String(+v.toPrecision(3))
}

export function PsdChart({ title, freqs, series, fmin, fmax, log, yRange, theme }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = wrapRef.current!
    const ro = new ResizeObserver((e) => {
      const r = e[0].contentRect
      setSize({ w: Math.floor(r.width), h: Math.floor(r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = wrapRef.current!
    if (size.w < 40 || size.h < 40 || freqs.length === 0) return
    const cs = getComputedStyle(el)
    const text = cs.getPropertyValue('--text-dim').trim() || '#888'
    const grid = cs.getPropertyValue('--plot-grid').trim() || 'rgba(128,128,128,.2)'

    const range = yRange ?? yRangeOf(series.map((s) => s.values), log)
    const [ylo, yhi] = range ?? (log ? [1e-3, 1] : [0, 1])
    const scaleY: uPlot.Scale = log
      ? { distr: 3, range: () => [ylo, yhi] }
      : { range: () => [Math.min(0, ylo), yhi * 1.05] }

    const opts: uPlot.Options = {
      width: size.w,
      height: size.h,
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { show: false } },
      scales: { x: { time: false, range: () => [fmin, fmax] }, y: scaleY },
      axes: [
        { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid }, label: 'Hz', labelSize: 16, size: 30 },
        {
          stroke: text,
          grid: { stroke: grid, width: 1 },
          ticks: { stroke: grid },
          values: (_u, v) => v.map(fmtY),
          size: 54,
          label: 'µV²/Hz',
          labelSize: 16,
        },
      ],
      series: [{}, ...series.map((s) => ({ label: s.label, stroke: s.color, width: 1.6, spanGaps: false }))],
      hooks: {
        drawClear: [
          (u) => {
            const { ctx, bbox } = u
            ctx.save()
            ctx.font = `${Math.round(11 * devicePixelRatio)}px system-ui, sans-serif`
            ctx.textBaseline = 'top'
            BAND_NAMES.forEach((name, i) => {
              const [lo, hi] = BANDS[name]
              const a = Math.max(lo, fmin)
              const b = Math.min(hi, fmax)
              if (b <= a) return
              const x0 = u.valToPos(a, 'x', true)
              const x1 = u.valToPos(b, 'x', true)
              ctx.fillStyle = i % 2 === 0 ? 'rgba(150,150,150,0.13)' : 'rgba(150,150,150,0.05)'
              ctx.fillRect(x0, bbox.top, x1 - x0, bbox.height)
              ctx.fillStyle = text
              ctx.fillText(SYMBOL[name], x0 + 3 * devicePixelRatio, bbox.top + 3 * devicePixelRatio)
            })
            ctx.restore()
          },
        ],
      },
    }
    const u = new uPlot(opts, [Array.from(freqs), ...series.map((s) => s.values)] as uPlot.AlignedData, el.firstElementChild as HTMLElement)
    return () => u.destroy()
  }, [size, freqs, series, fmin, fmax, log, yRange, theme])

  return (
    <div className="psd-chart">
      <div className="psd-chart-title">
        {series.map((s) => (
          <span key={s.label} className="psd-key">
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="muted">{title}</span>
      </div>
      <div className="psd-chart-plot" ref={wrapRef}>
        <div style={{ position: 'absolute', inset: 0 }} />
      </div>
    </div>
  )
}
