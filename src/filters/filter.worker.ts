import { applyFilters } from '../dsp'
import type { FilterRequest, FilterResponse } from './types'

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<FilterRequest>) => void) | null
  postMessage(m: FilterResponse, transfer?: Transferable[]): void
}

ctx.onmessage = (e) => {
  const { id, channel, generation, data, samplingRate, settings } = e.data
  try {
    const out = applyFilters(data, samplingRate, settings)
    ctx.postMessage({ id, channel, generation, data: out }, [out.buffer as ArrayBuffer])
  } catch (err) {
    ctx.postMessage({ id, channel, generation, error: err instanceof Error ? err.message : String(err) })
  }
}
