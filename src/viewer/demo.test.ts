import { describe, expect, it } from 'vitest'
import { parseEdf } from '../parser/parse'
import { buildDemoEdf } from './demo'

describe('dev demo recording', () => {
  it('parses with EEG + non-EEG channels and annotation triggers', () => {
    const rec = parseEdf(buildDemoEdf(60))
    expect(rec.channels).toHaveLength(9)
    expect(rec.channels[0].isEeg).toBe(true)
    expect(rec.channels[8].isEeg).toBe(false)
    expect(rec.channels[8].unit).toBe('degC')
    expect(rec.duration).toBe(60)
    expect(rec.warnings).toEqual([])
    expect(rec.triggers.some((t) => t.source === 'annotation' && t.duration === 20)).toBe(true)
    expect(rec.triggers.some((t) => t.text === 'Marker' || t.text === 'Blink test')).toBe(true)
  })
})
