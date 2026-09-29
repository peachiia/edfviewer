import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Recording } from '../parser/parse'
import { ChannelLabels } from './ChannelLabels'
import { EegCanvas } from './EegCanvas'
import { Minimap } from './Minimap'
import { SidePanel, type ExtraTab } from './SidePanel'
import { Toolbar } from './Toolbar'
import type { ChannelDataAccessor, EegOverlayPainter, MinimapOverlayPainter } from './types'
import { useViewerState } from './useViewerState'

const SIDE_KEY = 'edfviewer.sidePanel'
function loadSideOpen(): boolean {
  try {
    return localStorage.getItem(SIDE_KEY) !== 'closed'
  } catch {
    return true
  }
}

export interface ViewerProps {
  recording: Recording
  fileName: string
  onOpen: () => void
  theme: 'dark' | 'light'
  onOpenSettings: () => void
  /**
   * EXTENSION POINT (filters): per-channel data accessor. Default = Raw
   * samples. Pass a Filtered-signal accessor later; keep identities stable.
   */
  getData?: ChannelDataAccessor
  /** EXTENSION POINT (zones): painted over the EEG view. Bump `overlayKey` when its contents change. */
  eegOverlay?: EegOverlayPainter
  /** EXTENSION POINT (zones): painted on the minimap. */
  minimapOverlay?: MinimapOverlayPainter
  overlayKey?: unknown
  /** EXTENSION POINT: extra toolbar controls (filters popover, zone buttons). */
  toolbarExtra?: ReactNode
  /** EXTENSION POINT: extra side-panel tabs. */
  extraTabs?: ExtraTab[]
  /** EXTENSION POINT (PSD panel): rendered below the minimap. */
  bottomPanel?: ReactNode | ((channelNames: string[]) => ReactNode)
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)

export function Viewer(props: ViewerProps) {
  const { recording: rec } = props
  const rawData = useMemo<ChannelDataAccessor>(() => (i) => rec.channels[i].data, [rec])
  const getData = props.getData ?? rawData
  const vs = useViewerState(rec, getData)
  const [sideOpen, setSideOpen] = useState(loadSideOpen)
  const toggleSide = () =>
    setSideOpen((o) => {
      try {
        localStorage.setItem(SIDE_KEY, o ? 'closed' : 'open')
      } catch {
        /* ignore */
      }
      return !o
    })

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      const acts: Record<string, () => void> = {
        ArrowLeft: () => vs.stepBy(-1),
        ArrowRight: () => vs.stepBy(1),
        PageUp: () => vs.pageBy(-1),
        PageDown: () => vs.pageBy(1),
        Home: vs.home,
        End: vs.end,
        ArrowUp: () => vs.stepSens(-1), // more sensitive
        ArrowDown: () => vs.stepSens(1),
      }
      const a = acts[e.key]
      if (a) {
        e.preventDefault()
        a()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="viewer">
      <Toolbar
        rec={rec}
        fileName={props.fileName}
        vs={vs}
        onOpen={props.onOpen}
        onOpenSettings={props.onOpenSettings}
        sideOpen={sideOpen}
        onToggleSide={toggleSide}
        extra={props.toolbarExtra}
      />
      <div className="main">
        <div className="chart-col">
          <div className="stack">
            <ChannelLabels
              rec={rec}
              prefs={vs.prefs}
              visible={vs.visible}
              sensitivity={vs.sensitivity}
              onRename={vs.setName}
            />
            {vs.visible.length === 0 ? (
              <div className="eeg-canvas-wrap empty-stack">All channels hidden. Enable some in the Channels tab.</div>
            ) : (
              <EegCanvas
                start={vs.start}
                window={vs.window}
                duration={vs.duration}
                channels={rec.channels}
                visible={vs.visible}
                getData={getData}
                sensitivity={vs.sensitivity}
                scaleOverrides={vs.scaleOverrides}
                triggers={rec.triggers}
                showTriggers={vs.showTriggers}
                overlay={props.eegOverlay}
                repaintKey={[props.overlayKey, props.theme]}
                onPan={vs.panBy}
                onZoom={vs.zoom}
              />
            )}
          </div>
          <div className="minimap-row">
            <span className="minimap-pad" />
            <Minimap
              duration={vs.duration}
              start={vs.start}
              window={vs.window}
              triggers={rec.triggers}
              showTriggers={vs.showTriggers}
              onSeek={(c) => vs.setStart(c - vs.window / 2)}
              overlay={props.minimapOverlay}
              repaintKey={[props.overlayKey, props.theme]}
            />
          </div>
          {typeof props.bottomPanel === 'function'
            ? props.bottomPanel(vs.prefs.map((p) => p.name))
            : props.bottomPanel}
        </div>
        {sideOpen && <SidePanel rec={rec} vs={vs} extraTabs={props.extraTabs} />}
      </div>
    </div>
  )
}
