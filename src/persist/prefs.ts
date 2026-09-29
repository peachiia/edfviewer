/**
 * Versioned, defensive localStorage layer for GLOBAL preferences. Pure logic +
 * an injectable storage so it is unit-testable. Every storage access is wrapped
 * in try/catch: blocked, full or corrupt storage just yields defaults.
 * Zones and other per-file state are deliberately never persisted.
 */
import { DEFAULT_FILTER_SETTINGS, DEFAULT_SEGMENT_SECONDS, MAX_SEGMENT_SECONDS, MIN_SEGMENT_SECONDS, type FilterSettings } from '../dsp'
import { DEFAULT_SENSITIVITY, DEFAULT_WINDOW, clamp, clampStep, clampWindow } from '../viewer/math'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const PREFS_KEY = 'edfviewer.prefs'
export const CHANNEL_NAMES_KEY = 'edfviewer.channelNames'
export const THEME_KEY = 'edfviewer.theme'
export const SCHEMA_VERSION = 1

export type PsdViewMode = 'side' | 'overlay'

export interface ViewerPrefs {
  window: number
  /** null = follow window length */
  step: number | null
  sensitivity: number
}
export interface PsdPrefs {
  segment: number
  fmax: number
  log: boolean
  sharedY: boolean
  view: PsdViewMode
  open: boolean
  height: number
}
export interface Prefs {
  filters: FilterSettings
  viewer: ViewerPrefs
  psd: PsdPrefs
}

export const PSD_HEIGHT_MIN = 160
export const PSD_HEIGHT_MAX = 2000
export const DEFAULT_PSD_PREFS: PsdPrefs = {
  segment: DEFAULT_SEGMENT_SECONDS,
  fmax: 45,
  log: false,
  sharedY: true,
  view: 'side',
  open: true,
  height: 300,
}
export const DEFAULT_PREFS: Prefs = {
  filters: DEFAULT_FILTER_SETTINGS,
  viewer: { window: DEFAULT_WINDOW, step: null, sensitivity: DEFAULT_SENSITIVITY },
  psd: DEFAULT_PSD_PREFS,
}

// ---- field validators: take unknown, return a valid value (falling back) ----
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, lo: number, hi: number, fb: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fb
const bool = (v: unknown, fb: boolean): boolean => (typeof v === 'boolean' ? v : fb)

function sanitizePass(v: unknown, fb: FilterSettings['highpass']): FilterSettings['highpass'] {
  const o = isObj(v) ? v : {}
  return {
    enabled: bool(o.enabled, fb.enabled),
    freq: num(o.freq, 0.01, 10000, fb.freq),
    order: Math.round(num(o.order, 2, 8, fb.order)),
  }
}

export function sanitizeFilters(v: unknown): FilterSettings {
  const d = DEFAULT_FILTER_SETTINGS
  const o = isObj(v) ? v : {}
  const n = isObj(o.notch) ? o.notch : {}
  return {
    enabled: bool(o.enabled, d.enabled),
    highpass: sanitizePass(o.highpass, d.highpass),
    lowpass: sanitizePass(o.lowpass, d.lowpass),
    notch: {
      enabled: bool(n.enabled, d.notch.enabled),
      freq: num(n.freq, 0.01, 10000, d.notch.freq),
      q: num(n.q, 0.5, 1000, d.notch.q),
    },
  }
}

export function sanitizeViewer(v: unknown): ViewerPrefs {
  const o = isObj(v) ? v : {}
  const d = DEFAULT_PREFS.viewer
  return {
    window: clampWindow(typeof o.window === 'number' ? o.window : d.window),
    step: typeof o.step === 'number' && Number.isFinite(o.step) && o.step > 0 ? clampStep(o.step) : null,
    sensitivity: num(o.sensitivity, 0.01, 1e6, d.sensitivity),
  }
}

export function sanitizePsd(v: unknown): PsdPrefs {
  const o = isObj(v) ? v : {}
  const d = DEFAULT_PSD_PREFS
  return {
    segment: Math.round(num(o.segment, MIN_SEGMENT_SECONDS, MAX_SEGMENT_SECONDS, d.segment)),
    fmax: num(o.fmax, 1, 10000, d.fmax),
    log: bool(o.log, d.log),
    sharedY: bool(o.sharedY, d.sharedY),
    view: o.view === 'overlay' || o.view === 'side' ? o.view : d.view,
    open: bool(o.open, d.open),
    height: Math.round(num(o.height, PSD_HEIGHT_MIN, PSD_HEIGHT_MAX, d.height)),
  }
}

/** Validate/clamp an arbitrary parsed value into complete Prefs. Never throws. */
export function sanitizePrefs(raw: unknown): Prefs {
  const o = isObj(raw) && raw.v === SCHEMA_VERSION ? raw : {}
  return { filters: sanitizeFilters(o.filters), viewer: sanitizeViewer(o.viewer), psd: sanitizePsd(o.psd) }
}

function readJson(storage: StorageLike | null, key: string): unknown {
  try {
    const s = storage?.getItem(key)
    return s ? JSON.parse(s) : undefined
  } catch {
    return undefined
  }
}
function writeJson(storage: StorageLike | null, key: string, value: unknown): boolean {
  try {
    if (!storage) return false
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function loadPrefs(storage: StorageLike | null): Prefs {
  return sanitizePrefs(readJson(storage, PREFS_KEY))
}
export function savePrefs(storage: StorageLike | null, prefs: Prefs): boolean {
  return writeJson(storage, PREFS_KEY, { v: SCHEMA_VERSION, ...prefs })
}

// ---- theme (plain string, key kept compatible with the original) ----
export function loadTheme(storage: StorageLike | null): 'dark' | 'light' {
  try {
    const t = storage?.getItem(THEME_KEY)
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* ignore */
  }
  return 'dark'
}
export function saveTheme(storage: StorageLike | null, theme: 'dark' | 'light'): void {
  try {
    storage?.setItem(THEME_KEY, theme)
  } catch {
    /* ignore */
  }
}

// ---- last-used channel names ----
export interface SavedChannelNames {
  rates: number[]
  names: string[]
}

export function loadChannelNames(storage: StorageLike | null): SavedChannelNames | null {
  const o = readJson(storage, CHANNEL_NAMES_KEY)
  if (!isObj(o) || o.v !== SCHEMA_VERSION || !Array.isArray(o.rates) || !Array.isArray(o.names)) return null
  if (o.rates.length === 0 || o.rates.length !== o.names.length) return null
  if (!o.rates.every((r) => typeof r === 'number' && Number.isFinite(r)) || !o.names.every((n) => typeof n === 'string'))
    return null
  return { rates: o.rates as number[], names: (o.names as string[]).map((n) => n.slice(0, 64)) }
}
export function saveChannelNames(storage: StorageLike | null, saved: SavedChannelNames): boolean {
  return writeJson(storage, CHANNEL_NAMES_KEY, { v: SCHEMA_VERSION, ...saved })
}

/**
 * Names to pre-apply to a new file: only when the channel count AND every
 * per-channel sampling rate match the saved set. Blank names become null
 * (caller keeps the header label there).
 */
export function matchChannelNames(saved: SavedChannelNames | null, rates: readonly number[]): (string | null)[] | null {
  if (!saved || saved.rates.length !== rates.length) return null
  if (!saved.rates.every((r, i) => r === rates[i])) return null
  return saved.names.map((n) => (n.trim() === '' ? null : n))
}

// ---- debounced store ----
type Section = keyof Prefs

export interface PrefsStore {
  get(): Prefs
  /** Shallow-merge into one section and schedule a debounced write. */
  patch<S extends Section>(section: S, partial: Partial<Prefs[S]>): void
  /** Debounced save of the channel-name list. */
  setChannelNames(saved: SavedChannelNames): void
  getChannelNames(): SavedChannelNames | null
  /** Write anything pending immediately. */
  flush(): void
}

export function createPrefsStore(storage: StorageLike | null, delayMs = 400): PrefsStore {
  let prefs = loadPrefs(storage)
  let names: SavedChannelNames | null = loadChannelNames(storage)
  let timer: ReturnType<typeof setTimeout> | null = null
  let dirtyPrefs = false
  let dirtyNames = false

  const flush = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (dirtyPrefs) savePrefs(storage, prefs)
    if (dirtyNames && names) saveChannelNames(storage, names)
    dirtyPrefs = dirtyNames = false
  }
  const schedule = () => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(flush, delayMs)
  }
  return {
    get: () => prefs,
    patch(section, partial) {
      // re-sanitize so callers can never store out-of-range values
      const merged = { ...prefs[section], ...partial }
      const clean =
        section === 'filters' ? sanitizeFilters(merged) : section === 'viewer' ? sanitizeViewer(merged) : sanitizePsd(merged)
      prefs = { ...prefs, [section]: clean }
      dirtyPrefs = true
      schedule()
    },
    setChannelNames(saved) {
      names = saved
      dirtyNames = true
      schedule()
    },
    getChannelNames: () => names,
    flush,
  }
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

let shared: PrefsStore | null = null
/** App-wide store on window.localStorage (created lazily; safe when storage is blocked). */
export function prefsStore(): PrefsStore {
  if (!shared) {
    shared = createPrefsStore(browserStorage())
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => shared?.flush())
  }
  return shared
}
