/**
 * ⚠️  DEPRECATED: This file previously contained real student PII from academia.srmist.edu.in
 * 
 * IMPORTANT: This module must NEVER contain:
 * - Real student names, emails, phone numbers, registration numbers
 * - Real faculty names, emails, phone numbers
 * - Real attendance/marks/personal data
 * - Any personally identifiable information
 * 
 * Reason: Student data is confidential and must not be stored in source control.
 * 
 * At runtime, ALL data must be fetched live from the backend via /api/user, /api/attendance, /api/marks
 * If the backend fails, the UI MUST show explicit error states (not fallback data).
 * 
 * See: src/components/Attendance.tsx, src/components/Marks.tsx, src/components/Home.tsx
 */

export interface StudentInfo {
  name: string
  regNo: string
  program: string
  department: string
  section: string
  semester: number
  batch: number
  mobile: string
  advisorName: string
  advisorEmail: string
  advisorPhone: string
  academicAdvisorName: string
  academicAdvisorEmail: string
  academicAdvisorPhone: string
  academicYear: string
  enrollmentDate: string
}

export interface AttendanceCourse {
  code: string
  title: string
  type: 'Theory' | 'Practical'
  faculty: string
  slot: string
  room: string
  conducted: number
  absent: number
  percent: number
  credit: number
  category: string
}

export interface InternalMark {
  courseCode: string
  test: string
  max: number
  scored: number
}

export interface CourseSlotMap {
  slot: string
  title: string
  code: string
  room: string
  faculty: string
}

// Day order timetable for Batch 2
// 12 time periods per day
export const SLOT_TIMES: string[] = [
  '08:00–08:50',
  '08:50–09:40',
  '09:45–10:35',
  '10:40–11:30',
  '11:35–12:25',
  '12:30–13:20',
  '13:25–14:15',
  '14:20–15:10',
  '15:10–16:00',
  '16:00–16:50',
  '16:50–17:30',
  '17:30–18:10',
]

// For Batch 2: day order -> array of 12 slot codes
export const BATCH2_TIMETABLE: Record<number, string[]> = {
  1: ['P1', 'P2', 'P3', 'P4', 'P5', 'A', 'A', 'F', 'F', 'G', 'L11', 'L12'],
  2: ['B', 'B', 'G', 'G', 'A', 'P16', 'P17', 'P18', 'P19', 'P20', 'L21', 'L22'],
  3: ['P21', 'P22', 'P23', 'P24', 'P25', 'C', 'C', 'A', 'D', 'B', 'L31', 'L32'],
  4: ['D', 'D', 'B', 'E', 'C', 'P36', 'P37', 'P38', 'P39', 'P40', 'L41', 'L42'],
  5: ['P41', 'P42', 'P43', 'P44', 'P45', 'E', 'E', 'C', 'F', 'D', 'L51', 'L52'],
}

// EMPTY SAFE DEFAULTS (DO NOT ADD REAL DATA HERE)
export const STUDENT: StudentInfo = {
  name: '',
  regNo: '',
  program: '',
  department: '',
  section: '',
  semester: 0,
  batch: 0,
  mobile: '',
  advisorName: '',
  advisorEmail: '',
  advisorPhone: '',
  academicAdvisorName: '',
  academicAdvisorEmail: '',
  academicAdvisorPhone: '',
  academicYear: '',
  enrollmentDate: '',
}

// EMPTY SAFE DEFAULTS (DO NOT ADD REAL DATA HERE)
export const ATTENDANCE: AttendanceCourse[] = []

// EMPTY SAFE DEFAULTS (DO NOT ADD REAL DATA HERE)
export const INTERNAL_MARKS: InternalMark[] = []

/** Compute how many more consecutive classes needed to reach `target` % */
export function classesNeededToReach(conducted: number, absent: number, target = 75): number {
  const attended = conducted - absent
  if ((attended / conducted) * 100 >= target) return 0
  // solve: (attended + n) / (conducted + n) = target/100
  // attended + n = (target/100)*(conducted + n)
  // attended + n = (target/100)*conducted + (target/100)*n
  // n*(1 - target/100) = (target/100)*conducted - attended
  const ratio = target / 100
  const n = (ratio * conducted - attended) / (1 - ratio)
  return Math.ceil(n)
}

/** Classes the student can still miss while staying at or above `target` % */
export function classesSafeToMiss(conducted: number, absent: number, target = 75): number {
  const attended = conducted - absent
  // (attended) / (conducted + n) = target/100  → n = attended/(target/100) - conducted
  const ratio = target / 100
  const safeTotal = Math.floor(attended / ratio) - conducted
  return Math.max(0, safeTotal)
}
