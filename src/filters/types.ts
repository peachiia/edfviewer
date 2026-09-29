import type { FilterSettings } from '../dsp'

export type Samples = Float32Array | Float64Array

export interface FilterRequest {
  id: number
  channel: number
  generation: number
  data: Samples
  samplingRate: number
  settings: FilterSettings
}

export interface FilterResponse {
  id: number
  channel: number
  generation: number
  data?: Samples
  error?: string
}

/** The subset of Worker the coordinator needs; tests inject a fake. */
export interface WorkerLike {
  postMessage(msg: FilterRequest): void
  onmessage: ((e: { data: FilterResponse }) => void) | null
  terminate(): void
}

export interface ChannelSource {
  data: Samples
  samplingRate: number
}
