// Sync engine — coordinates per-source synchronization with isolation.
//
// Guarantees:
// - One source failing never erases another source's valid data (results are
//   per-source; merging is the caller's job and must be additive).
// - Failures carry retryability; backoff is exponential with jitter ceiling.
// - Staleness is explicit (retrievedAt + TTL), never implicit.

import type { SourceSystem } from '../../domain/types'

export interface SourceJob<T> {
  system: SourceSystem
  run: () => Promise<T>
}

export interface SourceResult<T> {
  system: SourceSystem
  ok: boolean
  data: T | null
  error: string | null
  retryable: boolean
  retrievedAt: string
  durationMs: number
}

export interface SyncRunReport<T> {
  runId: string
  startedAt: string
  results: SourceResult<T>[]
}

/** Execute all source jobs concurrently; a rejection becomes a result, never a throw. */
export async function runSync<T>(jobs: SourceJob<T>[], runId?: string): Promise<SyncRunReport<T>> {
  const startedAt = new Date().toISOString()
  const id = runId ?? `sync-${Date.now()}`
  const results = await Promise.all(
    jobs.map(async (job): Promise<SourceResult<T>> => {
      const start = Date.now()
      try {
        const data = await job.run()
        return {
          system: job.system,
          ok: true,
          data,
          error: null,
          retryable: false,
          retrievedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
        }
      } catch (err) {
        const retryable = (err as { retryable?: unknown })?.retryable !== false
        return {
          system: job.system,
          ok: false,
          data: null,
          error: err instanceof Error ? err.message : String(err),
          retryable,
          retrievedAt: new Date().toISOString(),
          durationMs: Date.now() - start,
        }
      }
    }),
  )
  return { runId: id, startedAt, results }
}

/** Exponential backoff in ms: 1s, 2s, 4s … capped at 60s. Pure/deterministic. */
export function backoffMs(attempt: number): number {
  if (!Number.isInteger(attempt) || attempt < 0) return 1000
  return Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6))
}

/** True when `retrievedAt` is older than `ttlMs` (or unparseable = stale). */
export function isStale(retrievedAt: string | null | undefined, ttlMs: number): boolean {
  if (!retrievedAt) return true
  const ts = Date.parse(retrievedAt)
  if (!Number.isFinite(ts)) return true
  return Date.now() - ts > ttlMs
}
