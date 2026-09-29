import type { Trigger } from '../parser/parse'

/** What the renderer needs to know about a channel. Data comes from a separate accessor. */
export interface ViewChannel {
  label: string
  unit: string
  isEeg: boolean
  samplingRate: number
}

/**
 * EXTENSION POINT (filters): returns the samples to display/measure for a
 * channel. The default returns Raw; a later filter worker returns Filtered.
 * Must return a stable array identity per (channel, settings) so per-channel
 * caches (DC offset) stay valid.
 */
export type ChannelDataAccessor = (channelIndex: number) => ArrayLike<number>

export interface ChannelPrefs {
  /** Display name (user-editable). */
  name: string
  hidden: boolean
  /** Per-channel units-per-row override; undefined = follow global sensitivity. */
  scale?: number
}

/** EXTENSION POINT (zones): lets the Triggers tab set a zone from a trigger. */
export interface TriggerZoneActions {
  /** Seconds trimmed from both ends of a trigger-derived zone. */
  trim: number
  onTrimChange: (seconds: number) => void
  /** Set zone `slot` from trigger `index`; returns an error message, or null on success. */
  onSet: (slot: 'A' | 'B', index: number) => string | null
}

/** Geometry of the EEG view, in CSS px. Passed to overlay callbacks. */
export interface ViewGeometry {
  width: number
  height: number
  rulerHeight: number
  rowHeight: number
  start: number
  window: number
  duration: number
  /** Recording channel indices currently shown, top to bottom. */
  visible: number[]
  timeToX: (t: number) => number
  xToTime: (x: number) => number
  /** Pan the view by dt seconds (clamped to the recording). Lets overlays auto-scroll while dragging. */
  panBy?: (dt: number) => void
}

/**
 * EXTENSION POINT (zones): drawn on top of the EEG view after traces/triggers.
 * A zone-selection overlay plugs in here (and adds its own pointer handling).
 */
export type EegOverlayPainter = (ctx: CanvasRenderingContext2D, g: ViewGeometry) => void

/** EXTENSION POINT (zones on minimap). x = timeToX for the full recording. */
export type MinimapOverlayPainter = (
  ctx: CanvasRenderingContext2D,
  g: { width: number; height: number; duration: number; timeToX: (t: number) => number },
) => void

export interface ViewColors {
  bg: string
  grid: string
  gridStrong: string
  text: string
  textDim: string
  trace: string
  accent: string
  trigger: string
  triggerSpan: string
}

export type { Trigger }
