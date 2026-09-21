import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_THRESHOLD_PCT,
  classesMissable,
  classesToReach,
  overallAttendance,
  projectedAfter,
  riskState,
} from '../attendance'
import { exact } from '../exact'

const input = (conducted: string, absent: string) => ({
  conducted: exact(conducted),
  absent: exact(absent),
})

describe('attendance policy', () => {
  it('threshold is exactly 75 and boundary is compliant', () => {
    expect(ATTENDANCE_THRESHOLD_PCT).toBe(75)
    expect(riskState(exact('75'))).toBe('compliant')
    expect(riskState(exact('75.00'))).toBe('compliant')
    expect(riskState(exact('74.99'))).toBe('at-risk')
    expect(riskState(exact('0'))).toBe('at-risk')
    expect(riskState(exact(''))).toBe('unknown')
  })

  it('computes classes needed to reach 75% (30 conducted, 9 absent = 70%)', () => {
    // attended 21/30 → (0.75*30-21)/0.25 = 6
    const d = classesToReach(input('30', '9'))
    expect(d?.calculatedBy).toBe('arch')
    expect(d?.value).toBe(6)
  })

  it('computes safe-to-miss while staying ≥75% (40 conducted, 8 absent = 80%)', () => {
    // floor(32/0.75)-40 = 42-40 = 2
    const d = classesMissable(input('40', '8'))
    expect(d?.value).toBe(2)
  })

  it('projects attendance after future classes', () => {
    // 21/30 + attend 4/4 → 25/34 ≈ 73.53 (still at-risk, honestly reported)
    const d = projectedAfter(input('30', '9'), 4, 4)
    expect(d?.value).toBeCloseTo(73.529, 2)
    expect(riskState(exact(String(d?.value)))).toBe('at-risk')
  })

  it('returns null (never zero) for missing source data', () => {
    expect(classesToReach(input('', '9'))).toBeNull()
    expect(classesMissable(input('30', ''))).toBeNull()
    expect(projectedAfter(input('30', '9'), -1, 0)).toBeNull()
    expect(projectedAfter(input('30', '9'), 4, 5)).toBeNull()
  })

  it('weights overall attendance by conducted hours', () => {
    const { percent } = overallAttendance([input('30', '9'), input('10', '0')])
    // (21+10)/(30+10) = 77.5
    expect(percent?.value).toBeCloseTo(77.5, 6)
  })

  it('reports unavailable (not 0%) when nothing is usable', () => {
    const { percent, meta } = overallAttendance([input('', '')])
    expect(percent).toBeNull()
    expect(meta.status).toBe('unavailable')
  })
})
