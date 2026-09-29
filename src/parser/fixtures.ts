/**
 * Synthetic EDF/EDF+/BDF/BDF+ writer for tests. Generates tiny recordings in
 * code so no real recordings need to be committed.
 */

export type FixtureFormat = 'edf' | 'bdf'

export interface FixtureChannel {
  label: string
  /** Physical dimension, e.g. "uV". Default "uV". */
  unit?: string
  physMin: number
  physMax: number
  /** Default: -32768 (EDF) / -8388608 (BDF). */
  digMin?: number
  /** Default: 32767 (EDF) / 8388607 (BDF). */
  digMax?: number
  samplesPerRecord: number
  /** Raw digital samples, length = records * samplesPerRecord. */
  digital: ArrayLike<number>
}

export interface FixtureAnnotation {
  onset: number
  duration?: number
  text: string
}

export interface FixtureSpec {
  format: FixtureFormat
  /** EDF+/BDF+ flavour written to the reserved field. */
  plus?: 'C' | 'D'
  /** Number of data records actually written. */
  records: number
  /** Value written in the header's record-count field (default: records). */
  declaredRecords?: number
  recordDuration: number
  /** "dd.mm.yy" */
  startDate?: string
  /** "hh.mm.ss" */
  startTime?: string
  patient?: string
  recording?: string
  channels: FixtureChannel[]
  /** If set, an annotations channel is appended holding these TALs. */
  annotations?: FixtureAnnotation[]
  /** Samples per record of the annotation channel (default 30). */
  annotationSamplesPerRecord?: number
  /** Drop this many bytes from the end of the file. */
  truncateBytes?: number
}

const ASCII = (s: string, n: number): string => {
  if (s.length > n) throw new Error(`fixture field too long: ${s}`)
  return s.padEnd(n, ' ')
}

const num = (v: number): string => String(v)

export function buildEdf(spec: FixtureSpec): ArrayBuffer {
  const bdf = spec.format === 'bdf'
  const bps = bdf ? 3 : 2
  const digMinDefault = bdf ? -8388608 : -32768
  const digMaxDefault = bdf ? 8388607 : 32767
  const annSpr = spec.annotationSamplesPerRecord ?? 30

  const chans = spec.channels
  const hasAnn = spec.annotations !== undefined
  const ns = chans.length + (hasAnn ? 1 : 0)
  const headerBytes = 256 + ns * 256

  let h = ''
  h += bdf ? 'ÿBIOSEMI' : ASCII('0', 8)
  h += ASCII(spec.patient ?? 'X X X X', 80)
  h += ASCII(spec.recording ?? 'Startdate X X X X', 80)
  h += ASCII(spec.startDate ?? '01.02.03', 8)
  h += ASCII(spec.startTime ?? '04.05.06', 8)
  h += ASCII(num(headerBytes), 8)
  const reserved = spec.plus ? `${bdf ? 'BDF' : 'EDF'}+${spec.plus}` : ''
  h += ASCII(reserved, 44)
  h += ASCII(num(spec.declaredRecords ?? spec.records), 8)
  h += ASCII(num(spec.recordDuration), 8)
  h += ASCII(num(ns), 4)

  type Sig = { label: string; unit: string; pmin: number; pmax: number; dmin: number; dmax: number; spr: number }
  const all: Sig[] = chans.map((c) => ({
    label: c.label,
    unit: c.unit ?? 'uV',
    pmin: c.physMin,
    pmax: c.physMax,
    dmin: c.digMin ?? digMinDefault,
    dmax: c.digMax ?? digMaxDefault,
    spr: c.samplesPerRecord,
  }))
  if (hasAnn) {
    all.push({
      label: bdf ? 'BDF Annotations' : 'EDF Annotations',
      unit: '', pmin: -1, pmax: 1, dmin: digMinDefault, dmax: digMaxDefault, spr: annSpr,
    })
  }
  const col = (f: (c: Sig) => string, n: number) => all.map((c) => ASCII(f(c), n)).join('')
  h += col((c) => c.label, 16)
  h += col(() => '', 80) // transducer
  h += col((c) => c.unit, 8)
  h += col((c) => num(c.pmin), 8)
  h += col((c) => num(c.pmax), 8)
  h += col((c) => num(c.dmin), 8)
  h += col((c) => num(c.dmax), 8)
  h += col(() => '', 80) // prefilter
  h += col((c) => num(c.spr), 8)
  h += col(() => '', 32)
  if (h.length !== headerBytes) throw new Error(`fixture header size ${h.length} != ${headerBytes}`)

  const recordBytes = all.reduce((s, c) => s + c.spr * bps, 0)
  const out = new Uint8Array(headerBytes + recordBytes * spec.records)
  for (let i = 0; i < h.length; i++) out[i] = h.charCodeAt(i) & 0xff
  const enc = new TextEncoder()

  let pos = headerBytes
  for (let r = 0; r < spec.records; r++) {
    for (const ch of chans) {
      for (let s = 0; s < ch.samplesPerRecord; s++) {
        const v = ch.digital[r * ch.samplesPerRecord + s]
        out[pos++] = v & 0xff
        out[pos++] = (v >> 8) & 0xff
        if (bdf) out[pos++] = (v >> 16) & 0xff
      }
    }
    if (hasAnn) {
      let tal = `+${r * spec.recordDuration}\u0014\u0014\u0000`
      for (const a of spec.annotations!) {
        if (Math.floor(a.onset / spec.recordDuration) !== r) continue
        const on = a.onset >= 0 ? `+${a.onset}` : `${a.onset}`
        tal += `${on}${a.duration !== undefined ? `\u0015${a.duration}` : ''}\u0014${a.text}\u0014\u0000`
      }
      const bytes = enc.encode(tal)
      if (bytes.length > annSpr * bps) throw new Error('fixture annotation channel too small')
      out.set(bytes, pos)
      pos += annSpr * bps
    }
  }
  return out.slice(0, out.length - (spec.truncateBytes ?? 0)).buffer
}

/** Sine wave in raw digital counts (rounded). */
export function sineDigital(n: number, fs: number, freq: number, amp: number): Int32Array {
  const a = new Int32Array(n)
  for (let i = 0; i < n; i++) a[i] = Math.round(amp * Math.sin((2 * Math.PI * freq * i) / fs))
  return a
}
