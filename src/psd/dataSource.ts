import { useMemo } from 'react'
import type { Recording } from '../parser/parse'

/**
 * The ONLY place that knows where PSD/display data comes from.
 *
 * Shape of the filter worker's hook (src/filters/index.ts):
 *   useFilteredData(recording, settings) =>
 *     { getData(ch), getFiltered(ch): Promise<Float32Array|Float64Array>, version, pending, label }
 *
 * TEMPORARY adapter: returns Raw and label "No filter". To wire the real filters,
 * replace the body of `useDataSource` with a call to `useFilteredData(recording, settings)`
 * (see the comment at the bottom) and delete the stub.
 */
export interface DataSource {
  /** Synchronous accessor for the EEG view (Viewer `getData`). */
  getData: (channel: number) => ArrayLike<number>
  /** Whole filtered channel (PSD input). */
  getFiltered: (channel: number) => Promise<Float32Array | Float64Array>
  /** Changes whenever filter settings change / results are recomputed. */
  version: number
  pending: boolean
  /** Human-readable active filters, e.g. "HP 0.5 Hz · notch 50 Hz". */
  label: string
}

export function useDataSource(recording: Recording): DataSource {
  return useMemo<DataSource>(
    () => ({
      getData: (ch) => recording.channels[ch].data,
      getFiltered: async (ch) => recording.channels[ch].data,
      version: 0,
      pending: false,
      label: 'No filter',
    }),
    [recording],
  )
}

// Real wiring (one line, once src/filters/index.ts exists):
//   import { useFilteredData } from '../filters'
//   export const useDataSource = (recording: Recording): DataSource => useFilteredData(recording, DEFAULT_SETTINGS)
// (or pass the filter settings state owned by App).
