import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_FILTER_SETTINGS, type FilterSettings } from '../dsp'
import type { Recording } from '../parser/parse'
import { FilterCoordinator } from './coordinator'
import { filterLabel } from './label'
import type { Samples, WorkerLike } from './types'

export interface FilteredData {
  /** Filtered if ready, else raw while pending. Identical object per channel+settings. */
  getData(channelIndex: number): Float32Array | Float64Array | undefined
  /** Resolves the filtered whole channel (used by PSD). */
  getFiltered(channelIndex: number): Promise<Float32Array | Float64Array>
  /** Bumps when any filtered result arrives or settings change; use as overlayKey / repaint trigger. */
  version: number
  pending: boolean
  /** e.g. "HP 0.5 Hz · LP 45 Hz · Notch 50 Hz" or "No filter". */
  label: string
}

export function useFilterSettings() {
  const [settings, setSettings] = useState<FilterSettings>(DEFAULT_FILTER_SETTINGS)
  return { settings, setSettings }
}

export function useFilteredData(recording: Recording | null, settings: FilterSettings): FilteredData {
  const [coord, setCoord] = useState<FilterCoordinator | null>(null)
  const [version, setVersion] = useState(0)
  const [pending, setPending] = useState(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const coordRef = useRef<FilterCoordinator | null>(null)
  const readyWaiters = useRef<Array<(c: FilterCoordinator) => void>>([])

  // One worker + coordinator per recording.
  useEffect(() => {
    if (!recording) return
    const worker = new Worker(new URL('./filter.worker.ts', import.meta.url), { type: 'module' })
    let alive = true
    const c: FilterCoordinator = new FilterCoordinator(
      worker as unknown as WorkerLike,
      recording.channels,
      settingsRef.current,
      () => {
        if (!alive) return
        setVersion(c.version)
        setPending(c.pending)
      },
      // may fire from inside another component's render (getData) - defer the state update
      () => queueMicrotask(() => alive && setPending(c.pending)),
    )
    coordRef.current = c
    setCoord(c)
    readyWaiters.current.splice(0).forEach((f) => f(c))
    return () => {
      alive = false
      coordRef.current = null
      setCoord(null)
      setPending(false)
      c.dispose()
    }
  }, [recording])

  // Any settings change invalidates every cache. Layout effect: re-render happens before paint.
  useLayoutEffect(() => {
    if (!coord) return
    coord.setSettings(settings)
    setPending(coord.pending)
  }, [coord, settings])

  const getData = useCallback(
    (i: number): Samples | undefined => (coord ? coord.getData(i) : recording?.channels[i]?.data),
    [coord, recording],
  )

  const getFiltered = useCallback((i: number): Promise<Samples> => {
    const c = coordRef.current
    if (c) return c.getFiltered(i)
    return new Promise<FilterCoordinator>((res) => readyWaiters.current.push(res)).then((cc) => cc.getFiltered(i))
  }, [])

  const label = useMemo(() => filterLabel(settings), [settings])
  return { getData, getFiltered, version, pending, label }
}
