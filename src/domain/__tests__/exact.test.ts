import { describe, expect, it } from 'vitest'
import { comparePct, displayOfficial, exact, isMissing } from '../exact'

describe('exact', () => {
  it('preserves the raw source string verbatim', () => {
    const v = exact('74.666')
    expect(v.raw).toBe('74.666')
    // numeric twin exists for math but raw is untouched
    expect(v.numeric).toBeCloseTo(74.666, 6)
  })

  it('refuses to invent numerics for truncated display strings', () => {
    // "74.666..." was cut off by the source UI — guessing would fabricate data
    const v = exact('74.666...')
    expect(v.raw).toBe('74.666...')
    expect(v.numeric).toBeNull()
    expect(isMissing(v)).toBe(true)
  })

  it('marks unparseable/missing values without substituting zero', () => {
    expect(isMissing(exact(''))).toBe(true)
    expect(isMissing(exact('  '))).toBe(true)
    expect(isMissing(exact('Absent'))).toBe(true)
    expect(isMissing(exact(null))).toBe(true)
    expect(exact('').numeric).toBeNull()
  })

  it('renders official values exactly, never 0 for missing', () => {
    expect(displayOfficial(exact('91.5'))).toBe('91.5')
    expect(displayOfficial(exact(''))).toBe('—')
    expect(displayOfficial(exact(''), 'N/A')).toBe('N/A')
    expect(displayOfficial(exact('0'))).toBe('0')
  })

  it('compares percentages for threshold checks', () => {
    expect(comparePct(exact('75'), exact('75'))).toBe(0)
    expect(comparePct(exact('74.99'), exact('75'))).toBe(-1)
    expect(comparePct(exact(''), exact('75'))).toBeNull()
  })
})
