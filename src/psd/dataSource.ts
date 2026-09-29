/** What the EEG view and PSD panel need from the filter pipeline (satisfied by `useFilteredData`). */
export interface DataSource {
  /** Synchronous accessor for the EEG view (Viewer `getData`). */
  getData: (channel: number) => ArrayLike<number> | undefined
  /** Whole filtered channel (PSD input). */
  getFiltered: (channel: number) => Promise<Float32Array | Float64Array>
  /** Changes whenever filter settings change / results are recomputed. */
  version: number
  pending: boolean
  /** Human-readable active filters, e.g. "HP 0.5 Hz · Notch 50 Hz". */
  label: string
}
