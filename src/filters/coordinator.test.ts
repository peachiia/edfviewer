import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FILTER_SETTINGS, type FilterSettings } from '../dsp'
import { FilterCoordinator } from './coordinator'
import type { FilterRequest, FilterResponse, WorkerLike } from './types'

class FakeWorker implements WorkerLike {
  posted: FilterRequest[] = []
  onmessage: ((e: { data: FilterResponse }) => void) | null = null
  terminated = false
  postMessage(m: FilterRequest) {
    this.posted.push(m)
  }
  terminate() {
    this.terminated = true
  }
  /** Reply to a request with a recognisable result (raw + 1000). */
  reply(req: FilterRequest, extra: Partial<FilterResponse> = {}) {
    const data = Float32Array.from(req.data, (v) => v + 1000)
    this.onmessage?.({ data: { id: req.id, channel: req.channel, generation: req.generation, data, ...extra } })
  }
}

const on: FilterSettings = { ...DEFAULT_FILTER_SETTINGS, enabled: true }
const chans = () => [
  { data: new Float32Array([1, 2, 3]), samplingRate: 250 },
  { data: new Float32Array([4, 5, 6]), samplingRate: 250 },
]
const make = (settings = on) => {
  const w = new FakeWorker()
  const changed = vi.fn()
  const c = new FilterCoordinator(w, chans(), settings, changed)
  return { w, c, changed }
}

describe('FilterCoordinator', () => {
  it('returns raw without touching the worker when filtering is off', async () => {
    const { w, c } = make({ ...on, enabled: false })
    expect(c.getData(0)).toBe(c.channels[0].data)
    expect(await c.getFiltered(0)).toBe(c.channels[0].data)
    expect(w.posted).toHaveLength(0)
    expect(c.pending).toBe(false)
  })

  it('serves raw while pending, then the filtered array (identical object) once ready', () => {
    const { w, c, changed } = make()
    expect(c.getData(0)).toBe(c.channels[0].data)
    expect(c.pending).toBe(true)
    w.reply(w.posted[0])
    const f = c.getData(0)
    expect(Array.from(f!)).toEqual([1001, 1002, 1003])
    expect(c.getData(0)).toBe(f)
    expect(c.pending).toBe(false)
    expect(changed).toHaveBeenCalled()
  })

  it('only filters requested channels', () => {
    const { w, c } = make()
    c.getData(1)
    expect(w.posted.map((p) => p.channel)).toEqual([1])
  })

  it('dedups in-flight requests', async () => {
    const { w, c } = make()
    c.getData(0)
    c.getData(0)
    const p = c.getFiltered(0)
    expect(w.posted).toHaveLength(1)
    w.reply(w.posted[0])
    expect(Array.from(await p)).toEqual([1001, 1002, 1003])
  })

  it('getFiltered after completion resolves from cache without a new request', async () => {
    const { w, c } = make()
    const p = c.getFiltered(0)
    w.reply(w.posted[0])
    const a = await p
    expect(await c.getFiltered(0)).toBe(a)
    expect(w.posted).toHaveLength(1)
  })

  it('invalidates the cache on any settings change and refilters lazily', () => {
    const { w, c } = make()
    c.getData(0)
    w.reply(w.posted[0])
    const old = c.getData(0)
    c.setSettings({ ...on, notch: { ...on.notch, enabled: true } })
    expect(c.getData(0)).toBe(c.channels[0].data) // raw while pending
    expect(c.getData(0)).not.toBe(old)
    expect(w.posted).toHaveLength(2)
    expect(w.posted[1].generation).toBeGreaterThan(w.posted[0].generation)
  })

  it('does nothing when settings are unchanged', () => {
    const { w, c } = make()
    c.getData(0)
    w.reply(w.posted[0])
    const f = c.getData(0)
    c.setSettings(structuredClone(on))
    expect(c.getData(0)).toBe(f)
    expect(w.posted).toHaveLength(1)
  })

  it('discards results from an older settings generation', () => {
    const { w, c } = make()
    c.getData(0)
    const stale = w.posted[0]
    c.setSettings({ ...on, lowpass: { ...on.lowpass, freq: 30 } })
    w.reply(stale)
    expect(c.getData(0)).toBe(c.channels[0].data)
    expect(c.pending).toBe(true)
    w.reply(w.posted[1])
    expect(Array.from(c.getData(0)!)).toEqual([1001, 1002, 1003])
    expect(c.pending).toBe(false)
  })

  it('a getFiltered waiter survives invalidation and resolves with the new generation result', async () => {
    const { w, c } = make()
    const p = c.getFiltered(0)
    const stale = w.posted[0]
    c.setSettings({ ...on, highpass: { ...on.highpass, freq: 1 } })
    w.reply(stale)
    expect(w.posted).toHaveLength(2)
    w.reply(w.posted[1])
    expect(Array.from(await p)).toEqual([1001, 1002, 1003])
  })

  it('turning the master switch off resolves waiters with raw', async () => {
    const { c } = make()
    const p = c.getFiltered(0)
    c.setSettings({ ...on, enabled: false })
    expect(await p).toBe(c.channels[0].data)
  })

  it('rejects waiters on worker error and falls back to raw', async () => {
    const { w, c } = make()
    const p = c.getFiltered(0)
    w.reply(w.posted[0], { data: undefined, error: 'boom' })
    await expect(p).rejects.toThrow('boom')
    expect(c.pending).toBe(false)
    expect(c.getData(0)).toBe(c.channels[0].data)
  })

  it('out-of-range channel yields undefined', () => {
    const { c } = make()
    expect(c.getData(9)).toBeUndefined()
  })

  it('dispose terminates the worker', () => {
    const { w, c } = make()
    c.dispose()
    expect(w.terminated).toBe(true)
  })
})
