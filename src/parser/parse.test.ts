import { describe, expect, it } from 'vitest'
import { buildEdf, sineDigital } from './fixtures'
import { EdfParseError, parseEdf } from './parse'

const base = { recordDuration: 1, records: 4 }

describe('header', () => {
  it('parses start time, duration, record info and sampling rate', () => {
    const buf = buildEdf({
      format: 'edf', ...base, startDate: '15.06.24', startTime: '13.45.10',
      channels: [{ label: 'Fp1', physMin: -100, physMax: 100, samplesPerRecord: 8, digital: new Int16Array(32) }],
    })
    const rec = parseEdf(buf)
    expect(rec.format).toBe('edf')
    expect(rec.startTime).toBe('2024-06-15T13:45:10')
    expect(rec.recordCount).toBe(4)
    expect(rec.recordDuration).toBe(1)
    expect(rec.duration).toBe(4)
    expect(rec.channels).toHaveLength(1)
    expect(rec.channels[0].label).toBe('Fp1')
    expect(rec.channels[0].samplingRate).toBe(8)
    expect(rec.channels[0].data).toHaveLength(32)
    expect(rec.warnings).toEqual([])
  })

  it('maps two-digit years >= 85 to 19xx', () => {
    const buf = buildEdf({
      format: 'edf', ...base, startDate: '01.01.99',
      channels: [{ label: 'a', physMin: 0, physMax: 1, samplesPerRecord: 1, digital: new Int16Array(4) }],
    })
    expect(parseEdf(buf).startTime?.startsWith('1999-01-01')).toBe(true)
  })

  it('keeps per-channel sampling rates', () => {
    const buf = buildEdf({
      format: 'edf', recordDuration: 2, records: 2,
      channels: [
        { label: 'a', physMin: -1, physMax: 1, samplesPerRecord: 10, digital: new Int16Array(20) },
        { label: 'b', physMin: -1, physMax: 1, samplesPerRecord: 40, digital: new Int16Array(80) },
      ],
    })
    const rec = parseEdf(buf)
    expect(rec.channels.map((c) => c.samplingRate)).toEqual([5, 20])
    expect(rec.channels.map((c) => c.data.length)).toEqual([20, 80])
  })

  it('throws a clear error for garbage input', () => {
    expect(() => parseEdf(new ArrayBuffer(10))).toThrow(EdfParseError)
    expect(() => parseEdf(new Uint8Array(512).fill(65).buffer)).toThrow(/not an EDF|BDF/i)
  })

  it('throws on inconsistent header length', () => {
    const buf = buildEdf({
      format: 'edf', ...base,
      channels: [{ label: 'a', physMin: 0, physMax: 1, samplesPerRecord: 1, digital: new Int16Array(4) }],
    })
    new Uint8Array(buf).set(new TextEncoder().encode('999     '), 184)
    expect(() => parseEdf(buf)).toThrow(EdfParseError)
  })
})

describe('sample decoding and scaling', () => {
  it('decodes 16-bit EDF, signed, with physical scaling to uV', () => {
    const digital = Int16Array.from([-32768, -16384, 0, 32767])
    const rec = parseEdf(buildEdf({
      format: 'edf', recordDuration: 1, records: 1,
      channels: [{ label: 'x', physMin: -3200, physMax: 3200, samplesPerRecord: 4, digital }],
    }))
    const d = rec.channels[0].data
    expect(d[0]).toBeCloseTo(-3200, 2)
    expect(d[1]).toBeCloseTo(-1600, 1)
    expect(d[2]).toBeCloseTo(0.049, 2) // digital 0 is offset by half a count
    expect(d[3]).toBeCloseTo(3200, 2)
    expect(rec.channels[0].unit).toBe('µV')
  })

  it('decodes 24-bit BDF signed values', () => {
    const digital = Int32Array.from([-8388608, -1, 0, 1, 8388607])
    const rec = parseEdf(buildEdf({
      format: 'bdf', recordDuration: 1, records: 1,
      channels: [{ label: 'x', physMin: -262144, physMax: 262143, samplesPerRecord: 5, digital }],
    }))
    expect(rec.format).toBe('bdf')
    const d = rec.channels[0].data
    expect(d[0]).toBeCloseTo(-262144, 0)
    expect(d[4]).toBeCloseTo(262143, 0)
    // 1 count = 524287 / 16777215 = ~1/32 uV
    expect(d[3] - d[2]).toBeCloseTo(1 / 32, 3)
    expect(d[2] - d[1]).toBeCloseTo(1 / 32, 3)
  })

  it('converts mV and V to uV; keeps non-voltage units as-is with a flag', () => {
    const mk = (label: string, unit: string) => ({
      label, unit, physMin: -1, physMax: 1, digMin: -1, digMax: 1, samplesPerRecord: 1, digital: Int16Array.from([1]),
    })
    const rec = parseEdf(buildEdf({
      format: 'edf', recordDuration: 1, records: 1,
      channels: [mk('a', 'uV'), mk('b', 'mV'), mk('c', 'V'), mk('d', 'degC'), mk('e', '')],
    }))
    const [a, b, c, d, e] = rec.channels
    expect([a.data[0], b.data[0], c.data[0]]).toEqual([1, 1000, 1e6])
    expect([a.unit, b.unit, c.unit]).toEqual(['µV', 'µV', 'µV'])
    expect([a.isEeg, b.isEeg, c.isEeg]).toEqual([true, true, true])
    expect(d.unit).toBe('degC')
    expect(d.data[0]).toBe(1)
    expect(d.isEeg).toBe(false)
    expect(e.isEeg).toBe(false)
    expect(b.originalUnit).toBe('mV')
  })

  it('round-trips a sine', () => {
    const digital = sineDigital(256, 256, 10, 1000)
    const rec = parseEdf(buildEdf({
      format: 'edf', recordDuration: 1, records: 1,
      channels: [{ label: 's', physMin: -32768, physMax: 32767, samplesPerRecord: 256, digital }],
    }))
    for (let i = 0; i < 256; i++) expect(rec.channels[0].data[i]).toBeCloseTo(digital[i], 3)
  })
})

describe('EDF+ annotations', () => {
  const chan = { label: 'a', physMin: -1, physMax: 1, samplesPerRecord: 2, digital: new Int16Array(8) }

  it('extracts TALs and hides the annotation channel', () => {
    const rec = parseEdf(buildEdf({
      format: 'edf', plus: 'C', ...base, channels: [chan],
      annotations: [
        { onset: 0.5, text: 'eyes open' },
        { onset: 2.25, duration: 1.5, text: 'eyes closed' },
      ],
    }))
    expect(rec.channels.map((c) => c.label)).toEqual(['a'])
    expect(rec.triggers).toEqual([
      { source: 'annotation', time: 0.5, text: 'eyes open' },
      { source: 'annotation', time: 2.25, duration: 1.5, text: 'eyes closed' },
    ])
  })

  it('skips time-keeping TALs', () => {
    const rec = parseEdf(buildEdf({
      format: 'edf', plus: 'C', ...base, channels: [chan], annotations: [],
    }))
    expect(rec.triggers).toEqual([])
  })

  it('works in BDF+ (24-bit annotation channel)', () => {
    const rec = parseEdf(buildEdf({
      format: 'bdf', plus: 'C', ...base, channels: [{ ...chan, digital: new Int32Array(8) }],
      annotations: [{ onset: 1, text: 'go' }],
    }))
    expect(rec.channels).toHaveLength(1)
    expect(rec.triggers).toEqual([{ source: 'annotation', time: 1, text: 'go' }])
  })

  it('rejects EDF+D with a clear message', () => {
    const buf = buildEdf({ format: 'edf', plus: 'D', ...base, channels: [chan], annotations: [] })
    expect(() => parseEdf(buf)).toThrow(/EDF\+D.*not supported/i)
  })
})

describe('BioSemi Status channel', () => {
  const status = (values: number[], spr = values.length) => ({
    label: 'Status', unit: '', physMin: -8388608, physMax: 8388607, samplesPerRecord: spr, digital: values,
  })

  it('emits a trigger on each rising change of the low 16 bits and hides the channel', () => {
    const values = [0, 0, 5, 5, 0, 0, 7, 9, 0, 0]
    const rec = parseEdf(buildEdf({
      format: 'bdf', recordDuration: 1, records: 1, channels: [status(values)],
    }))
    expect(rec.channels).toHaveLength(0)
    expect(rec.triggers).toEqual([
      { source: 'status', time: 0.2, value: 5, text: '5' },
      { source: 'status', time: 0.6, value: 7, text: '7' },
      { source: 'status', time: 0.7, value: 9, text: '9' },
    ])
  })

  it('masks system-flag bits >= 16', () => {
    const toSigned = (v: number) => (v >= 0x800000 ? v - 0x1000000 : v)
    const flags = 0xff0000
    const values = [flags, flags, flags | 3, flags | 3, flags, flags].map(toSigned)
    const rec = parseEdf(buildEdf({
      format: 'bdf', recordDuration: 1, records: 1, channels: [status(values)],
    }))
    expect(rec.triggers.map((t) => (t.source === 'status' ? t.value : null))).toEqual([3])
    expect(rec.triggers[0].time).toBeCloseTo(2 / 6, 10)
  })

  it('uses the channel sampling rate for time and works across records', () => {
    const rec = parseEdf(buildEdf({
      format: 'bdf', recordDuration: 1, records: 2,
      channels: [status([0, 0, 0, 1, 1, 0, 0, 2], 4)],
    }))
    expect(rec.triggers.map((t) => [t.time, t.source === 'status' ? t.value : null])).toEqual([[0.75, 1], [1.75, 2]])
  })
})

describe('truncated and odd files', () => {
  const chan = (n: number) => ({
    label: 'a', physMin: -1, physMax: 1, samplesPerRecord: 4, digital: new Int16Array(n * 4).fill(100),
  })

  it('loads complete records and warns when the file is truncated', () => {
    const rec = parseEdf(buildEdf({
      format: 'edf', recordDuration: 1, records: 4, channels: [chan(4)], truncateBytes: 4,
    }))
    expect(rec.recordCount).toBe(3)
    expect(rec.duration).toBe(3)
    expect(rec.channels[0].data).toHaveLength(12)
    expect(rec.warnings.join(' ')).toMatch(/truncated/i)
  })

  it('handles unknown record count (-1) from file size without warning', () => {
    const rec = parseEdf(buildEdf({
      format: 'edf', recordDuration: 1, records: 3, declaredRecords: -1, channels: [chan(3)],
    }))
    expect(rec.recordCount).toBe(3)
    expect(rec.warnings).toEqual([])
  })

  it('warns when the header declares fewer records than present', () => {
    const rec = parseEdf(buildEdf({
      format: 'edf', recordDuration: 1, records: 4, declaredRecords: 2, channels: [chan(4)],
    }))
    expect(rec.recordCount).toBe(2)
    expect(rec.warnings.length).toBeGreaterThan(0)
  })
})
