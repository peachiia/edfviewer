import type { FilterSettings } from '../dsp'
import type { ChannelSource, FilterResponse, Samples, WorkerLike } from './types'

interface Waiter {
  resolve: (s: Samples) => void
  reject: (e: Error) => void
}

/**
 * Pure cache/scheduling logic for whole-channel lazy filtering (ADR 0002).
 * - Only channels asked for (getData / getFiltered) are filtered.
 * - Any settings change drops every cached result and bumps the generation;
 *   responses from an older generation are discarded.
 * - Requests for the same channel+generation are deduplicated.
 * - Raw arrays are never modified; while pending, getData returns the raw array.
 */
export class FilterCoordinator {
  version = 0
  private settings: FilterSettings
  private settingsKey: string
  private generation = 0
  private nextId = 1
  private cache = new Map<number, Samples>()
  private inflight = new Set<number>()
  private failed = new Set<number>()
  private waiters = new Map<number, Waiter[]>()

  constructor(
    private worker: WorkerLike,
    readonly channels: ChannelSource[],
    settings: FilterSettings,
    private onChange: () => void = () => {},
    private onPendingChange: () => void = () => {},
  ) {
    this.settings = settings
    this.settingsKey = JSON.stringify(settings)
    worker.onmessage = (e) => this.handle(e.data)
  }

  get pending(): boolean {
    return this.settings.enabled && this.inflight.size > 0
  }

  /** Filtered if ready, else raw (and a filter request is scheduled). Stable identity per channel+settings. */
  getData(ch: number): Samples | undefined {
    const raw = this.channels[ch]?.data
    if (!raw || !this.settings.enabled) return raw
    const hit = this.cache.get(ch)
    if (hit) return hit
    this.request(ch)
    return raw
  }

  /** Resolves the filtered whole channel (raw when filtering is off). */
  getFiltered(ch: number): Promise<Samples> {
    const raw = this.channels[ch]?.data
    if (!raw) return Promise.reject(new Error(`No channel ${ch}`))
    if (!this.settings.enabled) return Promise.resolve(raw)
    const hit = this.cache.get(ch)
    if (hit) return Promise.resolve(hit)
    return new Promise((resolve, reject) => {
      const list = this.waiters.get(ch) ?? []
      list.push({ resolve, reject })
      this.waiters.set(ch, list)
      this.failed.delete(ch)
      this.request(ch)
    })
  }

  setSettings(settings: FilterSettings): void {
    const key = JSON.stringify(settings)
    if (key === this.settingsKey) return
    this.settings = settings
    this.settingsKey = key
    this.generation++
    this.cache.clear()
    this.inflight.clear()
    this.failed.clear()
    if (!settings.enabled) {
      for (const [ch, list] of this.waiters) for (const w of list) w.resolve(this.channels[ch].data)
      this.waiters.clear()
    } else {
      for (const ch of this.waiters.keys()) this.request(ch)
    }
    this.version++
    this.onChange()
  }

  dispose(): void {
    this.worker.onmessage = null
    this.worker.terminate()
    this.waiters.clear()
    this.inflight.clear()
  }

  private request(ch: number): void {
    if (this.inflight.has(ch) || this.cache.has(ch) || this.failed.has(ch)) return
    const src = this.channels[ch]
    if (!src) return
    this.inflight.add(ch)
    this.worker.postMessage({
      id: this.nextId++,
      channel: ch,
      generation: this.generation,
      data: src.data,
      samplingRate: src.samplingRate,
      settings: this.settings,
    })
    this.onPendingChange()
  }

  private handle(r: FilterResponse): void {
    if (r.generation !== this.generation) return // stale
    this.inflight.delete(r.channel)
    const list = this.waiters.get(r.channel)
    this.waiters.delete(r.channel)
    if (r.error !== undefined || !r.data) {
      this.failed.add(r.channel)
      const err = new Error(r.error ?? 'Filter failed')
      list?.forEach((w) => w.reject(err))
    } else {
      this.cache.set(r.channel, r.data)
      list?.forEach((w) => w.resolve(r.data!))
    }
    this.version++
    this.onChange()
  }
}
