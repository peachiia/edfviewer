import { useCallback, useMemo, useRef, useState } from 'react'
import type { Recording } from '../parser/parse'
import {
  autoScaleSensitivity,
  clamp,
  clampStart,
  clampStep,
  clampWindow,
  DEFAULT_SENSITIVITY,
  DEFAULT_WINDOW,
  niceCeil,
  robustAmplitude,
  stepSensitivity,
  zoomWindow,
} from './math'
import type { ChannelDataAccessor, ChannelPrefs } from './types'

/** 'triggers' | 'channels' | ids of extra tabs. */
export type SideTab = string

/** All viewer UI state + actions. Rendering itself lives outside React (renderer.ts). */
export function useViewerState(rec: Recording, getData: ChannelDataAccessor) {
  const duration = rec.duration
  const [nav, setNav] = useState({ start: 0, window: DEFAULT_WINDOW })
  const [stepOverride, setStepOverride] = useState<number | null>(null)
  const [sensitivity, setSensitivityRaw] = useState(DEFAULT_SENSITIVITY)
  const [prefs, setPrefs] = useState<ChannelPrefs[]>(() =>
    rec.channels.map((c, i) => ({ name: c.label || `Ch ${i + 1}`, hidden: false })),
  )
  const [showTriggers, setShowTriggers] = useState(true)
  const [tab, setTab] = useState<SideTab>('channels')

  const navRef = useRef(nav)
  navRef.current = nav
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const getDataRef = useRef(getData)
  getDataRef.current = getData

  const step = stepOverride ?? nav.window

  const setStart = useCallback(
    (s: number) => setNav((n) => ({ ...n, start: clampStart(s, n.window, duration) })),
    [duration],
  )
  const panBy = useCallback((dt: number) => setStart(navRef.current.start + dt), [setStart])
  const stepBy = useCallback(
    (dir: 1 | -1) => panBy(dir * (stepOverride ?? navRef.current.window)),
    [panBy, stepOverride],
  )
  const pageBy = useCallback((dir: 1 | -1) => panBy(dir * navRef.current.window), [panBy])
  const home = useCallback(() => setStart(0), [setStart])
  const end = useCallback(() => setStart(duration), [setStart, duration])

  const setWindow = useCallback(
    (w: number) => {
      const cw = clampWindow(w)
      setNav((n) => ({ window: cw, start: clampStart(n.start, cw, duration) }))
    },
    [duration],
  )
  const zoom = useCallback(
    (factor: number, anchorFrac: number) =>
      setNav((n) => zoomWindow(n.start, n.window, factor, anchorFrac, duration)),
    [duration],
  )
  const setStep = useCallback((s: number | null) => setStepOverride(s === null ? null : clampStep(s)), [])

  /** Jump so that time t sits a quarter of the way into the window. */
  const jumpTo = useCallback(
    (t: number) => setNav((n) => ({ ...n, start: clampStart(t - n.window * 0.25, n.window, duration) })),
    [duration],
  )
  /** Go-to-time: t becomes the left edge. */
  const goTo = useCallback((t: number) => setStart(t), [setStart])

  const setSensitivity = useCallback((v: number) => setSensitivityRaw(clamp(v, 0.01, 1e6)), [])
  const stepSens = useCallback((dir: 1 | -1) => setSensitivityRaw((s) => stepSensitivity(s, dir)), [])

  const patchPref = useCallback((i: number, patch: Partial<ChannelPrefs>) => {
    setPrefs((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  }, [])
  const setName = useCallback(
    (i: number, name: string) => {
      const t = name.trim()
      patchPref(i, { name: t === '' ? rec.channels[i].label || `Ch ${i + 1}` : t })
    },
    [patchPref, rec],
  )
  const setHidden = useCallback((i: number, hidden: boolean) => patchPref(i, { hidden }), [patchPref])
  const setScale = useCallback(
    (i: number, scale: number | undefined) =>
      patchPref(i, { scale: scale !== undefined && scale > 0 ? scale : undefined }),
    [patchPref],
  )

  const windowAmplitude = useCallback(
    (i: number): number => {
      const { start, window } = navRef.current
      const fs = rec.channels[i].samplingRate
      return robustAmplitude(getDataRef.current(i), start * fs, (start + window) * fs, 95)
    },
    [rec],
  )

  /** Global auto-scale: visible EEG channels only (non-EEG units are excluded). */
  const autoScale = useCallback(() => {
    const amps: number[] = []
    prefsRef.current.forEach((p, i) => {
      if (!p.hidden && rec.channels[i].isEeg) amps.push(windowAmplitude(i))
    })
    const s = autoScaleSensitivity(amps)
    if (s !== undefined) setSensitivityRaw(s)
  }, [rec, windowAmplitude])

  /** Per-channel fit (the way to scale non-EEG channels). */
  const fitChannel = useCallback(
    (i: number) => {
      const a = windowAmplitude(i)
      if (Number.isFinite(a) && a > 0) setScale(i, niceCeil(2 * a))
    },
    [windowAmplitude, setScale],
  )

  const visible = useMemo(() => {
    const v: number[] = []
    prefs.forEach((p, i) => {
      if (!p.hidden) v.push(i)
    })
    return v
  }, [prefs])
  const scaleOverrides = useMemo(() => {
    const m = new Map<number, number>()
    prefs.forEach((p, i) => {
      if (p.scale !== undefined) m.set(i, p.scale)
    })
    return m
  }, [prefs])

  return {
    duration,
    start: nav.start,
    window: nav.window,
    step,
    stepIsCustom: stepOverride !== null,
    sensitivity,
    prefs,
    visible,
    scaleOverrides,
    showTriggers,
    tab,
    setTab,
    setShowTriggers,
    setStart,
    panBy,
    stepBy,
    pageBy,
    home,
    end,
    setWindow,
    zoom,
    setStep,
    jumpTo,
    goTo,
    setSensitivity,
    stepSens,
    setName,
    setHidden,
    setScale,
    autoScale,
    fitChannel,
  }
}

export type ViewerState = ReturnType<typeof useViewerState>
