import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTER_SETTINGS } from '../dsp'
import { filterLabel, maxFilterFreq } from './label'

describe('filterLabel', () => {
  it('is "No filter" when master is off or no stage on', () => {
    expect(filterLabel(DEFAULT_FILTER_SETTINGS)).toBe('No filter')
    const s = {
      ...DEFAULT_FILTER_SETTINGS,
      enabled: true,
      highpass: { ...DEFAULT_FILTER_SETTINGS.highpass, enabled: false },
      lowpass: { ...DEFAULT_FILTER_SETTINGS.lowpass, enabled: false },
    }
    expect(filterLabel(s)).toBe('No filter')
  })
  it('lists enabled stages', () => {
    const s = {
      ...DEFAULT_FILTER_SETTINGS,
      enabled: true,
      lowpass: { enabled: true, freq: 45, order: 4 },
      notch: { enabled: true, freq: 50, q: 30 },
    }
    expect(filterLabel(s)).toBe('HP 0.5 Hz · LP 45 Hz · Notch 50 Hz')
  })
})

describe('maxFilterFreq', () => {
  it('is just below the lowest Nyquist', () => {
    const m = maxFilterFreq([{ samplingRate: 250 }, { samplingRate: 100 }])
    expect(m).toBeLessThan(50)
    expect(m).toBeGreaterThan(45)
  })
})
