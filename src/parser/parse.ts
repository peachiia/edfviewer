/**
 * EDF / EDF+ / BDF / BDF+ parser.
 *
 * Public surface: `loadRecording` (async, source-agnostic; see ADR 0001 — a lazy
 * File.slice() implementation can replace it without touching callers) and the
 * synchronous in-memory `parseEdf`.
 */

export type RecordingFormat = 'edf' | 'bdf'

export interface SignalChannel {
  /** Label from the header (trimmed). UI may override it. */
  label: string
  /** Unit of `data`: "µV" if converted from a voltage dimension, else the header dimension as-is. */
  unit: string
  /** Physical dimension as written in the header (trimmed). */
  originalUnit: string
  /** True when the header dimension was a voltage (data converted to µV). Non-EEG units are kept as-is. */
  isEeg: boolean
  samplingRate: number
  /** Raw (never modified) samples in `unit`. */
  data: Float32Array
}

export type Trigger =
  | { source: 'annotation'; time: number; duration?: number; text: string }
  | { source: 'status'; time: number; value: number; text: string }

export interface Recording {
  format: RecordingFormat
  /** EDF+/BDF+ flavour, if any. (EDF+D is rejected.) */
  plus: boolean
  patient: string
  recordingInfo: string
  /** Local start time "YYYY-MM-DDTHH:MM:SS" (no zone), or null if the header date/time is unparseable. */
  startTime: string | null
  /** Number of complete data records loaded. */
  recordCount: number
  /** Seconds per data record. */
  recordDuration: number
  /** Seconds of data loaded (recordCount * recordDuration). */
  duration: number
  /** Signal channels only; Status and Annotation channels are excluded. */
  channels: SignalChannel[]
  /** Sorted by time. */
  triggers: Trigger[]
  warnings: string[]
}

/** Anything that can yield the file bytes. Lets a lazy implementation slot in later. */
export type RecordingSource = ArrayBuffer | Blob

export class EdfParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EdfParseError'
  }
}

export async function loadRecording(source: RecordingSource): Promise<Recording> {
  const buf = source instanceof ArrayBuffer ? source : await source.arrayBuffer()
  return parseEdf(buf)
}

interface SignalHeader {
  label: string
  unit: string
  physMin: number
  physMax: number
  digMin: number
  digMax: number
  samplesPerRecord: number
  /** Byte offset within a data record. */
  offset: number
}

const HEADER_FIXED = 256
const UNIT_FACTORS: Record<string, number> = { nv: 1e-3, uv: 1, mv: 1e3, v: 1e6 }

export function parseEdf(buffer: ArrayBuffer): Recording {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < HEADER_FIXED) {
    throw new EdfParseError(`File too small (${bytes.length} bytes) to be an EDF/BDF file.`)
  }
  const warnings: string[] = []
  const latin1 = new TextDecoder('latin1')
  const text = (start: number, len: number) => latin1.decode(bytes.subarray(start, start + len)).trim()

  let format: RecordingFormat
  if (bytes[0] === 0xff && text(1, 7) === 'BIOSEMI') format = 'bdf'
  else if (text(0, 8) === '0') format = 'edf'
  else throw new EdfParseError('Not an EDF or BDF file (unrecognised version field in header).')
  const bps = format === 'bdf' ? 3 : 2

  const numField = (start: number, len: number, name: string): number => {
    const s = text(start, len)
    const v = s === '' ? NaN : Number(s)
    if (!Number.isFinite(v)) throw new EdfParseError(`Invalid header: ${name} is "${s}", expected a number.`)
    return v
  }

  const patient = text(8, 80)
  const recordingInfo = text(88, 80)
  const startTime = parseStart(text(168, 8), text(176, 8), warnings)
  const headerBytes = numField(184, 8, 'header size')
  const reserved = text(192, 44)
  const plus = /^(EDF|BDF)\+/.test(reserved)
  if (/^(EDF|BDF)\+D/.test(reserved)) {
    throw new EdfParseError(
      `${reserved.slice(0, 5)} (discontinuous) recordings are not supported. Only continuous EDF, BDF, EDF+C and BDF+ files can be opened.`,
    )
  }
  const declaredRecords = numField(236, 8, 'number of data records')
  const recordDuration = numField(244, 8, 'data record duration')
  const ns = numField(252, 4, 'number of signals')

  if (!Number.isInteger(ns) || ns < 1) throw new EdfParseError(`Invalid header: number of signals is ${ns}.`)
  if (!(recordDuration > 0)) throw new EdfParseError(`Invalid header: data record duration is ${recordDuration}.`)
  if (headerBytes !== HEADER_FIXED + ns * 256) {
    throw new EdfParseError(
      `Invalid header: header size ${headerBytes} does not match ${ns} signal(s) (expected ${HEADER_FIXED + ns * 256}).`,
    )
  }
  if (bytes.length < headerBytes) throw new EdfParseError('File is truncated inside the header.')

  // Per-signal header: field-major layout.
  let p = HEADER_FIXED
  const fields = (len: number): number => {
    const start = p
    p += ns * len
    return start
  }
  const labelAt = fields(16)
  fields(80) // transducer
  const unitAt = fields(8)
  const pminAt = fields(8)
  const pmaxAt = fields(8)
  const dminAt = fields(8)
  const dmaxAt = fields(8)
  fields(80) // prefilter
  const sprAt = fields(8)

  const sigs: SignalHeader[] = []
  let recordBytes = 0
  for (let i = 0; i < ns; i++) {
    const label = text(labelAt + i * 16, 16)
    const spr = numField(sprAt + i * 8, 8, `samples per record of signal ${i + 1}`)
    if (!Number.isInteger(spr) || spr < 0) throw new EdfParseError(`Invalid header: signal ${i + 1} has ${spr} samples per record.`)
    sigs.push({
      label,
      unit: text(unitAt + i * 8, 8),
      physMin: numField(pminAt + i * 8, 8, `physical min of "${label}"`),
      physMax: numField(pmaxAt + i * 8, 8, `physical max of "${label}"`),
      digMin: numField(dminAt + i * 8, 8, `digital min of "${label}"`),
      digMax: numField(dmaxAt + i * 8, 8, `digital max of "${label}"`),
      samplesPerRecord: spr,
      offset: recordBytes,
    })
    recordBytes += spr * bps
  }
  if (recordBytes === 0) throw new EdfParseError('Invalid header: data records are empty.')

  // Record count vs. what is actually in the file.
  const available = bytes.length - headerBytes
  const present = Math.floor(available / recordBytes)
  let recordCount = present
  if (declaredRecords >= 0 && declaredRecords !== present) {
    if (declaredRecords > present) {
      warnings.push(
        `File is truncated: header declares ${declaredRecords} data records but only ${present} complete record(s) are present. Loaded what exists.`,
      )
    } else {
      warnings.push(`Header declares ${declaredRecords} data records but the file contains ${present}; extra data ignored.`)
      recordCount = declaredRecords
    }
  }

  const isAnn = (s: SignalHeader) => /^(EDF|BDF) Annotations$/.test(s.label)
  const isStatus = (s: SignalHeader) => format === 'bdf' && s.label.toLowerCase() === 'status'

  const channels: SignalChannel[] = []
  const triggers: Trigger[] = []
  const decoder = new TextDecoder('utf-8')

  const readRaw = (pos: number): number => {
    if (bps === 2) {
      const v = bytes[pos] | (bytes[pos + 1] << 8)
      return v & 0x8000 ? v - 0x10000 : v
    }
    const v = bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16)
    return v & 0x800000 ? v - 0x1000000 : v
  }

  for (const s of sigs) {
    const n = s.samplesPerRecord * recordCount
    if (isAnn(s)) {
      for (let r = 0; r < recordCount; r++) {
        const start = headerBytes + r * recordBytes + s.offset
        const raw = bytes.subarray(start, start + s.samplesPerRecord * bps)
        parseTals(decoder.decode(raw), triggers)
      }
      continue
    }
    const rate = s.samplesPerRecord / recordDuration
    if (isStatus(s)) {
      let prev = 0
      for (let r = 0; r < recordCount; r++) {
        let pos = headerBytes + r * recordBytes + s.offset
        for (let k = 0; k < s.samplesPerRecord; k++, pos += bps) {
          const v = readRaw(pos) & 0xffff // low 16 bits; system-flag bits >= 16 masked
          if (v !== prev && v !== 0) {
            triggers.push({ source: 'status', time: (r * s.samplesPerRecord + k) / rate, value: v, text: String(v) })
          }
          prev = v
        }
      }
      continue
    }

    const factor = UNIT_FACTORS[s.unit.toLowerCase().replace(/[µμ]/g, 'u')]
    const isEeg = factor !== undefined
    let dRange = s.digMax - s.digMin
    if (dRange === 0) {
      warnings.push(`Channel "${s.label}" has equal digital min/max; samples left unscaled.`)
      dRange = 1
    }
    const gain = ((s.physMax - s.physMin) / dRange) * (factor ?? 1)
    const offset = s.physMin * (factor ?? 1)
    const data = new Float32Array(n)
    let i = 0
    for (let r = 0; r < recordCount; r++) {
      let pos = headerBytes + r * recordBytes + s.offset
      for (let k = 0; k < s.samplesPerRecord; k++, pos += bps) {
        data[i++] = (readRaw(pos) - s.digMin) * gain + offset
      }
    }
    channels.push({
      label: s.label,
      unit: isEeg ? 'µV' : s.unit,
      originalUnit: s.unit,
      isEeg,
      samplingRate: rate,
      data,
    })
  }

  triggers.sort((a, b) => a.time - b.time)

  return {
    format,
    plus,
    patient,
    recordingInfo,
    startTime,
    recordCount,
    recordDuration,
    duration: recordCount * recordDuration,
    channels,
    triggers,
    warnings,
  }
}

/** TAL: +onset[\x15duration]\x14text\x14[text\x14...]\x00 ; time-keeping TALs have no text. */
function parseTals(raw: string, out: Trigger[]): void {
  for (const tal of raw.split('\u0000')) {
    if (!tal) continue
    const parts = tal.split('\u0014')
    const [onsetStr, durStr] = parts[0].split('\u0015')
    const time = Number(onsetStr)
    if (!Number.isFinite(time)) continue
    const duration = durStr !== undefined && durStr !== '' ? Number(durStr) : undefined
    for (const t of parts.slice(1)) {
      if (t === '') continue
      const trig: Trigger = { source: 'annotation', time, text: t }
      if (duration !== undefined && Number.isFinite(duration)) trig.duration = duration
      out.push(trig)
    }
  }
}

function parseStart(date: string, time: string, warnings: string[]): string | null {
  const d = /^(\d\d)\.(\d\d)\.(\d\d)$/.exec(date)
  const t = /^(\d\d)\.(\d\d)\.(\d\d)$/.exec(time)
  if (!d || !t) {
    warnings.push(`Unparseable start date/time in header ("${date}" "${time}").`)
    return null
  }
  const yy = Number(d[3])
  const year = yy >= 85 ? 1900 + yy : 2000 + yy
  return `${year}-${d[2]}-${d[1]}T${t[1]}:${t[2]}:${t[3]}`
}
