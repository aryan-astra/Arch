// Academia adapter — canonical envelopes over the existing Academia fetchers.
//
// Source priority: marks = Academia first. Attendance uses Academia data here;
// the sync engine prefers Portal attendance when that adapter is live.

import { exact } from '../../domain/exact'
import type {
  AttendanceRecord,
  CalendarEvent,
  MarkComponent,
  MarkRecord,
  SourceMeta,
  SourceSystem,
} from '../../domain/types'
import {
  fetchAcademicCalendarEvents,
  fetchAttendance,
  fetchCurrentDayOrder,
  fetchStudentPhotoUrl,
  fetchTimetableProfileAndCredits,
  type AcademicCalendarEvent,
} from '../api'
import {
  AdapterError,
  type AdapterCapability,
  type Envelope,
  type SourceAdapter,
} from './types'

export const ACADEMIA_PARSER_VERSION = 'academia-adapter/1'

const SYSTEM: SourceSystem = 'academia'

function meta(status: SourceMeta['status'] = 'ok'): SourceMeta {
  return {
    source: SYSTEM,
    retrievedAt: new Date().toISOString(),
    parserVersion: ACADEMIA_PARSER_VERSION,
    status,
  }
}

export interface CanonicalAttendance {
  courses: AttendanceRecord[]
  marks: MarkRecord[]
  dayOrder: number | null
  termId: string
}

export class AcademiaAdapter implements SourceAdapter {
  readonly system: SourceSystem = SYSTEM
  readonly capabilities: AdapterCapability[] = [
    'profile',
    'attendance',
    'marks',
    'timetable',
    'planner',
    'notifications',
    'photo',
  ]

  isAvailable(): boolean {
    return true
  }

  /** Attendance + marks + day order in one canonical envelope. */
  async getAttendance(termId = 'current'): Promise<Envelope<CanonicalAttendance>> {
    let live: Awaited<ReturnType<typeof fetchAttendance>>
    try {
      live = await fetchAttendance()
    } catch (err) {
      throw new AdapterError(SYSTEM, (err as Error).message ?? 'attendance fetch failed')
    }
    let dayOrder: number | null = null
    try {
      dayOrder = await fetchCurrentDayOrder()
    } catch {
      dayOrder = null
    }
    const courses: AttendanceRecord[] = live.attendance.map((c) => ({
      courseCode: c.code,
      termId,
      conducted: exact(String(c.conducted)),
      absent: exact(String(c.absent)),
      percent: exact(String(c.percent)),
      meta: meta(),
    }))
    const marksByCourse = new Map<string, MarkComponent[]>()
    for (const m of live.marks) {
      const list = marksByCourse.get(m.courseCode) ?? []
      list.push({ test: m.test, max: exact(String(m.max)), scored: exact(String(m.scored)) })
      marksByCourse.set(m.courseCode, list)
    }
    const marks: MarkRecord[] = Array.from(marksByCourse.entries()).map(([courseCode, components]) => ({
      courseCode,
      termId,
      components,
      meta: meta(),
    }))
    return { data: { courses, marks, dayOrder, termId }, meta: meta() }
  }

  async getPlanner(): Promise<Envelope<CalendarEvent[]>> {
    const events: AcademicCalendarEvent[] = await fetchAcademicCalendarEvents()
    return {
      data: events.map((e) => ({
        id: e.id,
        date: e.date,
        title: e.title,
        kind: e.type === 'holiday' ? 'holiday' : e.type === 'exam' ? 'exam' : e.type === 'working' ? 'event' : 'event',
        dayOrder: e.dayOrder,
        meta: meta(),
      })),
      meta: meta(),
    }
  }

  async getTimetableCredits(): Promise<
    Envelope<{ creditsByCode: Record<string, number>; slotByCourseKey: Record<string, string> }>
  > {
    const result = await fetchTimetableProfileAndCredits()
    return {
      data: { creditsByCode: result.creditsByCode, slotByCourseKey: result.slotByCourseKey },
      meta: meta(),
    }
  }

  async getPhotoUrl(): Promise<Envelope<string | null>> {
    const url = await fetchStudentPhotoUrl()
    return { data: url, meta: meta() }
  }
}
