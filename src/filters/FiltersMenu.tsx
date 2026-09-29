import { useEffect, useRef, useState } from 'react'
import type { FilterSettings, PassSettings } from '../dsp'
import './filters.css'

interface Props {
  settings: FilterSettings
  onChange: (s: FilterSettings) => void
  /** Highest allowed cutoff (just below the lowest Nyquist). */
  maxFreq: number
  label: string
  pending: boolean
}

const Q_CHOICES = [10, 30, 60]
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function NumField({ value, min, max, step, onCommit, title }: {
  value: number
  min: number
  max: number
  step?: number
  onCommit: (v: number) => void
  title?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const v = parseFloat(draft)
    if (Number.isFinite(v)) onCommit(clamp(v, min, max))
    setDraft(null)
  }
  return (
    <input
      className="num"
      type="number"
      title={title}
      min={min}
      max={max}
      step={step ?? 'any'}
      value={draft ?? value}
      onChange={(e) => {
        setDraft(e.target.value)
        // apply live while the value is already valid (spinner arrows, typing); Enter/blur clamps the rest
        const v = parseFloat(e.target.value)
        if (Number.isFinite(v) && v >= min && v <= max) onCommit(v)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setDraft(null)
      }}
    />
  )
}

export function FiltersMenu({ settings, onChange, maxFreq, label, pending }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const set = (patch: Partial<FilterSettings>) => onChange({ ...settings, ...patch })
  const pass = (k: 'highpass' | 'lowpass', label: string) => {
    const p = settings[k]
    const upd = (patch: Partial<PassSettings>) => set({ [k]: { ...p, ...patch } })
    return (
      <div className="frow">
        <label className="chk">
          <input type="checkbox" checked={p.enabled} onChange={(e) => upd({ enabled: e.target.checked })} />
          {label}
        </label>
        <NumField value={p.freq} min={0.01} max={maxFreq} onCommit={(v) => upd({ freq: v })} title={`Cutoff, Hz (max ${maxFreq})`} />
        <span className="muted">Hz</span>
        <select value={p.order} onChange={(e) => upd({ order: Number(e.target.value) })} title="Order">
          {[2, 3, 4, 5, 6, 7, 8].map((o) => (
            <option key={o} value={o}>
              order {o}
            </option>
          ))}
        </select>
      </div>
    )
  }
  const n = settings.notch

  return (
    <div className="filters-menu" ref={root}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={settings.enabled ? 'active' : ''}
        title={`Active filters: ${label}${pending ? ' (filtering…)' : ''}`}
      >
        Filters{pending ? ' …' : ''} ▾
      </button>
      {open && (
        <div className="filters-pop" role="dialog" aria-label="Filters">
          <div className="muted fnote" aria-live="polite">
            Active: {label}
            {pending && ' · filtering…'}
          </div>
          <label className="chk master">
            <input type="checkbox" checked={settings.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
            Enable filters
          </label>
          <fieldset disabled={!settings.enabled}>
            {pass('highpass', 'High-pass')}
            {pass('lowpass', 'Low-pass')}
            <div className="frow">
              <label className="chk">
                <input
                  type="checkbox"
                  checked={n.enabled}
                  onChange={(e) => set({ notch: { ...n, enabled: e.target.checked } })}
                />
                Notch
              </label>
              <select value={n.freq} onChange={(e) => set({ notch: { ...n, freq: Number(e.target.value) } })}>
                <option value={50}>50 Hz</option>
                <option value={60}>60 Hz</option>
              </select>
              <select
                value={n.q}
                onChange={(e) => set({ notch: { ...n, q: Number(e.target.value) } })}
                title="Notch Q (higher = narrower)"
              >
                {(Q_CHOICES.includes(n.q) ? Q_CHOICES : [...Q_CHOICES, n.q].sort((a, b) => a - b)).map((q) => (
                  <option key={q} value={q}>
                    Q {q}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
          <p className="muted fnote">
            Zero-phase, applied to the whole channel. Cutoffs stay below Nyquist ({maxFreq} Hz max for this file).
          </p>
        </div>
      )}
    </div>
  )
}
