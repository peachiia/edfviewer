import { useState, type ReactNode } from 'react'
import type { Recording, Trigger } from '../parser/parse'
import { EditableName } from './EditableName'
import { fmtNum } from './format'
import { formatTime } from './math'
import type { TriggerZoneActions } from './types'
import type { ViewerState } from './useViewerState'

export interface ExtraTab {
  id: string
  label: string
  content: ReactNode
}

interface Props {
  rec: Recording
  vs: ViewerState
  /** EXTENSION POINT: additional tabs (e.g. zones). Ids must not clash with 'triggers'/'channels'. */
  extraTabs?: ExtraTab[]
  zoneActions?: TriggerZoneActions
}

export function SidePanel({ rec, vs, extraTabs = [], zoneActions }: Props) {
  const tab = vs.tab
  return (
    <aside className="side">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'triggers'} onClick={() => vs.setTab('triggers')}>
          Triggers{rec.triggers.length ? ` (${rec.triggers.length})` : ''}
        </button>
        <button role="tab" aria-selected={tab === 'channels'} onClick={() => vs.setTab('channels')}>
          Channels
        </button>
        {extraTabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => vs.setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-body">
        {tab === 'triggers' && <TriggerList triggers={rec.triggers} vs={vs} zoneActions={zoneActions} />}
        {tab === 'channels' && <ChannelList rec={rec} vs={vs} />}
        {extraTabs.find((t) => t.id === tab)?.content}
      </div>
    </aside>
  )
}

const ROW_H = 26
const VIEWPORT_GUESS = 600

function TriggerList({
  triggers,
  vs,
  zoneActions,
}: {
  triggers: Trigger[]
  vs: ViewerState
  zoneActions?: TriggerZoneActions
}) {
  const [scroll, setScroll] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const setZone = (slot: 'A' | 'B', idx: number) => {
    const err = zoneActions?.onSet(slot, idx) ?? null
    setNote(err)
    if (!err) vs.jumpTo(triggers[idx].time)
  }
  const first = Math.max(0, Math.floor(scroll / ROW_H) - 5)
  const last = Math.min(triggers.length, Math.ceil((scroll + VIEWPORT_GUESS * 2) / ROW_H) + 5)
  const active = (t: Trigger) => t.time >= vs.start && t.time <= vs.start + vs.window
  return (
    <div className="trigger-tab">
      <label className="check">
        <input type="checkbox" checked={vs.showTriggers} onChange={(e) => vs.setShowTriggers(e.target.checked)} />
        Show triggers
      </label>
      {zoneActions && triggers.length > 0 && (
        <div className="trigger-zone-bar">
          <label title="Seconds cut from both ends of a zone made from a trigger">
            Trim
            <input
              className="num"
              type="number"
              min={0}
              step={0.5}
              value={zoneActions.trim}
              onChange={(e) => zoneActions.onTrimChange(Math.max(0, parseFloat(e.target.value) || 0))}
            />
            s
          </label>
          <span className="muted">→ A / → B: this trigger until the next one</span>
        </div>
      )}
      {note && (
        <p className="zone-warn pad" role="status">
          {note}
        </p>
      )}
      {triggers.length === 0 ? (
        <p className="muted pad">No triggers found in this recording.</p>
      ) : (
        <div className="trigger-scroll" onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
          <div style={{ height: triggers.length * ROW_H, position: 'relative' }}>
            {triggers.slice(first, last).map((t, k) => {
              const idx = first + k
              return (
                <div
                  key={idx}
                  className={'trigger-row' + (active(t) ? ' active' : '')}
                  style={{ top: idx * ROW_H, height: ROW_H }}
                >
                  <button
                    className="trigger-jump"
                    onClick={() => vs.jumpTo(t.time)}
                    title={`${t.source} trigger at ${t.time.toFixed(3)} s`}
                  >
                    <span className="t-time">{formatTime(t.time, 2)}</span>
                    <span className="t-text">
                      {t.text || (t.source === 'status' ? `Status ${t.value}` : '(no text)')}
                    </span>
                    {t.source === 'annotation' && t.duration ? (
                      <span className="t-dur">{fmtNum(t.duration)} s</span>
                    ) : null}
                  </button>
                  {zoneActions &&
                    (['A', 'B'] as const).map((slot) => (
                      <button
                        key={slot}
                        className="small trigger-zone-btn"
                        data-slot={slot}
                        title={`Set Zone ${slot} from this trigger`}
                        onClick={() => setZone(slot, idx)}
                      >
                        → {slot}
                      </button>
                    ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ChannelList({ rec, vs }: { rec: Recording; vs: ViewerState }) {
  return (
    <div className="channel-list">
      {rec.channels.map((ch, i) => {
        const p = vs.prefs[i]
        return (
          <div className={'ch-row' + (p.hidden ? ' hidden-ch' : '')} key={i}>
            <input
              type="checkbox"
              checked={!p.hidden}
              title={p.hidden ? 'Show channel' : 'Hide channel'}
              onChange={(e) => vs.setHidden(i, !e.target.checked)}
            />
            <div className="ch-name">
              <EditableName value={p.name} onCommit={(v) => vs.setName(i, v)} />
              <small className="muted">
                {ch.samplingRate} Hz · {ch.unit}
                {!ch.isEeg ? ' · non-EEG' : ''}
              </small>
            </div>
            <input
              className="scale-input"
              type="number"
              min="0"
              step="any"
              placeholder={fmtNum(vs.sensitivity)}
              value={p.scale ?? ''}
              title={`Override ${ch.unit}/row for this channel (blank = global)`}
              onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => vs.setScale(i, e.target.value === '' ? undefined : Number(e.target.value))}
            />
            <button className="small" title="Fit this channel to the current window" onClick={() => vs.fitChannel(i)}>
              Fit
            </button>
          </div>
        )
      })}
      <p className="muted pad">
        Double-click a channel name to rename it. The box overrides units per row for one channel. Non-EEG units are
        shown as recorded and excluded from Auto.
      </p>
    </div>
  )
}
