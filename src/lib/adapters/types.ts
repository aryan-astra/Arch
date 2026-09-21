// Source adapter contracts.
//
// Adapters are the ONLY layer allowed to know SRM endpoint names and HTML
// shapes. Everything above consumes canonical envelopes: data + source +
// retrieval timestamp + freshness + parser version + success/failure.

import type { SourceMeta, SourceSystem, SyncStatus } from '../../domain/types'

export type AdapterCapability =
  | 'profile'
  | 'attendance'
  | 'marks'
  | 'timetable'
  | 'planner'
  | 'notifications'
  | 'photo'

export interface Envelope<T> {
  data: T
  meta: SourceMeta
}

export class AdapterError extends Error {
  readonly system: SourceSystem
  readonly status: SyncStatus
  readonly retryable: boolean
  constructor(system: SourceSystem, message: string, status: SyncStatus = 'failed', retryable = true) {
    super(message)
    this.name = 'AdapterError'
    this.system = system
    this.status = status
    this.retryable = retryable
  }
}

/** Thrown when an operation needs a source the adapter cannot reach. */
export class SourceUnavailableError extends AdapterError {
  constructor(system: SourceSystem, reason: string) {
    super(system, `${system} unavailable: ${reason}`, 'unavailable', true)
    this.name = 'SourceUnavailableError'
  }
}

export interface SourceAdapter {
  readonly system: SourceSystem
  readonly capabilities: AdapterCapability[]
  /** True only when the adapter has a live, verified session path. */
  isAvailable(): boolean
}
