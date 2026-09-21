// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { parseAttendancePage } from '../api'
import { SANITIZED_ATTENDANCE_PAGE } from '../__fixtures__/attendance-page'

describe('academia attendance parser (sanitized fixture)', () => {
  it('extracts student identity', () => {
    const result = parseAttendancePage(SANITIZED_ATTENDANCE_PAGE)
    expect(result.student.name).toBe('Test Student')
    expect(result.student.regNo).toBe('TEST0001')
    expect(result.student.semester).toBe(3)
  })

  it('extracts attendance rows with exact percentages', () => {
    const result = parseAttendancePage(SANITIZED_ATTENDANCE_PAGE)
    expect(result.attendance).toHaveLength(2)
    const theory = result.attendance.find((c) => c.code === 'TEST101')
    expect(theory?.percent).toBe(80)
    expect(theory?.conducted).toBe(30)
    expect(theory?.absent).toBe(6)
    expect(theory?.type).toBe('Theory')
    const practical = result.attendance.find((c) => c.code === 'TEST102')
    expect(practical?.type).toBe('Practical')
  })

  it('extracts internal marks components', () => {
    const result = parseAttendancePage(SANITIZED_ATTENDANCE_PAGE)
    const marks = result.marks.filter((m) => m.courseCode === 'TEST101')
    expect(marks).toHaveLength(2)
    expect(marks[0]).toMatchObject({ test: 'FT-I', max: 5, scored: 4.5 })
    expect(marks[1]).toMatchObject({ test: 'FT-II', max: 10, scored: 8 })
  })

  it('throws a structure-mismatch error on garbage input', () => {
    expect(() => parseAttendancePage('<html><body>nope</body></html>')).toThrow()
  })
})
