import { describe, expect, it, vi } from 'vitest'
import {
  CHANNEL_NAMES_KEY,
  DEFAULT_PREFS,
  PREFS_KEY,
  THEME_KEY,
  createPrefsStore,
  loadChannelNames,
  loadPrefs,
  loadTheme,
  matchChannelNames,
  sanitizePrefs,
  savePrefs,
  type StorageLike,
} from './prefs'

const mem = (init: Record<string, string> = {}): StorageLike & { m: Map<string, string> } => {
  const m = new Map(Object.entries(init))
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}
const throwing: StorageLike = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('load/save prefs', () => {
  it('returns defaults for null, blocked, empty and corrupt storage', () => {
    expect(loadPrefs(null)).toEqual(DEFAULT_PREFS)
    expect(loadPrefs(throwing)).toEqual(DEFAULT_PREFS)
    expect(loadPrefs(mem())).toEqual(DEFAULT_PREFS)
    expect(loadPrefs(mem({ [PREFS_KEY]: '{not json' }))).toEqual(DEFAULT_PREFS)
    expect(loadPrefs(mem({ [PREFS_KEY]: '42' }))).toEqual(DEFAULT_PREFS)
  })
  it('ignores an unknown schema version', () => {
    expect(loadPrefs(mem({ [PREFS_KEY]: JSON.stringify({ v: 99, viewer: { window: 30 } }) }))).toEqual(DEFAULT_PREFS)
  })
  it('round-trips', () => {
    const s = mem()
    const p = {
      ...DEFAULT_PREFS,
      viewer: { window: 20, step: 5, sensitivity: 100 },
      psd: { ...DEFAULT_PREFS.psd, log: true, view: 'overlay' as const },
    }
    expect(savePrefs(s, p)).toBe(true)
    expect(loadPrefs(s)).toEqual(p)
  })
  it('save reports failure instead of throwing', () => {
    expect(savePrefs(throwing, DEFAULT_PREFS)).toBe(false)
    expect(savePrefs(null, DEFAULT_PREFS)).toBe(false)
  })
})

describe('sanitizePrefs', () => {
  it('clamps and repairs bad values', () => {
    const p = sanitizePrefs({
      v: 1,
      filters: { enabled: 'yes', highpass: { freq: -5, order: 99 }, notch: { q: 'x' } },
      viewer: { window: 9999, step: -1, sensitivity: NaN },
      psd: { segment: 100, fmax: 0, view: 'weird', log: 1, height: 5 },
    })
    expect(p.filters.enabled).toBe(false)
    expect(p.filters.highpass.freq).toBe(0.01)
    expect(p.filters.highpass.order).toBe(8)
    expect(p.filters.notch.q).toBe(DEFAULT_PREFS.filters.notch.q)
    expect(p.viewer.window).toBe(60)
    expect(p.viewer.step).toBeNull()
    expect(p.viewer.sensitivity).toBe(DEFAULT_PREFS.viewer.sensitivity)
    expect(p.psd.segment).toBe(8)
    expect(p.psd.fmax).toBe(1)
    expect(p.psd.view).toBe('side')
    expect(p.psd.log).toBe(false)
    expect(p.psd.height).toBe(160)
  })
  it('keeps valid values', () => {
    const p = sanitizePrefs({ v: 1, viewer: { window: 20, step: 2.5, sensitivity: 50 } })
    expect(p.viewer).toEqual({ window: 20, step: 2.5, sensitivity: 50 })
  })
})

describe('theme', () => {
  it('reads the existing key and defaults to dark', () => {
    expect(loadTheme(mem({ [THEME_KEY]: 'light' }))).toBe('light')
    expect(loadTheme(mem({ [THEME_KEY]: 'blue' }))).toBe('dark')
    expect(loadTheme(throwing)).toBe('dark')
  })
})

describe('channel names', () => {
  const saved = { rates: [256, 256, 512], names: ['Fp1', '', 'EOG'] }
  it('matches only on same count and per-channel rates', () => {
    expect(matchChannelNames(saved, [256, 256, 512])).toEqual(['Fp1', null, 'EOG'])
    expect(matchChannelNames(saved, [256, 256])).toBeNull()
    expect(matchChannelNames(saved, [256, 512, 256])).toBeNull()
    expect(matchChannelNames(saved, [256, 256, 256])).toBeNull()
    expect(matchChannelNames(null, [256])).toBeNull()
  })
  it('rejects malformed stored lists', () => {
    const bad = (v: unknown) => loadChannelNames(mem({ [CHANNEL_NAMES_KEY]: JSON.stringify(v) }))
    expect(bad({ v: 1, rates: [1, 2], names: ['a'] })).toBeNull()
    expect(bad({ v: 1, rates: [1], names: [3] })).toBeNull()
    expect(bad({ v: 2, rates: [1], names: ['a'] })).toBeNull()
    expect(bad({ v: 1, rates: [], names: [] })).toBeNull()
    expect(loadChannelNames(throwing)).toBeNull()
  })
})

describe('createPrefsStore', () => {
  it('debounces writes and merges sections', () => {
    vi.useFakeTimers()
    const s = mem()
    const store = createPrefsStore(s, 400)
    store.patch('viewer', { window: 20 })
    store.patch('viewer', { sensitivity: 100 })
    store.patch('psd', { log: true })
    expect(s.m.has(PREFS_KEY)).toBe(false)
    vi.advanceTimersByTime(399)
    expect(s.m.has(PREFS_KEY)).toBe(false)
    vi.advanceTimersByTime(2)
    const p = loadPrefs(s)
    expect(p.viewer.window).toBe(20)
    expect(p.viewer.sensitivity).toBe(100)
    expect(p.psd.log).toBe(true)
    vi.useRealTimers()
  })
  it('sanitizes patches and flush writes immediately', () => {
    const s = mem()
    const store = createPrefsStore(s)
    store.patch('viewer', { window: 1e9 })
    expect(store.get().viewer.window).toBe(60)
    store.setChannelNames({ rates: [1], names: ['A'] })
    store.flush()
    expect(loadChannelNames(s)).toEqual({ rates: [1], names: ['A'] })
  })
  it('never throws with blocked storage', () => {
    const store = createPrefsStore(throwing)
    expect(store.get()).toEqual(DEFAULT_PREFS)
    store.patch('psd', { log: true })
    expect(() => store.flush()).not.toThrow()
  })
  it('starts from persisted values', () => {
    const s = mem()
    savePrefs(s, { ...DEFAULT_PREFS, viewer: { ...DEFAULT_PREFS.viewer, window: 30 } })
    expect(createPrefsStore(s).get().viewer.window).toBe(30)
  })
})
