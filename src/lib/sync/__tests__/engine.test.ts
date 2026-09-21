import { describe, expect, it } from 'vitest'
import { backoffMs, isStale, runSync } from '../engine'

describe('sync engine', () => {
  it('isolates source failures: one rejection never erases the other result', async () => {
    const report = await runSync([
      { system: 'academia', run: async () => ({ courses: 8 }) },
      {
        system: 'student-portal',
        run: async () => {
          throw Object.assign(new Error('portal down'), { retryable: true })
        },
      },
    ])
    expect(report.results).toHaveLength(2)
    const ok = report.results.find((r) => r.system === 'academia')
    const failed = report.results.find((r) => r.system === 'student-portal')
    expect(ok?.ok).toBe(true)
    expect(ok?.data).toEqual({ courses: 8 })
    expect(failed?.ok).toBe(false)
    expect(failed?.data).toBeNull()
    expect(failed?.retryable).toBe(true)
  })

  it('backs off exponentially with a 60s ceiling', () => {
    expect(backoffMs(0)).toBe(1000)
    expect(backoffMs(1)).toBe(2000)
    expect(backoffMs(3)).toBe(8000)
    expect(backoffMs(10)).toBe(60000)
    expect(backoffMs(-1)).toBe(1000)
  })

  it('detects staleness explicitly', () => {
    expect(isStale(null, 1000)).toBe(true)
    expect(isStale('not-a-date', 1000)).toBe(true)
    expect(isStale(new Date().toISOString(), 60_000)).toBe(false)
    expect(isStale(new Date(Date.now() - 120_000).toISOString(), 60_000)).toBe(true)
  })
})
