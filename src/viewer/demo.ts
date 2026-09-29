/**
 * DEV-ONLY demo recording (loaded via dynamic import behind import.meta.env.DEV,
 * so it is not part of the production bundle). 8 EEG channels at 250 Hz plus a
 * non-EEG (degC) channel, with annotations incl. duration spans.
 */
import { buildEdf, type FixtureChannel } from '../parser/fixtures'

export function buildDemoEdf(seconds = 180): ArrayBuffer {
  const fs = 250
  const n = seconds * fs
  let seed = 12345
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 32 - 0.5
  }
  // physMin/Max +-1000 uV over +-32767 counts => 1 count ~ 0.03 uV
  const toDig = (uv: number) => Math.round((uv / 1000) * 32767)
  const names = ['Fp1', 'Fp2', 'C3', 'C4', 'P3', 'P4', 'O1', 'O2']
  const channels: FixtureChannel[] = names.map((label, c) => {
    const d = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      const t = i / fs
      const eyesClosed = Math.floor(t / 20) % 2 === 1
      const alpha = (eyesClosed ? 25 : 6) * Math.sin(2 * Math.PI * 10 * t + c)
      const theta = 8 * Math.sin(2 * Math.PI * 6 * t + c * 2)
      const drift = 40 * Math.sin(2 * Math.PI * 0.05 * t)
      const blink = c < 2 && Math.abs(((t % 7) - 3.5)) < 0.15 ? 120 : 0
      d[i] = toDig(alpha + theta + drift + blink + 300 + rnd() * 20)
    }
    return { label, unit: 'uV', physMin: -1000, physMax: 1000, samplesPerRecord: fs, digital: d }
  })
  const temp = new Int32Array(seconds)
  for (let i = 0; i < seconds; i++) temp[i] = Math.round(3650 + 20 * Math.sin(i / 10))
  channels.push({ label: 'Temp', unit: 'degC', physMin: 0, physMax: 100, digMin: 0, digMax: 10000, samplesPerRecord: 1, digital: temp })
  const annotations = []
  for (let t = 0; t < seconds; t += 20) {
    annotations.push({ onset: t, duration: 20, text: t % 40 === 0 ? 'Eyes open' : 'Eyes closed' })
  }
  annotations.push({ onset: 33.5, text: 'Blink test' })
  annotations.push({ onset: 101.25, text: 'Marker' })
  return buildEdf({ format: 'edf', plus: 'C', records: seconds, recordDuration: 1, channels, annotations, annotationSamplesPerRecord: 60 })
}
