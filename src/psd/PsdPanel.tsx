import { useEffect, useMemo, useRef, useState } from 'react'
import { BAND_NAMES, DEFAULT_SEGMENT_SECONDS, MAX_SEGMENT_SECONDS, MIN_SEGMENT_SECONDS, deltaBandPower, type BandPowers } from '../dsp'
import type { Recording } from '../parser/parse'
import { ZONE_COLORS } from '../zones/useZones'
import { isTooShort, type ZoneId, type Zones } from '../zones/zoneLogic'
import type { DataSource } from './dataSource'
import { PsdChart, type ChartSeries } from './PsdChart'
import { computeZonePsd, prepareSeries, sharedYRange, type ZonePsdResult } from './psdLogic'
import './psd.css'

export type PsdViewMode = 'side' | 'overlay'

interface Props {
  recording: Recording
  zones: Zones
  source: DataSource
  theme: string
  /**
   * Editable channel names (index = recording channel). Falls back to header labels.
   * TODO: the Viewer owns the edited names (useViewerState.prefs) and does not expose them yet.
   */
  channelNames?: readonly string[]
}

type Results = Record<ZoneId, ZonePsdResult | null>

const IDS: ZoneId[] = ['A', 'B']

const fmtAbs = (v: number) => (v === 0 ? '0' : Math.abs(v) < 0.01 || Math.abs(v) >= 1e5 ? v.toExponential(2) : v.toPrecision(3))
const fmtPct = (v: number, signed = false) => `${signed && v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
const fmtAbsSigned = (v: number) => (v > 0 ? '+' : '') + fmtAbs(v)

export function PsdPanel({ recording, zones, source, theme, channelNames }: Props) {
  const eegChannels = useMemo(
    () => recording.channels.map((c, i) => ({ i, c })).filter((x) => x.c.isEeg),
    [recording],
  )
  const [open, setOpen] = useState(true)
  const [height, setHeight] = useState(300)
  const [channel, setChannel] = useState(() => eegChannels[0]?.i ?? 0)
  const [segment, setSegment] = useState(DEFAULT_SEGMENT_SECONDS)
  const [fmaxInput, setFmaxInput] = useState(45)
  const [log, setLog] = useState(false)
  const [sharedY, setSharedY] = useState(true)
  const [view, setView] = useState<PsdViewMode>('side')
  const [results, setResults] = useState<Results>({ A: null, B: null })

  const ch = recording.channels[channel]
  const fs = ch?.samplingRate ?? 1
  const nyquist = fs / 2
  const fmax = Math.min(Math.max(fmaxInput, 1), nyquist)
  const nameOf = (i: number) => channelNames?.[i] || recording.channels[i].label || `Ch ${i + 1}`

  // Compute PSDs (debounced while zone edges are being dragged).
  const getRef = useRef(source.getFiltered)
  getRef.current = source.getFiltered
  useEffect(() => {
    if (!open || !ch) return
    let cancelled = false
    const timer = setTimeout(() => {
      for (const id of IDS) {
        const z = zones[id]
        if (!z) {
          setResults((r) => (r[id] === null ? r : { ...r, [id]: null }))
          continue
        }
        void computeZonePsd((c) => getRef.current(c), channel, z, fs, segment).then((res) => {
          if (!cancelled) setResults((r) => ({ ...r, [id]: res }))
        })
      }
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // zones compared by value via start/end
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channel, segment, fs, source.version, zones.A?.start, zones.A?.end, zones.B?.start, zones.B?.end, recording])

  // Resize by dragging the top edge.
  const dragRef = useRef<{ y: number; h: number } | null>(null)
  const onResizeDown = (e: React.PointerEvent) => {
    dragRef.current = { y: e.clientY, h: height }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onResizeMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    setHeight(Math.round(Math.min(window.innerHeight * 0.7, Math.max(160, d.h - (e.clientY - d.y)))))
  }

  const okOf = (id: ZoneId) => {
    const r = results[id]
    return zones[id] && r && r.ok ? r : null
  }
  const seriesFor = (id: ZoneId) => {
    const r = okOf(id)
    return r ? prepareSeries(r.psd, 0, fmax, log) : null
  }
  const sa = seriesFor('A')
  const sb = seriesFor('B')
  const shared = sharedY ? sharedYRange(sa && [sa.values], sb && [sb.values], log) : null

  const bandsA = okOf('A')?.bands ?? null
  const bandsB = okOf('B')?.bands ?? null
  const delta: BandPowers | null = bandsA && bandsB ? deltaBandPower(bandsA, bandsB) : null

  const title = (id: ZoneId) => {
    const z = zones[id]
    return z ? `${nameOf(channel)} · ${z.start.toFixed(1)}–${z.end.toFixed(1)} s` : ''
  }
  const mk = (id: ZoneId, s: NonNullable<typeof sa>): ChartSeries => ({
    label: `Zone ${id}`,
    color: ZONE_COLORS[id],
    values: s.values,
  })

  const message = (id: ZoneId) => {
    const z = zones[id]
    const r = results[id]
    if (!z) return `Zone ${id}: drag on the EEG view${id === 'B' ? ' with Shift held' : ''} to select.`
    if (!r) return `Zone ${id}: computing…`
    if (!r.ok) return `Zone ${id}: ${r.error}`
    return null
  }

  const emptyBoth = !zones.A && !zones.B

  return (
    <div className="psd-panel" style={{ height: open ? height : undefined }}>
      {open && <div className="psd-resize" onPointerDown={onResizeDown} onPointerMove={onResizeMove} onPointerUp={() => (dragRef.current = null)} title="Drag to resize" />}
      <div className="psd-head">
        <button className="small" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? '▾' : '▸'} PSD
        </button>
        {open && (
          <>
            <div className="seg" role="group" aria-label="View">
              <button className={view === 'side' ? 'primary small' : 'small'} onClick={() => setView('side')}>
                Side-by-side
              </button>
              <button className={view === 'overlay' ? 'primary small' : 'small'} onClick={() => setView('overlay')}>
                Overlay
              </button>
            </div>
            <label>
              Channel{' '}
              <select value={channel} onChange={(e) => setChannel(Number(e.target.value))}>
                {eegChannels.map(({ i }) => (
                  <option key={i} value={i}>
                    {nameOf(i)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Segment{' '}
              <select value={segment} onChange={(e) => setSegment(Number(e.target.value))}>
                {Array.from({ length: MAX_SEGMENT_SECONDS - MIN_SEGMENT_SECONDS + 1 }, (_, k) => k + MIN_SEGMENT_SECONDS).map((s) => (
                  <option key={s} value={s}>
                    {s} s
                  </option>
                ))}
              </select>
            </label>
            <label>
              0–
              <input
                className="num"
                type="number"
                min={1}
                max={nyquist}
                value={fmaxInput}
                onChange={(e) => setFmaxInput(Number(e.target.value) || 45)}
              />{' '}
              Hz
            </label>
            <label className="check">
              <input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} /> Log y
            </label>
            <label className="check">
              <input type="checkbox" checked={sharedY} onChange={(e) => setSharedY(e.target.checked)} /> Shared y
            </label>
            <span className="muted psd-filter">
              Filter: {source.label}
              {source.pending ? ' (filtering…)' : ''}
            </span>
          </>
        )}
      </div>
      {open && (
        <div className="psd-body">
          <div className="psd-charts">
            {emptyBoth ? (
              <div className="psd-note">
                Select Zone A by dragging on the EEG view, and Zone B with Shift-drag (or arm B in the toolbar).
              </div>
            ) : view === 'side' ? (
              IDS.map((id) => {
                const s = id === 'A' ? sa : sb
                const msg = message(id)
                return (
                  <div className="psd-cell" key={id}>
                    {s && !msg ? (
                      <PsdChart title={title(id)} freqs={s.freqs} series={[mk(id, s)]} fmin={0} fmax={fmax} log={log} yRange={shared} theme={theme} />
                    ) : (
                      <div className="psd-note">{msg}</div>
                    )}
                  </div>
                )
              })
            ) : (
              <div className="psd-cell">
                {sa || sb ? (
                  <PsdChart
                    title={nameOf(channel)}
                    freqs={(sa ?? sb)!.freqs}
                    series={[...(sa ? [mk('A', sa)] : []), ...(sb ? [mk('B', sb)] : [])]}
                    fmin={0}
                    fmax={fmax}
                    log={log}
                    yRange={shared}
                    theme={theme}
                  />
                ) : (
                  <div className="psd-note">{IDS.map(message).filter(Boolean).join(' ')}</div>
                )}
                {view === 'overlay' && (sa || sb) && IDS.some((id) => message(id)) && (
                  <div className="psd-note small">{IDS.map(message).filter(Boolean).join(' ')}</div>
                )}
              </div>
            )}
          </div>
          <div className="psd-side">
            {IDS.map((id) => {
              const z = zones[id]
              return z && isTooShort(z) ? (
                <div className="zone-warn" key={id}>
                  Zone {id} is under 2 s, so the PSD may be noisy or unavailable.
                </div>
              ) : null
            })}
            <BandTable a={bandsA} b={bandsB} delta={delta} />
          </div>
        </div>
      )}
    </div>
  )
}

function BandTable({ a, b, delta }: { a: BandPowers | null; b: BandPowers | null; delta: BandPowers | null }) {
  return (
    <table className="band-table">
      <thead>
        <tr>
          <th rowSpan={2}>Band</th>
          <th colSpan={2} style={{ color: ZONE_COLORS.A }}>A</th>
          <th colSpan={2} style={{ color: ZONE_COLORS.B }}>B</th>
          <th colSpan={2}>Δ (B−A)</th>
        </tr>
        <tr>
          {[0, 1, 2].flatMap((k) => [<th key={`a${k}`}>µV²</th>, <th key={`r${k}`}>%</th>])}
        </tr>
      </thead>
      <tbody>
        {BAND_NAMES.map((n) => (
          <tr key={n}>
            <td>{n}</td>
            <td>{a ? fmtAbs(a.absolute[n]) : '–'}</td>
            <td>{a ? fmtPct(a.relative[n]) : '–'}</td>
            <td>{b ? fmtAbs(b.absolute[n]) : '–'}</td>
            <td>{b ? fmtPct(b.relative[n]) : '–'}</td>
            <td>{delta ? fmtAbsSigned(delta.absolute[n]) : '–'}</td>
            <td>{delta ? fmtPct(delta.relative[n], true) : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
