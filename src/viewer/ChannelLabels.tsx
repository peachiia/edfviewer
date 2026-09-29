import type { Recording } from '../parser/parse'
import { EditableName } from './EditableName'
import { fmtNum } from './format'
import { RULER_HEIGHT } from './renderer'
import type { ChannelPrefs } from './types'

interface Props {
  rec: Recording
  prefs: ChannelPrefs[]
  visible: number[]
  sensitivity: number
  onRename: (i: number, name: string) => void
}

/** Row labels aligned with the canvas rows (same height split, offset by the ruler). */
export function ChannelLabels({ rec, prefs, visible, sensitivity, onRename }: Props) {
  return (
    <div className="labels" style={{ paddingTop: RULER_HEIGHT }}>
      {visible.map((i) => {
        const ch = rec.channels[i]
        const scale = prefs[i].scale ?? sensitivity
        return (
          <div className="label-row" key={i}>
            <EditableName className="label-name" value={prefs[i].name} onCommit={(v) => onRename(i, v)} />
            <span className={'label-scale' + (prefs[i].scale !== undefined ? ' override' : '')}>
              {fmtNum(scale)} {ch.unit}/row{!ch.isEeg ? ' · non-EEG' : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
