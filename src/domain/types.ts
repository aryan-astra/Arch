// Canonical Arch academic model — source-independent types.
//
// Every dataset that reaches the UI must carry SourceMeta so the frontend can
// show source, retrieval time, freshness and validity without knowing which
// SRM system produced the data. Raw source values are preserved exactly
// (see ./exact.ts); numeric twins exist only for calculation.

export type SourceSystem = 'academia' | 'student-portal' | 'community' | 'arch'

export type SyncStatus = 'ok' | 'stale' | 'failed' | 'unavailable' | 'never-synced'

export interface SourceMeta {
  /** Which SRM system (or community/arch) produced this dataset. */
  source: SourceSystem
  /** ISO timestamp of the upstream retrieval. */
  retrievedAt: string
  /** Parser/adapter version that produced this record (for migrations). */
  parserVersion: string
  /** Freshness verdict at read time. */
  status: SyncStatus
  /** Optional raw source representation for audit/debug (never PII-logged). */
  rawRef?: string
}

export interface StudentIdentity {
  archAccountId: string
  /** Exactly one SRM identity per Arch account (v1 rule). */
  srmEmail: string
  displayName: string
  regNo: string
  program: string
  department: string
  section: string
  semester: number
  batch: number
}

export interface AcademicTerm {
  id: string
  academicYear: string
  semester: number
  label: string
}

export interface Course {
  code: string
  title: string
  kind: 'theory' | 'practical' | 'project' | 'other'
  credits: number
}

export interface CourseOffering extends Course {
  termId: string
  faculty: string
  slot: string
  room: string
  section: string
}

export interface AttendanceRecord {
  courseCode: string
  termId: string
  /** Exact source values — see ExactValue. conducted/total as provided. */
  conducted: import('./exact').ExactValue
  absent: import('./exact').ExactValue
  /** Source-reported percentage (exact). */
  percent: import('./exact').ExactValue
  meta: SourceMeta
}

export interface MarkComponent {
  /** e.g. 'FT-I', 'FP-II', internal test label as displayed by source. */
  test: string
  max: import('./exact').ExactValue
  scored: import('./exact').ExactValue
}

export interface MarkRecord {
  courseCode: string
  termId: string
  components: MarkComponent[]
  meta: SourceMeta
}

export interface TimetableEntry {
  termId: string
  dayOrder: number
  period: number
  timeSlot: string
  slotCode: string
  courseCode: string | null
}

export interface CalendarEvent {
  id: string
  date: string
  title: string
  kind: 'class' | 'test' | 'exam' | 'holiday' | 'event' | 'deadline' | 'reminder'
  dayOrder?: number
  attendanceState?: 'present' | 'absent' | 'unknown'
  meta: SourceMeta
}

/** A derived (Arch-calculated) number. Must render distinctly from official values. */
export interface DerivedNumber {
  value: number
  calculatedBy: 'arch'
  basis: string
  computedAt: string
}

export interface SnapshotRef {
  id: string
  capturedAt: string
  source: SourceSystem
  recordCount: number
}

export interface ConflictRecord {
  id: string
  entity: string
  entityKey: string
  academiaValue: string | null
  portalValue: string | null
  academiaRetrievedAt: string | null
  portalRetrievedAt: string | null
  canonicalChoice: 'academia' | 'student-portal'
  reason: string
  resolvedAt: string
}
