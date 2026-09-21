// Attendance policy + deterministic projections.
//
// Threshold: 75%. Exactly 75% is compliant; below is at risk. All outputs
// are DerivedNumber (Arch-calculated) — never render them as official SRM
// values. Core formulas reuse the proven helpers in data/real-data.

import { classesNeededToReach, classesSafeToMiss } from '../data/real-data'
import { exact, type ExactValue } from './exact'
import type { DerivedNumber, SourceMeta } from './types'

export const ATTENDANCE_THRESHOLD_PCT = 75

export type AttendanceRisk = 'compliant' | 'at-risk' | 'unknown'

function derived(value: number, basis: string): DerivedNumber {
  return { value, calculatedBy: 'arch', basis, computedAt: new Date().toISOString() }
}

export interface AttendanceInput {
  conducted: ExactValue
  absent: ExactValue
}

/** Risk state from a source-reported percentage. Missing data → unknown. */
export function riskState(percent: ExactValue): AttendanceRisk {
  if (percent.numeric === null) return 'unknown'
  return percent.numeric >= ATTENDANCE_THRESHOLD_PCT ? 'compliant' : 'at-risk'
}

/** Classes that must be attended consecutively to reach `target`%. */
export function classesToReach(
  input: AttendanceInput,
  target = ATTENDANCE_THRESHOLD_PCT,
): DerivedNumber | null {
  const { conducted, absent } = input
  if (conducted.numeric === null || absent.numeric === null) return null
  return derived(
    classesNeededToReach(conducted.numeric, absent.numeric, target),
    `reach ${target}% from ${conducted.numeric}/${absent.numeric}`,
  )
}

/** Classes that may be missed while staying at/above `target`%. */
export function classesMissable(
  input: AttendanceInput,
  target = ATTENDANCE_THRESHOLD_PCT,
): DerivedNumber | null {
  const { conducted, absent } = input
  if (conducted.numeric === null || absent.numeric === null) return null
  return derived(
    classesSafeToMiss(conducted.numeric, absent.numeric, target),
    `stay ≥${target}% from ${conducted.numeric}/${absent.numeric}`,
  )
}

/** Projected percentage after attending `attend` of `upcoming` future classes. */
export function projectedAfter(
  input: AttendanceInput,
  upcoming: number,
  attend: number,
): DerivedNumber | null {
  const { conducted, absent } = input
  if (conducted.numeric === null || absent.numeric === null) return null
  if (!Number.isInteger(upcoming) || upcoming < 0) return null
  if (!Number.isInteger(attend) || attend < 0 || attend > upcoming) return null
  const attended = conducted.numeric - absent.numeric
  const total = conducted.numeric + upcoming
  if (total <= 0) return null
  return derived(
    ((attended + attend) / total) * 100,
    `attend ${attend}/${upcoming} from ${conducted.numeric}/${absent.numeric}`,
  )
}

/** Overall attendance across courses, weighted by conducted hours. */
export function overallAttendance(
  courses: AttendanceInput[],
): { percent: DerivedNumber | null; meta: Pick<SourceMeta, 'status'> } {
  let attended = 0
  let total = 0
  for (const c of courses) {
    if (c.conducted.numeric === null || c.absent.numeric === null) continue
    attended += Math.max(0, c.conducted.numeric - c.absent.numeric)
    total += Math.max(0, c.conducted.numeric)
  }
  if (total <= 0) return { percent: null, meta: { status: 'unavailable' } }
  return {
    percent: derived((attended / total) * 100, `weighted over ${courses.length} courses`),
    meta: { status: 'ok' },
  }
}

export { exact }
export type { DerivedNumber, ExactValue }
