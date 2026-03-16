// API client — fetches real data from academia.srmist.edu.in via Vite proxy
// Proxy strips /api prefix and forwards to the target with session cookies

import { BATCH2_TIMETABLE, SLOT_TIMES, ATTENDANCE } from '../data/real-data'
import type { AttendanceCourse, InternalMark, StudentInfo } from '../data/real-data'

export interface LiveAttendanceResult {
  student: StudentInfo
  attendance: AttendanceCourse[]
  marks: InternalMark[]
  lastUpdated: string
}

export interface LiveTimetableResult {
  student: StudentInfo
  courses: AttendanceCourse[]
  lastUpdated: string
}

// Extracts the inner HTML from Zoho Creator's pageSanitizer.sanitize('...') call
function extractInnerHtml(outerHtml: string): string {
  const marker = "pageSanitizer.sanitize('"
  const startIdx = outerHtml.indexOf(marker)
  if (startIdx === -1) return outerHtml
  const contentStart = startIdx + marker.length
  const contentEnd = outerHtml.indexOf("')", contentStart)
  if (contentEnd === -1) return outerHtml
  return outerHtml
    .substring(contentStart, contentEnd)
    // Unescape all JavaScript hex sequences first (e.g. \x3C → <, \x3E → >)
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    // Then handle remaining named escapes
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '')
    .replace(/\\\//g, '/')
    .replace(/\\-/g, '-')
}

function normalizeInfoKey(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/[:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function getAdjacentValue(cells: string[], idx: number): string {
  const next = cells[idx + 1] ?? ''
  if (next === ':') return (cells[idx + 2] ?? '').trim()
  return next.trim()
}

function normalizeHeaderText(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/[%():]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function findHeaderIndex(headers: string[], patterns: RegExp[]): number {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)))
}

function parseCourseCode(cell: Element | null, fallback: string): string {
  const directText = cell?.firstChild?.nodeType === Node.TEXT_NODE
    ? (cell.firstChild.textContent ?? '').trim()
    : ''
  const combined = (directText || fallback || '').trim()
  const codeMatch = combined.toUpperCase().match(/[A-Z0-9]{5,}/)
  return (codeMatch?.[0] ?? combined).trim()
}

function extractSlotTokens(slotRaw: string): string[] {
  return (slotRaw
    .toUpperCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, '')
    .match(/(?:P\d+|L\d+|[A-G])/g) ?? [])
}

// Parses the My_Attendance page HTML (data is embedded in a JS pageSanitizer.sanitize() string)
function parseAttendancePage(html: string): LiveAttendanceResult {
  const innerHtml = extractInnerHtml(html)
  const parser = new DOMParser()
  const doc = parser.parseFromString(innerHtml, 'text/html')

  // Find tables by their header content rather than relying on fragile indices
  const allTables = Array.from(doc.querySelectorAll('table'))

  const attendance: AttendanceCourse[] = []
  const marks: InternalMark[] = []
  const student: StudentInfo = {
    name: '', regNo: '', program: '', department: '',
    batch: 0, section: '', semester: 0,
    mobile: '', advisorName: '', advisorEmail: '', advisorPhone: '',
    academicAdvisorName: '', academicAdvisorEmail: '', academicAdvisorPhone: '',
    academicYear: '', enrollmentDate: '',
  }

  // Find student info table: contains "Registration Number:"
  const infoTable = allTables.find(t =>
    t.textContent?.includes('Registration Number:')
  )
  if (infoTable) {
    Array.from(infoTable.querySelectorAll('tr')).forEach(row => {
      const cells = Array.from(row.querySelectorAll('td'))
        .map(c => c.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      for (let i = 0; i < cells.length; i++) {
        const key = normalizeInfoKey(cells[i] ?? '')
        if (!key) continue
        const value = getAdjacentValue(cells, i)
        if (!value) continue

        if (key.includes('registration number')) student.regNo = value
        if (key === 'name') student.name = value
        if (key.includes('program')) student.program = value
        if (key.includes('department')) student.department = value
        if (key.includes('section')) student.section = value
        if (key.includes('semester')) student.semester = parseInt(value, 10) || student.semester
        if (key === 'batch') student.batch = parseInt(value, 10) || student.batch
        if (key.includes('mobile')) student.mobile = value.replace(/\s+/g, '')
        if (key.includes('academic year') || key.includes('academic years')) student.academicYear = value

        if (key.includes('enrollment') || key === 'doe') {
          const parts = value.split('/').map(p => p.trim()).filter(Boolean)
          student.enrollmentDate = parts.length > 1 ? parts[parts.length - 1] ?? value : value
        }
      }
    })
  }

  // Find attendance table: header has "Hours Conducted" and "Attn %"
  const attendanceTable = allTables.find(t => {
    const header = t.querySelector('tr')
    return header?.textContent?.includes('Hours Conducted') && header?.textContent?.includes('Attn')
  })
  if (attendanceTable) {
    const rows = Array.from(attendanceTable.querySelectorAll('tr'))
    const headerCells = Array.from(rows[0]?.querySelectorAll('th, td') ?? [])
      .map((cell) => normalizeHeaderText(cell.textContent ?? ''))
    const firstDataRow = rows.slice(1).find((row) => row.querySelectorAll('td').length > 0)
    const fallbackLastIdx = Math.max(0, (firstDataRow?.querySelectorAll('td').length ?? 9) - 1)

    const codeIdx = findHeaderIndex(headerCells, [/course\s*code/, /^code$/]) >= 0 ? findHeaderIndex(headerCells, [/course\s*code/, /^code$/]) : 0
    const titleIdx = findHeaderIndex(headerCells, [/course\s*title/, /subject/, /course\s*name/]) >= 0 ? findHeaderIndex(headerCells, [/course\s*title/, /subject/, /course\s*name/]) : 1
    const typeIdx = findHeaderIndex(headerCells, [/category/, /course\s*type/, /^type$/, /component/]) >= 0 ? findHeaderIndex(headerCells, [/category/, /course\s*type/, /^type$/, /component/]) : 2
    const facultyIdx = findHeaderIndex(headerCells, [/faculty/, /staff/, /teacher/]) >= 0 ? findHeaderIndex(headerCells, [/faculty/, /staff/, /teacher/]) : 3
    const slotIdx = findHeaderIndex(headerCells, [/slot/, /period/, /timing/, /hour/]) >= 0 ? findHeaderIndex(headerCells, [/slot/, /period/, /timing/, /hour/]) : 4
    const roomIdx = findHeaderIndex(headerCells, [/room/, /venue/, /classroom/]) >= 0 ? findHeaderIndex(headerCells, [/room/, /venue/, /classroom/]) : 5
    const conductedIdx = findHeaderIndex(headerCells, [/hours?\s*conducted/, /classes?\s*conducted/, /conducted/]) >= 0 ? findHeaderIndex(headerCells, [/hours?\s*conducted/, /classes?\s*conducted/, /conducted/]) : 6
    const absentIdx = findHeaderIndex(headerCells, [/hours?\s*absent/, /classes?\s*absent/, /absent/]) >= 0 ? findHeaderIndex(headerCells, [/hours?\s*absent/, /classes?\s*absent/, /absent/]) : 7
    const pctIdx = findHeaderIndex(headerCells, [/attn/, /attendance/, /percent/, /%/]) >= 0 ? findHeaderIndex(headerCells, [/attn/, /attendance/, /percent/, /%/]) : Math.min(8, fallbackLastIdx)

    const rowsToParse = rows.slice(1)
    rowsToParse.forEach(row => {
      const cells = Array.from(row.querySelectorAll('td'))
      if (cells.length === 0) return

      const valueAt = (idx: number): string => (
        idx >= 0 && idx < cells.length
          ? (cells[idx]?.textContent?.replace(/\s+/g, ' ').trim() ?? '')
          : ''
      )

      const code = parseCourseCode(cells[codeIdx] ?? null, valueAt(codeIdx))
      const title = valueAt(titleIdx)
      const courseType = valueAt(typeIdx) || 'Theory'
      const normalizedCourseType = courseType.toLowerCase()
      const faculty = valueAt(facultyIdx)
      const slot = valueAt(slotIdx)
      const room = valueAt(roomIdx)
      const conducted = parseInt(valueAt(conductedIdx), 10) || 0
      const absent = parseInt(valueAt(absentIdx), 10) || 0
      const pctRaw = valueAt(pctIdx).match(/-?\d+(?:\.\d+)?/)?.[0] ?? '0'
      const pct = parseFloat(pctRaw) || 0

      const slotTokens = extractSlotTokens(slot)
      const inferredPractical = /\bpractical\b/i.test(normalizedCourseType) || slotTokens.some((token) => /^P\d+$/.test(token) || /^L\d+$/.test(token))

      if (code && code.length > 3) {
        attendance.push({
          code,
          title,
          type: inferredPractical ? 'Practical' : 'Theory',
          faculty,
          slot,
          room,
          conducted,
          absent,
          percent: pct,
          credit: 0,
          category: courseType,
        })
      }
    })
  }

  // Find marks table: header has "Test Performance"
  const marksTable = allTables.find(t => {
    const header = t.querySelector('tr')
    return header?.textContent?.includes('Test Performance')
  })
  if (marksTable) {
    const rows = Array.from(marksTable.querySelectorAll('tr')).slice(1)
    rows.forEach(row => {
      const cells = row.querySelectorAll('td')
      if (cells.length < 3) return
      const code = cells[0]?.textContent?.trim() ?? ''
      const marksCell = cells[2]
      if (!marksCell || !code) return
      // Each test is a nested td with <strong>FT-I/5.00</strong><br>scored
      marksCell.querySelectorAll('td').forEach(entry => {
        const strong = entry.querySelector('strong')
        if (!strong) return
        const labelText = strong.textContent?.trim() ?? ''
        const [test, maxStr] = labelText.split('/')
        const max = parseFloat(maxStr ?? '0')
        // The scored value is the text node after the <strong> (and after <br>)
        const allText = entry.textContent?.trim() ?? ''
        const scoredStr = allText.replace(labelText, '').trim()
        const scored = parseFloat(scoredStr)
        if (test && !isNaN(max) && !isNaN(scored)) {
          marks.push({ courseCode: code, test, max, scored })
        }
      })
    })
  }

  // If we couldn't parse the student name, something went wrong
  if (!student.name && !student.regNo) {
    throw new Error('Could not parse attendance page — HTML structure may have changed')
  }

  return {
    student,
    attendance,
    marks,
    lastUpdated: new Date().toISOString(),
  }
}

// Session token stored after login
let _sessionToken: string | null = null
type SessionPersistence = 'session' | 'local'

export function setSessionToken(token: string | null, persistence: SessionPersistence = 'session') {
  _sessionToken = token
  if (token) {
    if (persistence === 'local') {
      localStorage.setItem('academia.token', token)
      sessionStorage.removeItem('academia.token')
    } else {
      sessionStorage.setItem('academia.token', token)
      localStorage.removeItem('academia.token')
    }
  } else {
    sessionStorage.removeItem('academia.token')
    localStorage.removeItem('academia.token')
  }
}

export function getSessionToken(): string | null {
  if (_sessionToken) return _sessionToken
  const t = sessionStorage.getItem('academia.token') || localStorage.getItem('academia.token')
  if (t) _sessionToken = t
  return t
}

type AuthFailurePayload = {
  error?: string
  reason?: string
  valid?: boolean
}

async function readAuthFailure(resp: Response, fallbackMessage = 'Session expired — please log in again'): Promise<{ message: string; reason: string }> {
  let payload: AuthFailurePayload = {}
  try {
    payload = await resp.clone().json() as AuthFailurePayload
  } catch {
    payload = {}
  }
  return {
    message: payload.error || fallbackMessage,
    reason: typeof payload.reason === 'string' && payload.reason.trim() ? payload.reason.trim() : 'session_missing',
  }
}

async function throwIfUnauthorized(resp: Response, fallbackMessage?: string): Promise<void> {
  if (resp.status !== 401) return
  const failure = await readAuthFailure(resp, fallbackMessage)
  throw new Error(`${failure.message} [${failure.reason}]`)
}

export async function loginUser(
  email: string,
  password: string,
  opts?: { trusted?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, trusted: Boolean(opts?.trusted) }),
    })
    const data = await resp.json()
    if (data.success && data.sessionToken) {
      setSessionToken(data.sessionToken, opts?.trusted ? 'local' : 'session')
      return { success: true }
    }
    return { success: false, error: data.error || 'Login failed' }
  } catch {
    return { success: false, error: 'Network error — is the server running?' }
  }
}

export async function logoutUser() {
  const token = getSessionToken()
  if (token) {
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        headers: { 'X-Session-Token': token },
      })
    } catch { /* ignore */ }
  }
  setSessionToken(null)
}

// Fetch real attendance data via auth server proxy
export async function fetchAttendance(): Promise<LiveAttendanceResult> {
  const token = getSessionToken()
  if (!token) throw new Error('Not authenticated')

  const resp = await fetch('/proxy/page/My_Attendance', {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'X-Session-Token': token,
    },
  })
  await throwIfUnauthorized(resp)
  if (!resp.ok) throw new Error(`Server error: HTTP ${resp.status}`)
  const html = await resp.text()
  return parseAttendancePage(html)
}

function parseDayOrderFromWelcome(html: string): number | null {
  const innerHtml = extractInnerHtml(html)
  const text = innerHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')

  const dateMatch = /Date\s*[:-]?\s*(\d{1,2})\s*[-/]\s*([A-Za-z]{3})\s*[-/]\s*(\d{2,4})/i.exec(text)
  if (!dateMatch) return null
  const monthMap: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  }
  const day = parseInt(dateMatch[1] ?? '', 10)
  const month = monthMap[(dateMatch[2] ?? '').toLowerCase()] ?? 0
  const rawYear = parseInt(dateMatch[3] ?? '', 10)
  const year = rawYear < 100 ? 2000 + rawYear : rawYear
  if (!day || !month || !year) return null

  const today = new Date()
  const isToday =
    today.getFullYear() === year &&
    (today.getMonth() + 1) === month &&
    today.getDate() === day
  if (!isToday) return null

  // Only trust day order mention near the top date banner, not any later timetable/planner text.
  const nearDateWindow = text.slice(dateMatch.index, dateMatch.index + 220)
  const m = nearDateWindow.match(/Day\s*Order\s*[:-]?\s*([1-5])/i)
  if (!m) return null
  const parsed = parseInt(m[1] ?? '', 10)
  return Number.isFinite(parsed) ? parsed : null
}

export async function fetchCurrentDayOrder(): Promise<number | null> {
  const token = getSessionToken()
  if (!token) throw new Error('Not authenticated')
  const resp = await fetch('/proxy/page/WELCOME', {
    headers: { 'Accept': 'text/html,application/xhtml+xml', 'X-Session-Token': token },
  })
  await throwIfUnauthorized(resp)
  if (!resp.ok) throw new Error(`Server error: HTTP ${resp.status}`)
  return parseDayOrderFromWelcome(await resp.text())
}

function recordFieldValue(record: Record<string, unknown>, keyPattern: RegExp): string {
  for (const [key, value] of Object.entries(record)) {
    if (!keyPattern.test(key)) continue
    if (!value || typeof value !== 'object') continue
    const maybeValue = (value as { FIELDVALUE?: unknown }).FIELDVALUE
    if (typeof maybeValue === 'string' && maybeValue.trim()) return maybeValue.trim()
  }
  return ''
}

export async function fetchProfilePatch(): Promise<Partial<StudentInfo>> {
  const token = getSessionToken()
  if (!token) throw new Error('Not authenticated')
  const resp = await fetch('/proxy/form/Student_Address_Details', {
    headers: { 'Accept': 'application/json, text/plain, */*', 'X-Session-Token': token },
  })
  await throwIfUnauthorized(resp)
  if (!resp.ok) throw new Error(`Server error: HTTP ${resp.status}`)

  const text = await resp.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {}
  }

  const record = (parsed as { RECORD?: Record<string, unknown> })?.RECORD
  if (!record || typeof record !== 'object') return {}

  return {
    regNo: recordFieldValue(record, /^Registration_Number$/i),
    section: recordFieldValue(record, /^Section$/i),
    mobile: recordFieldValue(record, /^Mobile_Number$/i).replace(/\s+/g, ''),
    academicYear: recordFieldValue(record, /^Academic_Years?$/i),
    enrollmentDate: recordFieldValue(record, /(Enrollment|DOE)/i),
    advisorName: recordFieldValue(record, /(Faculty_)?Advisor(_Name)?$/i),
    advisorEmail: recordFieldValue(record, /(Faculty_)?Advisor.*(Mail|Email)/i),
    advisorPhone: recordFieldValue(record, /(Faculty_)?Advisor.*(Phone|Mobile|Contact)/i),
    academicAdvisorName: recordFieldValue(record, /Academic_Advisor(_Name)?$/i),
    academicAdvisorEmail: recordFieldValue(record, /Academic_Advisor.*(Mail|Email)/i),
    academicAdvisorPhone: recordFieldValue(record, /Academic_Advisor.*(Phone|Mobile|Contact)/i),
  }
}

function parseAdvisorCell(text: string, role: 'faculty' | 'academic'): Partial<StudentInfo> {
  const compact = text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  const roleLabelText = role === 'faculty' ? 'Faculty Advisor' : 'Academic Advisor'
  const roleIdx = compact.toLowerCase().indexOf(roleLabelText.toLowerCase())
  const beforeRole = roleIdx >= 0 ? compact.slice(0, roleIdx) : compact
  const afterRole = roleIdx >= 0 ? compact.slice(roleIdx + roleLabelText.length) : compact

  const email =
    afterRole.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ??
    compact.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ??
    ''
  const phone =
    afterRole.replace(email, ' ').match(/(?<!\d)\d{10}(?!\d)/)?.[0] ??
    compact.match(/(?<!\d)\d{10}(?!\d)/)?.[0] ??
    ''

  let name = beforeRole
    .replace(/\bCounselor\b/gi, '')
    .replace(/[_:|/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!name) {
    name = compact
      .replace(roleLabelText, '')
      .replace(email, '')
      .replace(phone, '')
      .replace(/\bCounselor\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  if (role === 'faculty') {
    return { advisorName: name, advisorEmail: email, advisorPhone: phone }
  }
  return { academicAdvisorName: name, academicAdvisorEmail: email, academicAdvisorPhone: phone }
}

function parseTimetableProfilePage(html: string): Partial<StudentInfo> {
  const innerHtml = extractInnerHtml(html)
  const parser = new DOMParser()
  const doc = parser.parseFromString(innerHtml, 'text/html')
  const patch: Partial<StudentInfo> = {}

  const infoTable = Array.from(doc.querySelectorAll('table')).find(t =>
    t.textContent?.includes('Registration Number:') && t.textContent?.includes('Program:')
  )

  if (infoTable) {
    Array.from(infoTable.querySelectorAll('tr')).forEach(row => {
      const cells = Array.from(row.querySelectorAll('td'))
        .map(c => c.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      for (let i = 0; i < cells.length; i++) {
        const key = normalizeInfoKey(cells[i] ?? '')
        if (!key) continue
        const value = getAdjacentValue(cells, i)
        if (!value) continue

        if (key.includes('registration number')) patch.regNo = value
        if (key === 'name') patch.name = value
        if (key.includes('program')) patch.program = value
        if (key.includes('department')) patch.department = value
        if (key.includes('mobile')) patch.mobile = value.replace(/\s+/g, '')
        if (key.includes('semester')) patch.semester = parseInt(value, 10) || patch.semester
        if (key === 'batch') patch.batch = parseInt(value, 10) || patch.batch
      }
    })
  }

  if (patch.department) {
    const sectionMatch = patch.department.match(/\(([A-Za-z0-9]+)\s*Section\)/i)
    if (sectionMatch?.[1]) patch.section = sectionMatch[1].trim()
    patch.department = patch.department
      .replace(/\([^()]*section\)/ig, '')
      .replace(/\s*-\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const pageText = doc.body.textContent?.replace(/\s+/g, ' ') ?? ''
  const ay = pageText.match(/AY\s*20\d{2}\s*[- ]\s*\d{2}\s*[A-Z]+/i)?.[0]
  if (ay) patch.academicYear = ay.replace(/\s+/g, ' ').trim()

  const counselorRow = Array.from(doc.querySelectorAll('tr')).find(tr =>
    /counselor/i.test(tr.querySelector('td')?.textContent ?? '')
  )
  if (counselorRow) {
    const cells = Array.from(counselorRow.querySelectorAll('td'))
      .map(td => td.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter(Boolean)
    if (cells[1]) Object.assign(patch, parseAdvisorCell(cells[1], 'faculty'))
    if (cells[2]) Object.assign(patch, parseAdvisorCell(cells[2], 'academic'))
  }

  Array.from(doc.querySelectorAll('td')).forEach(td => {
    const text = td.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (!text) return
    if ((!patch.advisorName || !patch.advisorEmail || !patch.advisorPhone) && text.includes('Faculty Advisor')) {
      Object.assign(patch, parseAdvisorCell(text, 'faculty'))
    }
    if ((!patch.academicAdvisorName || !patch.academicAdvisorEmail || !patch.academicAdvisorPhone) && text.includes('Academic Advisor')) {
      Object.assign(patch, parseAdvisorCell(text, 'academic'))
    }
  })

  return patch
}

type TimetableCourseMetadata = {
  creditsByCode: Record<string, number>
  slotByCourseKey: Record<string, string>
}

function parseTimetableCourseMetadata(html: string): TimetableCourseMetadata {
  const innerHtml = extractInnerHtml(html)
  const creditsByCode: Record<string, number> = {}
  const slotByCourseKey: Record<string, string> = {}
  const parser = new DOMParser()
  const doc = parser.parseFromString(innerHtml, 'text/html')
  const courseTable = doc.querySelector('table.course_tbl')
  if (!courseTable) {
    return { creditsByCode, slotByCourseKey }
  }

  const cells = Array.from(courseTable.querySelectorAll('td'))
    .map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '')

  const headerStart = cells.findIndex((value) => /^s\.?\s*no$/i.test(value))
  if (headerStart < 0) {
    return { creditsByCode, slotByCourseKey }
  }

  const columnCount = 11
  for (let idx = headerStart + columnCount; idx + columnCount - 1 < cells.length;) {
    const serial = cells[idx] ?? ''
    if (!/^\d+$/.test(serial)) {
      idx += 1
      continue
    }

    const code = (cells[idx + 1] ?? '').trim().toUpperCase()
    const credit = parseFloat((cells[idx + 3] ?? '').trim())
    const courseTypeRaw = (cells[idx + 6] ?? '').trim()
    const slotRaw = (cells[idx + 8] ?? '').trim()
    const slotTokens = extractSlotTokens(slotRaw)

    if (code && Number.isFinite(credit)) {
      creditsByCode[code] = credit
    }
    if (code && slotTokens.length > 0) {
      const inferredType: AttendanceCourse['type'] =
        /\bpractical\b/i.test(courseTypeRaw) || slotTokens.some((token) => /^P\d+$/.test(token) || /^L\d+$/.test(token))
          ? 'Practical'
          : 'Theory'
      slotByCourseKey[`${code}|${inferredType}`] = slotTokens.join('-')
    }

    idx += columnCount
  }
  return { creditsByCode, slotByCourseKey }
}

export interface TimetableProfileCredits {
  profilePatch: Partial<StudentInfo>
  creditsByCode: Record<string, number>
  slotByCourseKey: Record<string, string>
  timetableByDay: Record<number, string[]>
}

const SLOT_TOKEN_PATTERN = /^(?:[A-G]|P\d+|L\d+)$/i

function normalizeSlotToken(raw: string): string {
  return raw.replace(/\u00a0/g, ' ').replace(/\s+/g, '').toUpperCase()
}

function parseTimetableByDayFromHtml(html: string): Record<number, string[]> {
  const innerHtml = extractInnerHtml(html)
  const parser = new DOMParser()
  const doc = parser.parseFromString(innerHtml, 'text/html')
  const byDay: Record<number, string[]> = {}

  for (const row of Array.from(doc.querySelectorAll('tr'))) {
    const cells = Array.from(row.querySelectorAll('td,th'))
      .map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter(Boolean)
    if (cells.length < 6) continue

    const rowText = cells.join(' ')
    const dayMatch = rowText.match(/day(?:\s*order)?\s*([1-5])/i)
    const numericLead = /^\d+$/.test(cells[0] ?? '') ? parseInt(cells[0] ?? '', 10) : NaN
    const day = dayMatch
      ? parseInt(dayMatch[1] ?? '', 10)
      : numericLead
    if (!Number.isFinite(day) || day < 1 || day > 5) continue

    const slots = cells
      .flatMap((value) => value.split(/[^A-Za-z0-9]+/g))
      .map(normalizeSlotToken)
      .filter((value) => SLOT_TOKEN_PATTERN.test(value))

    if (slots.length >= 8) {
      byDay[day] = slots.slice(0, 12)
    }
  }

  return byDay
}

async function fetchUnifiedTimetableByBatch(batch: number, token: string): Promise<Record<number, string[]>> {
  const candidates = batch === 1
    ? [
      'Unified_Time_Table_2025_Batch_1',
      'Unified_Time_Table_2025_batch_1',
      'Unified_Time_Table_2024_Batch_1',
      'Unified_Time_Table_2024_batch_1',
      'Unified_Time_Table_Batch_1',
      'Unified_Time_Table_batch_1',
    ]
    : batch === 2
      ? [
        'Unified_Time_Table_2025_Batch_2',
        'Unified_Time_Table_2025_batch_2',
        'Unified_Time_Table_2024_Batch_2',
        'Unified_Time_Table_2024_batch_2',
        'Unified_Time_Table_Batch_2',
        'Unified_Time_Table_batch_2',
      ]
      : []

  for (const page of candidates) {
    const resp = await fetch(`/proxy/page/${page}`, {
      headers: { 'Accept': 'text/html,application/xhtml+xml', 'X-Session-Token': token },
    })
    await throwIfUnauthorized(resp)
    if (!resp.ok) continue
    const html = await resp.text()
    const parsed = parseTimetableByDayFromHtml(html)
    if (Object.keys(parsed).length >= 3) return parsed
  }

  return {}
}

export async function fetchTimetableProfileAndCredits(): Promise<TimetableProfileCredits> {
  const token = getSessionToken()
  if (!token) throw new Error('Not authenticated')
  const resp = await fetch('/proxy/page/My_Time_Table_2023_24', {
    headers: { 'Accept': 'text/html,application/xhtml+xml', 'X-Session-Token': token },
  })
  await throwIfUnauthorized(resp)
  if (!resp.ok) throw new Error(`Server error: HTTP ${resp.status}`)
  const html = await resp.text()
  const profilePatch = parseTimetableProfilePage(html)
  const metadata = parseTimetableCourseMetadata(html)
  let timetableByDay = parseTimetableByDayFromHtml(html)

  if (Object.keys(timetableByDay).length < 3 && typeof profilePatch.batch === 'number') {
    const unified = await fetchUnifiedTimetableByBatch(profilePatch.batch, token)
    if (Object.keys(unified).length >= 3) timetableByDay = unified
  }

  if (Object.keys(timetableByDay).length < 3) {
    timetableByDay = profilePatch.batch === 2
      ? {
        1: [...(BATCH2_TIMETABLE[1] ?? [])],
        2: [...(BATCH2_TIMETABLE[2] ?? [])],
        3: [...(BATCH2_TIMETABLE[3] ?? [])],
        4: [...(BATCH2_TIMETABLE[4] ?? [])],
        5: [...(BATCH2_TIMETABLE[5] ?? [])],
      }
      : {}
  }

  return {
    profilePatch,
    creditsByCode: metadata.creditsByCode,
    slotByCourseKey: metadata.slotByCourseKey,
    timetableByDay,
  }
}

export async function fetchTimetableProfilePatch(): Promise<Partial<StudentInfo>> {
  const data = await fetchTimetableProfileAndCredits()
  return data.profilePatch
}

export interface AcademicCalendarEvent {
  id: string
  date: string // YYYY-MM-DD
  title: string
  type: 'holiday' | 'exam' | 'working' | 'event'
  dayOrder?: number
  semester: 'odd' | 'even'
}

function extractPlannerInnerHtml(outerHtml: string): string {
  const parser = new DOMParser()
  const outerDoc = parser.parseFromString(outerHtml, 'text/html')
  const encoded = outerDoc
    .querySelector('.zc-pb-embed-placeholder-content')
    ?.getAttribute('zmlvalue')
  if (!encoded) return extractInnerHtml(outerHtml)
  const textarea = document.createElement('textarea')
  textarea.innerHTML = encoded
  return textarea.value
}

function classifyCalendarType(title: string): AcademicCalendarEvent['type'] {
  const t = title.toLowerCase()
  if (
    t.includes('holiday') ||
    /holi|pongal|pooja|christmas|deepavali|diwali|muharram|milad|thaipoosam|good friday/.test(t)
  ) return 'holiday'
  if (t.includes('exam') || t.includes('assessment') || t.includes('test')) return 'exam'
  if (t.includes('working day') || t.includes('last working')) return 'working'
  return 'event'
}

function parsePlannerEvents(html: string, semester: 'odd' | 'even'): AcademicCalendarEvent[] {
  const plannerHtml = extractPlannerInnerHtml(html)
  const parser = new DOMParser()
  const doc = parser.parseFromString(plannerHtml, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return []

  const months = semester === 'odd' ? [7, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6]
  const year = semester === 'odd' ? 2025 : 2026
  const events: AcademicCalendarEvent[] = []

  Array.from(table.querySelectorAll('tr')).forEach((row, rowIdx) => {
    const cells = Array.from(row.querySelectorAll('td,th'))
      .map(c => c.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    if (cells.length < 30) return

    for (let block = 0; block < 6; block++) {
      const offset = block * 5
      const day = parseInt(cells[offset] ?? '', 10)
      if (!Number.isFinite(day)) continue

      const month = months[block] ?? 1
      const check = new Date(Date.UTC(year, month - 1, day))
      if (check.getUTCMonth() !== month - 1) continue

      const rawTitle = (cells[offset + 2] ?? '').trim()
      const dayOrderText = (cells[offset + 3] ?? '').trim()
      const dayOrder = /^\d+$/.test(dayOrderText) ? parseInt(dayOrderText, 10) : undefined
      const title = rawTitle || (dayOrder ? `Day Order ${dayOrder}` : '')
      if (!title) continue

      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      events.push({
        id: `${semester}-${rowIdx}-${block}-${day}`,
        date,
        title,
        dayOrder,
        type: rawTitle ? classifyCalendarType(rawTitle) : 'working',
        semester,
      })
    }
  })

  return events
}

async function fetchPlannerPage(linkName: string): Promise<string> {
  const token = getSessionToken()
  if (!token) throw new Error('Not authenticated')
  const resp = await fetch(`/proxy/page/${linkName}`, {
    headers: { 'Accept': 'text/html,application/xhtml+xml', 'X-Session-Token': token },
  })
  await throwIfUnauthorized(resp)
  if (!resp.ok) throw new Error(`Server error: HTTP ${resp.status}`)
  return await resp.text()
}

export async function fetchAcademicCalendarEvents(): Promise<AcademicCalendarEvent[]> {
  const [oddResult, evenResult] = await Promise.allSettled([
    fetchPlannerPage('Academic_Planner_2025_26_ODD'),
    fetchPlannerPage('Academic_Planner_2025_26_EVEN'),
  ])

  const events: AcademicCalendarEvent[] = []
  if (oddResult.status === 'fulfilled') {
    events.push(...parsePlannerEvents(oddResult.value, 'odd'))
  }
  if (evenResult.status === 'fulfilled') {
    events.push(...parsePlannerEvents(evenResult.value, 'even'))
  }
  if (events.length === 0) {
    const reason = oddResult.status === 'rejected'
      ? oddResult.reason
      : evenResult.status === 'rejected'
        ? evenResult.reason
        : new Error('No planner events found')
    throw reason instanceof Error ? reason : new Error('Failed to load academic planner')
  }

  return events.sort((a, b) => (
    a.date.localeCompare(b.date) ||
    a.title.localeCompare(b.title)
  ))
}

export type { AttendanceCourse, InternalMark, StudentInfo }

// Get today's classes based on day order — returns empty if no valid day order
export function getTodayClasses(
  dayOrder: number | null,
  liveAttendance?: AttendanceCourse[],
  timetableByDay: Record<number, string[]> = BATCH2_TIMETABLE
): Array<{
  period: number
  timeSlot: string
  slot: string
  course: AttendanceCourse | null
}> {
  if (typeof dayOrder !== 'number' || !Number.isInteger(dayOrder) || dayOrder < 1 || dayOrder > 5) {
    return []
  }
  const slots = timetableByDay[dayOrder] ?? []
  const courseList = (liveAttendance && liveAttendance.length > 0) ? liveAttendance : ATTENDANCE

  const toCourseSlotTokens = (slotValue: string): string[] => (
    extractSlotTokens(slotValue)
  )

  return slots.map((slotCode, idx) => {
    const normalizedSlotCode = slotCode.trim().toUpperCase()
    const course = courseList.find(c => {
      const slotTokens = toCourseSlotTokens(c.slot)
      const hasSlotToken = slotTokens.includes(normalizedSlotCode)
      const isPracticalCourse =
        c.type === 'Practical' ||
        slotTokens.some((token) => /^P\d+$/.test(token) || /^L\d+$/.test(token))

      // Match theory slots (single letter A-G)
      if (/^[A-G]$/.test(normalizedSlotCode)) return hasSlotToken && !isPracticalCourse
      // Match lab slots (P## pattern)
      if (/^P\d+$/.test(normalizedSlotCode)) {
        return hasSlotToken && isPracticalCourse
      }
      // Match L slots
      if (/^L\d+$/.test(normalizedSlotCode)) {
        return hasSlotToken
      }
      return false
    }) ?? null

    return {
      period: idx + 1,
      timeSlot: SLOT_TIMES[idx] ?? '',
      slot: normalizedSlotCode,
      course,
    }
  }).filter(p => p.course !== null || /^[A-G]$/.test(p.slot))
}

// Get schedule for all 5 day orders
export function getFullSchedule(
  liveAttendance?: AttendanceCourse[],
  timetableByDay: Record<number, string[]> = BATCH2_TIMETABLE
): Record<number, ReturnType<typeof getTodayClasses>> {
  const result: Record<number, ReturnType<typeof getTodayClasses>> = {}
  for (let d = 1; d <= 5; d++) {
    result[d] = getTodayClasses(d, liveAttendance, timetableByDay).filter(p => p.course !== null)
  }
  return result
}

// ── Circulars ──────────────────────────────────────────────────────────────────
export interface Circular {
  id: string
  title: string
  date: string
  from?: string
}

function parseCircularsPage(html: string): Circular[] {
  const innerHtml = extractInnerHtml(html)
  const parser = new DOMParser()
  const doc = parser.parseFromString(innerHtml, 'text/html')
  const circulars: Circular[] = []

  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const rows = Array.from(table.querySelectorAll('tr'))
    if (rows.length < 2) continue

    const headerTexts = Array.from(rows[0]?.querySelectorAll('th, td') ?? [])
      .map(h => h.textContent?.trim().toLowerCase() ?? '')
    if (headerTexts.every(h => h.length === 0)) continue
    if (headerTexts.some(h => h === 'login' || h === 'home' || h === 'logout')) continue

    let found = 0
    rows.slice(1).forEach((row, idx) => {
      const tds = Array.from(row.querySelectorAll('td'))
      const texts = tds.map(td => td.textContent?.trim().replace(/\s+/g, ' ') ?? '')
      if (texts.every(t => t.length === 0)) return

      const dateIdx = texts.findIndex(t =>
        /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|[A-Z][a-z]+ \d{1,2},? \d{4}/.test(t)
      )
      const title = (
        dateIdx >= 0
          ? texts.find((t, i) => i !== dateIdx && t.length > 5)
          : texts.find(t => t.length > 5)
      ) ?? texts[0] ?? ''

      if (title.length > 3) {
        circulars.push({
          id: `circ-${idx}`,
          title,
          date: dateIdx >= 0 ? (texts[dateIdx] ?? '') : '',
          from: texts.find((t, i) => i !== dateIdx && t !== title && t.length > 0),
        })
        found++
      }
    })
    if (found > 0) break
  }
  return circulars
}

export async function fetchCirculars(): Promise<Circular[]> {
  const token = getSessionToken()
  if (!token) throw new Error('Not authenticated')
  const resp = await fetch('/proxy/page/Circular_RA24', {
    headers: { 'Accept': 'text/html', 'X-Session-Token': token },
  })
  await throwIfUnauthorized(resp)
  if (!resp.ok) throw new Error(`Server error: HTTP ${resp.status}`)
  return parseCircularsPage(await resp.text())
}

export async function fetchNotificationCount(): Promise<number> {
  const token = getSessionToken()
  if (!token) return 0
  try {
    const resp = await fetch('/proxy/notifications/getcount?channel=1', {
      headers: { 'Accept': 'application/json, */*', 'X-Session-Token': token },
    })
    await throwIfUnauthorized(resp)
    if (!resp.ok) return 0
    const text = await resp.text()
    if (!text.trim()) return 0
    const d = JSON.parse(text)
    return typeof d === 'number' ? d : (d?.count ?? d?.unread_count ?? 0)
  } catch (err) {
    const msg = (err as Error).message ?? ''
    if (msg.includes('Session expired') || msg.includes('Not authenticated')) throw err
    return 0
  }
}

export interface PushDesignStatus {
  enabled: boolean
  phase: 'design-only' | 'subscription-ready' | 'subscription-stored'
  publicKeyAvailable: boolean
  publicKey: string
  subscriptionStored: boolean
  requirements: string[]
  notes: string[]
}

export async function fetchPushDesignStatus(): Promise<PushDesignStatus> {
  const token = getSessionToken()
  if (!token) throw new Error('Not authenticated')
  const resp = await fetch('/auth/push/status', {
    headers: { 'Accept': 'application/json', 'X-Session-Token': token },
  })
  await throwIfUnauthorized(resp)
  if (!resp.ok) throw new Error(`Server error: HTTP ${resp.status}`)
  return await resp.json() as PushDesignStatus
}

export async function fetchPushPublicKey(): Promise<string> {
  const token = getSessionToken()
  if (!token) throw new Error('Not authenticated')
  const resp = await fetch('/auth/push/public-key', {
    headers: { 'Accept': 'application/json', 'X-Session-Token': token },
  })
  await throwIfUnauthorized(resp)
  if (!resp.ok) throw new Error(`Server error: HTTP ${resp.status}`)
  const body = await resp.json() as { publicKey?: string }
  if (!body.publicKey) throw new Error('Push public key is missing on server')
  return body.publicKey
}

export async function savePushSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  const token = getSessionToken()
  if (!token) throw new Error('Not authenticated')
  const resp = await fetch('/auth/push/subscription', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'X-Session-Token': token },
    body: JSON.stringify({ subscription }),
  })
  await throwIfUnauthorized(resp)
  if (!resp.ok) throw new Error(`Server error: HTTP ${resp.status}`)
}

export async function deletePushSubscription(): Promise<void> {
  const token = getSessionToken()
  if (!token) throw new Error('Not authenticated')
  const resp = await fetch('/auth/push/subscription', {
    method: 'DELETE',
    headers: { 'Accept': 'application/json', 'X-Session-Token': token },
  })
  await throwIfUnauthorized(resp)
  if (!resp.ok) throw new Error(`Server error: HTTP ${resp.status}`)
}

export interface AdminMetricUser {
  email: string
  sessions: number
  trustedSessions: number
  firstSeenAt: string | null
  lastSeenAt: string | null
}

export interface AdminSelfMetrics {
  ok: boolean
  store: string
  activeSessionCount: number
  activeUserCount: number
  pushSubscriptionCount: number
  activeUsers: AdminMetricUser[]
  recentAuthEvents: Record<string, unknown>[]
  serverTime: string
}

export async function fetchAdminSelfMetrics(): Promise<AdminSelfMetrics> {
  const token = getSessionToken()
  if (!token) throw new Error('Not authenticated')
  const resp = await fetch('/auth/admin/metrics/self', {
    headers: { 'Accept': 'application/json', 'X-Session-Token': token },
  })
  await throwIfUnauthorized(resp)
  if (!resp.ok) throw new Error(`Server error: HTTP ${resp.status}`)
  return await resp.json() as AdminSelfMetrics
}

export async function validateSession(): Promise<{ valid: boolean; email?: string; reason?: string }> {
  const token = getSessionToken()
  if (!token) return { valid: false }
  try {
    const resp = await fetch('/auth/validate', {
      headers: { 'X-Session-Token': token },
    })
    if (resp.status === 401) {
      const failure = await readAuthFailure(resp, 'Session expired — please log in again')
      return { valid: false, reason: failure.reason }
    }
    if (!resp.ok) return { valid: true } // server error — assume valid, don't force logout
    return await resp.json() as { valid: boolean; email?: string; reason?: string }
  } catch {
    return { valid: true } // network error (offline) — keep session
  }
}

export { BATCH2_TIMETABLE, SLOT_TIMES }
