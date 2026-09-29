import { useEffect, useState } from 'react'
import { ZONE_COLORS, type ZoneState } from './useZones'
import { MIN_ZONE_SECONDS, isTooShort, type ZoneEdge, type ZoneId } from './zoneLogic'

function BoundInput({ value, onCommit, label }: { value: number; onCommit: (v: number) => void; label: string }) {
  const [text, setText] = useState(value.toFixed(2))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(value.toFixed(2))
  }, [value, focused])
  const commit = () => {
    const v = parseFloat(text)
    if (Number.isFinite(v)) onCommit(v)
    else setText(value.toFixed(2))
  }
  return (
    <input
      className="num"
      aria-label={label}
      value={focused ? text : value.toFixed(2)}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        commit()
        setFocused(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setText(value.toFixed(2))
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/** Toolbar group: [A][B] slot toggles, plus bounds / clear / short-zone warning per zone. */
export function ZoneToolbar({ zs }: { zs: ZoneState }) {
  return (
    <div className="group zone-toolbar" title="Drag on the EEG view to select a zone. Shift-drag makes Zone B.">
      <span className="muted">Zone</span>
      {(['A', 'B'] as ZoneId[]).map((id) => {
        const z = zs.zones[id]
        return (
          <span className="zone-slot" key={id}>
            <button
              className={zs.armed === id ? 'primary' : ''}
              style={{ borderColor: ZONE_COLORS[id] }}
              aria-pressed={zs.armed === id}
              onClick={() => zs.setArmed(id)}
            >
              {id}
            </button>
            {z && (
              <>
                {(['start', 'end'] as ZoneEdge[]).map((edge) => (
                  <BoundInput
                    key={edge}
                    label={`Zone ${id} ${edge} (s)`}
                    value={z[edge]}
                    onCommit={(v) => zs.setBound(id, edge, v)}
                  />
                ))}
                <span className="muted">s</span>
                {isTooShort(z) && (
                  <span className="zone-warn" title={`Zone ${id} is shorter than ${MIN_ZONE_SECONDS} s`}>
                    ⚠ short
                  </span>
                )}
                <button className="small" aria-label={`Clear zone ${id}`} title={`Clear zone ${id}`} onClick={() => zs.clear(id)}>
                  ✕
                </button>
              </>
            )}
          </span>
        )
      })}
    </div>
  )
}
