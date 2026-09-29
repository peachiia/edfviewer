import type { FilterSettings } from '../dsp'

export function filterLabel(s: FilterSettings): string {
  if (!s.enabled) return 'No filter'
  const parts: string[] = []
  if (s.highpass.enabled) parts.push(`HP ${s.highpass.freq} Hz`)
  if (s.lowpass.enabled) parts.push(`LP ${s.lowpass.freq} Hz`)
  if (s.notch.enabled) parts.push(`Notch ${s.notch.freq} Hz`)
  return parts.length ? parts.join(' · ') : 'No filter'
}

/** Highest cutoff that is realisable on every channel (just below the lowest Nyquist). */
export function maxFilterFreq(channels: { samplingRate: number }[]): number {
  const fs = channels.length ? Math.min(...channels.map((c) => c.samplingRate)) : 250
  return Math.floor(fs / 2 * 0.98 * 10) / 10
}
