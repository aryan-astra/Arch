// Real student data scraped from academia.srmist.edu.in on 11-Mar-2026

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

export const STUDENT: StudentInfo = {
  name: 'SOUNAVA BANERJEE',
  regNo: 'RA2411003011625',
  program: 'B.Tech',
  department: 'Computer Science and Engineering',
  section: 'E2',
  semester: 4,
  batch: 2,
  mobile: '7695886223',
  advisorName: 'Dr. Vidhya S',
  advisorEmail: 'vidhyas2@srmist.edu.in',
  advisorPhone: '9444069002',
  academicAdvisorName: 'Dr. S. Priya',
  academicAdvisorEmail: 'priyas3@srmist.edu.in',
  academicAdvisorPhone: '9965930862',
  academicYear: 'AY2025-26 EVEN',
  enrollmentDate: '06-Jan-2026',
}

export const ATTENDANCE: AttendanceCourse[] = [
  { code: '21MAB204T', title: 'Probability and Queueing Theory', type: 'Theory', faculty: 'Dr. R. Kalaiyarasi', slot: 'A', room: 'TP 202', conducted: 30, absent: 6, percent: 80.00, credit: 4, category: 'Basic Science' },
  { code: '21CSC204J', title: 'Design and Analysis of Algorithms', type: 'Theory', faculty: 'Dr. Dandumahanti Bhanu Priya', slot: 'B', room: 'TP 202', conducted: 26, absent: 7, percent: 73.08, credit: 4, category: 'Professional Core' },
  { code: '21IPE312P', title: 'ERP Solutions for Digital Enterprises', type: 'Theory', faculty: 'Sneha K', slot: 'C', room: 'TP 105', conducted: 18, absent: 4, percent: 77.78, credit: 3, category: 'Professional Elective' },
  { code: '21CSC205P', title: 'Database Management Systems', type: 'Theory', faculty: 'Arnab Maity', slot: 'D', room: 'TP 202', conducted: 29, absent: 6, percent: 79.31, credit: 4, category: 'Professional Core' },
  { code: '21PDH209T', title: 'Social Engineering', type: 'Theory', faculty: 'Christina Sweetline B', slot: 'E', room: 'TP 202', conducted: 16, absent: 4, percent: 75.00, credit: 2, category: 'Humanities & Social Sciences' },
  { code: '21CSC206T', title: 'Artificial Intelligence', type: 'Theory', faculty: 'Dr. Vidhya S', slot: 'F', room: 'TP 202', conducted: 25, absent: 5, percent: 80.00, credit: 3, category: 'Professional Core' },
  { code: '21DCS201P', title: 'Design Thinking and Methodology', type: 'Theory', faculty: 'Dr. Vidhya S', slot: 'G', room: 'TP 202', conducted: 25, absent: 3, percent: 88.00, credit: 3, category: 'Engineering Science' },
  { code: '21CSC204J', title: 'Design and Analysis of Algorithms', type: 'Practical', faculty: 'Dr. Dandumahanti Bhanu Priya', slot: 'P39-P40', room: 'TP014', conducted: 14, absent: 4, percent: 71.43, credit: 4, category: 'Professional Core' },
  { code: '21PDM301L', title: 'Analytical and Logical Thinking Skills', type: 'Practical', faculty: 'Dr. Vidhya S', slot: 'L51-L52', room: 'NA', conducted: 14, absent: 2, percent: 85.71, credit: 0, category: 'Humanities & Social Sciences' },
]

export const INTERNAL_MARKS: InternalMark[] = [
  { courseCode: '21MAB204T', test: 'FT-I', max: 5, scored: 5.00 },
  { courseCode: '21CSC204J', test: 'FJ-I', max: 15, scored: 9.58 },
  { courseCode: '21CSC206T', test: 'FT-I', max: 5, scored: 3.00 },
  { courseCode: '21PDH209T', test: 'FT-II', max: 15, scored: 14.00 },
  { courseCode: '21PDH209T', test: 'FT-I', max: 5, scored: 5.00 },
]

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
