import { useEffect, useState, type ReactNode } from 'react'
import type { Recording } from '../parser/parse'
import { fmtNum } from './format'
import { formatTime, parseTime, SENSITIVITY_STEPS } from './math'
import type { ViewerState } from './useViewerState'

const WINDOW_CHOICES = [1, 2, 5, 10, 15, 20, 30, 60]

interface Props {
  rec: Recording
  fileName: string
  vs: ViewerState
  onOpen: () => void
  onOpenSettings: () => void
  sideOpen: boolean
  onToggleSide: () => void
  /** EXTENSION POINT: filters popover, zone A/B buttons, etc. */
  extra?: ReactNode
}

export function Toolbar({ rec, fileName, vs, onOpen, onOpenSettings, sideOpen, onToggleSide, extra }: Props) {
  const rates = [...new Set(rec.channels.map((c) => c.samplingRate))]
  const winOptions = WINDOW_CHOICES.includes(vs.window)
    ? WINDOW_CHOICES
    : [...WINDOW_CHOICES, vs.window].sort((a, b) => a - b)
  const sensOptions: readonly number[] = SENSITIVITY_STEPS.includes(vs.sensitivity)
    ? SENSITIVITY_STEPS
    : [...SENSITIVITY_STEPS, vs.sensitivity].sort((a, b) => a - b)

  return (
    <header className="toolbar">
      <div className="group">
        <button className="primary" onClick={onOpen}>
          Open
        </button>
        <span className="file-info" title={fileName}>
          <strong>{fileName}</strong>
          <span className="muted">
            {' · '}
            {formatTime(rec.duration)} · {rates.map((r) => `${r} Hz`).join('/')} · {rec.channels.length} ch
          </span>
        </span>
      </div>

      <div className="group">
        <label>
          Window
          <select value={vs.window} onChange={(e) => vs.setWindow(Number(e.target.value))}>
            {winOptions.map((w) => (
              <option key={w} value={w}>
                {fmtNum(w)} s
              </option>
            ))}
          </select>
        </label>
        <StepInput vs={vs} />
        <button title="Step back (Left)" onClick={() => vs.stepBy(-1)}>
          ◀
        </button>
        <button title="Step forward (Right)" onClick={() => vs.stepBy(1)}>
          ▶
        </button>
        <GoTo vs={vs} />
      </div>

      <div className="group">
        <label>
          Sens
          <select value={vs.sensitivity} onChange={(e) => vs.setSensitivity(Number(e.target.value))}>
            {sensOptions.map((s) => (
              <option key={s} value={s}>
                {fmtNum(s)} µV/row
              </option>
            ))}
          </select>
        </label>
        <button title="Less sensitive (Down)" onClick={() => vs.stepSens(1)}>
          −
        </button>
        <button title="More sensitive (Up)" onClick={() => vs.stepSens(-1)}>
          +
        </button>
        <button title="Scale to the current window (visible EEG channels)" onClick={vs.autoScale}>
          Auto
        </button>
      </div>

      {extra && <div className="group">{extra}</div>}

      <div className="group right">
        <button
          title={sideOpen ? 'Hide the Triggers / Channels panel' : 'Show the Triggers / Channels panel'}
          aria-pressed={sideOpen}
          onClick={onToggleSide}
        >
          {sideOpen ? 'Panel ▸' : '◂ Panel'}
        </button>
        <button title="Settings, help and about" aria-label="Settings" onClick={onOpenSettings}>
          ⚙ Settings
        </button>
      </div>
    </header>
  )
}

function StepInput({ vs }: { vs: ViewerState }) {
  const [text, setText] = useState(fmtNum(vs.step))
  const [focus, setFocus] = useState(false)
  useEffect(() => {
    if (!focus) setText(fmtNum(vs.step))
  }, [vs.step, focus])
  const commit = () => {
    const v = Number(text)
    vs.setStep(text.trim() === '' || !Number.isFinite(v) || v <= 0 ? null : v)
    setFocus(false)
  }
  return (
    <label title="Step size in seconds. Empty = follow window length.">
      Step
      <input
        className="num"
        value={text}
        inputMode="decimal"
        onFocus={() => setFocus(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      s
    </label>
  )
}

function GoTo({ vs }: { vs: ViewerState }) {
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  const go = () => {
    const t = parseTime(text)
    if (t === undefined) {
      setBad(true)
      return
    }
    setBad(false)
    vs.goTo(t)
  }
  return (
    <label title="Go to time (seconds, m:ss or h:mm:ss); sets the left edge">
      Go to
      <input
        className={'num wide' + (bad ? ' bad' : '')}
        placeholder={formatTime(vs.start)}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setBad(false)
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') go()
        }}
      />
    </label>
  )
}
