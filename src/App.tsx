import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Home, BarChart2, Clock3, CalendarDays, User } from "lucide-react"
import {
  classesSafeToMiss, classesNeededToReach,
} from "./data/real-data"
import type { AttendanceCourse, InternalMark, StudentInfo } from "./data/real-data"
import { BATCH2_TIMETABLE, getTodayClasses, fetchAttendance, fetchCurrentDayOrder, fetchProfilePatch, fetchTimetableProfileAndCredits, fetchAcademicCalendarEvents, fetchNotificationCount, fetchPushDesignStatus, fetchPushPublicKey, savePushSubscription, fetchAdminSelfMetrics, validateSession, loginUser, logoutUser, getSessionToken } from "./lib/api"
import type { AcademicCalendarEvent, AdminSelfMetrics } from "./lib/api"
import * as sessionStorageLib from "./lib/storage"
import { ExpandableNav } from "./components/expandable-tabs"
import { AcademiaLogo } from "./components/AcademiaLogo"
import { HeroBadge } from "./components/HeroBadge"
import { ProgressiveBlur } from "./components/ProgressiveBlur"
import changelogEntriesData from "./data/changelog.json"

const loadSessionSnapshot = sessionStorageLib.loadSessionSnapshot
const persistSessionSnapshot = sessionStorageLib.persistSessionSnapshot
const clearSessionSnapshot = sessionStorageLib.clearSessionSnapshot
const refreshSessionSnapshot =
  typeof sessionStorageLib.refreshSessionSnapshot === "function"
    ? sessionStorageLib.refreshSessionSnapshot
    : () => null

const EMPTY_STUDENT: StudentInfo = {
  name: '', regNo: '', program: '', department: '',
  batch: 0, section: '', semester: 0,
  mobile: '', advisorName: '', advisorEmail: '', advisorPhone: '',
  academicAdvisorName: '', academicAdvisorEmail: '', academicAdvisorPhone: '',
  academicYear: '', enrollmentDate: '',
}

// ─── Types ─────────────────────────────────────────────────────────────────────
type Screen = "home" | "attendance" | "schedule" | "calendar" | "profile" | "cooking"
type LoginStep = "email" | "password"
const THEME_OPTIONS = [
  { key: "dark", label: "Midnight" },
  { key: "light", label: "Daylight" },
  { key: "pink", label: "Rose" },
  { key: "catppuccin", label: "Lilac" },
  { key: "graphite", label: "Graphite" },
  { key: "cosmic-night", label: "Nebula" },
  { key: "northern-lights", label: "Mint" },
  { key: "starry-night", label: "Cobalt" },
  { key: "mocha-mousse", label: "Sand" },
  { key: "darkmatter", label: "Ember" },
] as const
type Theme = (typeof THEME_OPTIONS)[number]["key"]
type ChangelogEntry = {
  version: string
  summary: string
  added: string[]
  improved: string[]
  removed?: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
}

function normalizeChangelogEntries(source: unknown): ChangelogEntry[] {
  if (!Array.isArray(source)) return []
  return source.flatMap((rawEntry) => {
    if (!isRecord(rawEntry)) return []
    const version = typeof rawEntry.version === "string" ? rawEntry.version.trim() : ""
    const summary = typeof rawEntry.summary === "string" ? rawEntry.summary.trim() : ""
    const added = toStringArray(rawEntry.added)
    const improved = toStringArray(rawEntry.improved)
    const removed = toStringArray(rawEntry.removed)
    if (!version || !summary || added.length === 0 || improved.length === 0) return []
    return [{
      version,
      summary,
      added,
      improved,
      removed: removed.length > 0 ? removed : undefined,
    }]
  })
}

function parseVersionSegments(version: string): number[] {
  const cleanVersion = version.trim().replace(/^[^\d]*/, "")
  return cleanVersion.split(".").map((segment) => {
    const parsed = Number.parseInt(segment, 10)
    return Number.isFinite(parsed) ? parsed : 0
  })
}

function compareChangelogVersions(a: string, b: string): number {
  const aParts = parseVersionSegments(a)
  const bParts = parseVersionSegments(b)
  const maxLen = Math.max(aParts.length, bParts.length)
  for (let idx = 0; idx < maxLen; idx += 1) {
    const aValue = aParts[idx] ?? 0
    const bValue = bParts[idx] ?? 0
    if (aValue !== bValue) return aValue - bValue
  }
  return 0
}

const THEME_KEYS = new Set<Theme>(THEME_OPTIONS.map((theme) => theme.key))
const DARK_THEMES = new Set<Theme>([
  "dark",
  "graphite",
  "cosmic-night",
  "starry-night",
  "darkmatter",
])
const CHANGELOG_ENTRIES = normalizeChangelogEntries(changelogEntriesData)
const LATEST_CHANGELOG_INDEX = CHANGELOG_ENTRIES.length > 0
  ? CHANGELOG_ENTRIES.reduce(
    (bestIndex, entry, idx) =>
      compareChangelogVersions(entry.version, CHANGELOG_ENTRIES[bestIndex]?.version ?? "") > 0
        ? idx
        : bestIndex,
    0,
  )
  : -1
const CURRENT_APP_VERSION = CHANGELOG_ENTRIES[LATEST_CHANGELOG_INDEX]?.version ?? 'v1.0.0'
const MarksLineChart = lazy(() => import("./components/MarksLineChart"))
const PASS_MARK_PCT = 50
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

// ─── Theme helpers ─────────────────────────────────────────────────────────────
function isTheme(value: string | null): value is Theme {
  return !!value && THEME_KEYS.has(value as Theme)
}

function applyTheme(t: Theme) {
  const root = document.documentElement
  root.classList.remove(...THEME_OPTIONS.map((theme) => `theme-${theme.key}`))
  root.classList.remove("theme-tone-dark", "theme-tone-light")
  root.classList.add(`theme-${t}`)
  root.classList.add(DARK_THEMES.has(t) ? "theme-tone-dark" : "theme-tone-light")
}

function getSavedTheme(): Theme {
  const saved = localStorage.getItem("theme")
  return isTheme(saved) ? saved : "dark"
}

// Apply saved theme immediately (before React renders to prevent flash)
applyTheme(getSavedTheme())

// ─── Constants ─────────────────────────────────────────────────────────────────

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d = new Date()): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
function fmt12(time24: string): string {
  const [hStr, mStr] = time24.trim().split(":")
  const h = parseInt(hStr ?? "0", 10)
  const m = mStr ?? "00"
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${ampm}`
}

function supportsWebPush(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
}

function vapidBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const normalized = base64String.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const rawData = atob(`${normalized}${padding}`)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return buffer
}

const ADMIN_PROFILE_ID = 'as6977'
function isAdminProfileUser(identity: string): boolean {
  const normalized = identity.trim().toLowerCase()
  if (!normalized) return false
  const localPart = normalized.split('@')[0] || ''
  return normalized === ADMIN_PROFILE_ID || localPart === ADMIN_PROFILE_ID
}

function fmtTimeSlot(slot: string): { start: string; end: string } {
  const [s, e] = slot.split("\u2013")
  return { start: fmt12(s ?? ""), end: fmt12(e ?? "") }
}

function nowMinutes(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function parseSlotStart(slot: string): number {
  const part = slot.split("\u2013")[0] ?? "00:00"
  const [h, m] = part.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function parseSlotEnd(slot: string): number {
  const part = slot.split("\u2013")[1] ?? "00:00"
  const [h, m] = part.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

// Live clock — updates every minute, triggers re-render for isLive/isDone state
function useClock(): number {
  const [now, setNow] = useState(nowMinutes)
  useEffect(() => {
    const id = setInterval(() => setNow(nowMinutes()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let raf = 0
    if (target === 0) {
      raf = requestAnimationFrame(() => setVal(0))
      return () => cancelAnimationFrame(raf)
    }
    let start: number | null = null
    const step = (ts: number) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setVal(parseFloat((eased * target).toFixed(1)))
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

function useNowTimestamp(intervalMs = 60_000): number {
  const [nowTs, setNowTs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return nowTs
}

function useDayOrder(): [number | null, (d: number | null) => void] {
  const todayKey = new Date().toISOString().slice(0, 10)
  const [dayOrder, setDayOrderState] = useState<number | null>(() => {
    const saved = localStorage.getItem("dayOrder")
    if (!saved) return null
    try {
      const parsed = JSON.parse(saved) as { day?: unknown; date?: unknown }
      if (
        typeof parsed?.day === 'number' &&
        Number.isFinite(parsed.day) &&
        parsed.day >= 1 &&
        parsed.day <= 5 &&
        typeof parsed?.date === 'string' &&
        parsed.date === todayKey
      ) {
        return parsed.day
      }
    } catch {
      // ignore legacy/plain value
    }
    localStorage.removeItem("dayOrder")
    return null
  })
  const setDayOrder = useCallback((d: number | null) => {
    if (typeof d !== 'number' || !Number.isFinite(d)) {
      localStorage.removeItem("dayOrder")
      setDayOrderState(null)
      return
    }
    const next = Math.max(1, Math.min(5, Math.round(d)))
    localStorage.setItem("dayOrder", JSON.stringify({ day: next, date: todayKey }))
    setDayOrderState(next)
  }, [todayKey])
  return [dayOrder, setDayOrder]
}

function firstName(fullName: string): string {
  const parts = fullName.trim().split(" ")
  return parts[0] ?? fullName
}

function toTitle(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

const SRM_EMAIL_DOMAIN = 'srmist.edu.in'
const FEEDBACK_EMAIL = 'arch.unbeaten936@passinbox.com'
const FEEDBACK_MAILTO = `mailto:${FEEDBACK_EMAIL}?subject=Arch%20Feedback`
const APP_VALID_PATHS = new Set(['/', '/index.html'])
const AUTH_PROGRESS_STEPS = [
  'Connecting to SRM gateway',
  'Verifying NetID',
  'Checking active sessions',
  'Creating secure portal session',
  'Loading your dashboard',
] as const

type AttendanceSnapshotEntry = {
  courseLabel: string
  title: string
  conducted: number
  absent: number
}
type AttendanceSnapshot = Record<string, AttendanceSnapshotEntry>
type AttendanceUpdateKind = 'present' | 'absent' | 'updated'
type AttendancePollingMode = 'active-class' | 'between-classes' | 'off-hours' | 'idle-day' | 'weekend'
type AttendanceUpdateNotice = {
  courseLabel: string
  title: string
  status: AttendanceUpdateKind
}
type TimetableByDay = Record<number, string[]>
type CourseSlotOverrides = Record<string, string>
type TabCachePayload = {
  attendance: AttendanceCourse[]
  marks: InternalMark[]
  calendarEvents: AcademicCalendarEvent[]
  timetableByDay: TimetableByDay
  courseSlotOverrides: CourseSlotOverrides
  studentBatch: number | null
  dayOrder: number | null
  lastUpdatedIso: string | null
  savedAt: number
  cacheVersion: number
}

const ATTENDANCE_SNAPSHOT_PREFIX = 'arch.attendance.snapshot.'
const TAB_CACHE_PREFIX = 'arch.tabcache.v1.'
const TAB_CACHE_VERSION = 4
const TAB_CACHE_MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000
const DAY_ORDER_REFRESH_MS = 10 * 60 * 1000
const ATTENDANCE_POLL_INTERVALS: Record<AttendancePollingMode, number> = {
  'active-class': 20 * 1000,
  'between-classes': 60 * 1000,
  'off-hours': 7 * 60 * 1000,
  'idle-day': 15 * 60 * 1000,
  'weekend': 25 * 60 * 1000,
}

function getAttendanceSnapshotStorageKey(email: string): string {
  return `${ATTENDANCE_SNAPSHOT_PREFIX}${encodeURIComponent(email.trim().toLowerCase())}`
}

function getTabCacheStorageKey(email: string): string {
  return `${TAB_CACHE_PREFIX}${encodeURIComponent(email.trim().toLowerCase())}`
}

function decodeUserKey(raw: string, encoded: boolean): string {
  const source = encoded
    ? (() => {
      try { return decodeURIComponent(raw) } catch { return raw }
    })()
    : raw
  return source.trim().toLowerCase()
}

function cleanupStaleLocalEntries(activeEmail: string | null): void {
  const normalizedActive = activeEmail?.trim().toLowerCase() || ''
  const keys = Object.keys(localStorage)
  const now = Date.now()

  for (const key of keys) {
    if (key.startsWith('academia.student.')) {
      const email = decodeUserKey(key.slice('academia.student.'.length), false)
      if (!email || (normalizedActive && email !== normalizedActive)) {
        localStorage.removeItem(key)
      }
      continue
    }

    if (key.startsWith(ATTENDANCE_SNAPSHOT_PREFIX)) {
      const email = decodeUserKey(key.slice(ATTENDANCE_SNAPSHOT_PREFIX.length), true)
      if (!email || (normalizedActive && email !== normalizedActive)) {
        localStorage.removeItem(key)
      }
      continue
    }

    if (key.startsWith(TAB_CACHE_PREFIX)) {
      const email = decodeUserKey(key.slice(TAB_CACHE_PREFIX.length), true)
      if (!email || (normalizedActive && email !== normalizedActive)) {
        localStorage.removeItem(key)
        continue
      }
      try {
        const payload = JSON.parse(localStorage.getItem(key) || '{}') as Partial<TabCachePayload>
        const cacheVersion = typeof payload.cacheVersion === 'number' ? payload.cacheVersion : 0
        const savedAt = typeof payload.savedAt === 'number' ? payload.savedAt : 0
        if (cacheVersion < TAB_CACHE_VERSION || savedAt <= 0 || (now - savedAt) > TAB_CACHE_MAX_AGE_MS) {
          localStorage.removeItem(key)
        }
      } catch {
        localStorage.removeItem(key)
      }
    }
  }
}

function cloneDefaultTimetableByDay(): TimetableByDay {
  return {
    1: [...(BATCH2_TIMETABLE[1] ?? [])],
    2: [...(BATCH2_TIMETABLE[2] ?? [])],
    3: [...(BATCH2_TIMETABLE[3] ?? [])],
    4: [...(BATCH2_TIMETABLE[4] ?? [])],
    5: [...(BATCH2_TIMETABLE[5] ?? [])],
  }
}

function fallbackTimetableForBatch(batch: number | null | undefined): TimetableByDay {
  return batch === 2 ? cloneDefaultTimetableByDay() : {}
}

function isBatch2FallbackTimetable(timetableByDay: TimetableByDay): boolean {
  for (let day = 1; day <= 5; day += 1) {
    const expected = BATCH2_TIMETABLE[day] ?? []
    const actual = timetableByDay[day] ?? []
    if (actual.length !== expected.length) return false
    for (let idx = 0; idx < expected.length; idx += 1) {
      if (actual[idx] !== expected[idx]) return false
    }
  }
  return true
}

function normalizeTimetableByDay(raw: unknown, fallback: TimetableByDay = {}): TimetableByDay {
  if (!raw || typeof raw !== 'object') return fallback
  const parsed: TimetableByDay = {}
  for (let day = 1; day <= 5; day += 1) {
    const value = (raw as Record<string, unknown>)[String(day)] ?? (raw as Record<number, unknown>)[day]
    if (!Array.isArray(value)) continue
    const slots = value
      .map((slot) => (typeof slot === 'string' ? slot.trim().toUpperCase() : ''))
      .filter((slot) => slot.length > 0)
      .slice(0, 12)
    if (slots.length > 0) parsed[day] = slots
  }
  return Object.keys(parsed).length > 0 ? parsed : fallback
}

function normalizeCourseSlotOverrides(raw: unknown): CourseSlotOverrides {
  if (!raw || typeof raw !== 'object') return {}
  const normalized: CourseSlotOverrides = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== 'string' || !key.includes('|')) continue
    if (typeof value !== 'string') continue
    const slot = value.trim().toUpperCase()
    if (!slot) continue
    normalized[key] = slot
  }
  return normalized
}

function readTabCache(email: string): TabCachePayload | null {
  if (!email) return null
  const raw = localStorage.getItem(getTabCacheStorageKey(email))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<TabCachePayload>
    const cacheVersion = typeof parsed.cacheVersion === 'number' ? parsed.cacheVersion : 0
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0
    if (cacheVersion < TAB_CACHE_VERSION || savedAt <= 0 || (Date.now() - savedAt) > TAB_CACHE_MAX_AGE_MS) {
      localStorage.removeItem(getTabCacheStorageKey(email))
      return null
    }
    const studentBatch = typeof parsed.studentBatch === 'number' && parsed.studentBatch >= 1 ? parsed.studentBatch : null
    const fallbackTimetable = fallbackTimetableForBatch(studentBatch)
    return {
      attendance: Array.isArray(parsed.attendance) ? parsed.attendance as AttendanceCourse[] : [],
      marks: Array.isArray(parsed.marks) ? parsed.marks as InternalMark[] : [],
      calendarEvents: Array.isArray(parsed.calendarEvents) ? parsed.calendarEvents as AcademicCalendarEvent[] : [],
      timetableByDay: normalizeTimetableByDay(parsed.timetableByDay, fallbackTimetable),
      courseSlotOverrides: normalizeCourseSlotOverrides(parsed.courseSlotOverrides),
      studentBatch,
      dayOrder: typeof parsed.dayOrder === 'number' && parsed.dayOrder >= 1 && parsed.dayOrder <= 5 ? parsed.dayOrder : null,
      lastUpdatedIso: typeof parsed.lastUpdatedIso === 'string' ? parsed.lastUpdatedIso : null,
      savedAt,
      cacheVersion: TAB_CACHE_VERSION,
    }
  } catch {
    localStorage.removeItem(getTabCacheStorageKey(email))
    return null
  }
}

function writeTabCache(email: string, payload: TabCachePayload): void {
  if (!email) return
  localStorage.setItem(getTabCacheStorageKey(email), JSON.stringify(payload))
}

function isStandalonePwaDisplayMode(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true ||
    document.referrer.startsWith('android-app://')
  )
}

function createAttendanceSnapshot(courses: AttendanceCourse[]): AttendanceSnapshot {
  const snapshot: AttendanceSnapshot = {}
  for (const course of courses) {
    const key = `${course.code}|${course.type}`
    snapshot[key] = {
      courseLabel: key,
      title: course.title,
      conducted: course.conducted,
      absent: course.absent,
    }
  }
  return snapshot
}

function detectAttendanceUpdates(previous: AttendanceSnapshot | null, next: AttendanceSnapshot): AttendanceUpdateNotice[] {
  if (!previous) return []
  const updates: AttendanceUpdateNotice[] = []
  for (const [key, current] of Object.entries(next)) {
    const prev = previous[key]
    if (!prev) continue
    const deltaConducted = current.conducted - prev.conducted
    const deltaAbsent = current.absent - prev.absent
    if (deltaConducted <= 0 && deltaAbsent <= 0) continue
    const status: AttendanceUpdateKind =
      deltaConducted > 0 && deltaAbsent === 0
        ? 'present'
        : deltaConducted > 0 && deltaAbsent === deltaConducted
          ? 'absent'
          : 'updated'
    updates.push({
      courseLabel: current.courseLabel,
      title: current.title,
      status,
    })
  }
  return updates
}

function resolveAttendancePollingMode(
  dayOrder: number | null,
  attendance: AttendanceCourse[],
  timetableByDay: TimetableByDay,
  now = new Date()
): AttendancePollingMode {
  const weekday = now.getDay()
  if (weekday === 0 || weekday === 6) return 'weekend'

  const todayClasses = getTodayClasses(dayOrder, attendance, timetableByDay)
  const windows = todayClasses
    .map((slot) => ({
      start: parseSlotStart(slot.timeSlot),
      end: parseSlotEnd(slot.timeSlot),
    }))
    .filter((slotWindow) => Number.isFinite(slotWindow.start) && Number.isFinite(slotWindow.end) && slotWindow.end > slotWindow.start)

  if (windows.length === 0) return 'idle-day'

  const nowMinutesValue = now.getHours() * 60 + now.getMinutes()
  if (windows.some((slotWindow) => nowMinutesValue >= slotWindow.start && nowMinutesValue < slotWindow.end)) {
    return 'active-class'
  }

  const firstClassStart = Math.min(...windows.map((slotWindow) => slotWindow.start))
  const lastClassEnd = Math.max(...windows.map((slotWindow) => slotWindow.end))
  if (nowMinutesValue < firstClassStart || nowMinutesValue >= lastClassEnd) {
    return 'off-hours'
  }
  return 'between-classes'
}

function getAdaptiveAttendancePollIntervalMs(
  dayOrder: number | null,
  attendance: AttendanceCourse[],
  timetableByDay: TimetableByDay
): number {
  const mode = resolveAttendancePollingMode(dayOrder, attendance, timetableByDay)
  const baseInterval = ATTENDANCE_POLL_INTERVALS[mode]
  if (document.hidden) return Math.max(baseInterval, 3 * 60 * 1000)
  return baseInterval
}

function normalizeAppPath(pathname: string): string {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}

function generateJoiningNetIds(count = 160): string[] {
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  const target = Math.max(100, Math.min(200, count))
  const generated = new Set<string>()
  let attempts = 0
  const maxAttempts = target * 40

  while (generated.size < target && attempts < maxAttempts) {
    const prefix =
      letters[Math.floor(Math.random() * letters.length)] +
      letters[Math.floor(Math.random() * letters.length)]
    const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    generated.add(`${prefix}${digits}@${SRM_EMAIL_DOMAIN}`)
    attempts += 1
  }

  if (generated.size < target) {
    for (let i = 0; i < letters.length && generated.size < target; i += 1) {
      for (let j = 0; j < letters.length && generated.size < target; j += 1) {
        const digits = String((i * 37 + j * 19) % 10000).padStart(4, '0')
        generated.add(`${letters[i]}${letters[j]}${digits}@${SRM_EMAIL_DOMAIN}`)
      }
    }
  }

  return Array.from(generated)
}

const JOINING_NETIDS = generateJoiningNetIds(160)
const LIVE_FEED_CARDS = JOINING_NETIDS.map((netId, idx) => ({
  id: `${netId}-${idx}`,
  netId,
}))

function normalizeLoginEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return ''
  return trimmed.includes('@') ? trimmed : `${trimmed}@${SRM_EMAIL_DOMAIN}`
}

function emailLocalPart(raw: string): string {
  const normalized = normalizeLoginEmail(raw)
  return normalized.split('@')[0] ?? normalized
}

function LoginLiveFeedStack() {
  const [index, setIndex] = useState(0)
  const total = LIVE_FEED_CARDS.length

  useEffect(() => {
    if (total === 0) return
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % total)
    }, 3000)
    return () => clearInterval(id)
  }, [total])

  const stack = useMemo(() => {
    if (total === 0) return []
    return [0, 1, 2].map((offset) => {
      const cursor = (index + offset) % total
      return LIVE_FEED_CARDS[cursor]
    })
  }, [index, total])

  if (stack.length === 0) return null

  const layers = [
    { scale: 1, opacity: 1, y: 0, zIndex: 30 },
    { scale: 0.95, opacity: 0.6, y: 20, zIndex: 20 },
    { scale: 0.9, opacity: 0.3, y: 40, zIndex: 10 },
  ]
  const layerFilters = ["none", "blur(0.6px) saturate(0.82)", "blur(1.1px) saturate(0.72)"] as const

  return (
    <div className="login-live-feed" aria-live="polite">
      <div className="login-live-feed-title">
        <span className="login-live-feed-dot" />
        Live Feed
      </div>
      <div className="login-live-feed-stack">
        {stack.map((card, layerIdx) => (
          <motion.div
            key={card.id}
            className={`login-live-feed-card layer-${layerIdx}${layerIdx === 0 ? " active" : ""}`}
            aria-hidden={layerIdx !== 0}
            initial={false}
            animate={{
              scale: layers[layerIdx].scale,
              opacity: layers[layerIdx].opacity,
              y: layers[layerIdx].y,
            }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 24,
              mass: 0.9,
            }}
            style={{
              zIndex: layers[layerIdx].zIndex,
              pointerEvents: layerIdx === 0 ? "auto" : "none",
              transformOrigin: "center top",
              filter: layerFilters[layerIdx],
            }}
          >
            <div className="login-live-feed-message">
              <strong>{card.netId}</strong>
              <span>just joined Arch</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function mergeStudent(base: StudentInfo, patch: Partial<StudentInfo>): StudentInfo {
  const pick = (next: string | undefined, prev: string) => (next && next.trim() ? next : prev)
  return {
    ...base,
    name: pick(patch.name, base.name),
    regNo: pick(patch.regNo, base.regNo),
    program: pick(patch.program, base.program),
    department: pick(patch.department, base.department),
    section: pick(patch.section, base.section),
    semester: typeof patch.semester === 'number' && patch.semester > 0 ? patch.semester : base.semester,
    batch: typeof patch.batch === 'number' && patch.batch > 0 ? patch.batch : base.batch,
    mobile: pick(patch.mobile, base.mobile),
    advisorName: pick(patch.advisorName, base.advisorName),
    advisorEmail: pick(patch.advisorEmail, base.advisorEmail),
    advisorPhone: pick(patch.advisorPhone, base.advisorPhone),
    academicAdvisorName: pick(patch.academicAdvisorName, base.academicAdvisorName),
    academicAdvisorEmail: pick(patch.academicAdvisorEmail, base.academicAdvisorEmail),
    academicAdvisorPhone: pick(patch.academicAdvisorPhone, base.academicAdvisorPhone),
    academicYear: pick(patch.academicYear, base.academicYear),
    enrollmentDate: pick(patch.enrollmentDate, base.enrollmentDate),
  }
}

function hasStudentPatchData(patch: Partial<StudentInfo>): boolean {
  return Object.values(patch).some((value) => {
    if (typeof value === 'string') return value.trim().length > 0
    if (typeof value === 'number') return value > 0
    return Boolean(value)
  })
}

function nextIsoDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function toMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  const d = new Date(year ?? 2026, (month ?? 1) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function toPrettyDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const d = new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1)
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function applyCreditsToAttendance(
  attendance: AttendanceCourse[],
  credits: Record<string, number>
): AttendanceCourse[] {
  if (Object.keys(credits).length === 0) return attendance
  return attendance.map(course => ({
    ...course,
    credit: credits[course.code] ?? course.credit,
  }))
}

function attendanceCourseKey(course: Pick<AttendanceCourse, 'code' | 'type'>): string {
  return `${course.code.trim().toUpperCase()}|${course.type}`
}

function applyCourseSlotOverrides(
  attendance: AttendanceCourse[],
  courseSlotOverrides: CourseSlotOverrides
): AttendanceCourse[] {
  if (Object.keys(courseSlotOverrides).length === 0) return attendance
  return attendance.map((course) => {
    const overrideSlot = courseSlotOverrides[attendanceCourseKey(course)]
    if (!overrideSlot || overrideSlot === course.slot) return course
    return {
      ...course,
      slot: overrideSlot,
    }
  })
}

function overallPct(courses: AttendanceCourse[]): number {
  const conducted = courses.reduce((s, c) => s + c.conducted, 0)
  const absent = courses.reduce((s, c) => s + c.absent, 0)
  if (!conducted) return 0
  return Math.round(((conducted - absent) / conducted) * 1000) / 10
}

function attnClass(pct: number): "danger" | "ok" {
  return pct > 75 ? "ok" : "danger"
}

function markClass(pct: number): "low" | "ok" {
  return pct < PASS_MARK_PCT ? "low" : "ok"
}

const ROMAN_TO_INT: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
}

function normalizeAssessmentToken(test: string): string {
  return test.toUpperCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim()
}

function assessmentPrefix(test: string): string {
  const normalized = normalizeAssessmentToken(test)
  const prefix = normalized.match(/^[A-Z]+/)
  return prefix?.[0] ?? normalized
}

function assessmentIndex(test: string): number {
  const normalized = normalizeAssessmentToken(test)
  const digitMatch = normalized.match(/\d+/)
  if (digitMatch?.[0]) return Number.parseInt(digitMatch[0], 10)
  const romanMatches = normalized.match(/\b(?:X|IX|IV|V?I{1,3})\b/g)
  if (!romanMatches || romanMatches.length === 0) return Number.MAX_SAFE_INTEGER
  const roman = romanMatches[romanMatches.length - 1]!
  return ROMAN_TO_INT[roman] ?? Number.MAX_SAFE_INTEGER
}

function compareAssessmentNames(a: string, b: string): number {
  const prefixDiff = assessmentPrefix(a).localeCompare(assessmentPrefix(b))
  if (prefixDiff !== 0) return prefixDiff
  const indexDiff = assessmentIndex(a) - assessmentIndex(b)
  if (indexDiff !== 0) return indexDiff
  return normalizeAssessmentToken(a).localeCompare(normalizeAssessmentToken(b))
}

function formatAssessmentLabel(test: string): string {
  const normalized = normalizeAssessmentToken(test).replace(
    /\b(X|IX|IV|V?I{1,3})\b/g,
    (token) => String(ROMAN_TO_INT[token] ?? token),
  )
  return normalized.replace(/([A-Z]+)-(\d+)/g, "$1 $2")
}

function compareInternalMarks(a: InternalMark, b: InternalMark): number {
  const byAssessment = compareAssessmentNames(a.test, b.test)
  if (byAssessment !== 0) return byAssessment
  return a.max - b.max
}

// Merge consecutive same-course periods
interface GroupedClass {
  period: number
  timeSlot: string    // merged span: first start → last end
  slot: string
  course: AttendanceCourse
  count: number
  individualSlots: Array<{ period: number; timeSlot: string }>
}

function groupClasses(
  raw: Array<{ period: number; timeSlot: string; slot: string; course: AttendanceCourse | null }>
): GroupedClass[] {
  const filtered = raw.filter(
    (c): c is typeof c & { course: AttendanceCourse } => c.course !== null
  )

  // Group ALL occurrences of same course (code + type), preserving first-occurrence order
  const seen = new Map<string, GroupedClass>()
  const order: string[] = []
  for (const entry of filtered) {
    const key = `${entry.course.code}|${entry.course.type}`
    if (!seen.has(key)) {
      order.push(key)
      seen.set(key, { ...entry, count: 1, individualSlots: [{ period: entry.period, timeSlot: entry.timeSlot }] })
    } else {
      const g = seen.get(key)!
      g.count++
      g.individualSlots.push({ period: entry.period, timeSlot: entry.timeSlot })
    }
  }

  // Update merged timeSlot span for multi-occurrence courses
  return order.map(key => {
    const g = seen.get(key)!
    if (g.count > 1) {
      const start = (g.individualSlots[0]!.timeSlot.split('\u2013')[0] ?? '').trim()
      const end = (g.individualSlots[g.count - 1]!.timeSlot.split('\u2013')[1] ?? '').trim()
      g.timeSlot = `${start}\u2013${end}`
    }
    return g
  })
}

// ─── Icons ─────────────────────────────────────────────────────────────────────
const Icons = {
  Home: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  Calendar: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  BarChart: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  Person: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Eye: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  EyeOff: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ),
  Refresh: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  ),
  Close: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Mail: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  Phone: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  LogOut: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  ChevronLeft: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  Bell: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  Shield: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 5-3.2 8.5-7 10-3.8-1.5-7-5-7-10V6l7-3z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  ),
  Trend: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 16 9 10 13 14 21 6"/>
      <polyline points="15 6 21 6 21 12"/>
    </svg>
  ),
}

// ─── Pull-to-refresh hook ──────────────────────────────────────────────────────
function usePullToRefresh(onRefresh: () => void, enabled: boolean) {
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])
  const startY = useRef(0)
  const pullRef = useRef(0)
  const [pullPct, setPullPct] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 8) return
      startY.current = e.touches[0]?.clientY ?? 0
    }
    const onMove = (e: TouchEvent) => {
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current
      if (dy > 0 && window.scrollY <= 0) {
        pullRef.current = Math.min(dy / 80, 1)
        setPullPct(pullRef.current)
      } else if (dy <= 0 && pullRef.current > 0) {
        pullRef.current = 0
        setPullPct(0)
      }
    }
    const onEnd = () => {
      if (pullRef.current >= 1) onRefreshRef.current()
      pullRef.current = 0
      setPullPct(0)
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [enabled])
  return pullPct
}

// ─── Attendance donut ─────────────────────────────────────────────────────────
function AttendanceDonut({ pct, animated }: { pct: number; animated: number }) {
  const r = 34
  const circ = 2 * Math.PI * r
  const dash = (animated / 100) * circ
  const cls = attnClass(pct)
  const strokeColor = cls === 'ok' ? '#34C759' : '#FF3B30'
  return (
    <svg viewBox="0 0 100 100" className="att-donut">
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="11" className="att-donut-track" />
      <circle
        cx="50" cy="50" r={r} fill="none" strokeWidth="11"
        stroke={strokeColor}
        strokeDasharray={`${dash.toFixed(2)} ${circ.toFixed(2)}`}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.22,1,0.36,1)' }}
      />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="att-donut-label">
        {animated.toFixed(0)}%
      </text>
    </svg>
  )
}

// ─── Circulars screen ─────────────────────────────────────────────────────────
function CalendarScreen({ events, loading, error, onDayOrderSync }: {
  events: AcademicCalendarEvent[]
  loading: boolean
  error: string
  onDayOrderSync: (d: number) => void
}) {
  const monthKeys = useMemo(
    () => Array.from(new Set(events.map(e => e.date.slice(0, 7)))).sort(),
    [events]
  )
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedDate, setSelectedDate] = useState('')

  const currentMonth = new Date().toISOString().slice(0, 7)
  const activeMonth = (selectedMonth && monthKeys.includes(selectedMonth))
    ? selectedMonth
    : (monthKeys.includes(currentMonth) ? currentMonth : (monthKeys[0] ?? currentMonth))
  const monthIdx = monthKeys.indexOf(activeMonth)

  const eventsByDate = useMemo(() => {
    const map: Record<string, AcademicCalendarEvent[]> = {}
    events.forEach(ev => {
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date]!.push(ev)
    })
    return map
  }, [events])

  const [year, month] = activeMonth.split('-').map(Number)
  const nowDate = new Date()
  const todayKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`
  const firstWeekday = new Date(year ?? 2026, (month ?? 1) - 1, 1).getDay()
  const daysInMonth = new Date(year ?? 2026, month ?? 1, 0).getDate()
  const calendarCells = [
    ...Array.from({ length: firstWeekday }, () => 0),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const defaultSelectedDate = todayKey.startsWith(activeMonth) ? todayKey : ''
  const effectiveSelectedDate = (selectedDate && selectedDate.startsWith(activeMonth))
    ? selectedDate
    : defaultSelectedDate
  const selectedEvents = effectiveSelectedDate ? (eventsByDate[effectiveSelectedDate] ?? []) : []
  const monthEvents = useMemo(
    () => events.filter(ev => ev.date.startsWith(activeMonth)),
    [events, activeMonth]
  )

  function exportIcsFile(fileEvents: AcademicCalendarEvent[], fileName: string) {
    if (fileEvents.length === 0) return
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SRM Arch//Academic Planner//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ]
    fileEvents.forEach(ev => {
      const start = ev.date.replace(/-/g, '')
      const end = nextIsoDate(ev.date).replace(/-/g, '')
      const desc = ev.dayOrder ? `${ev.title} | Day Order ${ev.dayOrder}` : ev.title
      lines.push(
        'BEGIN:VEVENT',
        `UID:${ev.id}@academia-srm`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${icsEscape(ev.title)}`,
        `DESCRIPTION:${icsEscape(desc)}`,
        'END:VEVENT'
      )
    })
    lines.push('END:VCALENDAR')

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="attn-hero">
        <div>
          <div className="stat-label">Academic Calendar</div>
          <div className="attn-hero-pct calendar-hero-pct">
            {toMonthLabel(activeMonth)}
          </div>
        </div>
        <div className="attn-hero-right">
          <div className="attn-hero-label">AY 2025–26</div>
          <div className="attn-hero-sub">{loading ? 'Loading…' : `${events.length} entries`}</div>
        </div>
      </div>

      <div className="calendar-sync-row">
        <button className="calendar-sync-btn" onClick={() => exportIcsFile(events, 'academia-academic-calendar.ics')}>
          Export full .ics
        </button>
        <button
          className="calendar-sync-btn"
          onClick={() => exportIcsFile(monthEvents, `academia-academic-calendar-${activeMonth}.ics`)}
          disabled={monthEvents.length === 0}
        >
          Export {toMonthLabel(activeMonth)} .ics
        </button>
        <a
          className="calendar-sync-btn ghost"
          href="https://calendar.google.com/calendar/u/0/r/settings/export"
          target="_blank"
          rel="noreferrer"
        >
          Open Google import
        </a>
      </div>
      <div style={{ padding: '0 16px 10px', fontSize: 11, color: 'var(--ink-4)' }}>
        Export full calendar or this month, then import the file into Google Calendar. Tap any date to sync Day Order with timetable.
      </div>

      {loading && (
        <div className="circulars-loading">
          <div className="loading-ring" />
          <span>Loading academic planner…</span>
        </div>
      )}
      {!loading && error && <div className="error-banner" style={{ margin: '0 16px' }}>{error}</div>}

      {!loading && !error && (
        <>
          <div className="calendar-month-nav">
            <button
              className="calendar-month-btn"
              disabled={monthIdx <= 0}
              onClick={() => monthIdx > 0 && setSelectedMonth(monthKeys[monthIdx - 1] ?? activeMonth)}
              aria-label="Previous month"
            >
              <Icons.ChevronLeft />
            </button>
            <div className="calendar-month-label">{toMonthLabel(activeMonth)}</div>
            <button
              className="calendar-month-btn"
              disabled={monthIdx < 0 || monthIdx >= monthKeys.length - 1}
              onClick={() => monthIdx >= 0 && setSelectedMonth(monthKeys[monthIdx + 1] ?? activeMonth)}
              aria-label="Next month"
            >
              <Icons.ChevronRight />
            </button>
          </div>

          <div className="calendar-grid-header">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="calendar-grid">
            {calendarCells.map((day, idx) => {
              if (day === 0) return <div key={`empty-${idx}`} className="calendar-day empty" />
              const dateKey = `${activeMonth}-${String(day).padStart(2, '0')}`
              const dayEvents = eventsByDate[dateKey] ?? []
              const dayOrder = dayEvents.find(e => typeof e.dayOrder === 'number')?.dayOrder
              const hasHoliday = dayEvents.some(e => e.type === 'holiday')
              const hasExam = dayEvents.some(e => e.type === 'exam')
              const hasWorking = dayEvents.some(e => e.type === 'working')
              const hasEvent = dayEvents.some(e => e.type === 'event')
              const selected = effectiveSelectedDate === dateKey
              const isToday = dateKey === todayKey
              return (
                <button
                  key={dateKey}
                  className={`calendar-day${selected ? ' selected' : ''}${isToday ? ' today' : ''}${hasHoliday ? ' holiday' : ''}`}
                  onClick={() => {
                    setSelectedDate(dateKey)
                    if (dayOrder) onDayOrderSync(dayOrder)
                  }}
                >
                  <span className="calendar-day-num">{day}</span>
                  {dayOrder && <span className="calendar-day-order">D{dayOrder}</span>}
                  <span className="calendar-dots">
                    {hasHoliday && <span className="dot holiday" />}
                    {hasExam && <span className="dot exam" />}
                    {hasEvent && <span className="dot event" />}
                    {hasWorking && !hasHoliday && <span className="dot working" />}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="section-header">
            <span className="section-title">{effectiveSelectedDate ? toPrettyDate(effectiveSelectedDate) : 'Events'}</span>
          </div>
          {selectedEvents.length === 0 ? (
            <div className="empty-state" style={{ margin: '0 16px' }}>
              No planned events for this day
            </div>
          ) : (
            <div className="calendar-events-list">
              {selectedEvents.map(ev => (
                <div key={ev.id} className={`calendar-event-row ${ev.type}`}>
                  <div className="calendar-event-main">
                    <span className={`calendar-event-chip ${ev.type}`}>{ev.type}</span>
                    <span>{ev.title}</span>
                    {ev.dayOrder && <span className="calendar-event-day">Day {ev.dayOrder}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <div className="page-spacer" />
    </>
  )
}

function LoginSpotlight({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`login-spotlight-wrap${compact ? ' compact' : ''}`} aria-hidden>
      <span className="login-spotlight login-spotlight-primary" />
      <span className="login-spotlight login-spotlight-secondary" />
    </div>
  )
}

function LoginScreen({ onSuccess }: { onSuccess: (email: string) => void }) {
  const [step, setStep] = useState<LoginStep>("email")
  const [emailInput, setEmailInput] = useState("")
  const normalizedEmail = normalizeLoginEmail(emailInput)
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [trusted, setTrusted] = useState(true)
  const [loading, setLoading] = useState(false)
  const [authStepIdx, setAuthStepIdx] = useState(0)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [step])

  useEffect(() => {
    if (!loading) return
    const id = setInterval(() => {
      setAuthStepIdx(prev => (prev < AUTH_PROGRESS_STEPS.length - 1 ? prev + 1 : prev))
    }, 1700)
    return () => clearInterval(id)
  }, [loading])

  function handleEmailNext(e: React.FormEvent) {
    e.preventDefault()
    if (!normalizedEmail) return
    setEmailInput(normalizedEmail)
    setError("")
    setStep("password")
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return
    setError("")
    setAuthStepIdx(0)
    setLoading(true)
    try {
      const loginEmail = normalizeLoginEmail(emailInput)
      const result = await loginUser(loginEmail, password, { trusted })
      if (result.success) {
        persistSessionSnapshot({ email: loginEmail, trusted, loginAt: Date.now() })
        onSuccess(loginEmail)
      } else {
        setError(result.error || "Login failed. Check credentials.")
      }
    } catch {
      setError("Network error — make sure the server is running.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`login-screen ${step === "password" ? "password-step" : ""}`}>
      <LoginSpotlight compact={step === "password"} />
      <div className="login-hero">
        <div className="login-logo" aria-hidden>
          <AcademiaLogo />
        </div>
        <div className="login-title-big">Arch</div>
        <div className="login-subtitle">SRM Student Portal</div>
        <HeroBadge
          className="login-alpha-hero-badge"
          text="Alpha version"
          variant="outline"
          size="sm"
          highlighted
          icon={<span className="hero-badge-alpha" aria-hidden>α</span>}
        />
        <div className="login-mobile-note">Currently optimized for mobile view.</div>
        <div className="login-community-note">
          Made for the SRM community,{" "}
          <a className="login-feedback-link" href={FEEDBACK_MAILTO}>
            feedback is highly appreciated.
          </a>
        </div>
        <div className="login-free-note login-free-note-highlight">
          <span className="login-free-note-text">
            Arch will always be free and you will never ever be forced to pay.
          </span>
        </div>
      </div>
      {step === "email" && <LoginLiveFeedStack />}

      <div className="login-form-area">
        {step === "email" ? (
          <form onSubmit={handleEmailNext} style={{ display: "flex", flexDirection: "column" }}>
            <div className="login-step-title">NetID</div>
            {error && <div className="error-banner">{error}</div>}
            <div className="field-wrap">
              <div className="field-input-row">
                <input
                  ref={inputRef}
                  className="field-input"
                  type="text"
                  placeholder="NetID"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  autoComplete="username"
                  name="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  inputMode="text"
                  required
                />
              </div>
              <div className="login-domain-hint">
                {emailInput.includes('@')
                  ? <>Signing in as <strong>{normalizedEmail || `user@${SRM_EMAIL_DOMAIN}`}</strong></>
                  : <>We’ll use <strong>{normalizedEmail || `user@${SRM_EMAIL_DOMAIN}`}</strong></>}
              </div>
            </div>
            <button className="btn-primary" type="submit">Continue</button>
          </form>
        ) : (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column" }}>
            <div className="login-step-title">Password</div>
            {error && <div className="error-banner">{error}</div>}
            <div className="login-email-chip">
              <span className="login-email-addr">{normalizedEmail}</span>
              <button
                type="button"
                className="login-change-btn"
                onClick={() => {
                  setStep("email")
                  setPassword("")
                  setError("")
                  setEmailInput(emailLocalPart(normalizedEmail))
                }}
              >
                Change
              </button>
            </div>
            <div className="field-wrap">
              <input type="text" autoComplete="username" name="username" value={normalizedEmail} readOnly style={{ display: "none" }} />
              <div className="field-input-row">
                <input
                  ref={inputRef}
                  id="pw"
                  className="field-input"
                  type={showPw ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  name="password"
                  required
                />
                <button type="button" className="field-eye-btn" onClick={() => setShowPw(v => !v)} aria-label={showPw ? "Hide" : "Show"}>
                  {showPw ? <Icons.EyeOff /> : <Icons.Eye />}
                </button>
              </div>
            </div>
            <label className="field-checkbox-row">
              <input type="checkbox" checked={trusted} onChange={e => setTrusted(e.target.checked)} />
              <div>
                <div className="field-checkbox-label">Stay signed in</div>
                <div className="field-checkbox-sub">Keep me logged in for 180 days</div>
              </div>
            </label>
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span className="spinner" />Signing in…
                </span>
              ) : "Sign in"}
            </button>
            {loading && (
              <div className="login-status-note">
                <div className="login-status-head">Authenticating securely…</div>
                <div className="login-status-current">
                  Step {authStepIdx + 1} of {AUTH_PROGRESS_STEPS.length}: <strong>{AUTH_PROGRESS_STEPS[authStepIdx]}</strong>
                </div>
                <div className="login-auth-steps" role="status" aria-live="polite">
                  {AUTH_PROGRESS_STEPS.map((label, idx) => (
                    <span
                      key={label}
                      className={`login-auth-step${idx < authStepIdx ? ' done' : ''}${idx === authStepIdx ? ' active' : ''}`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Home ──────────────────────────────────────────────────────────────────────
function HomeScreen({ student, fallbackName, attendance, timetableByDay, refreshing, onRefresh, dayOrder, onDayOrderChange, lastUpdated, dataLoading }: {
  student: StudentInfo
  fallbackName: string
  attendance: AttendanceCourse[]
  timetableByDay: TimetableByDay
  refreshing: boolean
  onRefresh: () => void
  dayOrder: number | null
  onDayOrderChange: (d: number | null) => void
  lastUpdated: Date | null
  dataLoading: boolean
}) {
  const overall = overallPct(attendance)
  const animatedOverall = useCountUp(overall)
  const below = attendance.filter(c => c.percent <= 75)
  const todayClasses = groupClasses(getTodayClasses(dayOrder, attendance, timetableByDay))
  const todayClassesPreview = todayClasses.slice(0, 4)
  const now = useClock()
  const nowTs = useNowTimestamp()
  const [showDayPicker, setShowDayPicker] = useState(false)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  // Find current or next class
  const classStatus = (() => {
    for (const cls of todayClasses) {
      const s = parseSlotStart(cls.timeSlot)
      const e = parseSlotEnd(cls.timeSlot)
      if (now >= s && now < e) return { type: 'now' as const, cls, endsIn: e - now }
      if (now < s) return { type: 'next' as const, cls, startsIn: s - now }
    }
    return null
  })()

  const hour = Math.floor(now / 60)
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const updatedLabel = useMemo(() => {
    if (!lastUpdated) return null
    const diff = Math.floor((nowTs - lastUpdated.getTime()) / 60000)
    if (diff < 1) return 'just now'
    if (diff < 60) return `${diff}m ago`
    return `${Math.floor(diff / 60)}h ago`
  }, [lastUpdated, nowTs])
  const displayName = toTitle(firstName(student.name || fallbackName || "Student"))
  const semesterSectionLabel = (() => {
    const parts: string[] = []
    if (student.semester > 0) parts.push(`Sem ${student.semester}`)
    const section = student.section.trim()
    if (section) parts.push(section.toUpperCase())
    return parts.length > 0 ? parts.join(' · ') : 'Syncing profile…'
  })()

  return (
    <>
      {/* Welcome */}
      <div className="welcome-block">
        <div className="welcome-row">
          <div>
            <div className="welcome-greeting">{greeting},</div>
            <div className="welcome-name">{displayName}</div>
          </div>
          <span className="day-badge" onClick={() => setShowDayPicker(true)}>
            {dayOrder ? `Day ${dayOrder}` : 'No Day Order'}
          </span>
        </div>
        <div className="welcome-meta">
          <span className="meta-pill">{student.regNo || "Loading ID…"}</span>
          <span className="meta-pill">{semesterSectionLabel}</span>
          <span className="meta-pill">{fmtDate()}</span>
        </div>
      </div>

      {/* Next / Current class card */}
      {classStatus && (
        <div style={{ padding: "0 16px 14px" }}>
          <div className={`next-class-card${classStatus.type === 'now' ? ' live' : ''}`}>
            <div className="next-class-label">
              {classStatus.type === 'now' ? (
                <><span className="live-dot" /> NOW · Ends in {classStatus.endsIn}m</>
              ) : classStatus.startsIn >= 60 ? (
                <>NEXT · In {Math.floor(classStatus.startsIn / 60)}h {classStatus.startsIn % 60}m</>
              ) : (
                <>NEXT · In {classStatus.startsIn} min</>
              )}
            </div>
            <div className="next-class-title">{classStatus.cls.course.title}</div>
            <div className="next-class-meta">{classStatus.cls.course.faculty} · {classStatus.cls.course.room}</div>
            <div className="next-class-footer">
              <span className="next-class-time">
                {fmtTimeSlot(classStatus.cls.timeSlot).start} – {fmtTimeSlot(classStatus.cls.timeSlot).end}
              </span>
              <span className="next-class-slot-badge">Slot {classStatus.cls.slot}</span>
            </div>
          </div>
        </div>
      )}

      {/* Attendance ring */}
      <div style={{ padding: "0 16px" }}>
        {dataLoading ? (
          <div className="att-ring-row">
            <div className="skeleton-circle" />
            <div className="att-ring-stats-row">
              <div className="att-ring-stat">
                <div className="skeleton-line" style={{ width: 64, height: 11, marginBottom: 6 }} />
                <div className="skeleton-line" style={{ width: 56, height: 26, marginBottom: 4 }} />
                <div className="skeleton-line" style={{ width: 72, height: 11 }} />
              </div>
              <div className="att-ring-divider" />
              <div className="att-ring-stat">
                <div className="skeleton-line" style={{ width: 48, height: 11, marginBottom: 6 }} />
                <div className="skeleton-line" style={{ width: 32, height: 26, marginBottom: 4 }} />
                <div className="skeleton-line" style={{ width: 80, height: 11 }} />
              </div>
            </div>
          </div>
        ) : (
          <div className="att-ring-row">
            <AttendanceDonut pct={overall} animated={animatedOverall} />
            <div className="att-ring-stats-row">
              <div className="att-ring-stat">
                <div className="stat-label">Attendance</div>
                <div className={`att-ring-val ${attnClass(overall)}`}>{animatedOverall.toFixed(1)}%</div>
                <div className="stat-sub">{attendance.length} courses</div>
              </div>
              <div className="att-ring-divider" />
              <div className="att-ring-stat">
                <div className="stat-label">At Risk</div>
                <div className="att-ring-val">{below.length}</div>
                <div className="stat-sub">{below.length > 0 ? "need attention" : "all clear"}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* At-risk attendance pills — compact */}
      {below.length > 0 && (
        <div className="below-pills-row">
          {below.map(c => (
            <span key={c.code + c.type} className="below-pill">
              {c.title} ({c.code}) · {c.percent.toFixed(0)}%
            </span>
          ))}
        </div>
      )}

      {/* Today schedule */}
      <div className="sched-header">
        <span className="sched-header-title">Today · {dayOrder ? `Day ${dayOrder}` : 'No Day Order'}</span>
        <div className="sched-header-right">
          {updatedLabel && <span className="last-updated-label">{updatedLabel}</span>}
          <button className="refresh-btn" onClick={onRefresh} disabled={refreshing}>
            <span className={refreshing ? "spin" : ""}><Icons.Refresh /></span>
            {refreshing ? "Updating…" : "Refresh"}
          </button>
        </div>
      </div>

      {todayClasses.length === 0 && !dataLoading ? (
        <div className="empty-state" style={{ margin: "0 16px" }}>
          <div className="empty-icon"><Icons.Calendar /></div>
          No classes today
        </div>
      ) : dataLoading ? (
        <div className="sched-skeleton-list">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="sched-skeleton-item">
              <div className="sched-skeleton-time">
                <div className="skeleton-line" style={{ width: 34, height: 12, marginBottom: 4 }} />
                <div className="skeleton-line" style={{ width: 26, height: 9 }} />
              </div>
              <div className="sched-skeleton-main">
                <div className="skeleton-line" style={{ width: `${72 - idx * 8}%`, height: 14, marginBottom: 6 }} />
                <div className="skeleton-line" style={{ width: `${52 - idx * 6}%`, height: 10 }} />
              </div>
              <div className="sched-skeleton-slot">
                <div className="skeleton-line" style={{ width: 18, height: 12 }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="sched-list">
          {todayClassesPreview.map(cls => {
            const itemKey = `${cls.course.code}|${cls.course.type}`
            const s = parseSlotStart(cls.timeSlot)
            const e = parseSlotEnd(cls.timeSlot)
            const isLive = now >= s && now < e
            const isDone = now >= e
            const { start, end } = fmtTimeSlot(cls.timeSlot)
            const isExpanded = expandedKey === itemKey
            return (
              <div key={itemKey} className={`sched-item-wrap${isLive ? " live" : ""}${isDone ? " done" : ""}`}>
                <div
                  className="sched-item"
                  onClick={() => cls.count > 1 && setExpandedKey(isExpanded ? null : itemKey)}
                >
                  <div className="sched-time-col">
                    <span className="sched-start">{start}</span>
                    <span className="sched-end">{end}</span>
                  </div>
                  <div className="sched-body">
                    <div className="sched-subject">{cls.course.title}</div>
                    <div className="sched-meta">{cls.course.faculty} · {cls.course.room}</div>
                    {isLive && (
                      <div className="sched-live-chip">
                        <span className="live-dot" />
                        Now
                      </div>
                    )}
                  </div>
                  <div className="sched-slot-col">
                    {cls.count > 1 && <span className="count-badge">{cls.count}×</span>}
                    <span className="slot-label">{cls.slot}</span>
                  </div>
                </div>
                {cls.count > 1 && isExpanded && (
                  <div className="slot-expand-row">
                    {cls.individualSlots.map((s, i) => {
                      const t = fmtTimeSlot(s.timeSlot)
                      return (
                        <span key={i} className="slot-expand-time">
                          {t.start}–{t.end}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {todayClasses.length > todayClassesPreview.length && (
        <div style={{ padding: '6px 16px 0', fontSize: 11, color: 'var(--ink-4)' }}>
          Showing first {todayClassesPreview.length}. See full day in Timetable tab.
        </div>
      )}
      <div className="page-spacer" />
      {showDayPicker && (
        <div className="sheet-backdrop" onClick={() => setShowDayPicker(false)}>
          <div className="sheet-panel" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">Today's Day Order</div>
            <div className="sheet-body">Select the current academic day order or mark no day order</div>
            <div className="day-picker-grid">
              <button
                className={`day-picker-btn${dayOrder === null ? " active" : ""}`}
                onClick={() => { onDayOrderChange(null); setShowDayPicker(false) }}
              >
                No Day Order
              </button>
              {[1,2,3,4,5].map(d => (
                <button
                  key={d}
                  className={`day-picker-btn${dayOrder === d ? " active" : ""}`}
                  onClick={() => { onDayOrderChange(d); setShowDayPicker(false) }}
                >
                  Day {d}
                </button>
              ))}
            </div>
            <div className="sheet-actions">
              <button className="btn-sheet-cancel" onClick={() => setShowDayPicker(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Attendance ────────────────────────────────────────────────────────────────
function AttendanceScreen({ attendance, marks }: { attendance: AttendanceCourse[]; marks: InternalMark[] }) {
  const marksMap = useMemo(() => {
    const m: Record<string, InternalMark[]> = {}
    marks.forEach(mk => { if (!m[mk.courseCode]) m[mk.courseCode] = []; m[mk.courseCode]!.push(mk) })
    Object.values(m).forEach((items) => items.sort(compareInternalMarks))
    return m
  }, [marks])
  const [activeInsight, setActiveInsight] = useState<"planner" | "marks" | null>(null)
  const plannerCourses = useMemo(
    () => attendance.map(c => ({ key: `${c.code}|${c.type}`, course: c })),
    [attendance]
  )
  const [plannerCourseKey, setPlannerCourseKey] = useState('')
  const [plannedLeaves, setPlannedLeaves] = useState(0)
  const [recoveryClasses, setRecoveryClasses] = useState(3)
  const effectivePlannerCourseKey = useMemo(() => {
    if (plannerCourses.length === 0) return ''
    return plannerCourses.some(c => c.key === plannerCourseKey)
      ? plannerCourseKey
      : plannerCourses[0]!.key
  }, [plannerCourses, plannerCourseKey])

  const plannerCourse = plannerCourses.find(c => c.key === effectivePlannerCourseKey)?.course ?? null
  const plannerModel = useMemo(() => {
    if (!plannerCourse) return null
    const present = Math.max(0, plannerCourse.conducted - plannerCourse.absent)
    const projectedConducted = plannerCourse.conducted + plannedLeaves
    const projectedAbsent = plannerCourse.absent + plannedLeaves
    const projectedPct = projectedConducted > 0 ? ((projectedConducted - projectedAbsent) / projectedConducted) * 100 : 0
    const recoveryConducted = projectedConducted + recoveryClasses
    const recoveryPresent = present + recoveryClasses
    const recoveryPct = recoveryConducted > 0 ? (recoveryPresent / recoveryConducted) * 100 : projectedPct
    return {
      projectedPct,
      recoveryPct,
      mustAttendAfterLeaves: classesNeededToReach(projectedConducted, projectedAbsent),
      safeAfterLeaves: classesSafeToMiss(projectedConducted, projectedAbsent),
    }
  }, [plannerCourse, plannedLeaves, recoveryClasses])
  const marksTrend = useMemo(() => {
    const titleByCode: Record<string, string> = {}
    attendance.forEach(c => {
      if (!titleByCode[c.code]) titleByCode[c.code] = c.title
    })
    return Object.entries(marksMap)
      .map(([courseCode, entries]) => {
        const tests = entries
          .map(m => ({
            rawTest: m.test,
            test: formatAssessmentLabel(m.test),
            scored: m.scored,
            max: m.max,
            pct: m.max > 0 ? (m.scored / m.max) * 100 : 0,
          }))
          .filter(entry => Number.isFinite(entry.pct))
          .sort((a, b) => compareAssessmentNames(a.rawTest, b.rawTest))
        if (tests.length === 0) return null
        const points = tests.map(test => test.pct)
        const avg = points.reduce((sum, p) => sum + p, 0) / points.length
        const first = points[0] ?? 0
        const latest = points[points.length - 1] ?? first
        const best = Math.max(...points)
        return {
          courseCode,
          title: titleByCode[courseCode] ?? courseCode,
          tests,
          first,
          best,
          avg,
          latest,
          delta: latest - first,
        }
      })
      .filter((row): row is {
        courseCode: string
        title: string
        tests: Array<{ rawTest: string; test: string; pct: number; scored: number; max: number }>
        first: number
        best: number
        avg: number
        latest: number
        delta: number
      } => row !== null)
      .sort((a, b) => b.latest - a.latest)
  }, [marksMap, attendance])

  const overall = overallPct(attendance)
  const animatedOverall = useCountUp(overall)
  const atRiskNow = attendance.filter(c => c.percent <= 75).length
  const projectedClass = plannerModel ? attnClass(plannerModel.projectedPct) : 'ok'
  const overallTrendAvg = marksTrend.length > 0
    ? marksTrend.reduce((sum, row) => sum + row.avg, 0) / marksTrend.length
    : 0

  return (
    <>
      <div className="attendance-overview-card">
        <div className="attendance-overview-top">
          <div className="attendance-overview-main">
            <div className="attendance-overview-kicker">Overall attendance</div>
            <div className={`attendance-overview-pct ${attnClass(overall)}`}>
              {animatedOverall.toFixed(1)}%
            </div>
          </div>
          <div className="attendance-overview-side">
            <div className="attendance-overview-actions" role="group" aria-label="Attendance insight tools">
              <button
                className={`attendance-action-pill${activeInsight === "planner" ? " active" : ""}`}
                onClick={() => setActiveInsight("planner")}
                aria-label="Open attendance risk and leave planner"
                title="Attendance risk + leave planner"
              >
                <span className="attendance-action-icon"><Icons.Shield /></span>
                Risk
              </button>
              <button
                className={`attendance-action-pill${activeInsight === "marks" ? " active" : ""}`}
                onClick={() => setActiveInsight("marks")}
                aria-label="Open internal marks trend"
                title={marksTrend.length > 0 ? `Internal marks trend · Average ${overallTrendAvg.toFixed(1)}%` : "Internal marks trend"}
              >
                <span className="attendance-action-icon"><Icons.Trend /></span>
                Trend
              </button>
            </div>
            <div className="attendance-overview-meta">
              <div className="attendance-overview-meta-item">
                <span>Courses</span>
                <strong>{attendance.length}</strong>
              </div>
              <div className="attendance-overview-meta-item">
                <span>At risk</span>
                <strong>{atRiskNow}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Theory */}
      <div className="section-header">
        <span className="section-title">Theory</span>
      </div>
      <div className="course-list">
        {attendance.filter(c => c.type === "Theory").map(c => (
          <CourseRow key={c.code + c.title} course={c} marks={marksMap[c.code] ?? []} />
        ))}
      </div>

      <div className="section-header">
        <span className="section-title">Practicals</span>
      </div>
      <div className="course-list">
        {attendance.filter(c => c.type === "Practical").map(c => (
          <CourseRow key={c.code + c.type} course={c} marks={marksMap[c.code] ?? []} />
        ))}
      </div>
      <div className="page-spacer" />

      {activeInsight === "planner" && (
        <div className="sheet-backdrop insight-sheet-backdrop" onClick={() => setActiveInsight(null)}>
          <div className="sheet-panel insight-sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">Attendance risk prediction + leave planner</div>
            <div className="sheet-body">Plan classes to miss and instantly check recovery required for the 75% rule.</div>
            <div className="attendance-planner-card">
              <div className="attendance-planner-grid">
                <label className="attendance-planner-field course">
                  <span>Course</span>
                  <select
                    value={effectivePlannerCourseKey}
                    onChange={(e) => setPlannerCourseKey(e.target.value)}
                    disabled={plannerCourses.length === 0}
                  >
                    {plannerCourses.map(({ key, course }) => (
                      <option key={key} value={key}>
                        {course.code} · {course.type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="attendance-planner-field small">
                  <span>Planned leaves</span>
                  <input
                    type="number"
                    min={0}
                    max={40}
                    value={plannedLeaves}
                    onChange={(e) => setPlannedLeaves(Math.max(0, Math.min(40, Number.parseInt(e.target.value || '0', 10) || 0)))}
                  />
                </label>
                <label className="attendance-planner-field small">
                  <span>Recovery classes</span>
                  <input
                    type="number"
                    min={0}
                    max={40}
                    value={recoveryClasses}
                    onChange={(e) => setRecoveryClasses(Math.max(0, Math.min(40, Number.parseInt(e.target.value || '0', 10) || 0)))}
                  />
                </label>
              </div>
              {plannerModel && plannerCourse ? (
                <>
                  <div className="attendance-planner-stats">
                    <div className="attendance-planner-stat">
                      <span className="k">At risk now</span>
                      <span className="v">{atRiskNow}</span>
                    </div>
                    <div className="attendance-planner-stat">
                      <span className="k">Projected</span>
                      <span className={`v ${projectedClass}`}>{plannerModel.projectedPct.toFixed(1)}%</span>
                    </div>
                    <div className="attendance-planner-stat">
                      <span className="k">After recovery</span>
                      <span className={`v ${attnClass(plannerModel.recoveryPct)}`}>{plannerModel.recoveryPct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className={`attendance-planner-note ${projectedClass}`}>
                    {plannerModel.projectedPct > 75
                      ? `You can take ${plannedLeaves} leave class${plannedLeaves === 1 ? '' : 'es'} in ${plannerCourse.code} and stay above 75%.`
                      : plannerModel.projectedPct === 75
                        ? `${plannerCourse.code} lands exactly at 75%. Further leaves will push this below threshold.`
                        : `${plannerCourse.code} drops below 75%. Attend at least ${plannerModel.mustAttendAfterLeaves} consecutive class${plannerModel.mustAttendAfterLeaves === 1 ? '' : 'es'} to recover.`}
                  </div>
                  <div className="attendance-planner-foot">
                    <span>Safe to miss after plan: <strong>{plannerModel.safeAfterLeaves}</strong></span>
                    <span>Need to attend after plan: <strong>{plannerModel.mustAttendAfterLeaves}</strong></span>
                  </div>
                </>
              ) : (
                <div className="empty-state" style={{ margin: 0 }}>
                  <div className="empty-icon"><Icons.BarChart /></div>
                  Planner is available after attendance courses load
                </div>
              )}
            </div>
            <div className="sheet-actions">
              <button className="btn-sheet-cancel" onClick={() => setActiveInsight(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {activeInsight === "marks" && (
        <div className="sheet-backdrop insight-sheet-backdrop" onClick={() => setActiveInsight(null)}>
          <div className="sheet-panel insight-sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">Internal marks trend</div>
            <div className="sheet-body">Read each course with first score, latest score, average and assessment-wise progression. The pass line is fixed at 50%, and the safe zone starts from that line.</div>
            {marksTrend.length === 0 ? (
              <div className="empty-state" style={{ margin: 0 }}>
                <div className="empty-icon"><Icons.Calendar /></div>
                Trend appears after internal marks are published
              </div>
            ) : (
              <div className="marks-insight-list">
                {marksTrend.map((row) => {
                  const trendClass = row.delta > 1 ? 'up' : row.delta < -1 ? 'down' : 'flat'
                  const trendLabel = trendClass === 'up' ? 'Improving' : trendClass === 'down' ? 'Needs attention' : 'Stable'
                  return (
                    <div key={row.courseCode} className="marks-insight-card">
                      <div className="marks-insight-head">
                        <div className="marks-insight-head-main">
                          <div className="marks-insight-code">{row.courseCode}</div>
                          <div className="marks-insight-title">{row.title}</div>
                        </div>
                        <span className={`marks-insight-trend ${trendClass}`}>
                          {trendLabel} {row.delta >= 0 ? '+' : ''}{row.delta.toFixed(1)}%
                        </span>
                      </div>
                      <div className="marks-insight-metrics">
                        <div className="marks-insight-metric">
                          <div className="marks-insight-metric-top">
                            <span>Latest</span>
                            <strong>{row.latest.toFixed(1)}%</strong>
                          </div>
                        </div>
                        <div className="marks-insight-metric">
                          <div className="marks-insight-metric-top">
                            <span>Average</span>
                            <strong>{row.avg.toFixed(1)}%</strong>
                          </div>
                        </div>
                        <div className="marks-insight-metric">
                          <div className="marks-insight-metric-top">
                            <span>Best</span>
                            <strong>{row.best.toFixed(1)}%</strong>
                          </div>
                        </div>
                      </div>
                      <Suspense fallback={<div className="marks-line-chart-shell marks-line-chart-skeleton" />}>
                        <MarksLineChart tests={row.tests} />
                      </Suspense>
                      <div className="marks-insight-meta">
                        Started at <strong>{row.first.toFixed(1)}%</strong> · Best <strong>{row.best.toFixed(1)}%</strong>
                      </div>
                      <div className="marks-insight-tests">
                        {row.tests.map((test, idx) => (
                          <span key={`${row.courseCode}-${idx}`} className={`marks-insight-test ${markClass(test.pct)}`}>
                            {test.test}: {test.scored.toFixed(1)}/{test.max.toFixed(1)} ({test.pct.toFixed(1)}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="sheet-actions">
              <button className="btn-sheet-cancel" onClick={() => setActiveInsight(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function CourseRow({ course, marks }: { course: AttendanceCourse; marks: InternalMark[] }) {
  const cls = attnClass(course.percent)
  const need = classesNeededToReach(course.conducted, course.absent)
  const safe = classesSafeToMiss(course.conducted, course.absent)
  const presentHours = Math.max(0, course.conducted - course.absent)
  const guidanceMode: 'attend' | 'miss' | 'limit' = need > 0 ? 'attend' : safe > 0 ? 'miss' : 'limit'
  const guidanceLabel = guidanceMode === 'attend'
    ? 'Must attend'
    : guidanceMode === 'miss'
      ? 'Can miss'
      : 'At limit'
  const guidanceValue = guidanceMode === 'attend'
    ? `${need} class${need === 1 ? '' : 'es'}`
    : guidanceMode === 'miss'
      ? `${safe} class${safe === 1 ? '' : 'es'}`
      : '0 classes'

  return (
    <div className={`course-item ${cls}`}>
      <div className="course-item-top">
        <div className="course-item-info">
          <div className="course-item-code">
            {course.code} · Slot {course.slot}{course.credit > 0 ? ` · ${Number.isInteger(course.credit) ? course.credit.toFixed(0) : course.credit} credit${course.credit === 1 ? '' : 's'}` : ''}
          </div>
          <div className="course-item-title">{course.title}</div>
          <div className="course-item-faculty">{course.faculty}</div>
        </div>
        <div className={`course-item-pct ${cls}`}>{course.percent.toFixed(1)}%</div>
      </div>
      <div className="attn-track">
        <div className="attn-fill" style={{ width: `${Math.min(100, course.percent)}%` }} />
      </div>
      <div className="attn-hours-row">
        <span className="attn-hour-chip total">Total {course.conducted}h</span>
        <span className="attn-hour-chip present">Present {presentHours}h</span>
        <span className="attn-hour-chip absent">Absent {course.absent}h</span>
      </div>
      <div className={`attn-guidance-card single ${cls === 'ok' ? 'ok' : 'danger'}`}>
        <span className="attn-guidance-label">{guidanceLabel}</span>
        <span className="attn-guidance-value">{guidanceValue}</span>
      </div>
      {marks.length > 0 && (
        <div className="marks-list">
          {marks.map((m, idx) => {
            const pct = m.max > 0 ? (m.scored / m.max) * 100 : 0
            const mCls = markClass(pct)
            return (
              <div key={`${m.test}-${m.max}-${idx}`} className="mark-row">
                <span className="mark-test-label">{formatAssessmentLabel(m.test)}: {m.scored.toFixed(1)}/{m.max.toFixed(1)}</span>
                <span className={`mark-pct-chip ${mCls}`}>{pct.toFixed(0)}%</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Schedule ──────────────────────────────────────────────────────────────────
function ScheduleScreen({ initialDay, attendance, timetableByDay }: {
  initialDay: number | null
  attendance: AttendanceCourse[]
  timetableByDay: TimetableByDay
}) {
  const [manualSelectedDay, setManualSelectedDay] = useState<number | null>(null)
  const selectedDay = manualSelectedDay ?? initialDay ?? 1
  const classes = groupClasses(getTodayClasses(selectedDay, attendance, timetableByDay))
  const now = useClock()
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  return (
    <>
      <div className="section-header" style={{ paddingBottom: 12 }}>
        <span className="section-title">Timetable · AY 2025-26</span>
      </div>
      <div className="day-tab-bar">
        {[1, 2, 3, 4, 5].map(d => (
          <button
            key={d}
            className={`day-tab${selectedDay === d ? " active" : ""}${initialDay !== null && d === initialDay ? " today" : ""}`}
            onClick={() => { setManualSelectedDay(d); setExpandedKey(null) }}
          >
            Day {d}
          </button>
        ))}
      </div>

      {classes.length === 0 ? (
        <div className="empty-state" style={{ margin: "0 16px" }}>
          <div className="empty-icon"><Icons.Calendar /></div>
          No classes on Day {selectedDay}
        </div>
      ) : (
        <div className="tt-list">
          {classes.map(cls => {
            const itemKey = `${cls.course.code}|${cls.course.type}`
            const s = parseSlotStart(cls.timeSlot)
            const e = parseSlotEnd(cls.timeSlot)
            const isLive = initialDay !== null && selectedDay === initialDay && now >= s && now < e
            const isDone = initialDay !== null && selectedDay === initialDay && now >= e
            const { start, end } = fmtTimeSlot(cls.timeSlot)
            const durationMins = Math.max(0, e - s)
            const durationLabel = durationMins >= 60
              ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
              : `${durationMins}m`
            const isExpanded = expandedKey === itemKey
            return (
              <div key={itemKey} className={`tt-item-wrap${isLive ? " live" : ""}${isDone ? " done" : ""}`}>
                <div
                  className="tt-item"
                  onClick={() => cls.count > 1 && setExpandedKey(isExpanded ? null : itemKey)}
                  style={cls.count > 1 ? { cursor: 'pointer' } : undefined}
                >
                  <div className="tt-time-col">
                    <span className="tt-time-label">Time</span>
                    <span className="tt-time-range">{start} — {end}</span>
                    <span className="tt-duration">{durationLabel}</span>
                    {cls.count > 1 && <span className="tt-count-badge">{cls.count} slots</span>}
                  </div>
                  <div className="tt-body">
                    <div className="tt-course">{cls.course.title}</div>
                    <div className="tt-meta-row">
                      <span className="tt-slot-chip">Slot {cls.slot}</span>
                      <span className="tt-room-chip">{cls.course.room}</span>
                    </div>
                    <div className="tt-meta">{cls.course.faculty}</div>
                    {isLive && (
                      <div className="tt-now">
                        <span className="live-dot" />
                        Now
                      </div>
                    )}
                  </div>
                </div>
                {cls.count > 1 && isExpanded && (
                  <div className="slot-expand-row">
                    {cls.individualSlots.map((sl, i) => {
                      const t = fmtTimeSlot(sl.timeSlot)
                      return (
                        <span key={i} className="slot-expand-time">
                          {t.start}–{t.end}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="page-spacer" />
    </>
  )
}

// ─── Profile ───────────────────────────────────────────────────────────────────
function ProfileAvatar({ name }: { name: string }) {
  return <div className="profile-avatar">{firstName(name)[0] || '?'}</div>
}

function ProfileScreen({
  student,
  theme,
  onTheme,
  onLogout,
  attendanceAlertPermission,
  onEnableAttendanceAlerts,
  onOpenCooking,
  showAdminMetrics,
  adminMetrics,
  adminMetricsLoading,
  adminMetricsError,
}: {
  student: StudentInfo
  theme: Theme
  onTheme: (t: Theme) => void
  onLogout: () => void
  attendanceAlertPermission: NotificationPermission | 'unsupported'
  onEnableAttendanceAlerts: () => void
  onOpenCooking: () => void
  showAdminMetrics: boolean
  adminMetrics: AdminSelfMetrics | null
  adminMetricsLoading: boolean
  adminMetricsError: string
}) {
  return (
    <>
      <div className="profile-hero">
        <ProfileAvatar name={student.name} />
        <div>
          <div className="profile-name">{toTitle(student.name)}</div>
          <div className="profile-reg">{student.regNo}</div>
        </div>
      </div>

      <div className="section-header">
        <span className="section-title">Academic Details</span>
      </div>
      <div className="card-group">
        {([
          ["Program", student.program],
          ["Department", student.department],
          ["Section", student.section],
          ["Semester", `${student.semester}`],
          ["Batch", `${student.batch}`],
          ["Academic Year", student.academicYear],
          ["Enrollment", student.enrollmentDate],
          ["Mobile", student.mobile],
        ] as [string, string][]).map(([k, v]) => (
          <div key={k} className="card-row">
            <span className="card-row-key">{k}</span>
            <span className="card-row-val">{v}</span>
          </div>
        ))}
      </div>

      <div className="section-header">
        <span className="section-title">Faculty Advisor</span>
      </div>
      <div className="advisor-card">
        <div className="advisor-header">
          <div className="advisor-name-text">{student.advisorName}</div>
          <div className="advisor-role-text">Faculty Advisor</div>
        </div>
        <a href={`mailto:${student.advisorEmail}`} className="advisor-link-row">
          <Icons.Mail />
          <span className="advisor-link-text">{student.advisorEmail}</span>
          <Icons.ChevronRight />
        </a>
        <a href={`tel:${student.advisorPhone}`} className="advisor-link-row">
          <Icons.Phone />
          <span className="advisor-link-text">{student.advisorPhone}</span>
          <Icons.ChevronRight />
        </a>
      </div>

      <div className="section-header">
        <span className="section-title">Academic Advisor</span>
      </div>
      <div className="advisor-card">
        <div className="advisor-header">
          <div className="advisor-name-text">{student.academicAdvisorName}</div>
          <div className="advisor-role-text">Academic Advisor</div>
        </div>
        <a href={`mailto:${student.academicAdvisorEmail}`} className="advisor-link-row">
          <Icons.Mail />
          <span className="advisor-link-text">{student.academicAdvisorEmail}</span>
          <Icons.ChevronRight />
        </a>
        <a href={`tel:${student.academicAdvisorPhone}`} className="advisor-link-row">
          <Icons.Phone />
          <span className="advisor-link-text">{student.academicAdvisorPhone}</span>
          <Icons.ChevronRight />
        </a>
      </div>

      <div className="section-header">
        <span className="section-title">Appearance</span>
      </div>
      <div className="theme-picker">
        <label htmlFor="theme-select" className="theme-picker-label">Choose theme</label>
        <div className="theme-select-wrap">
          <span className={`theme-swatch theme-swatch-${theme}`} />
          <select
            id="theme-select"
            className="theme-select"
            value={theme}
            onChange={(e) => {
              const nextTheme = e.target.value
              if (isTheme(nextTheme)) onTheme(nextTheme)
            }}
          >
            {THEME_OPTIONS.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="section-header">
        <span className="section-title">Attendance Alerts</span>
      </div>
      <div className="btn-row">
        <button
          className={`btn-list-item secondary${attendanceAlertPermission === 'granted' ? ' active' : ''}`}
          onClick={onEnableAttendanceAlerts}
          disabled={attendanceAlertPermission === 'unsupported' || attendanceAlertPermission === 'granted'}
        >
          <Icons.Bell />
          {attendanceAlertPermission === 'granted'
            ? 'Attendance alerts enabled'
            : attendanceAlertPermission === 'denied'
              ? 'Allow notifications in app settings'
              : attendanceAlertPermission === 'unsupported'
                ? 'Notifications not supported on this device'
                : 'Enable attendance alerts'}
        </button>
      </div>
      <div className="profile-alert-note">
        Works in installed PWA mode and alerts when a subject is marked present or absent.
      </div>

      <div className="section-header">
        <span className="section-title">Updates</span>
      </div>
      <div className="btn-row">
        <button className="btn-list-item secondary" onClick={onOpenCooking}>
          <Icons.Trend />
          Cooking
          <span className="btn-row-meta">{CURRENT_APP_VERSION}</span>
        </button>
      </div>
      <div className="profile-alert-note">
        Open to see short version-wise changes.
      </div>

      {showAdminMetrics && (
        <>
          <div className="section-header">
            <span className="section-title">Admin App Metrics</span>
          </div>
          <div className="card-group">
            <div className="card-row">
              <span className="card-row-key">Active users</span>
              <span className="card-row-val">{adminMetricsLoading ? 'Loading…' : `${adminMetrics?.activeUserCount ?? 0}`}</span>
            </div>
            <div className="card-row">
              <span className="card-row-key">Active sessions</span>
              <span className="card-row-val">{adminMetricsLoading ? 'Loading…' : `${adminMetrics?.activeSessionCount ?? 0}`}</span>
            </div>
            <div className="card-row">
              <span className="card-row-key">Push subscriptions</span>
              <span className="card-row-val">{adminMetricsLoading ? 'Loading…' : `${adminMetrics?.pushSubscriptionCount ?? 0}`}</span>
            </div>
            <div className="card-row">
              <span className="card-row-key">Session store</span>
              <span className="card-row-val">{adminMetricsLoading ? 'Loading…' : (adminMetrics?.store ?? 'unknown')}</span>
            </div>
          </div>
          <div className="profile-alert-note">
            {adminMetricsError
              ? `Unable to load admin metrics: ${adminMetricsError}`
              : `Visible only to ${ADMIN_PROFILE_ID}.`}
          </div>
        </>
      )}

      <div className="section-header">
        <span className="section-title">Support</span>
      </div>
      <div className="btn-row">
        <a className="btn-list-item secondary" href={FEEDBACK_MAILTO}>
          <Icons.Mail />
          Send feedback
        </a>
      </div>

      <div className="section-header" />
      <div className="btn-row">
        <button className="btn-list-item danger" onClick={onLogout}>
          <Icons.LogOut />
          Sign out
        </button>
      </div>
      <div className="page-spacer" />
    </>
  )
}

function CookingScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="cooking-screen">
      <ProgressiveBlur
        className="cooking-progressive-blur cooking-progressive-blur-bottom"
        position="bottom"
        backgroundColor="#000000"
        height="92px"
        blurAmount="2px"
      />

      <div className="cooking-scroll">
        <div className="cooking-header">
          <button className="cooking-back-btn" onClick={onBack}>
            <Icons.ChevronLeft />
            Back
          </button>
          <div className="cooking-title">Cooking</div>
          <div className="cooking-current">{CURRENT_APP_VERSION}</div>
        </div>
        <div className="cooking-subtitle">Latest updates in one place.</div>

        <div className="cooking-list">
          {CHANGELOG_ENTRIES.map((entry, idx) => (
            <details key={entry.version} className="cooking-item" open={idx === LATEST_CHANGELOG_INDEX}>
              <summary className="cooking-summary">
                <span className="cooking-version-text">{entry.version}</span>
                <span className="cooking-summary-text">({entry.summary})</span>
              </summary>
              <div className="cooking-body">
                {entry.added.map((line, lineIdx) => (
                  <div key={`${entry.version}-added-${lineIdx}`} className="cooking-row">
                    <span className="cooking-sign cooking-sign-plus" aria-hidden>+</span>
                    <span className="cooking-row-text">{line}</span>
                  </div>
                ))}
                {entry.improved.map((line, lineIdx) => (
                  <div key={`${entry.version}-improved-${lineIdx}`} className="cooking-row">
                    <span className="cooking-sign cooking-sign-plus" aria-hidden>+</span>
                    <span className="cooking-row-text">{line}</span>
                  </div>
                ))}
                {entry.removed?.map((line, lineIdx) => (
                  <div key={`${entry.version}-removed-${lineIdx}`} className="cooking-row">
                    <span className="cooking-sign cooking-sign-minus" aria-hidden>-</span>
                    <span className="cooking-row-text">{line}</span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
        <div className="page-spacer" />
      </div>
    </div>
  )
}

function NotFoundScreen() {
  return (
    <div className="not-found-screen">
      <div className="not-found-panel">
        <div className="not-found-code">404</div>
        <div className="not-found-title">Page not found</div>
        <div className="not-found-copy">The page you are trying to open does not exist.</div>
        <img src="/404-sad.jpg" alt="Sad 404 illustration" className="not-found-image" />
        <a href="/" className="not-found-home-link">Go to Arch home</a>
      </div>
    </div>
  )
}

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [routePath] = useState(() => normalizeAppPath(window.location.pathname))
  const isNotFoundRoute = !APP_VALID_PATHS.has(routePath)
  const bootSnapshot = useMemo(() => loadSessionSnapshot(), [])
  const bootEmail = bootSnapshot?.email ?? ''
  const bootCache = useMemo(() => (bootEmail ? readTabCache(bootEmail) : null), [bootEmail])
  const bootStudentBatch = bootCache?.studentBatch ?? null
  const bootLastUpdated = useMemo(() => {
    if (!bootCache?.lastUpdatedIso) return null
    const date = new Date(bootCache.lastUpdatedIso)
    return Number.isNaN(date.getTime()) ? null : date
  }, [bootCache])
  const [loggedIn, setLoggedIn] = useState(() => !!getSessionToken())
  const [loggedEmail, setLoggedEmail] = useState(() => bootEmail)
  const [screen, setScreen] = useState<Screen>("home")
  const [student, setStudent] = useState<StudentInfo>(() => {
    if (!bootEmail) return EMPTY_STUDENT
    const saved = localStorage.getItem(`academia.student.${bootEmail}`)
    if (saved) {
      try { return JSON.parse(saved) as StudentInfo } catch { return EMPTY_STUDENT }
    }
    return EMPTY_STUDENT
  })
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => bootLastUpdated)
  const [dayOrder, setDayOrder] = useDayOrder()
  const [attendance, setAttendance] = useState<AttendanceCourse[]>(() => bootCache?.attendance ?? [])
  const [courseCredits, setCourseCredits] = useState<Record<string, number>>({})
  const [marks, setMarks] = useState<InternalMark[]>(() => bootCache?.marks ?? [])
  const [refreshing, setRefreshing] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPwa, setShowPwa] = useState(false)
  const [showIosPwa, setShowIosPwa] = useState(false)
  const [theme, setTheme] = useState<Theme>(getSavedTheme)
  const [calendarEvents, setCalendarEvents] = useState<AcademicCalendarEvent[]>(() => bootCache?.calendarEvents ?? [])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState('')
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [needUpdate, setNeedUpdate] = useState(false)
  const [timetableByDay, setTimetableByDay] = useState<TimetableByDay>(() => {
    if (bootCache?.timetableByDay) return bootCache.timetableByDay
    return fallbackTimetableForBatch(bootStudentBatch)
  })
  const [courseSlotOverrides, setCourseSlotOverrides] = useState<CourseSlotOverrides>(() => bootCache?.courseSlotOverrides ?? {})
  const [notificationCount, setNotificationCount] = useState(0)
  const [adminMetrics, setAdminMetrics] = useState<AdminSelfMetrics | null>(null)
  const [adminMetricsLoading, setAdminMetricsLoading] = useState(false)
  const [adminMetricsError, setAdminMetricsError] = useState('')
  const [attendanceAlertPermission, setAttendanceAlertPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (!('Notification' in window)) return 'unsupported'
    return Notification.permission
  })
  const pollRef = useRef<number | null>(null)
  const pollInFlightRef = useRef(false)
  const dayOrderRef = useRef<number | null>(dayOrder)
  const dayOrderSyncedAtRef = useRef(0)
  const attendanceSnapshotRef = useRef<AttendanceSnapshot | null>(null)
  const loggedEmailRef = useRef(loggedEmail)
  const studentRef = useRef(student)
  const creditsRef = useRef(courseCredits)
  const courseSlotOverridesRef = useRef(courseSlotOverrides)
  const pushAutoEnrollAttemptedRef = useRef(false)
  const showAdminMetrics = useMemo(() => isAdminProfileUser(loggedEmail), [loggedEmail])
  useEffect(() => { dayOrderRef.current = dayOrder }, [dayOrder])
  useEffect(() => { loggedEmailRef.current = loggedEmail }, [loggedEmail])
  useEffect(() => { studentRef.current = student }, [student])
  useEffect(() => { creditsRef.current = courseCredits }, [courseCredits])
  useEffect(() => { courseSlotOverridesRef.current = courseSlotOverrides }, [courseSlotOverrides])

  useEffect(() => {
    cleanupStaleLocalEntries(loggedEmail || bootEmail || null)
  }, [loggedEmail, bootEmail])

  useEffect(() => {
    attendanceSnapshotRef.current = null
    if (!loggedIn || !loggedEmail) return
    const key = getAttendanceSnapshotStorageKey(loggedEmail)
    const raw = localStorage.getItem(key)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as AttendanceSnapshot
      if (parsed && typeof parsed === 'object') {
        attendanceSnapshotRef.current = parsed
      } else {
        localStorage.removeItem(key)
      }
    } catch {
      localStorage.removeItem(key)
    }
  }, [loggedIn, loggedEmail])

  useEffect(() => {
    if (!loggedIn || Object.keys(courseSlotOverrides).length === 0) return
    setAttendance((prev) => applyCourseSlotOverrides(prev, courseSlotOverrides))
  }, [loggedIn, courseSlotOverrides])

  useEffect(() => {
    if (!loggedIn || !loggedEmail) return
    writeTabCache(loggedEmail, {
      attendance,
      marks,
      calendarEvents,
      timetableByDay,
      courseSlotOverrides,
      studentBatch: student.batch > 0 ? student.batch : null,
      dayOrder,
      lastUpdatedIso: lastUpdated ? lastUpdated.toISOString() : null,
      savedAt: Date.now(),
      cacheVersion: TAB_CACHE_VERSION,
    })
  }, [loggedIn, loggedEmail, attendance, marks, calendarEvents, timetableByDay, courseSlotOverrides, student.batch, dayOrder, lastUpdated])

  useEffect(() => {
    const root = document.documentElement
    const viewport = window.visualViewport
    if (!viewport) {
      root.style.setProperty('--dynamic-safe-bottom', '0px')
      return
    }

    const syncDynamicBottomInset = () => {
      const inset = Math.max(0, Math.min(140, window.innerHeight - viewport.height - viewport.offsetTop))
      root.style.setProperty('--dynamic-safe-bottom', `${Math.round(inset)}px`)
    }

    syncDynamicBottomInset()
    viewport.addEventListener('resize', syncDynamicBottomInset)
    viewport.addEventListener('scroll', syncDynamicBottomInset)
    window.addEventListener('orientationchange', syncDynamicBottomInset)
    return () => {
      viewport.removeEventListener('resize', syncDynamicBottomInset)
      viewport.removeEventListener('scroll', syncDynamicBottomInset)
      window.removeEventListener('orientationchange', syncDynamicBottomInset)
      root.style.setProperty('--dynamic-safe-bottom', '0px')
    }
  }, [])

  function handleTheme(t: Theme) {
    setTheme(t)
    localStorage.setItem("theme", t)
    applyTheme(t)
  }

  const ensureClosedAppPushEnrollment = useCallback(async () => {
    if (!supportsWebPush()) return
    const pushStatus = await fetchPushDesignStatus()
    if (!pushStatus.enabled || !pushStatus.publicKeyAvailable) return

    const publicKey = pushStatus.publicKey || await fetchPushPublicKey()
    if (!publicKey) return

    let registration = await navigator.serviceWorker.getRegistration().catch((err) => {
      console.warn('[closed-push] Failed to access service worker registration', err)
      return null
    })
    if (!registration) {
      registration = await navigator.serviceWorker.register('/sw.js')
    }
    if (!registration.active) {
      registration = await navigator.serviceWorker.ready
    }

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidBase64ToArrayBuffer(publicKey),
      })
    }
    await savePushSubscription(subscription.toJSON())
  }, [])

  const requestAttendanceAlertsPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      setAttendanceAlertPermission('unsupported')
      return
    }
    let permission = Notification.permission
    if (permission !== 'granted') {
      permission = await Notification.requestPermission()
    }
    setAttendanceAlertPermission(permission)
    if (permission !== 'granted') return

    pushAutoEnrollAttemptedRef.current = true
    try {
      await ensureClosedAppPushEnrollment()
    } catch (err) {
      console.warn('[closed-push] Auto-enrollment skipped:', err)
    }
  }, [ensureClosedAppPushEnrollment])

  useEffect(() => {
    if (!loggedIn || attendanceAlertPermission !== 'granted') return
    if (pushAutoEnrollAttemptedRef.current) return
    pushAutoEnrollAttemptedRef.current = true
    ensureClosedAppPushEnrollment().catch((err) => {
      console.warn('[closed-push] Background auto-enrollment skipped:', err)
    })
  }, [loggedIn, attendanceAlertPermission, ensureClosedAppPushEnrollment])

  const sendAttendanceUpdateNotifications = useCallback(async (updates: AttendanceUpdateNotice[]) => {
    if (updates.length === 0) return
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    if (!isStandalonePwaDisplayMode()) return

    const notify = async (title: string, body: string, tag: string) => {
      const options: NotificationOptions = {
        body,
        icon: '/pwa-192.png',
        badge: '/pwa-192.png',
        tag,
      }
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration().catch((err) => {
          console.warn('[attendance-alerts] Unable to access service worker registration', err)
          return null
        })
        if (reg) {
          await reg.showNotification(title, options)
          return
        }
      }
      new Notification(title, options)
    }

    const primaryUpdates = updates.slice(0, 3)
    await Promise.all(primaryUpdates.map((update, idx) => {
      const statusLabel = update.status === 'present' ? 'Present' : update.status === 'absent' ? 'Absent' : 'Updated'
      const body =
        update.status === 'present'
          ? `${update.title} (${update.courseLabel}) is now marked PRESENT.`
          : update.status === 'absent'
            ? `${update.title} (${update.courseLabel}) is now marked ABSENT.`
            : `${update.title} (${update.courseLabel}) attendance was updated.`
      return notify(`Attendance: ${statusLabel}`, body, `arch-attendance-${update.courseLabel}-${Date.now()}-${idx}`)
    }))

    if (updates.length > primaryUpdates.length) {
      const extra = updates.length - primaryUpdates.length
      await notify('Attendance updates', `${extra} more subject update${extra === 1 ? '' : 's'} received.`, `arch-attendance-summary-${Date.now()}`)
    }
  }, [])

  // Android/Chrome install prompt
  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
      setShowPwa(true)
    }
    window.addEventListener("beforeinstallprompt", h)
    return () => window.removeEventListener("beforeinstallprompt", h)
  }, [])

  // iOS Safari: show "Add to Home Screen" guidance if not already installed
  useEffect(() => {
    const ua = navigator.userAgent
    const isIos = /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua)
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true
    if (isIos && !isStandalone && !localStorage.getItem("ios-pwa-ok")) {
      setShowIosPwa(true)
    }
  }, [])

  // SW registration + update notification
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => { void reg.unregister() })
      }).catch(() => {})
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => { void caches.delete(key) })
        }).catch(() => {})
      }
      return
    }
    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        registerSW({
          onNeedRefresh() { setNeedUpdate(true) },
          onOfflineReady() {},
        })
      })
      .catch(() => {
        // Dev fallback if virtual module isn't served
        if (import.meta.env.PROD) {
          navigator.serviceWorker.register('/sw.js').catch(() => {})
        }
      })
  }, [])

  // Offline / online detection
  useEffect(() => {
    const goOnline = () => setIsOffline(false)
    const goOffline = () => setIsOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Session validation — verify server-side session alive on app start
  useEffect(() => {
    if (!loggedIn) return
    validateSession().then(({ valid, reason }) => {
      if (!valid) {
        console.warn('[auth] Session validation failed', reason ?? 'unknown')
        handleLogout()
      }
      else refreshSessionSnapshot()
    }).catch(() => {}) // network error = offline, keep session
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn])

  // Profile hydration: timetable + address data (low-frequency; not high-priority polling)
  const hydrateProfile = useCallback(async () => {
    if (!loggedIn) return
    const [ttResult, addrResult] = await Promise.allSettled([
      fetchTimetableProfileAndCredits(),
      fetchProfilePatch(),
    ])
    if (ttResult.status === 'fulfilled') {
      setCourseCredits(ttResult.value.creditsByCode)
      setCourseSlotOverrides(normalizeCourseSlotOverrides(ttResult.value.slotByCourseKey))
      const detectedBatch = typeof ttResult.value.profilePatch.batch === 'number'
        ? ttResult.value.profilePatch.batch
        : null
      const fallbackTimetable = fallbackTimetableForBatch(detectedBatch)
      setTimetableByDay(normalizeTimetableByDay(ttResult.value.timetableByDay, fallbackTimetable))
      setAttendance((prev) => applyCourseSlotOverrides(
        applyCreditsToAttendance(prev, ttResult.value.creditsByCode),
        ttResult.value.slotByCourseKey,
      ))
    }
    const timetablePatch = ttResult.status === 'fulfilled' ? ttResult.value.profilePatch : {}
    const addressPatch = addrResult.status === 'fulfilled' ? addrResult.value : {}
    if (!hasStudentPatchData(timetablePatch) && !hasStudentPatchData(addressPatch)) return

    // Keep timetable values when address payload contains blank fields.
    const mergedPatch = mergeStudent(mergeStudent(EMPTY_STUDENT, timetablePatch), addressPatch)

    const next = mergeStudent(studentRef.current, mergedPatch)
    setStudent(next)
    const email = loggedEmailRef.current
    if (email) localStorage.setItem(`academia.student.${email}`, JSON.stringify(next))
  }, [loggedIn])

  useEffect(() => {
    if (!loggedIn) return
    hydrateProfile().catch(() => {})
  }, [loggedIn, hydrateProfile])

  useEffect(() => {
    if (!loggedIn || screen !== 'profile') return
    hydrateProfile().catch(() => {})
  }, [loggedIn, screen, hydrateProfile])

  const clearPollTimer = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearTimeout(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const resetUserSessionState = useCallback(() => {
    clearSessionSnapshot()
    const email = loggedEmailRef.current
    if (email) localStorage.removeItem(`academia.student.${email}`)
    if (email) localStorage.removeItem(getTabCacheStorageKey(email))
    if (email) localStorage.removeItem(getAttendanceSnapshotStorageKey(email))
    localStorage.removeItem('academia.student') // legacy key cleanup
    setStudent(EMPTY_STUDENT)
    setAttendance([])
    setMarks([])
    setCourseCredits({})
    setCourseSlotOverrides({})
    setCalendarEvents([])
    setCalendarError('')
    setTimetableByDay({})
    setNotificationCount(0)
    setAdminMetrics(null)
    setAdminMetricsLoading(false)
    setAdminMetricsError('')
    setLastUpdated(null)
    setLoggedEmail('')
    setLoggedIn(false)
    setScreen('home')
    setDayOrder(null)
    dayOrderRef.current = null
    dayOrderSyncedAtRef.current = 0
    attendanceSnapshotRef.current = null
    pushAutoEnrollAttemptedRef.current = false
    pollInFlightRef.current = false
    clearPollTimer()
  }, [clearPollTimer, setDayOrder])

  useEffect(() => {
    if (!loggedIn) {
      setNotificationCount(0)
      return
    }

    let disposed = false
    let timer: number | null = null

    const run = async () => {
      try {
        const count = await fetchNotificationCount()
        if (disposed) return
        const safe = Number.isFinite(count) ? Math.max(0, Math.min(99, Math.floor(count))) : 0
        setNotificationCount(safe)
      } catch (err) {
        const msg = (err as Error).message ?? ''
        if (msg.includes('Session expired') || msg.includes('Not authenticated')) {
          logoutUser().catch(() => {})
          resetUserSessionState()
          disposed = true
          return
        }
        console.warn('[notification] Count refresh failed', err)
      } finally {
        if (!disposed) {
          const delay = document.hidden ? 3 * 60 * 1000 : 90 * 1000
          timer = window.setTimeout(() => { void run() }, delay)
        }
      }
    }

    const wake = () => {
      if (disposed) return
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
      void run()
    }

    void run()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    return () => {
      disposed = true
      if (timer !== null) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
    }
  }, [loggedIn, resetUserSessionState])

  useEffect(() => {
    if (!loggedIn || !showAdminMetrics || screen !== 'profile') {
      if (!showAdminMetrics) {
        setAdminMetrics(null)
        setAdminMetricsError('')
      }
      setAdminMetricsLoading(false)
      return
    }

    let disposed = false
    setAdminMetricsLoading(true)
    setAdminMetricsError('')

    fetchAdminSelfMetrics()
      .then((metrics) => {
        if (disposed) return
        setAdminMetrics(metrics)
      })
      .catch((err) => {
        if (disposed) return
        const msg = (err as Error).message ?? ''
        if (msg.includes('Session expired') || msg.includes('Not authenticated')) {
          logoutUser().catch(() => {})
          resetUserSessionState()
          disposed = true
          return
        }
        setAdminMetricsError(msg || 'Failed to load admin metrics')
      })
      .finally(() => {
        if (!disposed) setAdminMetricsLoading(false)
      })

    return () => {
      disposed = true
    }
  }, [loggedIn, showAdminMetrics, screen, resetUserSessionState])

  const syncAttendanceState = useCallback(async (opts?: { forceDayOrderFetch?: boolean; notifyOnChange?: boolean }) => {
    const nowTs = Date.now()
    const shouldFetchDayOrder =
      opts?.forceDayOrderFetch === true ||
      dayOrderRef.current === null ||
      (nowTs - dayOrderSyncedAtRef.current) >= DAY_ORDER_REFRESH_MS

    if (shouldFetchDayOrder) dayOrderSyncedAtRef.current = nowTs

    const dayOrderPromise = shouldFetchDayOrder
      ? fetchCurrentDayOrder().catch((err) => {
        console.warn('[attendance] Day order refresh failed', err)
        return dayOrderRef.current
      })
      : Promise.resolve(dayOrderRef.current)

    const [res, dayOrderResult] = await Promise.all([
      fetchAttendance(),
      dayOrderPromise,
    ])
    const nextDayOrder = typeof dayOrderResult === 'number' && Number.isFinite(dayOrderResult) ? dayOrderResult : null
    if (dayOrderRef.current !== nextDayOrder) {
      dayOrderRef.current = nextDayOrder
      setDayOrder(nextDayOrder)
    }

    const nextStudent = mergeStudent(studentRef.current, res.student)
    const nextAttendance = applyCourseSlotOverrides(
      applyCreditsToAttendance(res.attendance, creditsRef.current),
      courseSlotOverridesRef.current,
    )
    setAttendance(nextAttendance)
    setMarks(res.marks)
    setStudent(nextStudent)
    setTimetableByDay((prev) => {
      if (nextStudent.batch === 1 && isBatch2FallbackTimetable(prev)) {
        return {}
      }
      if (nextStudent.batch === 2 && Object.keys(prev).length === 0) {
        return cloneDefaultTimetableByDay()
      }
      return prev
    })
    refreshSessionSnapshot()

    const nextSnapshot = createAttendanceSnapshot(nextAttendance)
    const previousSnapshot = attendanceSnapshotRef.current
    attendanceSnapshotRef.current = nextSnapshot

    const email = loggedEmailRef.current
    if (email) {
      localStorage.setItem(`academia.student.${email}`, JSON.stringify(nextStudent))
      localStorage.setItem(getAttendanceSnapshotStorageKey(email), JSON.stringify(nextSnapshot))
    }

    if (opts?.notifyOnChange && previousSnapshot) {
      const updates = detectAttendanceUpdates(previousSnapshot, nextSnapshot)
      if (updates.length > 0) void sendAttendanceUpdateNotifications(updates)
    }

    setLastUpdated(new Date())
    return { dayOrder: nextDayOrder, attendance: nextAttendance }
  }, [sendAttendanceUpdateNotifications, setDayOrder])

  // Attendance polling: fast only during active class windows, relaxed otherwise.
  useEffect(() => {
    if (!loggedIn) return
    let disposed = false

    const runPoll = async () => {
      if (disposed || pollInFlightRef.current) return
      pollInFlightRef.current = true
      try {
        const synced = await syncAttendanceState({ notifyOnChange: true })
        if (disposed) return
        const nextDelay = getAdaptiveAttendancePollIntervalMs(synced.dayOrder, synced.attendance, timetableByDay)
        pollRef.current = window.setTimeout(() => { void runPoll() }, nextDelay)
      } catch (err) {
        const msg = (err as Error).message ?? ''
        if (msg.includes('Session expired') || msg.includes('Not authenticated')) {
          logoutUser().catch(() => {})
          resetUserSessionState()
          disposed = true
          return
        }
        console.warn('[attendance] Adaptive poll failed', err)
        const retryDelay = isOffline ? 3 * 60 * 1000 : 90 * 1000
        pollRef.current = window.setTimeout(() => { void runPoll() }, retryDelay)
      } finally {
        pollInFlightRef.current = false
      }
    }

    const wakePoll = () => {
      if (disposed || document.hidden) return
      clearPollTimer()
      void runPoll()
    }

    void runPoll()
    document.addEventListener('visibilitychange', wakePoll)
    window.addEventListener('focus', wakePoll)
    return () => {
      disposed = true
      clearPollTimer()
      document.removeEventListener('visibilitychange', wakePoll)
      window.removeEventListener('focus', wakePoll)
    }
  }, [loggedIn, isOffline, syncAttendanceState, clearPollTimer, resetUserSessionState, timetableByDay])

  // Academic planner calendar — fetch on demand when screen opens
  useEffect(() => {
    if (screen !== 'calendar' || !loggedIn) return
    setCalendarLoading(calendarEvents.length === 0)
    setCalendarError('')
    fetchAcademicCalendarEvents()
      .then(setCalendarEvents)
      .catch(err => setCalendarError(err.message || 'Failed to load academic calendar'))
      .finally(() => setCalendarLoading(false))
  }, [screen, loggedIn, calendarEvents.length])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await syncAttendanceState({ forceDayOrderFetch: true, notifyOnChange: true })
    } catch (err) {
      const msg = (err as Error).message ?? ''
      if (msg.includes('Session expired') || msg.includes('Not authenticated')) {
        logoutUser().catch(() => {})
        resetUserSessionState()
      }
    } finally {
      setRefreshing(false)
    }
  }

  const handleLogout = useCallback(() => {
    logoutUser().catch(() => {})
    resetUserSessionState()
  }, [resetUserSessionState]) // all deps are stable setters or refs

  async function handleInstall() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const r = await installPrompt.userChoice
    if (r.outcome === "accepted") {
      setShowPwa(false)
      void requestAttendanceAlertsPermission()
    }
    setInstallPrompt(null)
  }

  const pullPct = usePullToRefresh(handleRefresh, loggedIn && (screen === 'home' || screen === 'attendance'))

  if (isNotFoundRoute) {
    return <NotFoundScreen />
  }

  if (!loggedIn) return (
    <LoginScreen onSuccess={(email) => {
      // Keep only this user's scoped cache entries to prevent storage bloat.
      cleanupStaleLocalEntries(email)
      // Load THIS user's cached student for instant name display
      const saved = localStorage.getItem(`academia.student.${email}`)
      let cachedStudent = EMPTY_STUDENT
      if (saved) {
        try {
          cachedStudent = JSON.parse(saved) as StudentInfo
        } catch {
          cachedStudent = EMPTY_STUDENT
        }
      }
      setStudent(cachedStudent)
      const cache = readTabCache(email)
      setAttendance(cache?.attendance ?? [])
      setMarks(cache?.marks ?? [])
      setCalendarEvents(cache?.calendarEvents ?? [])
      setCourseSlotOverrides(cache?.courseSlotOverrides ?? {})
      const fallbackTimetable = fallbackTimetableForBatch(cache?.studentBatch ?? null)
      setTimetableByDay(cache?.timetableByDay ?? fallbackTimetable)
      if (cache?.lastUpdatedIso) {
        const restored = new Date(cache.lastUpdatedIso)
        setLastUpdated(Number.isNaN(restored.getTime()) ? null : restored)
      } else {
        setLastUpdated(null)
      }
      setCalendarError('')
      dayOrderSyncedAtRef.current = 0
      attendanceSnapshotRef.current = null
      pollInFlightRef.current = false
      setLoggedEmail(email)
      setLoggedIn(true)
    }} />
  )

  const navTabs = [
    { key: "home"       as const, title: "Home",       icon: Home },
    { key: "attendance" as const, title: "Attendance", icon: BarChart2 },
    { key: "schedule"   as const, title: "Timetable",  icon: Clock3 },
    { key: "calendar"   as const, title: "Calendar",   icon: CalendarDays },
    { key: "profile"    as const, title: "Profile",    icon: User, badgeCount: notificationCount },
  ]
  const fallbackName = loggedEmail.split('@')[0] || 'Student'
  const installName = toTitle(firstName(student.name || loggedEmail.split('@')[0] || 'Student'))

  return (
    <div className={screen === 'cooking' ? 'app cooking-mode' : 'app'}>
      {/* Content */}
      <main className={screen === 'cooking' ? 'page-content cooking-page-content' : 'page-content'}>
        {/* PWA banner — Android */}
        {screen !== 'cooking' && showPwa && (
          <div className="pwa-banner">
            <span style={{ fontSize: 18, display: 'inline-flex' }}><Icons.Phone /></span>
            <div className="pwa-banner-text">
              <strong>{installName}, install your Arch app</strong>
              Get faster access with a personalized home-screen app
            </div>
            <button className="pwa-install-btn" onClick={handleInstall}>Install</button>
            <button className="pwa-dismiss" onClick={() => setShowPwa(false)} aria-label="Dismiss install prompt">
              <Icons.Close />
            </button>
          </div>
        )}

        {/* PWA banner — iOS Safari */}
        {screen !== 'cooking' && !showPwa && showIosPwa && (
          <div className="pwa-banner">
            <span style={{ fontSize: 18, display: 'inline-flex' }}><Icons.Phone /></span>
            <div className="pwa-banner-text">
              <strong>{installName}, install your Arch app</strong>
              Tap <strong style={{ color: "rgba(255,255,255,0.9)" }}>Share →</strong> "Add to Home Screen"
            </div>
            <button
              className="pwa-dismiss"
              onClick={() => { localStorage.setItem("ios-pwa-ok", "1"); setShowIosPwa(false) }}
              aria-label="Dismiss install prompt"
            >
              <Icons.Close />
            </button>
          </div>
        )}

        {/* Status banners — offline / update */}
        {screen !== 'cooking' && isOffline && (
          <div className="status-banner offline">
            <span>No internet — showing cached data</span>
          </div>
        )}
        {screen !== 'cooking' && !isOffline && needUpdate && (
          <div className="status-banner update">
            <span>Update available</span>
            <button className="status-banner-btn" onClick={() => window.location.reload()}>Reload</button>
          </div>
        )}

        {/* Pull-to-refresh indicator */}
        {screen !== 'cooking' && pullPct > 0 && (
          <div style={{ height: `${Math.round(pullPct * 44)}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', opacity: pullPct, transition: 'opacity 0.1s' }}>
            <div className="ptr-spinner" style={{ transform: `rotate(${Math.round(pullPct * 270)}deg)` }} />
          </div>
        )}
        {screen === "home" && (
          <HomeScreen
            student={student}
            fallbackName={fallbackName}
            attendance={attendance}
            timetableByDay={timetableByDay}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            dayOrder={dayOrder}
            onDayOrderChange={setDayOrder}
            lastUpdated={lastUpdated}
            dataLoading={loggedIn && attendance.length === 0 && lastUpdated === null}
          />
        )}
        {screen === "attendance" && (
          <AttendanceScreen attendance={attendance} marks={marks} />
        )}
        {screen === "schedule" && (
          <ScheduleScreen
            key={dayOrder ?? 'none'}
            initialDay={dayOrder}
            attendance={attendance}
            timetableByDay={timetableByDay}
          />
        )}
        {screen === "calendar" && <CalendarScreen events={calendarEvents} loading={calendarLoading} error={calendarError} onDayOrderSync={setDayOrder} />}
        {screen === "profile" && (
          <ProfileScreen
            student={student}
            theme={theme}
            onTheme={handleTheme}
            onLogout={handleLogout}
            attendanceAlertPermission={attendanceAlertPermission}
            onEnableAttendanceAlerts={() => { void requestAttendanceAlertsPermission() }}
            onOpenCooking={() => setScreen('cooking')}
            showAdminMetrics={showAdminMetrics}
            adminMetrics={adminMetrics}
            adminMetricsLoading={adminMetricsLoading}
            adminMetricsError={adminMetricsError}
          />
        )}
        {screen === "cooking" && (
          <CookingScreen onBack={() => setScreen('profile')} />
        )}
      </main>

      {screen !== 'cooking' && (
        <ExpandableNav
          tabs={navTabs}
          activeKey={screen}
          onSelect={(key) => setScreen(key as Screen)}
        />
      )}
    </div>
  )
}
