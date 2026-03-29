import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Home, BarChart2, Clock3, CalendarDays, TrendingUp, User, UtensilsCrossed } from "lucide-react"
import { CartesianGrid, Area, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { DayPicker, type DateRange } from "react-day-picker"
import {
  classesSafeToMiss, classesNeededToReach,
} from "./data/real-data"
import type { AttendanceCourse, InternalMark, StudentInfo } from "./data/real-data"
import { DAY_KEYS, DAY_LONG_LABEL, DAY_SHORT_LABEL, MEAL_LABEL, MEAL_WINDOW_TEXT, getActiveMeal, getDayKeyFromDate, getDayTypeFromDate, getMenuForDay, isNonVegItem } from "./data/mess-schedule"
import type { MessDayKey, MessMealKey } from "./data/mess-schedule"
import { BATCH2_TIMETABLE, getTodayClasses, fetchAttendance, fetchCurrentDayOrder, fetchProfilePatch, fetchTimetableProfileAndCredits, fetchAcademicCalendarEvents, fetchNotificationCount, fetchPushDesignStatus, fetchPushPublicKey, savePushSubscription, fetchAdminSelfMetrics, loginUser, logoutUser, getSessionToken } from "./lib/api"
import type { AcademicCalendarEvent, AdminSelfMetrics } from "./lib/api"
import * as sessionStorageLib from "./lib/storage"
import { ExpandableNav } from "./components/expandable-tabs"
import { AcademiaLogo } from "./components/AcademiaLogo"
import { HeroBadge } from "./components/HeroBadge"
import { GradualBlur } from "./components/GradualBlur"
import Grainient from "./components/Grainient"
import { AnimatedShinyText } from "./components/AnimatedShinyText"
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
type Screen = "home" | "attendance" | "schedule" | "calendar" | "marks" | "mess" | "profile" | "cooking"
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
const APP_RUNTIME_VERSION_KEY = 'arch.runtime.version'
const SPECIAL_FRUIT_SURPRISES = ['✨', '🍉', '🍍', '🥭', '🍓'] as const
const QUICK_DOCK_STORAGE_KEY = 'arch.quickDockTabs.v1'
const FLOATING_LAYOUT_STORAGE_KEY = 'arch.floatingDockLayout.v1'
const FLOATING_TAB_ORDER: Screen[] = ['home', 'attendance', 'schedule', 'calendar', 'marks', 'mess', 'profile']
const FLOATING_DOCK_DEFAULT_ORDER: Screen[] = ['home', 'attendance', 'schedule', 'calendar', 'profile']
const FLOATING_TAB_KEYS = new Set<Screen>(['home', 'attendance', 'schedule', 'calendar', 'marks', 'mess', 'profile'])
const SCREEN_KEYS = new Set<Screen>(['home', 'attendance', 'schedule', 'calendar', 'marks', 'mess', 'profile', 'cooking'])
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function normalizeFloatingDockLayout(source: unknown): Screen[] {
  if (!Array.isArray(source)) return []
  const seen = new Set<Screen>()
  const out: Screen[] = []
  for (const item of source) {
    if ((item === 'home' || item === 'attendance' || item === 'schedule' || item === 'calendar' || item === 'marks' || item === 'mess' || item === 'profile') && !seen.has(item)) {
      seen.add(item)
      out.push(item)
    }
  }
  return out
}

function isScreenValue(value: unknown): value is Screen {
  return typeof value === 'string' && SCREEN_KEYS.has(value as Screen)
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
  const safeTarget = Number.isFinite(target) ? target : 0
  const [val, setVal] = useState(() => safeTarget)
  const prevTargetRef = useRef(safeTarget)
  const hydratedRef = useRef(false)

  useEffect(() => {
    let raf = 0
    const commitNow = () => {
      raf = requestAnimationFrame(() => setVal(safeTarget))
    }

    if (!hydratedRef.current) {
      hydratedRef.current = true
      prevTargetRef.current = safeTarget
      return () => cancelAnimationFrame(raf)
    }

    const from = prevTargetRef.current
    prevTargetRef.current = safeTarget

    if (duration <= 0 || from === safeTarget) {
      commitNow()
      return () => cancelAnimationFrame(raf)
    }

    // Avoid showing misleading low values during first non-zero hydration.
    if (from === 0 && safeTarget > 0) {
      commitNow()
      return () => cancelAnimationFrame(raf)
    }

    let start: number | null = null
    const step = (ts: number) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const next = from + (safeTarget - from) * eased
      setVal(parseFloat(next.toFixed(1)))
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [safeTarget, duration])
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
type PredictionLeaveType = 'absent' | 'present'
type PredictionGapHandling = 'none' | 'present' | 'absent'
type PredictionSafetyMode = 'plus1' | 'border'
type PredictionHolidayGoal = '5d' | '1w' | '2w' | 'max'
type PredictionHolidayPlanStyle = 'stretch' | 'scattered' | 'both'
type PredictionHolidayReasonCode =
  | 'best_long_break_safe_margin'
  | 'max_leave_without_risk'
  | 'safer_alternative_more_buffer'
  | 'best_effort_with_blockers'
type PredictionDateRange = {
  start: string
  end: string
}
type PredictionCourseImpact = {
  courseKey: string
  code: string
  type: AttendanceCourse['type']
  title: string
  currentPct: number
  projectedPct: number
  classesCounted: number
  projectedConducted: number
  projectedAbsent: number
  canMiss: number
  mustAttend: number
  isAtRisk: boolean
}
type PredictionSummary = {
  totalClassesCounted: number
  gapClassesCounted: number
  impactedCourses: PredictionCourseImpact[]
  overallProjected: number
  endDate: string
  leaveType: PredictionLeaveType
  gapHandling: PredictionGapHandling
  unmatchedDays: number
  consideredDays: number
  rangeCount: number
}
type PredictionHolidayPlanCourseImpact = {
  courseKey: string
  code: string
  type: AttendanceCourse['type']
  title: string
  leaveClasses: number
  projectedPct: number
  safeBufferClasses: number
  atRisk: boolean
}
type PredictionHolidayReadinessNeed = {
  courseKey: string
  code: string
  type: AttendanceCourse['type']
  title: string
  neededClasses: number
}
type PredictionHolidayPlanOption = {
  id: string
  label: string
  style: 'stretch' | 'scattered'
  leaveDates: string[]
  leaveDays: number
  startDate: string
  endDate: string
  attendDaysBefore: number
  safetyMarginClasses: number
  totalSkipCost: number
  reasonCode: PredictionHolidayReasonCode
  reasonText: string
  impactedCourses: PredictionHolidayPlanCourseImpact[]
}
type PredictionHolidayCalendarMarker = 'leave' | 'hard_block' | 'unmatched' | 'prep' | 'today'
type PredictionHolidayBlocker = {
  courseKey: string
  code: string
  type: AttendanceCourse['type']
  title: string
  bestPossiblePct: number
  requiredToRecover: number
}
type PredictionHolidayOptimizerSummary = {
  generatedAt: string
  horizonStart: string
  horizonEnd: string
  targetPct: number
  safetyMode: PredictionSafetyMode
  goal: PredictionHolidayGoal
  style: PredictionHolidayPlanStyle
  readinessDate: string | null
  readinessAttendDays: number
  readinessAttendClasses: number
  prepAttendDates: string[]
  readinessNeeds: PredictionHolidayReadinessNeed[]
  hardBlockDates: string[]
  unmatchedDates: string[]
  maxContiguousLeaveDays: number
  maxScatteredLeaveDays: number
  blockers: PredictionHolidayBlocker[]
  options: PredictionHolidayPlanOption[]
}
type PredictionHolidayOptimizerCache = {
  goal: PredictionHolidayGoal
  style: PredictionHolidayPlanStyle
  safetyMode: PredictionSafetyMode
  useCustomTarget: boolean
  customTargetPct: number
  summary: PredictionHolidayOptimizerSummary | null
}
type PredictionCachePayload = {
  ranges: PredictionDateRange[]
  startDate: string
  endDate: string
  activeMonth: string
  leaveType: PredictionLeaveType
  gapHandling: PredictionGapHandling
  summary: PredictionSummary | null
  holidayOptimizer: PredictionHolidayOptimizerCache | null
}
type HolidayOptimizerCourseConstraint = {
  index: number
  courseKey: string
  code: string
  type: AttendanceCourse['type']
  title: string
  baseConducted: number
  baseAbsent: number
  futureClasses: number
  maxSkipRaw: number
  maxSkipConstraint: number
  bestPossiblePct: number
  requiredToRecover: number
  isBlocker: boolean
  riskWeight: number
}
type HolidayOptimizerDay = {
  date: string
  classCount: number
  hardBlock: boolean
  hardBlockReason: 'holiday' | 'exam' | 'community' | null
  isUnmatched: boolean
  leaveEligible: boolean
  skipCost: number
  impacts: number[]
}
type HolidayOptimizerModel = {
  horizonStart: string
  horizonEnd: string
  targetPct: number
  safetyMode: PredictionSafetyMode
  readinessDate: string | null
  readinessAttendDays: number
  readinessAttendClasses: number
  prepAttendDates: string[]
  readinessNeeds: PredictionHolidayReadinessNeed[]
  constraints: HolidayOptimizerCourseConstraint[]
  days: HolidayOptimizerDay[]
  candidateIndexes: number[]
  hardBlockDates: string[]
  unmatchedDates: string[]
  blockers: PredictionHolidayBlocker[]
}
type HolidayOptimizerPlan = {
  style: 'stretch' | 'scattered'
  indexes: number[]
  leaveDates: string[]
  leaveCounts: number[]
  leaveDays: number
  startDate: string
  endDate: string
  attendDaysBefore: number
  safetyMarginClasses: number
  totalSkipCost: number
  compactSpanDays: number
}
type TabCachePayload = {
  attendance: AttendanceCourse[]
  marks: InternalMark[]
  courseCredits: Record<string, number>
  calendarEvents: AcademicCalendarEvent[]
  timetableByDay: TimetableByDay
  courseSlotOverrides: CourseSlotOverrides
  studentBatch: number | null
  dayOrder: number | null
  notificationCount: number
  lastScreen: Screen
  predictionCache: PredictionCachePayload | null
  lastUpdatedIso: string | null
  savedAt: number
  cacheVersion: number
}

const ATTENDANCE_SNAPSHOT_PREFIX = 'arch.attendance.snapshot.'
const TAB_CACHE_PREFIX = 'arch.tabcache.v1.'
const TAB_CACHE_VERSION = 7
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

function normalizeCourseCredits(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {}
  const normalized: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const code = key.trim().toUpperCase()
    if (!code) continue
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue
    normalized[code] = value
  }
  return normalized
}

function normalizeNotificationCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(99, Math.floor(value)))
}

function normalizePredictionLeaveType(value: unknown): PredictionLeaveType {
  if (value === 'present' || value === 'od' || value === 'ml') return 'present'
  return value === 'absent' ? 'absent' : 'absent'
}

function normalizePredictionGapHandling(value: unknown): PredictionGapHandling {
  if (value === 'present') return 'present'
  if (value === 'absent') return 'absent'
  return 'none'
}

function normalizePredictionSafetyMode(value: unknown): PredictionSafetyMode {
  return value === 'border' ? 'border' : 'plus1'
}

function normalizePredictionHolidayGoal(value: unknown): PredictionHolidayGoal {
  if (value === '5d' || value === '1w' || value === '2w') return value
  return 'max'
}

function normalizePredictionHolidayPlanStyle(value: unknown): PredictionHolidayPlanStyle {
  if (value === 'stretch' || value === 'scattered') return value
  return 'both'
}

function clampPredictionTargetPct(value: number): number {
  if (!Number.isFinite(value)) return 75
  return Math.max(75, Math.min(95, Math.round(value)))
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizePredictionHolidayOptimizerSummary(raw: unknown): PredictionHolidayOptimizerSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = raw as Partial<PredictionHolidayOptimizerSummary>
  if (
    typeof parsed.generatedAt !== 'string' ||
    !isIsoDate(parsed.horizonStart) ||
    !isIsoDate(parsed.horizonEnd) ||
    !Array.isArray(parsed.options) ||
    !Array.isArray(parsed.blockers)
  ) {
    return null
  }

  const blockers: PredictionHolidayBlocker[] = parsed.blockers
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const item = entry as Partial<PredictionHolidayBlocker>
      if (
        typeof item.courseKey !== 'string' ||
        typeof item.code !== 'string' ||
        (item.type !== 'Theory' && item.type !== 'Practical') ||
        typeof item.title !== 'string' ||
        typeof item.bestPossiblePct !== 'number' ||
        typeof item.requiredToRecover !== 'number'
      ) return null
      return {
        courseKey: item.courseKey,
        code: item.code,
        type: item.type,
        title: item.title,
        bestPossiblePct: item.bestPossiblePct,
        requiredToRecover: item.requiredToRecover,
      }
    })
    .filter((entry): entry is PredictionHolidayBlocker => Boolean(entry))

  const readinessNeeds: PredictionHolidayReadinessNeed[] = Array.isArray(parsed.readinessNeeds)
    ? parsed.readinessNeeds
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const item = entry as Partial<PredictionHolidayReadinessNeed>
        if (
          typeof item.courseKey !== 'string' ||
          typeof item.code !== 'string' ||
          (item.type !== 'Theory' && item.type !== 'Practical') ||
          typeof item.title !== 'string' ||
          typeof item.neededClasses !== 'number' ||
          !Number.isFinite(item.neededClasses)
        ) return null
        return {
          courseKey: item.courseKey,
          code: item.code,
          type: item.type,
          title: item.title,
          neededClasses: Math.max(0, Math.floor(item.neededClasses)),
        } satisfies PredictionHolidayReadinessNeed
      })
      .filter((entry): entry is PredictionHolidayReadinessNeed => Boolean(entry))
      .sort((a, b) => b.neededClasses - a.neededClasses || a.code.localeCompare(b.code))
    : []

  const options: PredictionHolidayPlanOption[] = parsed.options
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const item = entry as Partial<PredictionHolidayPlanOption>
      if (
        typeof item.id !== 'string' ||
        typeof item.label !== 'string' ||
        (item.style !== 'stretch' && item.style !== 'scattered') ||
        !Array.isArray(item.leaveDates) ||
        typeof item.leaveDays !== 'number' ||
        !isIsoDate(item.startDate) ||
        !isIsoDate(item.endDate) ||
        typeof item.attendDaysBefore !== 'number' ||
        typeof item.safetyMarginClasses !== 'number' ||
        typeof item.totalSkipCost !== 'number' ||
        typeof item.reasonText !== 'string' ||
        !Array.isArray(item.impactedCourses)
      ) return null
      const reasonCode: PredictionHolidayReasonCode =
        item.reasonCode === 'best_long_break_safe_margin' ||
        item.reasonCode === 'max_leave_without_risk' ||
        item.reasonCode === 'safer_alternative_more_buffer' ||
        item.reasonCode === 'best_effort_with_blockers'
          ? item.reasonCode
          : 'max_leave_without_risk'

      const impactedCourses: PredictionHolidayPlanCourseImpact[] = item.impactedCourses
        .map((impact) => {
          if (!impact || typeof impact !== 'object') return null
          const row = impact as Partial<PredictionHolidayPlanCourseImpact>
          if (
            typeof row.courseKey !== 'string' ||
            typeof row.code !== 'string' ||
            (row.type !== 'Theory' && row.type !== 'Practical') ||
            typeof row.title !== 'string' ||
            typeof row.leaveClasses !== 'number' ||
            typeof row.projectedPct !== 'number' ||
            typeof row.safeBufferClasses !== 'number' ||
            typeof row.atRisk !== 'boolean'
          ) return null
          return {
            courseKey: row.courseKey,
            code: row.code,
            type: row.type,
            title: row.title,
            leaveClasses: row.leaveClasses,
            projectedPct: row.projectedPct,
            safeBufferClasses: row.safeBufferClasses,
            atRisk: row.atRisk,
          }
        })
        .filter((impact): impact is PredictionHolidayPlanCourseImpact => Boolean(impact))

      return {
        id: item.id,
        label: item.label,
        style: item.style,
        leaveDates: item.leaveDates.filter((date): date is string => isIsoDate(date)),
        leaveDays: Math.max(0, Math.floor(item.leaveDays)),
        startDate: item.startDate,
        endDate: item.endDate,
        attendDaysBefore: Math.max(0, Math.floor(item.attendDaysBefore)),
        safetyMarginClasses: Math.floor(item.safetyMarginClasses),
        totalSkipCost: item.totalSkipCost,
        reasonCode,
        reasonText: item.reasonText,
        impactedCourses,
      }
    })
    .filter((entry): entry is PredictionHolidayPlanOption => Boolean(entry))

  return {
    generatedAt: parsed.generatedAt,
    horizonStart: parsed.horizonStart,
    horizonEnd: parsed.horizonEnd,
    targetPct: clampPredictionTargetPct(typeof parsed.targetPct === 'number' ? parsed.targetPct : 75),
    safetyMode: normalizePredictionSafetyMode(parsed.safetyMode),
    goal: normalizePredictionHolidayGoal(parsed.goal),
    style: normalizePredictionHolidayPlanStyle(parsed.style),
    readinessDate: isIsoDate(parsed.readinessDate) ? parsed.readinessDate : null,
    readinessAttendDays: typeof parsed.readinessAttendDays === 'number' && Number.isFinite(parsed.readinessAttendDays)
      ? Math.max(0, Math.floor(parsed.readinessAttendDays))
      : 0,
    readinessAttendClasses: typeof parsed.readinessAttendClasses === 'number' && Number.isFinite(parsed.readinessAttendClasses)
      ? Math.max(0, Math.floor(parsed.readinessAttendClasses))
      : 0,
    prepAttendDates: Array.isArray(parsed.prepAttendDates)
      ? parsed.prepAttendDates.filter((date): date is string => isIsoDate(date))
      : [],
    readinessNeeds,
    hardBlockDates: Array.isArray(parsed.hardBlockDates)
      ? parsed.hardBlockDates.filter((date): date is string => isIsoDate(date))
      : [],
    unmatchedDates: Array.isArray(parsed.unmatchedDates)
      ? parsed.unmatchedDates.filter((date): date is string => isIsoDate(date))
      : [],
    maxContiguousLeaveDays: typeof parsed.maxContiguousLeaveDays === 'number' && Number.isFinite(parsed.maxContiguousLeaveDays)
      ? Math.max(0, Math.floor(parsed.maxContiguousLeaveDays))
      : 0,
    maxScatteredLeaveDays: typeof parsed.maxScatteredLeaveDays === 'number' && Number.isFinite(parsed.maxScatteredLeaveDays)
      ? Math.max(0, Math.floor(parsed.maxScatteredLeaveDays))
      : 0,
    blockers,
    options,
  }
}

function buildPredictionHolidayMarkers(
  summary: PredictionHolidayOptimizerSummary | null,
  activeOptionId: string | null,
): Map<string, PredictionHolidayCalendarMarker> {
  const markers = new Map<string, PredictionHolidayCalendarMarker>()
  if (!summary) return markers

  for (const date of summary.hardBlockDates) {
    if (isIsoDate(date)) markers.set(date, 'hard_block')
  }
  for (const date of summary.unmatchedDates) {
    if (isIsoDate(date) && !markers.has(date)) markers.set(date, 'unmatched')
  }
  for (const date of summary.prepAttendDates) {
    if (isIsoDate(date) && !markers.has(date)) markers.set(date, 'prep')
  }
  const selectedOption = summary.options.find((option) => option.id === activeOptionId) ?? summary.options[0] ?? null
  if (selectedOption) {
    for (const date of selectedOption.leaveDates) {
      if (isIsoDate(date)) markers.set(date, 'leave')
    }
  }

  const todayIso = toLocalIsoDate(new Date())
  if (!markers.has(todayIso)) markers.set(todayIso, 'today')
  return markers
}

function normalizePredictionHolidayOptimizerCache(raw: unknown): PredictionHolidayOptimizerCache | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = raw as Partial<PredictionHolidayOptimizerCache>
  return {
    goal: normalizePredictionHolidayGoal(parsed.goal),
    style: normalizePredictionHolidayPlanStyle(parsed.style),
    safetyMode: normalizePredictionSafetyMode(parsed.safetyMode),
    useCustomTarget: parsed.useCustomTarget === true,
    customTargetPct: clampPredictionTargetPct(typeof parsed.customTargetPct === 'number' ? parsed.customTargetPct : 80),
    summary: normalizePredictionHolidayOptimizerSummary(parsed.summary),
  }
}

function normalizePredictionCache(raw: unknown): PredictionCachePayload | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Partial<PredictionCachePayload>
  const hasExplicitRanges = Array.isArray(source.ranges)
  const rangesSource = hasExplicitRanges ? (source.ranges ?? []) : []
  const normalizedRanges = normalizePredictionRanges(
    rangesSource
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const maybe = entry as Partial<PredictionDateRange>
        if (typeof maybe.start !== 'string' || typeof maybe.end !== 'string') return null
        return { start: maybe.start, end: maybe.end }
      })
      .filter((entry): entry is PredictionDateRange => Boolean(entry)),
  )
  const startDate = typeof source.startDate === 'string' ? source.startDate : ''
  const endDate = typeof source.endDate === 'string' ? source.endDate : ''
  const activeMonth = typeof source.activeMonth === 'string' && /^\d{4}-\d{2}$/.test(source.activeMonth)
    ? source.activeMonth
    : toLocalIsoDate(new Date()).slice(0, 7)
  const hasRangeDates = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate)

  const summarySource = source.summary
  let summary: PredictionSummary | null = null
  if (summarySource && typeof summarySource === 'object') {
    const parsed = summarySource as Partial<PredictionSummary>
    const impactedCourses = Array.isArray(parsed.impactedCourses)
      ? parsed.impactedCourses.filter((entry): entry is PredictionCourseImpact => {
        if (!entry || typeof entry !== 'object') return false
        const item = entry as Partial<PredictionCourseImpact>
        return (
          typeof item.courseKey === 'string' &&
          typeof item.code === 'string' &&
          (item.type === 'Theory' || item.type === 'Practical') &&
          typeof item.title === 'string' &&
          typeof item.currentPct === 'number' &&
          typeof item.projectedPct === 'number' &&
          typeof item.classesCounted === 'number' &&
          typeof item.projectedConducted === 'number' &&
          typeof item.projectedAbsent === 'number' &&
          typeof item.canMiss === 'number' &&
          typeof item.mustAttend === 'number' &&
          typeof item.isAtRisk === 'boolean'
        )
      })
      : []

    if (
      typeof parsed.totalClassesCounted === 'number' &&
      typeof parsed.overallProjected === 'number' &&
      typeof parsed.endDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.endDate) &&
      typeof parsed.unmatchedDays === 'number' &&
      typeof parsed.consideredDays === 'number'
    ) {
      summary = {
        totalClassesCounted: parsed.totalClassesCounted,
        gapClassesCounted: typeof parsed.gapClassesCounted === 'number' && Number.isFinite(parsed.gapClassesCounted)
          ? Math.max(0, Math.floor(parsed.gapClassesCounted))
          : 0,
        impactedCourses,
        overallProjected: parsed.overallProjected,
        endDate: parsed.endDate,
        leaveType: normalizePredictionLeaveType(parsed.leaveType),
        gapHandling: normalizePredictionGapHandling(parsed.gapHandling),
        unmatchedDays: parsed.unmatchedDays,
        consideredDays: parsed.consideredDays,
        rangeCount: typeof parsed.rangeCount === 'number' && Number.isFinite(parsed.rangeCount)
          ? Math.max(1, Math.floor(parsed.rangeCount))
          : Math.max(1, normalizedRanges.length || 1),
      }
    }
  }

  const holidayOptimizer = normalizePredictionHolidayOptimizerCache(source.holidayOptimizer)
  const fallbackRangeFromLegacy = !hasExplicitRanges && hasRangeDates
    ? normalizePredictionRanges([{ start: startDate, end: endDate }])
    : []
  const ranges = hasExplicitRanges
    ? normalizedRanges
    : (normalizedRanges.length > 0 ? normalizedRanges : fallbackRangeFromLegacy)
  if (ranges.length === 0 && !hasRangeDates && !holidayOptimizer) return null
  const firstRange = ranges[0] ?? null
  const lastRange = ranges[ranges.length - 1] ?? null

  return {
    ranges,
    startDate: firstRange?.start ?? startDate,
    endDate: lastRange?.end ?? endDate,
    activeMonth,
    leaveType: normalizePredictionLeaveType(source.leaveType),
    gapHandling: normalizePredictionGapHandling(source.gapHandling),
    summary,
    holidayOptimizer,
  }
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
      courseCredits: normalizeCourseCredits(parsed.courseCredits),
      calendarEvents: Array.isArray(parsed.calendarEvents) ? parsed.calendarEvents as AcademicCalendarEvent[] : [],
      timetableByDay: normalizeTimetableByDay(parsed.timetableByDay, fallbackTimetable),
      courseSlotOverrides: normalizeCourseSlotOverrides(parsed.courseSlotOverrides),
      studentBatch,
      dayOrder: typeof parsed.dayOrder === 'number' && parsed.dayOrder >= 1 && parsed.dayOrder <= 5 ? parsed.dayOrder : null,
      notificationCount: normalizeNotificationCount(parsed.notificationCount),
      lastScreen: isScreenValue(parsed.lastScreen) ? parsed.lastScreen : 'home',
      predictionCache: normalizePredictionCache(parsed.predictionCache),
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

function normalizeLoginEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return ''
  return trimmed.includes('@') ? trimmed : `${trimmed}@${SRM_EMAIL_DOMAIN}`
}

function emailLocalPart(raw: string): string {
  const normalized = normalizeLoginEmail(raw)
  return normalized.split('@')[0] ?? normalized
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
  return toLocalIsoDate(d)
}

function previousIsoDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() - 1)
  return toLocalIsoDate(d)
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

function toCompactDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const d = new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

function countPredictionDateRuns(dates: string[]): number {
  if (dates.length === 0) return 0
  const ordered = [...dates].sort(compareIsoDate)
  let runs = 1
  for (let idx = 1; idx < ordered.length; idx += 1) {
    const previous = ordered[idx - 1]
    const current = ordered[idx]
    if (!previous || !current) continue
    if (current !== nextIsoDate(previous)) runs += 1
  }
  return runs
}

function formatPredictionHolidayOptionDates(option: PredictionHolidayPlanOption): string {
  if (option.style === 'stretch') {
    return `${toPrettyDate(option.startDate)} → ${toPrettyDate(option.endDate)}`
  }
  const labels = option.leaveDates.map((date) => toCompactDate(date))
  if (labels.length <= 4) return labels.join(' · ')
  return `${labels.slice(0, 4).join(' · ')} · +${labels.length - 4} more`
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLocalIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1)
}

function compareIsoDate(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function normalizePredictionRanges(ranges: PredictionDateRange[]): PredictionDateRange[] {
  if (!Array.isArray(ranges)) return []
  const clean = ranges
    .map((range) => {
      const start = typeof range.start === 'string' ? range.start : ''
      const end = typeof range.end === 'string' ? range.end : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null
      return compareIsoDate(start, end) <= 0 ? { start, end } : { start: end, end: start }
    })
    .filter((range): range is PredictionDateRange => Boolean(range))
    .sort((a, b) => compareIsoDate(a.start, b.start))

  const merged: PredictionDateRange[] = []
  for (const range of clean) {
    const last = merged[merged.length - 1]
    if (!last) {
      merged.push(range)
      continue
    }
    const adjacencyStart = nextIsoDate(last.end)
    if (compareIsoDate(range.start, adjacencyStart) <= 0) {
      if (compareIsoDate(range.end, last.end) > 0) {
        last.end = range.end
      }
      continue
    }
    merged.push(range)
  }
  return merged
}

function buildPredictionGapRanges(ranges: PredictionDateRange[]): PredictionDateRange[] {
  const normalized = normalizePredictionRanges(ranges)
  if (normalized.length <= 1) return []
  const gaps: PredictionDateRange[] = []
  for (let idx = 0; idx < normalized.length - 1; idx += 1) {
    const current = normalized[idx]
    const next = normalized[idx + 1]
    if (!current || !next) continue
    const gapStart = nextIsoDate(current.end)
    const gapEnd = previousIsoDate(next.start)
    if (compareIsoDate(gapStart, gapEnd) <= 0) {
      gaps.push({ start: gapStart, end: gapEnd })
    }
  }
  return gaps
}

function predictionRequiredAttended(
  conducted: number,
  targetPct: number,
  safetyMode: PredictionSafetyMode,
): number {
  const ratio = targetPct / 100
  const borderRequired = Math.ceil(conducted * ratio)
  return safetyMode === 'plus1' ? borderRequired + 1 : borderRequired
}

function isPredictionSafe(
  conducted: number,
  absent: number,
  targetPct: number,
  safetyMode: PredictionSafetyMode,
): boolean {
  if (conducted <= 0) return true
  const attended = conducted - absent
  return attended >= predictionRequiredAttended(conducted, targetPct, safetyMode)
}

function predictionClassesNeededForSafety(
  conducted: number,
  absent: number,
  targetPct: number,
  safetyMode: PredictionSafetyMode,
): number {
  if (conducted <= 0) return 0
  if (safetyMode === 'border') {
    return classesNeededToReach(conducted, absent, targetPct)
  }
  if (isPredictionSafe(conducted, absent, targetPct, safetyMode)) return 0
  const fallback = classesNeededToReach(conducted, absent, targetPct)
  const probe = Math.max(0, fallback)
  for (let tries = 0; tries < 5000; tries += 1) {
    const next = probe + tries
    if (isPredictionSafe(conducted + next, absent, targetPct, safetyMode)) return next
  }
  return Math.max(0, fallback)
}

function isPredictionCommunityHardBlock(title: string): boolean {
  return /\b(event|fest|festival|workshop|seminar|symposium|hackathon|conference|cultural|sports|competition|placement|training)\b/i.test(title)
}

function predictionGoalToDays(goal: PredictionHolidayGoal): number {
  if (goal === '5d') return 5
  if (goal === '1w') return 7
  if (goal === '2w') return 14
  return 0
}

function buildPredictionHolidayOptimizerModel({
  attendance,
  calendarEvents,
  timetableByDay,
  dayOrder,
  targetPct,
  safetyMode,
}: {
  attendance: AttendanceCourse[]
  calendarEvents: AcademicCalendarEvent[]
  timetableByDay: TimetableByDay
  dayOrder: number | null
  targetPct: number
  safetyMode: PredictionSafetyMode
}): HolidayOptimizerModel | null {
  if (attendance.length === 0 || calendarEvents.length === 0) return null
  const horizonStart = toLocalIsoDate(new Date())
  const eventDates = calendarEvents.map((event) => event.date).filter((date) => isIsoDate(date)).sort(compareIsoDate)
  const horizonEnd = eventDates[eventDates.length - 1] ?? null
  if (!horizonEnd || compareIsoDate(horizonEnd, horizonStart) < 0) return null

  const constraints: HolidayOptimizerCourseConstraint[] = attendance.map((course, index) => ({
    index,
    courseKey: attendanceCourseKey(course),
    code: course.code,
    type: course.type,
    title: course.title,
    baseConducted: course.conducted,
    baseAbsent: course.absent,
    futureClasses: 0,
    maxSkipRaw: 0,
    maxSkipConstraint: 0,
    bestPossiblePct: course.percent,
    requiredToRecover: 0,
    isBlocker: false,
    riskWeight: 1,
  }))
  const constraintIndexByCourseKey = new Map<string, number>()
  for (const constraint of constraints) {
    constraintIndexByCourseKey.set(constraint.courseKey, constraint.index)
  }

  const eventMap = new Map<string, AcademicCalendarEvent[]>()
  for (const event of calendarEvents) {
    if (!isIsoDate(event.date) || compareIsoDate(event.date, horizonStart) < 0 || compareIsoDate(event.date, horizonEnd) > 0) continue
    const list = eventMap.get(event.date)
    if (list) {
      list.push(event)
    } else {
      eventMap.set(event.date, [event])
    }
  }

  const days: HolidayOptimizerDay[] = []
  const hardBlockDates: string[] = []
  const unmatchedDates: string[] = []
  const todayIso = toLocalIsoDate(new Date())
  for (let cursor = parseLocalIsoDate(horizonStart); compareIsoDate(toLocalIsoDate(cursor), horizonEnd) <= 0; cursor.setDate(cursor.getDate() + 1)) {
    const date = toLocalIsoDate(cursor)
    const dayEvents = eventMap.get(date) ?? []
    const hasHoliday = dayEvents.some((event) => event.type === 'holiday')
    const hasExam = dayEvents.some((event) => event.type === 'exam')
    const hasCommunity = dayEvents.some((event) => event.type === 'event' && isPredictionCommunityHardBlock(event.title))
    const hardBlockReason: HolidayOptimizerDay['hardBlockReason'] = hasHoliday
      ? 'holiday'
      : hasExam
        ? 'exam'
        : hasCommunity
          ? 'community'
          : null

    const mappedDayOrder = dayEvents.find((event) => typeof event.dayOrder === 'number' && event.dayOrder >= 1 && event.dayOrder <= 5)?.dayOrder ?? null
    const resolvedDayOrder = mappedDayOrder ?? (date === todayIso ? dayOrder : null)
    const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6
    const plannerSignalsWorking = dayEvents.some((event) => event.type === 'working' || typeof event.dayOrder === 'number')
    let isUnmatched = !hardBlockReason && !resolvedDayOrder && plannerSignalsWorking && !isWeekend

    const impacts = new Array<number>(constraints.length).fill(0)
    let classCount = 0
    if (resolvedDayOrder && resolvedDayOrder >= 1 && resolvedDayOrder <= 5) {
      const classRows = getTodayClasses(resolvedDayOrder, attendance, timetableByDay)
        .filter((row): row is typeof row & { course: AttendanceCourse } => row.course !== null)
      classCount = classRows.length
      for (const row of classRows) {
        const idx = constraintIndexByCourseKey.get(attendanceCourseKey(row.course))
        if (idx === undefined) continue
        impacts[idx] = (impacts[idx] ?? 0) + 1
      }
    }
    if (!hardBlockReason && resolvedDayOrder && classCount === 0 && plannerSignalsWorking) {
      isUnmatched = true
    }

    for (let idx = 0; idx < impacts.length; idx += 1) {
      constraints[idx]!.futureClasses += impacts[idx] ?? 0
    }

    const leaveEligible = !hardBlockReason && !isUnmatched && classCount > 0
    if (hardBlockReason) hardBlockDates.push(date)
    if (isUnmatched) unmatchedDates.push(date)

    days.push({
      date,
      classCount,
      hardBlock: Boolean(hardBlockReason),
      hardBlockReason,
      isUnmatched,
      leaveEligible,
      skipCost: 0,
      impacts,
    })
  }

  const blockers: PredictionHolidayBlocker[] = []
  for (const constraint of constraints) {
    const conductedAtHorizon = constraint.baseConducted + constraint.futureClasses
    const absentIfAttendAll = constraint.baseAbsent
    const bestPossiblePct = conductedAtHorizon > 0
      ? ((conductedAtHorizon - absentIfAttendAll) / conductedAtHorizon) * 100
      : 100
    const requiredAttended = predictionRequiredAttended(conductedAtHorizon, targetPct, safetyMode)
    const maxSkipRaw = conductedAtHorizon - requiredAttended - constraint.baseAbsent
    const isBlocker = !isPredictionSafe(conductedAtHorizon, absentIfAttendAll, targetPct, safetyMode)
    const requiredToRecover = isBlocker
      ? predictionClassesNeededForSafety(conductedAtHorizon, absentIfAttendAll, targetPct, safetyMode)
      : 0
    const maxSkipConstraint = Math.max(0, Math.min(constraint.futureClasses, Math.floor(maxSkipRaw)))
    const currentPct = constraint.baseConducted > 0
      ? ((constraint.baseConducted - constraint.baseAbsent) / constraint.baseConducted) * 100
      : 100
    const pressure = Math.max(0, 78 - currentPct) / 8
    const lowHeadroomPenalty = !isBlocker && maxSkipConstraint <= 2 ? 1.25 : 0

    constraint.maxSkipRaw = Math.floor(maxSkipRaw)
    constraint.maxSkipConstraint = maxSkipConstraint
    constraint.bestPossiblePct = bestPossiblePct
    constraint.requiredToRecover = requiredToRecover
    constraint.isBlocker = isBlocker
    constraint.riskWeight = 1 + pressure + lowHeadroomPenalty + (isBlocker ? 2.5 : 0)

    if (isBlocker) {
      blockers.push({
        courseKey: constraint.courseKey,
        code: constraint.code,
        type: constraint.type,
        title: constraint.title,
        bestPossiblePct,
        requiredToRecover,
      })
    }
  }

  const readinessNeeds: PredictionHolidayReadinessNeed[] = []
  const prepAttendDates: string[] = []
  const prepAttendByCourse = new Array<number>(constraints.length).fill(0)
  const readinessState = constraints.map((constraint) => ({
    conducted: constraint.baseConducted,
    absent: constraint.baseAbsent,
  }))
  const allSafeAtState = () => readinessState.every((state, idx) => {
    const constraint = constraints[idx]
    if (!constraint) return true
    return isPredictionSafe(state.conducted, state.absent, targetPct, safetyMode)
  })

  let readinessAttendClasses = 0
  let readinessDate: string | null = null
  const alreadySafeNow = allSafeAtState()
  if (!alreadySafeNow) {
    for (const day of days) {
      if (day.hardBlock || day.isUnmatched || day.classCount <= 0) continue
      prepAttendDates.push(day.date)
      readinessAttendClasses += day.classCount
      for (let idx = 0; idx < day.impacts.length; idx += 1) {
        const impact = day.impacts[idx] ?? 0
        if (impact <= 0) continue
        readinessState[idx]!.conducted += impact
        prepAttendByCourse[idx] = (prepAttendByCourse[idx] ?? 0) + impact
      }
      if (allSafeAtState()) {
        readinessDate = day.date
        break
      }
    }
  }
  const canReachReadiness = alreadySafeNow || readinessDate !== null
  if (alreadySafeNow) {
    readinessAttendClasses = 0
  }
  if (readinessDate) {
    for (let idx = 0; idx < constraints.length; idx += 1) {
      const constraint = constraints[idx]
      if (!constraint) continue
      const wasSafeInitially = isPredictionSafe(constraint.baseConducted, constraint.baseAbsent, targetPct, safetyMode)
      if (wasSafeInitially) continue
      const neededClasses = prepAttendByCourse[idx] ?? 0
      if (neededClasses <= 0) continue
      readinessNeeds.push({
        courseKey: constraint.courseKey,
        code: constraint.code,
        type: constraint.type,
        title: constraint.title,
        neededClasses,
      })
    }
  } else if (!canReachReadiness) {
    for (const constraint of constraints) {
      const neededClasses = Math.max(0, constraint.requiredToRecover)
      if (neededClasses <= 0) continue
      readinessNeeds.push({
        courseKey: constraint.courseKey,
        code: constraint.code,
        type: constraint.type,
        title: constraint.title,
        neededClasses,
      })
    }
  }
  readinessNeeds.sort((a, b) => b.neededClasses - a.neededClasses || a.code.localeCompare(b.code))
  const readinessAttendDays = prepAttendDates.length

  for (const day of days) {
    if (day.classCount <= 0) {
      day.skipCost = 0
      continue
    }
    let cost = 0
    for (let idx = 0; idx < day.impacts.length; idx += 1) {
      const impact = day.impacts[idx] ?? 0
      if (impact <= 0) continue
      const constraint = constraints[idx]
      if (!constraint) continue
      const blockerPenalty = constraint.isBlocker ? 2.4 : 0
      cost += impact * (1 + constraint.riskWeight + blockerPenalty)
    }
    day.skipCost = Number(cost.toFixed(3))
  }

  const candidateIndexes: number[] = []
  const readinessCutoff = readinessDate
  for (let idx = 0; idx < days.length; idx += 1) {
    const day = days[idx]
    if (!day?.leaveEligible) continue
    if (!canReachReadiness) continue
    if (readinessCutoff && compareIsoDate(day.date, readinessCutoff) <= 0) continue
    candidateIndexes.push(idx)
  }

  return {
    horizonStart,
    horizonEnd,
    targetPct,
    safetyMode,
    readinessDate,
    readinessAttendDays,
    readinessAttendClasses,
    prepAttendDates,
    readinessNeeds,
    constraints,
    days,
    candidateIndexes,
    hardBlockDates,
    unmatchedDates,
    blockers,
  }
}

function predictionHolidayCanAddImpacts(
  counts: number[],
  impacts: number[],
  constraints: HolidayOptimizerCourseConstraint[],
): boolean {
  for (let idx = 0; idx < constraints.length; idx += 1) {
    const constraint = constraints[idx]
    if (!constraint) continue
    if ((counts[idx] ?? 0) + (impacts[idx] ?? 0) > constraint.maxSkipConstraint) return false
  }
  return true
}

function predictionHolidayAddImpacts(counts: number[], impacts: number[]): void {
  for (let idx = 0; idx < impacts.length; idx += 1) {
    counts[idx] = (counts[idx] ?? 0) + (impacts[idx] ?? 0)
  }
}

function predictionHolidaySubImpacts(counts: number[], impacts: number[]): void {
  for (let idx = 0; idx < impacts.length; idx += 1) {
    counts[idx] = (counts[idx] ?? 0) - (impacts[idx] ?? 0)
  }
}

function predictionHolidaySafetyMargin(
  constraints: HolidayOptimizerCourseConstraint[],
  leaveCounts: number[],
): number {
  let margin: number | null = null
  for (let idx = 0; idx < constraints.length; idx += 1) {
    const constraint = constraints[idx]
    if (!constraint) continue
    const local = constraint.maxSkipConstraint - (leaveCounts[idx] ?? 0)
    margin = margin === null ? local : Math.min(margin, local)
  }
  return margin ?? 0
}

function buildPredictionHolidayPlan(
  model: HolidayOptimizerModel,
  style: HolidayOptimizerPlan['style'],
  indexes: number[],
): HolidayOptimizerPlan | null {
  if (indexes.length === 0) return null
  const ordered = [...indexes].sort((a, b) => a - b)
  const leaveCounts = new Array<number>(model.constraints.length).fill(0)
  let totalSkipCost = 0
  for (const dayIdx of ordered) {
    const day = model.days[dayIdx]
    if (!day) continue
    predictionHolidayAddImpacts(leaveCounts, day.impacts)
    totalSkipCost += day.skipCost
  }
  if (!predictionHolidayCanAddImpacts(new Array<number>(model.constraints.length).fill(0), leaveCounts, model.constraints)) {
    return null
  }

  const leaveDates = ordered.map((idx) => model.days[idx]?.date).filter((date): date is string => Boolean(date))
  if (leaveDates.length === 0) return null
  const firstDate = leaveDates[0]!
  const lastDate = leaveDates[leaveDates.length - 1]!
  const selectedSet = new Set(ordered)
  const firstIndex = ordered[0]!
  let attendDaysBefore = 0
  for (const candidateIdx of model.candidateIndexes) {
    if (candidateIdx >= firstIndex) break
    if (!selectedSet.has(candidateIdx)) attendDaysBefore += 1
  }
  const compactSpanDays = Math.max(
    1,
    Math.floor((parseLocalIsoDate(lastDate).getTime() - parseLocalIsoDate(firstDate).getTime()) / (24 * 60 * 60 * 1000)) + 1,
  )

  return {
    style,
    indexes: ordered,
    leaveDates,
    leaveCounts,
    leaveDays: leaveDates.length,
    startDate: firstDate,
    endDate: lastDate,
    attendDaysBefore,
    safetyMarginClasses: predictionHolidaySafetyMargin(model.constraints, leaveCounts),
    totalSkipCost: Number(totalSkipCost.toFixed(3)),
    compactSpanDays,
  }
}

function rankPredictionHolidayPlan(a: HolidayOptimizerPlan, b: HolidayOptimizerPlan): number {
  if (a.leaveDays !== b.leaveDays) return b.leaveDays - a.leaveDays
  if (a.safetyMarginClasses !== b.safetyMarginClasses) return b.safetyMarginClasses - a.safetyMarginClasses
  if (a.totalSkipCost !== b.totalSkipCost) return a.totalSkipCost - b.totalSkipCost
  if (a.compactSpanDays !== b.compactSpanDays) return a.compactSpanDays - b.compactSpanDays
  return compareIsoDate(a.startDate, b.startDate)
}

function solvePredictionHolidayContiguousFixed(
  model: HolidayOptimizerModel,
  length: number,
): HolidayOptimizerPlan | null {
  if (length <= 0) return null
  let best: HolidayOptimizerPlan | null = null

  let segmentStart = -1
  for (let idx = 0; idx <= model.days.length; idx += 1) {
    const day = model.days[idx]
    const eligible = Boolean(day?.leaveEligible)
    if (eligible && segmentStart < 0) segmentStart = idx
    if (eligible) continue
    if (segmentStart < 0) continue
    const segmentEnd = idx - 1
    const segmentLength = segmentEnd - segmentStart + 1
    if (segmentLength >= length) {
      const counts = new Array<number>(model.constraints.length).fill(0)
      for (let fill = segmentStart; fill < segmentStart + length; fill += 1) {
        const fillDay = model.days[fill]
        if (!fillDay) continue
        predictionHolidayAddImpacts(counts, fillDay.impacts)
      }
      for (let start = segmentStart; start <= segmentEnd - length + 1; start += 1) {
        if (start > segmentStart) {
          const outDay = model.days[start - 1]
          const inDay = model.days[start + length - 1]
          if (outDay) predictionHolidaySubImpacts(counts, outDay.impacts)
          if (inDay) predictionHolidayAddImpacts(counts, inDay.impacts)
        }
        if (!predictionHolidayCanAddImpacts(new Array<number>(model.constraints.length).fill(0), counts, model.constraints)) continue
        const indexes = []
        for (let pick = start; pick < start + length; pick += 1) indexes.push(pick)
        const plan = buildPredictionHolidayPlan(model, 'stretch', indexes)
        if (!plan) continue
        if (!best || rankPredictionHolidayPlan(plan, best) < 0) best = plan
      }
    }
    segmentStart = -1
  }
  return best
}

function solvePredictionHolidayContiguousMax(model: HolidayOptimizerModel): HolidayOptimizerPlan | null {
  if (model.candidateIndexes.length === 0) return null
  const counts = new Array<number>(model.constraints.length).fill(0)
  let best: HolidayOptimizerPlan | null = null
  let start = 0
  let end = 0
  while (start < model.days.length) {
    if (!model.days[start]?.leaveEligible) {
      start += 1
      end = Math.max(end, start)
      continue
    }

    while (end < model.days.length && model.days[end]?.leaveEligible) {
      const day = model.days[end]
      if (!day || !predictionHolidayCanAddImpacts(counts, day.impacts, model.constraints)) break
      predictionHolidayAddImpacts(counts, day.impacts)
      end += 1
    }

    if (end > start) {
      const indexes = []
      for (let idx = start; idx < end; idx += 1) indexes.push(idx)
      const plan = buildPredictionHolidayPlan(model, 'stretch', indexes)
      if (plan && (!best || rankPredictionHolidayPlan(plan, best) < 0)) best = plan
    }

    if (end === start) {
      start += 1
      end = Math.max(end, start)
      continue
    }

    const outDay = model.days[start]
    if (outDay) predictionHolidaySubImpacts(counts, outDay.impacts)
    start += 1

    while (start < end && !model.days[start]?.leaveEligible) {
      start += 1
    }
    if (start > end) end = start
  }
  return best
}

function repairPredictionHolidayScatteredCompactness(
  model: HolidayOptimizerModel,
  indexes: number[],
): number[] {
  let best = [...indexes].sort((a, b) => a - b)
  if (best.length <= 1) return best
  for (let pass = 0; pass < 4; pass += 1) {
    const currentPlan = buildPredictionHolidayPlan(model, 'scattered', best)
    if (!currentPlan) break
    const selected = new Set(best)
    const pool = model.candidateIndexes.filter((idx) => !selected.has(idx))
    const edgeIndexes = Array.from(new Set([best[0], best[best.length - 1]])).filter((idx): idx is number => typeof idx === 'number')
    let improved = false
    let chosen = best
    let chosenPlan = currentPlan
    for (const edge of edgeIndexes) {
      for (const candidate of pool) {
        const trial = best.map((idx) => (idx === edge ? candidate : idx)).sort((a, b) => a - b)
        if (new Set(trial).size !== trial.length) continue
        let hasAdjacent = false
        for (let i = 1; i < trial.length; i += 1) {
          if (trial[i] === trial[i - 1] + 1) {
            hasAdjacent = true
            break
          }
        }
        if (hasAdjacent) continue
        const trialPlan = buildPredictionHolidayPlan(model, 'scattered', trial)
        if (!trialPlan || trialPlan.leaveDays !== currentPlan.leaveDays) continue
        const betterCompact =
          trialPlan.compactSpanDays < chosenPlan.compactSpanDays ||
          (trialPlan.compactSpanDays === chosenPlan.compactSpanDays && trialPlan.totalSkipCost < chosenPlan.totalSkipCost)
        if (!betterCompact) continue
        chosen = trial
        chosenPlan = trialPlan
        improved = true
      }
    }
    if (!improved) break
    best = chosen
  }
  return best
}

function solvePredictionHolidayScatteredGreedy(
  model: HolidayOptimizerModel,
  order: number[],
  maxDays: number,
  contiguousCap: number = Number.POSITIVE_INFINITY,
): HolidayOptimizerPlan | null {
  const counts = new Array<number>(model.constraints.length).fill(0)
  const selected: number[] = []
  const selectedSet = new Set<number>()
  for (const idx of order) {
    if (maxDays > 0 && selected.length >= maxDays) break
    const day = model.days[idx]
    if (!day) continue
    if (contiguousCap < Number.POSITIVE_INFINITY && selected.length > 0) {
      const trial = [...selected, idx].sort((a, b) => a - b)
      let longestRun = 1
      let currentRun = 1
      for (let i = 1; i < trial.length; i += 1) {
        if (trial[i] === trial[i - 1] + 1) {
          currentRun += 1
          longestRun = Math.max(longestRun, currentRun)
        } else {
          currentRun = 1
        }
      }
      if (longestRun > contiguousCap) continue
    }
    if (!predictionHolidayCanAddImpacts(counts, day.impacts, model.constraints)) continue
    if (selectedSet.has(idx - 1) || selectedSet.has(idx + 1)) continue
    predictionHolidayAddImpacts(counts, day.impacts)
    selected.push(idx)
    selectedSet.add(idx)
  }
  if (selected.length === 0) return null
  const repaired = repairPredictionHolidayScatteredCompactness(model, selected)
  return buildPredictionHolidayPlan(model, 'scattered', repaired)
}

function predictionHolidayReasonText(reasonCode: PredictionHolidayReasonCode): string {
  if (reasonCode === 'best_long_break_safe_margin') return 'Best long break with safe margin across all courses.'
  if (reasonCode === 'safer_alternative_more_buffer') return 'Safer alternative with stronger attendance buffer.'
  if (reasonCode === 'best_effort_with_blockers') return 'Best-effort plan while some courses are currently unrecoverable.'
  return 'Max leave possible without crossing the selected threshold.'
}

function toPredictionHolidayPlanOption(
  model: HolidayOptimizerModel,
  plan: HolidayOptimizerPlan,
  id: string,
  label: string,
  reasonCode: PredictionHolidayReasonCode,
): PredictionHolidayPlanOption {
  const impactedCourses = model.constraints
    .map((constraint, idx) => {
      const leaveClasses = plan.leaveCounts[idx] ?? 0
      if (leaveClasses <= 0) return null
      const projectedConducted = constraint.baseConducted + constraint.futureClasses
      const projectedAbsent = constraint.baseAbsent + leaveClasses
      const projectedPct = projectedConducted > 0
        ? ((projectedConducted - projectedAbsent) / projectedConducted) * 100
        : 100
      const safeBufferClasses = constraint.maxSkipConstraint - leaveClasses
      return {
        courseKey: constraint.courseKey,
        code: constraint.code,
        type: constraint.type,
        title: constraint.title,
        leaveClasses,
        projectedPct,
        safeBufferClasses,
        atRisk: !isPredictionSafe(projectedConducted, projectedAbsent, model.targetPct, model.safetyMode),
      } satisfies PredictionHolidayPlanCourseImpact
    })
    .filter((entry): entry is PredictionHolidayPlanCourseImpact => Boolean(entry))
    .sort((a, b) => b.leaveClasses - a.leaveClasses || a.projectedPct - b.projectedPct)

  return {
    id,
    label,
    style: plan.style,
    leaveDates: plan.leaveDates,
    leaveDays: plan.leaveDays,
    startDate: plan.startDate,
    endDate: plan.endDate,
    attendDaysBefore: plan.attendDaysBefore,
    safetyMarginClasses: plan.safetyMarginClasses,
    totalSkipCost: plan.totalSkipCost,
    reasonCode,
    reasonText: predictionHolidayReasonText(reasonCode),
    impactedCourses,
  }
}

function buildPredictionHolidayOptimizerSummary(
  model: HolidayOptimizerModel,
  goal: PredictionHolidayGoal,
  style: PredictionHolidayPlanStyle,
): PredictionHolidayOptimizerSummary {
  const hasBlockers = model.blockers.length > 0
  if (hasBlockers) {
    return {
      generatedAt: new Date().toISOString(),
      horizonStart: model.horizonStart,
      horizonEnd: model.horizonEnd,
      targetPct: model.targetPct,
      safetyMode: model.safetyMode,
      goal,
      style,
      readinessDate: model.readinessDate,
      readinessAttendDays: model.readinessAttendDays,
      readinessAttendClasses: model.readinessAttendClasses,
      prepAttendDates: model.prepAttendDates,
      readinessNeeds: model.readinessNeeds,
      hardBlockDates: model.hardBlockDates,
      unmatchedDates: model.unmatchedDates,
      maxContiguousLeaveDays: 0,
      maxScatteredLeaveDays: 0,
      blockers: model.blockers,
      options: [],
    }
  }

  const requestedDays = predictionGoalToDays(goal)
  const contiguousMax = solvePredictionHolidayContiguousMax(model)
  const contiguousGoal = requestedDays > 0
    ? (solvePredictionHolidayContiguousFixed(model, requestedDays) ?? contiguousMax)
    : contiguousMax
  const contiguousPrimary = contiguousGoal ?? contiguousMax

  const candidateIndexes = model.candidateIndexes
  const cheapOrder = [...candidateIndexes].sort((a, b) => {
    const costDelta = (model.days[a]?.skipCost ?? 0) - (model.days[b]?.skipCost ?? 0)
    if (costDelta !== 0) return costDelta
    return compareIsoDate(model.days[a]?.date ?? '', model.days[b]?.date ?? '')
  })
  const middle = candidateIndexes[Math.floor(candidateIndexes.length / 2)] ?? 0
  const compactOrder = [...candidateIndexes].sort((a, b) => {
    const idxA = a
    const idxB = b
    const distA = Math.abs(idxA - middle)
    const distB = Math.abs(idxB - middle)
    if (distA !== distB) return distA - distB
    const costDelta = (model.days[a]?.skipCost ?? 0) - (model.days[b]?.skipCost ?? 0)
    if (costDelta !== 0) return costDelta
    return compareIsoDate(model.days[a]?.date ?? '', model.days[b]?.date ?? '')
  })
  const scatterCap = requestedDays > 0 ? requestedDays : 0
  const contiguousGuard = contiguousPrimary && contiguousPrimary.leaveDays >= 2
    ? Math.max(1, contiguousPrimary.leaveDays - 1)
    : Number.POSITIVE_INFINITY
  const scatteredCheap = solvePredictionHolidayScatteredGreedy(model, cheapOrder, scatterCap, contiguousGuard)
  const scatteredCompact = solvePredictionHolidayScatteredGreedy(model, compactOrder, scatterCap, contiguousGuard)
  const scatteredGoal = (() => {
    if (scatteredCheap && scatteredCompact) {
      return rankPredictionHolidayPlan(scatteredCheap, scatteredCompact) <= 0 ? scatteredCheap : scatteredCompact
    }
    return scatteredCheap ?? scatteredCompact
  })()
  const scatteredMax = (() => {
    const planCheap = solvePredictionHolidayScatteredGreedy(model, cheapOrder, 0, contiguousGuard)
    const planCompact = solvePredictionHolidayScatteredGreedy(model, compactOrder, 0, contiguousGuard)
    if (planCheap && planCompact) {
      return rankPredictionHolidayPlan(planCheap, planCompact) <= 0 ? planCheap : planCompact
    }
    return planCheap ?? planCompact
  })()

  const scatteredPrimary = scatteredGoal ?? scatteredMax
  const allPlans: HolidayOptimizerPlan[] = [
    contiguousPrimary,
    scatteredPrimary,
    contiguousMax,
    scatteredMax,
  ].filter((entry): entry is HolidayOptimizerPlan => Boolean(entry))

  const primary = style === 'stretch'
    ? contiguousPrimary
    : style === 'scattered'
      ? scatteredPrimary
      : (contiguousPrimary ?? scatteredPrimary)

  let saferOption: HolidayOptimizerPlan | null = null
  if (contiguousPrimary && contiguousPrimary.leaveDays > 1) {
    const safer = solvePredictionHolidayContiguousFixed(model, contiguousPrimary.leaveDays - 1)
    if (safer && safer.safetyMarginClasses > contiguousPrimary.safetyMarginClasses) {
      saferOption = safer
    }
  }
  if (!saferOption && primary) {
    saferOption = allPlans
      .filter((plan) => plan.leaveDays <= primary.leaveDays)
      .sort((a, b) => {
        if (a.safetyMarginClasses !== b.safetyMarginClasses) return b.safetyMarginClasses - a.safetyMarginClasses
        return rankPredictionHolidayPlan(a, b)
      })[0] ?? null
    if (saferOption && saferOption.safetyMarginClasses <= primary.safetyMarginClasses) {
      saferOption = null
    }
  }

  const maxOption = allPlans.sort(rankPredictionHolidayPlan)[0] ?? null
  const options: PredictionHolidayPlanOption[] = []
  const seen = new Set<string>()
  const pushOption = (
    plan: HolidayOptimizerPlan | null,
    fallbackId: string,
    label: string,
    preferredReason: PredictionHolidayReasonCode,
  ) => {
    if (!plan) return
    const uniqueKey = `${plan.style}:${plan.leaveDates.join(',')}`
    if (seen.has(uniqueKey)) return
    seen.add(uniqueKey)
    options.push(toPredictionHolidayPlanOption(model, plan, fallbackId, label, preferredReason))
  }

  pushOption(primary, 'opt-primary', '🔥 Best break', 'best_long_break_safe_margin')
  pushOption(saferOption, 'opt-safer', '⚖️ Safer option', 'safer_alternative_more_buffer')
  pushOption(maxOption, 'opt-max', '📈 Max possible', 'max_leave_without_risk')
  if (options.length < 3) {
    const fallbackPlans = [...allPlans].sort(rankPredictionHolidayPlan)
    for (const plan of fallbackPlans) {
      if (options.length >= 3) break
      const isSecond = options.length === 1
      pushOption(
        plan,
        `opt-alt-${options.length + 1}`,
        isSecond ? '⚖️ Alternative' : '📈 Alternative',
        isSecond ? 'safer_alternative_more_buffer' : 'max_leave_without_risk',
      )
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    horizonStart: model.horizonStart,
    horizonEnd: model.horizonEnd,
    targetPct: model.targetPct,
    safetyMode: model.safetyMode,
    goal,
    style,
    readinessDate: model.readinessDate,
    readinessAttendDays: model.readinessAttendDays,
    readinessAttendClasses: model.readinessAttendClasses,
    prepAttendDates: model.prepAttendDates,
    readinessNeeds: model.readinessNeeds,
    hardBlockDates: model.hardBlockDates,
    unmatchedDates: model.unmatchedDates,
    maxContiguousLeaveDays: contiguousMax?.leaveDays ?? 0,
    maxScatteredLeaveDays: scatteredMax?.leaveDays ?? 0,
    blockers: model.blockers,
    options: options.slice(0, 3),
  }
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

function normalizeCourseCode(code: string): string {
  return code.trim().toUpperCase()
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
  return pct >= 75 ? "ok" : "danger"
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

function shortCourseTitle(title: string): string {
  const cleaned = title.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= 34) return cleaned
  return `${cleaned.slice(0, 31).trimEnd()}...`
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 15 9 10 13 14 20 7" />
      <polyline points="15 7 20 7 20 12" />
    </svg>
  ),
  TrendingUp: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  X: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Calculator: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.05" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="7.4" />
      <circle cx="12" cy="12" r="2.1" />
      <path d="M12 4.6v2.2" />
      <path d="M12 17.2v2.2" />
      <path d="M4.6 12h2.2" />
      <path d="M17.2 12h2.2" />
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
          <span>Loading academic calendar…</span>
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
function HomeScreen({ student, fallbackName, attendance, timetableByDay, refreshing, onRefresh, dayOrder, onDayOrderChange, lastUpdated, dataLoading, onOpenCooking }: {
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
  onOpenCooking: () => void
}) {
  const overall = overallPct(attendance)
  const animatedOverall = useCountUp(overall)
  const below = attendance.filter(c => c.percent < 75)
  const todayClasses = groupClasses(getTodayClasses(dayOrder, attendance, timetableByDay))
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
  const normalizedCurrentVersion = CURRENT_APP_VERSION.trim().replace(/^v/i, '')
  const homeVersionLabel = `🪸 Updated version : v${normalizedCurrentVersion}`

  return (
    <>
      {/* Welcome */}
      <div className="welcome-block">
        <div className="welcome-row">
          <div>
            <div className="welcome-greeting">{greeting},</div>
            <div className="welcome-name">{displayName}</div>
          </div>
          <div className="welcome-row-actions">
            <button
              type="button"
              className="welcome-version-chip"
              onClick={onOpenCooking}
              aria-label="Open changelog"
              title="Open changelog"
            >
              <AnimatedShinyText className="welcome-version-text" shimmerWidth={240}>
                {homeVersionLabel}
              </AnimatedShinyText>
            </button>
            <span className="day-badge" onClick={() => setShowDayPicker(true)}>
              {dayOrder ? `Day ${dayOrder}` : 'No Day Order'}
            </span>
          </div>
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
          {todayClasses.map(cls => {
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
function AttendanceScreen({
  attendance,
  parserStatus,
  parserHint,
  calendarEvents,
  timetableByDay,
  dayOrder,
  predictionCache,
  onPredictionCacheChange,
  quickMenuOpen,
}: {
  attendance: AttendanceCourse[]
  parserStatus?: 'ok' | 'structure_mismatch'
  parserHint?: string
  calendarEvents: AcademicCalendarEvent[]
  timetableByDay: TimetableByDay
  dayOrder: number | null
  predictionCache: PredictionCachePayload | null
  onPredictionCacheChange: (payload: PredictionCachePayload | null) => void
  quickMenuOpen: boolean
}) {
  const [activeInsight, setActiveInsight] = useState<"planner" | "prediction" | null>(null)
  const plannerCourses = useMemo(
    () => attendance.map(c => ({ key: `${c.code}|${c.type}`, course: c })),
    [attendance]
  )
  const [plannerCourseKey, setPlannerCourseKey] = useState('')
  const [plannedLeaves, setPlannedLeaves] = useState(0)
  const [recoveryClasses, setRecoveryClasses] = useState(3)

  // Prediction state
  const [predictionRanges, setPredictionRanges] = useState<PredictionDateRange[]>(() => {
    if (predictionCache && Array.isArray(predictionCache.ranges)) {
      return normalizePredictionRanges(predictionCache.ranges)
    }
    if (predictionCache?.startDate && predictionCache?.endDate) {
      return normalizePredictionRanges([{ start: predictionCache.startDate, end: predictionCache.endDate }])
    }
    return []
  })
  const [predictionDraftRange, setPredictionDraftRange] = useState<DateRange | undefined>(undefined)
  const [predictionActiveMonth, setPredictionActiveMonth] = useState<string>(() => {
    if (predictionCache?.activeMonth) return predictionCache.activeMonth
    return toLocalIsoDate(new Date()).slice(0, 7)
  })
  const [predictionLeaveType, setPredictionLeaveType] = useState<PredictionLeaveType>(() => (
    predictionCache?.leaveType ?? 'absent'
  ))
  const [predictionGapHandling, setPredictionGapHandling] = useState<PredictionGapHandling>(() => (
    predictionCache?.gapHandling ?? 'none'
  ))
  const [predictionResults, setPredictionResults] = useState<PredictionSummary | null>(() => (
    predictionCache?.summary ?? null
  ))
  const [predictionModeActive, setPredictionModeActive] = useState<boolean>(() => Boolean(predictionCache?.summary))
  const [predictionSelectedRangeIndex, setPredictionSelectedRangeIndex] = useState(0)
  const [predictionHolidayGoal, setPredictionHolidayGoal] = useState<PredictionHolidayGoal>(() => (
    normalizePredictionHolidayGoal(predictionCache?.holidayOptimizer?.goal)
  ))
  const [predictionHolidayStyle, setPredictionHolidayStyle] = useState<PredictionHolidayPlanStyle>(() => (
    normalizePredictionHolidayPlanStyle(predictionCache?.holidayOptimizer?.style)
  ))
  const [predictionHolidaySafetyMode, setPredictionHolidaySafetyMode] = useState<PredictionSafetyMode>(() => (
    normalizePredictionSafetyMode(predictionCache?.holidayOptimizer?.safetyMode)
  ))
  const [predictionHolidayUseCustomTarget, setPredictionHolidayUseCustomTarget] = useState<boolean>(() => (
    predictionCache?.holidayOptimizer?.useCustomTarget === true
  ))
  const [predictionHolidayCustomTargetPct, setPredictionHolidayCustomTargetPct] = useState<number>(() => (
    clampPredictionTargetPct(predictionCache?.holidayOptimizer?.customTargetPct ?? 80)
  ))
  const [predictionHolidaySummary, setPredictionHolidaySummary] = useState<PredictionHolidayOptimizerSummary | null>(() => (
    predictionCache?.holidayOptimizer?.summary ?? null
  ))
  const [predictionHolidaySelectedOptionId, setPredictionHolidaySelectedOptionId] = useState<string | null>(() => (
    predictionCache?.holidayOptimizer?.summary?.options[0]?.id ?? null
  ))

  const activePredictionRange = predictionRanges[predictionSelectedRangeIndex] ?? predictionRanges[predictionRanges.length - 1] ?? null
  const predictionDraftNormalizedRange = useMemo<PredictionDateRange | null>(() => {
    if (!predictionDraftRange?.from) return null
    const fromIso = toLocalIsoDate(predictionDraftRange.from)
    const toIso = predictionDraftRange.to ? toLocalIsoDate(predictionDraftRange.to) : fromIso
    const [startIso, endIso] = compareIsoDate(fromIso, toIso) <= 0 ? [fromIso, toIso] : [toIso, fromIso]
    return { start: startIso, end: endIso }
  }, [predictionDraftRange])
  const predictionStartDate = (predictionDraftNormalizedRange ?? activePredictionRange)?.start ?? ''
  const canCommitPredictionDraftRange = predictionDraftNormalizedRange !== null

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

  const predictionDayOrderByDate = useMemo(() => {
    const next = new Map<string, number>()
    for (const event of calendarEvents) {
      if (typeof event.dayOrder === 'number' && Number.isFinite(event.dayOrder) && event.dayOrder >= 1 && event.dayOrder <= 5) {
        next.set(event.date, event.dayOrder)
      }
    }
    return next
  }, [calendarEvents])

  const predictionHolidayDateSet = useMemo(() => {
    const next = new Set<string>()
    for (const event of calendarEvents) {
      if (event.type === 'holiday') next.add(event.date)
    }
    return next
  }, [calendarEvents])

  const activePredictionMonth = useMemo(() => {
    if (/^\d{4}-\d{2}$/.test(predictionActiveMonth)) return predictionActiveMonth
    if (/^\d{4}-\d{2}-\d{2}$/.test(predictionStartDate)) return predictionStartDate.slice(0, 7)
    return toLocalIsoDate(new Date()).slice(0, 7)
  }, [predictionActiveMonth, predictionStartDate])

  const predictionGapRanges = useMemo(() => buildPredictionGapRanges(predictionRanges), [predictionRanges])
  const predictionHasGaps = predictionGapRanges.length > 0
  const predictionHolidayTargetPct = predictionHolidayUseCustomTarget
    ? clampPredictionTargetPct(predictionHolidayCustomTargetPct)
    : 75
  const predictionHolidaySafeLabel = predictionHolidaySafetyMode === 'plus1'
    ? `${predictionHolidayTargetPct}% +1`
    : `${predictionHolidayTargetPct}% border`

  const predictionCalendarSelectedRange = predictionDraftRange

  const onPredictionRangeSelect = useCallback((range: DateRange | undefined) => {
    setPredictionDraftRange(range)
  }, [])

  const commitPredictionDraftRange = useCallback(() => {
    if (!predictionDraftNormalizedRange) return
    const { start: startIso, end: endIso } = predictionDraftNormalizedRange
    setPredictionRanges((prev) => {
      const merged = normalizePredictionRanges([...prev, { start: startIso, end: endIso }])
      const nextIndex = Math.max(0, merged.findIndex((entry) => entry.start === startIso && entry.end === endIso))
      setPredictionSelectedRangeIndex(nextIndex >= 0 ? nextIndex : merged.length - 1)
      return merged
    })
    setPredictionActiveMonth(startIso.slice(0, 7))
    setPredictionDraftRange(undefined)
    setPredictionResults(null)
    setPredictionModeActive(false)
  }, [predictionDraftNormalizedRange])

  const clearPredictionRanges = useCallback(() => {
    const todayMonth = toLocalIsoDate(new Date()).slice(0, 7)
    setPredictionRanges([])
    setPredictionSelectedRangeIndex(0)
    setPredictionDraftRange(undefined)
    setPredictionActiveMonth(todayMonth)
    setPredictionGapHandling('none')
    setPredictionResults(null)
    setPredictionModeActive(false)
  }, [])

  const calculateDayClasses = useCallback((targetDate: string) => {
    const date = parseLocalIsoDate(targetDate)
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    const isHoliday = predictionHolidayDateSet.has(targetDate)
    const mappedDayOrder = predictionDayOrderByDate.get(targetDate) ?? null
    const allowWeekendClasses = isWeekend && mappedDayOrder !== null
    const shouldSkip = isHoliday || (isWeekend && !allowWeekendClasses)
    if (shouldSkip) {
      return {
        isHoliday,
        isWeekend,
        dayOrderResolved: null as number | null,
        classCount: 0,
        shouldCount: false,
      }
    }

    const dayOrderResolved = mappedDayOrder ?? dayOrder ?? null
    if (!dayOrderResolved || dayOrderResolved < 1 || dayOrderResolved > 5) {
      return {
        isHoliday,
        isWeekend,
        dayOrderResolved: null as number | null,
        classCount: 0,
        shouldCount: true,
      }
    }

    const classRows = getTodayClasses(dayOrderResolved, attendance, timetableByDay)
      .filter((row): row is typeof row & { course: AttendanceCourse } => row.course !== null)

    return {
      isHoliday,
      isWeekend,
      dayOrderResolved,
      classCount: classRows.length,
      shouldCount: true,
      classRows,
    }
  }, [predictionHolidayDateSet, predictionDayOrderByDate, dayOrder, attendance, timetableByDay])

  const predictionHolidayModel = useMemo(
    () => buildPredictionHolidayOptimizerModel({
      attendance,
      calendarEvents,
      timetableByDay,
      dayOrder,
      targetPct: predictionHolidayTargetPct,
      safetyMode: predictionHolidaySafetyMode,
    }),
    [attendance, calendarEvents, timetableByDay, dayOrder, predictionHolidayTargetPct, predictionHolidaySafetyMode],
  )
  const predictionHolidayDisabledReason = useMemo(() => {
    if (predictionHolidayModel) return ''
    if (attendance.length === 0) return 'Attendance data is still loading.'
    if (calendarEvents.length === 0) return 'Syncing academic calendar for holiday optimizer…'
    const todayIso = toLocalIsoDate(new Date())
    const hasFutureCalendarWindow = calendarEvents.some(
      (event) => isIsoDate(event.date) && compareIsoDate(event.date, todayIso) >= 0,
    )
    if (!hasFutureCalendarWindow) return 'No future calendar window is available for optimization.'
    return 'Holiday optimizer is unavailable for the current timetable/day-order data.'
  }, [predictionHolidayModel, attendance.length, calendarEvents])

  const calculatePrediction = useCallback(() => {
    if (!predictionRanges.length) return

    const selectedClassCountByKey: Record<string, number> = {}
    const gapClassCountByKey: Record<string, number> = {}
    for (const course of attendance) {
      const key = attendanceCourseKey(course)
      selectedClassCountByKey[key] = 0
      gapClassCountByKey[key] = 0
    }

    let totalClassesCounted = 0
    let gapClassesCounted = 0
    let unmatchedDays = 0
    let consideredDays = 0
    const visitedDates = new Set<string>()
    const shouldIncludeGapRanges = predictionGapHandling === 'present' || predictionGapHandling === 'absent'
    const gapRanges = shouldIncludeGapRanges
      ? buildPredictionGapRanges(predictionRanges)
      : []
    const rangesToProcess: Array<{ range: PredictionDateRange; isGap: boolean }> = [
      ...predictionRanges.map((range) => ({ range, isGap: false })),
      ...gapRanges.map((range) => ({ range, isGap: true })),
    ]
    for (const { range, isGap } of rangesToProcess) {
      const start = parseLocalIsoDate(range.start)
      const end = parseLocalIsoDate(range.end)
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue
      if (start.getTime() > end.getTime()) continue
      const cursor = new Date(start)
      while (cursor.getTime() <= end.getTime()) {
        const currentIso = toLocalIsoDate(cursor)
        if (visitedDates.has(currentIso)) {
          cursor.setDate(cursor.getDate() + 1)
          continue
        }
        visitedDates.add(currentIso)
        const dayCalc = calculateDayClasses(currentIso)
        if (!dayCalc.shouldCount) {
          cursor.setDate(cursor.getDate() + 1)
          continue
        }

        consideredDays += 1
        if (!dayCalc.dayOrderResolved || !dayCalc.classRows || dayCalc.classRows.length === 0) {
          unmatchedDays += 1
          cursor.setDate(cursor.getDate() + 1)
          continue
        }

        for (const row of dayCalc.classRows) {
          const key = attendanceCourseKey(row.course)
          if (isGap) {
            gapClassCountByKey[key] = (gapClassCountByKey[key] ?? 0) + 1
          } else {
            selectedClassCountByKey[key] = (selectedClassCountByKey[key] ?? 0) + 1
          }
          totalClassesCounted += 1
          if (isGap) gapClassesCounted += 1
        }
        cursor.setDate(cursor.getDate() + 1)
      }
    }

    const absentAdds = predictionLeaveType === 'absent'
    const impactedCourses = attendance
      .map((course) => {
        const key = attendanceCourseKey(course)
        const selectedClasses = selectedClassCountByKey[key] ?? 0
        const gapClasses = gapClassCountByKey[key] ?? 0
        const classesCounted = selectedClasses + gapClasses
        const projectedConducted = course.conducted + classesCounted
        const projectedAbsent = course.absent + (absentAdds ? selectedClasses : 0) + (predictionGapHandling === 'absent' ? gapClasses : 0)
        const projectedPct = projectedConducted > 0
          ? ((projectedConducted - projectedAbsent) / projectedConducted) * 100
          : course.percent
        return {
          courseKey: key,
          code: course.code,
          type: course.type,
          title: course.title,
          currentPct: course.percent,
          projectedPct,
          classesCounted,
          projectedConducted,
          projectedAbsent,
          canMiss: classesSafeToMiss(projectedConducted, projectedAbsent),
          mustAttend: classesNeededToReach(projectedConducted, projectedAbsent),
          isAtRisk: projectedPct < 75,
        } satisfies PredictionCourseImpact
      })
      .filter((course) => course.classesCounted > 0)
      .sort((a, b) => b.classesCounted - a.classesCounted || a.projectedPct - b.projectedPct)

    const totalConducted = attendance.reduce(
      (sum, course) => (
        sum
        + course.conducted
        + (selectedClassCountByKey[attendanceCourseKey(course)] ?? 0)
        + (gapClassCountByKey[attendanceCourseKey(course)] ?? 0)
      ),
      0,
    )
    const totalAbsent = attendance.reduce(
      (sum, course) => (
        sum
        + course.absent
        + (absentAdds ? (selectedClassCountByKey[attendanceCourseKey(course)] ?? 0) : 0)
        + (predictionGapHandling === 'absent' ? (gapClassCountByKey[attendanceCourseKey(course)] ?? 0) : 0)
      ),
      0,
    )
    const overallProjected = totalConducted > 0
      ? ((totalConducted - totalAbsent) / totalConducted) * 100
      : overallPct(attendance)

    setPredictionResults({
      totalClassesCounted,
      gapClassesCounted,
      impactedCourses,
      overallProjected,
      endDate: predictionRanges[predictionRanges.length - 1]?.end ?? '',
      leaveType: predictionLeaveType,
      gapHandling: predictionGapHandling,
      unmatchedDays,
      consideredDays,
      rangeCount: predictionRanges.length,
    })
    setPredictionModeActive(true)
  }, [predictionRanges, attendance, predictionLeaveType, predictionGapHandling, calculateDayClasses])

  const calculatePredictionHolidayOptimizer = useCallback(() => {
    if (!predictionHolidayModel) {
      setPredictionHolidaySummary(null)
      setPredictionHolidaySelectedOptionId(null)
      return
    }
    const nextSummary = buildPredictionHolidayOptimizerSummary(
      predictionHolidayModel,
      predictionHolidayGoal,
      predictionHolidayStyle,
    )
    setPredictionHolidaySummary(nextSummary)
    setPredictionHolidaySelectedOptionId(nextSummary.options[0]?.id ?? null)
  }, [predictionHolidayModel, predictionHolidayGoal, predictionHolidayStyle])

  const clearHolidayOptimizerResults = useCallback(() => {
    setPredictionHolidaySummary(null)
    setPredictionHolidaySelectedOptionId(null)
  }, [])

  const handlePredictionHolidayGoalChange = useCallback((nextGoal: PredictionHolidayGoal) => {
    setPredictionHolidayGoal(nextGoal)
    clearHolidayOptimizerResults()
  }, [clearHolidayOptimizerResults])

  const handlePredictionHolidayStyleChange = useCallback((nextStyle: PredictionHolidayPlanStyle) => {
    setPredictionHolidayStyle(nextStyle)
    clearHolidayOptimizerResults()
  }, [clearHolidayOptimizerResults])

  const handlePredictionHolidaySafetyModeChange = useCallback((nextMode: PredictionSafetyMode) => {
    setPredictionHolidaySafetyMode(nextMode)
    clearHolidayOptimizerResults()
  }, [clearHolidayOptimizerResults])

  const handlePredictionHolidayUseCustomTargetChange = useCallback((nextUseCustomTarget: boolean) => {
    setPredictionHolidayUseCustomTarget(nextUseCustomTarget)
    clearHolidayOptimizerResults()
  }, [clearHolidayOptimizerResults])

  const handlePredictionHolidayCustomTargetPctChange = useCallback((nextTarget: number) => {
    setPredictionHolidayCustomTargetPct(clampPredictionTargetPct(nextTarget))
    clearHolidayOptimizerResults()
  }, [clearHolidayOptimizerResults])

  const predictionHolidayActiveOption = useMemo(() => {
    if (!predictionHolidaySummary) return null
    return predictionHolidaySummary.options.find((option) => option.id === predictionHolidaySelectedOptionId)
      ?? predictionHolidaySummary.options[0]
      ?? null
  }, [predictionHolidaySummary, predictionHolidaySelectedOptionId])
  const predictionHolidayActiveRuns = useMemo(
    () => countPredictionDateRuns(predictionHolidayActiveOption?.leaveDates ?? []),
    [predictionHolidayActiveOption?.leaveDates],
  )
  const predictionHolidayActiveLeaveDateSet = useMemo(() => (
    new Set(predictionHolidayActiveOption?.leaveDates ?? [])
  ), [predictionHolidayActiveOption])
  const predictionHolidayMarkerMap = useMemo(
    () => buildPredictionHolidayMarkers(predictionHolidaySummary, predictionHolidayActiveOption?.id ?? null),
    [predictionHolidaySummary, predictionHolidayActiveOption?.id],
  )
  const predictionHolidayMarkerDates = useMemo(() => {
    const leave: Date[] = []
    const hardBlock: Date[] = []
    const unmatched: Date[] = []
    const prep: Date[] = []
    const today: Date[] = []
    for (const [isoDate, marker] of predictionHolidayMarkerMap.entries()) {
      if (!isIsoDate(isoDate)) continue
      const parsed = parseLocalIsoDate(isoDate)
      if (marker === 'leave') {
        leave.push(parsed)
      } else if (marker === 'hard_block') {
        hardBlock.push(parsed)
      } else if (marker === 'unmatched') {
        unmatched.push(parsed)
      } else if (marker === 'prep') {
        prep.push(parsed)
      } else if (marker === 'today') {
        today.push(parsed)
      }
    }
    return { leave, hardBlock, unmatched, prep, today }
  }, [predictionHolidayMarkerMap])

  const predictionImpactByCourseKey = useMemo(() => {
    const map = new Map<string, PredictionCourseImpact>()
    if (!predictionModeActive || !predictionResults) return map
    for (const impact of predictionResults.impactedCourses) {
      map.set(impact.courseKey, impact)
    }
    return map
  }, [predictionModeActive, predictionResults])

  const attendanceView = useMemo(() => {
    if (!predictionModeActive || !predictionResults) return attendance
    return attendance.map((course) => {
      const impact = predictionImpactByCourseKey.get(attendanceCourseKey(course))
      if (!impact) return course
      return {
        ...course,
        conducted: impact.projectedConducted,
        absent: impact.projectedAbsent,
        percent: impact.projectedPct,
      }
    })
  }, [attendance, predictionModeActive, predictionResults, predictionImpactByCourseKey])

  useEffect(() => {
    const normalizedRanges = normalizePredictionRanges(predictionRanges)
    const firstRange = normalizedRanges[0] ?? null
    const lastRange = normalizedRanges[normalizedRanges.length - 1] ?? null
    onPredictionCacheChange({
      ranges: normalizedRanges,
      startDate: firstRange?.start ?? '',
      endDate: lastRange?.end ?? '',
      activeMonth: activePredictionMonth,
      leaveType: predictionLeaveType,
      gapHandling: predictionGapHandling,
      summary: predictionResults,
      holidayOptimizer: {
        goal: predictionHolidayGoal,
        style: predictionHolidayStyle,
        safetyMode: predictionHolidaySafetyMode,
        useCustomTarget: predictionHolidayUseCustomTarget,
        customTargetPct: predictionHolidayTargetPct,
        summary: predictionHolidaySummary,
      },
    })
  }, [
    predictionRanges,
    activePredictionMonth,
    predictionLeaveType,
    predictionGapHandling,
    predictionResults,
    predictionHolidayGoal,
    predictionHolidayStyle,
    predictionHolidaySafetyMode,
    predictionHolidayUseCustomTarget,
    predictionHolidayTargetPct,
    predictionHolidaySummary,
    onPredictionCacheChange,
  ])

  const overall = overallPct(attendanceView)
  const animatedOverall = useCountUp(overall)
  const atRiskNow = attendanceView.filter(c => c.percent < 75).length
  const projectedClass = plannerModel ? attnClass(plannerModel.projectedPct) : 'ok'
  const predictionSheetOpen = activeInsight === 'prediction'

  const clearPredictionMode = useCallback(() => {
    setPredictionResults(null)
    setPredictionModeActive(false)
    const normalizedRanges = normalizePredictionRanges(predictionRanges)
    const firstRange = normalizedRanges[0] ?? null
    const lastRange = normalizedRanges[normalizedRanges.length - 1] ?? null
    onPredictionCacheChange({
      ranges: normalizedRanges,
      startDate: firstRange?.start ?? '',
      endDate: lastRange?.end ?? '',
      activeMonth: activePredictionMonth,
      leaveType: predictionLeaveType,
      gapHandling: predictionGapHandling,
      summary: null,
      holidayOptimizer: {
        goal: predictionHolidayGoal,
        style: predictionHolidayStyle,
        safetyMode: predictionHolidaySafetyMode,
        useCustomTarget: predictionHolidayUseCustomTarget,
        customTargetPct: predictionHolidayTargetPct,
        summary: predictionHolidaySummary,
      },
    })
  }, [
    predictionRanges,
    activePredictionMonth,
    predictionLeaveType,
    predictionGapHandling,
    predictionHolidayGoal,
    predictionHolidayStyle,
    predictionHolidaySafetyMode,
    predictionHolidayUseCustomTarget,
    predictionHolidayTargetPct,
    predictionHolidaySummary,
    onPredictionCacheChange,
  ])

  return (
    <>
      {parserStatus === 'structure_mismatch' && (
        <div className="error-banner" style={{ margin: '0 16px 10px' }}>
          {parserHint || 'Portal data may have changed — refresh or check academia.srmist.edu.in directly'}
        </div>
      )}

      {predictionModeActive && predictionResults && (
        <motion.div
          className="prediction-mode-bar"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
            <div className="prediction-mode-copy">
              <div className="prediction-mode-title">
                <span className="prediction-mode-icon" aria-hidden="true">
                  <Icons.Trend />
                </span>
                <strong>Prediction</strong>
              </div>
              <span className="prediction-mode-meta-line">
                {predictionResults.endDate
                  ? `Until ${parseLocalIsoDate(predictionResults.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                  : 'Prediction active'}
                {' · '}
                {predictionResults.rangeCount > 1 ? `${predictionResults.rangeCount} ranges` : '1 range'}
                {' · '}
                {predictionLeaveType === 'absent' ? 'Absent' : 'Present'}
                {predictionResults.gapClassesCounted > 0
                  ? ` · Gaps as ${predictionResults.gapHandling} (${predictionResults.gapClassesCounted} classes)`
                  : ''}
              </span>
            </div>
          <div className="prediction-mode-values">
            <span className={`prediction-mode-pct ${attnClass(predictionResults.overallProjected)}`}>
              {predictionResults.overallProjected.toFixed(1)}%
            </span>
            <button className="prediction-mode-close" type="button" onClick={clearPredictionMode}>
              <Icons.X />
            </button>
          </div>
        </motion.div>
      )}

      <div className={`attendance-overview-card${predictionModeActive ? ' prediction-active' : ''}`}>
        <div className="attendance-overview-top">
          <div className="attendance-overview-main">
            <div className="attendance-overview-kicker">Overall attendance</div>
            <div className={`attendance-overview-pct ${attnClass(overall)}`}>
              {animatedOverall.toFixed(1)}%
            </div>
          </div>
          <div className="attendance-overview-side">
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
        {attendanceView.filter(c => c.type === "Theory").map(c => (
          <CourseRow key={c.code + c.title} course={c} />
        ))}
      </div>

      <div className="section-header">
        <span className="section-title">Practicals</span>
      </div>
      <div className="course-list">
        {attendanceView.filter(c => c.type === "Practical").map(c => (
          <CourseRow key={c.code + c.type} course={c} />
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
                    {plannerModel.projectedPct >= 75
                      ? plannerModel.projectedPct === 75
                        ? `${plannerCourse.code} lands exactly at 75%. You are safe, but any extra leave will push this below threshold.`
                        : `You can take ${plannedLeaves} leave class${plannedLeaves === 1 ? '' : 'es'} in ${plannerCourse.code} and stay at or above 75%.`
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

      {/* Prediction Sheet */}
      {activeInsight === "prediction" && (
        <div className="sheet-backdrop insight-sheet-backdrop prediction-backdrop" onClick={() => setActiveInsight(null)}>
          <motion.div
            className="sheet-panel prediction-sheet-panel"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 72, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 12, stiffness: 320, mass: 0.72 }}
          >
            <div className="sheet-handle" />
              <div className="sheet-title prediction-sheet-title">
              <Icons.Trend /> Prediction
              </div>

            <div className="prediction-form">
              <div className="prediction-selected-ranges">
                {predictionRanges.map((range, idx) => (
                  <motion.button
                    key={`${range.start}-${range.end}-${idx}`}
                    type="button"
                    className={`prediction-range-chip ${idx === predictionSelectedRangeIndex ? 'active' : ''}`}
                    onClick={() => setPredictionSelectedRangeIndex(idx)}
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    {range.start === range.end
                      ? toCompactDate(range.start)
                      : `${toCompactDate(range.start)}-${toCompactDate(range.end)}`}
                  </motion.button>
                ))}
              </div>
              <div className="prediction-calendar-shell">
                <DayPicker
                  mode="range"
                  showOutsideDays
                  fixedWeeks
                  numberOfMonths={1}
                  navLayout="around"
                  month={parseLocalIsoDate(`${activePredictionMonth}-01`)}
                  selected={predictionCalendarSelectedRange}
                  modifiers={{
                    multi_selected: predictionRanges.flatMap((range) => [{ from: parseLocalIsoDate(range.start), to: parseLocalIsoDate(range.end) }]),
                    gap_present: predictionGapHandling === 'present'
                      ? predictionGapRanges.flatMap((range) => [{ from: parseLocalIsoDate(range.start), to: parseLocalIsoDate(range.end) }])
                      : [],
                    gap_absent: predictionGapHandling === 'absent'
                      ? predictionGapRanges.flatMap((range) => [{ from: parseLocalIsoDate(range.start), to: parseLocalIsoDate(range.end) }])
                      : [],
                  }}
                  modifiersClassNames={{
                    multi_selected: 'prediction-dp-multi-selected',
                    gap_present: 'prediction-dp-gap-present',
                    gap_absent: 'prediction-dp-gap-absent',
                  }}
                  onMonthChange={(month) => setPredictionActiveMonth(toLocalIsoDate(month).slice(0, 7))}
                  onSelect={onPredictionRangeSelect}
                  weekStartsOn={0}
                  className="prediction-daypicker"
                  classNames={{
                    months: 'prediction-dp-months',
                    month: 'prediction-dp-month',
                    month_caption: 'prediction-dp-caption',
                    caption_label: 'prediction-dp-caption-label',
                    month_grid: 'prediction-dp-month-grid',
                    nav: 'prediction-dp-nav',
                    button_previous: 'prediction-dp-nav-btn',
                    button_next: 'prediction-dp-nav-btn',
                    weekdays: 'prediction-dp-weekdays',
                    weekday: 'prediction-dp-weekday',
                    weeks: 'prediction-dp-weeks',
                    week: 'prediction-dp-week',
                    day: 'prediction-dp-day',
                    day_button: 'prediction-dp-day-btn',
                    selected: 'prediction-dp-selected',
                    range_start: 'prediction-dp-range-start',
                    range_middle: 'prediction-dp-range-middle',
                    range_end: 'prediction-dp-range-end',
                    today: 'prediction-dp-today',
                    outside: 'prediction-dp-outside',
                    hidden: 'prediction-dp-hidden',
                  }}
                />
                <div className="prediction-calendar-actions">
                  <button
                    type="button"
                    className="prediction-mini-btn"
                    onClick={commitPredictionDraftRange}
                    disabled={!canCommitPredictionDraftRange}
                  >
                    Add range
                  </button>
                  <button type="button" className="prediction-mini-btn ghost" onClick={clearPredictionRanges}>
                    Reset
                  </button>
                </div>
              </div>

              <div className="prediction-gap-toggle">
                <div className="prediction-field-label">Gap handling</div>
                <div className="prediction-type-buttons compact-three">
                  <button
                    className={`prediction-type-btn tone-neutral ${predictionGapHandling === 'none' ? 'active' : ''}`}
                    onClick={() => setPredictionGapHandling('none')}
                    type="button"
                    disabled={!predictionHasGaps}
                  >
                    <span className="type-label">No gap</span>
                  </button>
                  <button
                    className={`prediction-type-btn tone-green ${predictionGapHandling === 'present' ? 'active' : ''}`}
                    onClick={() => setPredictionGapHandling('present')}
                    type="button"
                    disabled={!predictionHasGaps}
                  >
                    <span className="type-label">Gap present</span>
                  </button>
                  <button
                    className={`prediction-type-btn tone-red ${predictionGapHandling === 'absent' ? 'active' : ''}`}
                    onClick={() => setPredictionGapHandling('absent')}
                    type="button"
                    disabled={!predictionHasGaps}
                  >
                    <span className="type-label">Gap absent</span>
                  </button>
                </div>
                {!predictionHasGaps && (
                  <div className="prediction-gap-hint">Add 2+ separate ranges to enable gap options.</div>
                )}
              </div>

              <div className="prediction-leave-type">
                <div className="prediction-field-label">Range mode</div>
                <div className="prediction-type-buttons compact-two">
                  <button
                    className={`prediction-type-btn ${predictionLeaveType === 'absent' ? 'active' : ''}`}
                    onClick={() => setPredictionLeaveType('absent')}
                    type="button"
                  >
                    <span className="type-label">Absent</span>
                  </button>
                  <button
                    className={`prediction-type-btn ${predictionLeaveType === 'present' ? 'active' : ''}`}
                    onClick={() => setPredictionLeaveType('present')}
                    type="button"
                  >
                    <span className="type-label">Present</span>
                  </button>
                </div>
              </div>

              <button
                className="prediction-calculate-btn"
                disabled={predictionRanges.length === 0}
                onClick={() => {
                  calculatePrediction()
                }}
              >
                Predict ranges
              </button>

              <div className="prediction-optimizer-panel">
                <div className="prediction-optimizer-head">
                  <span className="prediction-optimizer-title">Holiday optimizer</span>
                  <span className="prediction-optimizer-sub">
                    {predictionHolidaySummary
                      ? `Top plans · ${predictionHolidaySummary.options.length}`
                      : 'Find best leave strategy'}
                  </span>
                </div>

                <div className="prediction-optimizer-grid">
                  <div className="prediction-optimizer-group">
                    <div className="prediction-field-label">Goal</div>
                    <div className="prediction-type-buttons compact-four">
                      <button
                        className={`prediction-type-btn ${predictionHolidayGoal === '5d' ? 'active' : ''}`}
                        onClick={() => handlePredictionHolidayGoalChange('5d')}
                        type="button"
                      >
                        <span className="type-label">5d</span>
                      </button>
                      <button
                        className={`prediction-type-btn ${predictionHolidayGoal === '1w' ? 'active' : ''}`}
                        onClick={() => handlePredictionHolidayGoalChange('1w')}
                        type="button"
                      >
                        <span className="type-label">1w</span>
                      </button>
                      <button
                        className={`prediction-type-btn ${predictionHolidayGoal === '2w' ? 'active' : ''}`}
                        onClick={() => handlePredictionHolidayGoalChange('2w')}
                        type="button"
                      >
                        <span className="type-label">2w</span>
                      </button>
                      <button
                        className={`prediction-type-btn ${predictionHolidayGoal === 'max' ? 'active' : ''}`}
                        onClick={() => handlePredictionHolidayGoalChange('max')}
                        type="button"
                      >
                        <span className="type-label">Max</span>
                      </button>
                    </div>
                  </div>

                  <div className="prediction-optimizer-group">
                    <div className="prediction-field-label">Style</div>
                    <div className="prediction-type-buttons compact-three">
                      <button
                        className={`prediction-type-btn ${predictionHolidayStyle === 'stretch' ? 'active' : ''}`}
                        onClick={() => handlePredictionHolidayStyleChange('stretch')}
                        type="button"
                      >
                        <span className="type-label">Stretch</span>
                      </button>
                      <button
                        className={`prediction-type-btn ${predictionHolidayStyle === 'scattered' ? 'active' : ''}`}
                        onClick={() => handlePredictionHolidayStyleChange('scattered')}
                        type="button"
                      >
                        <span className="type-label">Scattered</span>
                      </button>
                      <button
                        className={`prediction-type-btn ${predictionHolidayStyle === 'both' ? 'active' : ''}`}
                        onClick={() => handlePredictionHolidayStyleChange('both')}
                        type="button"
                      >
                        <span className="type-label">Both</span>
                      </button>
                    </div>
                  </div>

                  <div className="prediction-optimizer-group">
                    <div className="prediction-field-label">Safety</div>
                    <div className="prediction-optimizer-controls">
                      <label className="prediction-custom-target-toggle">
                        <input
                          type="checkbox"
                          checked={predictionHolidayUseCustomTarget}
                          onChange={(event) => handlePredictionHolidayUseCustomTargetChange(event.target.checked)}
                        />
                        Custom %
                      </label>
                      <div className="prediction-glass-select-wrap">
                        <select
                          className="prediction-glass-select"
                          value={predictionHolidaySafetyMode}
                          onChange={(event) => handlePredictionHolidaySafetyModeChange(normalizePredictionSafetyMode(event.target.value))}
                        >
                          <option value="plus1">+1 margin</option>
                          <option value="border">75/target border</option>
                        </select>
                        <span className="prediction-glass-select-caret">▾</span>
                      </div>
                      {predictionHolidayUseCustomTarget && (
                        <div className="prediction-glass-select-wrap">
                          <select
                            className="prediction-glass-select"
                            value={String(predictionHolidayCustomTargetPct)}
                            onChange={(event) => {
                              const next = Number.parseInt(event.target.value, 10)
                              handlePredictionHolidayCustomTargetPctChange(next)
                            }}
                          >
                            {Array.from({ length: 11 }, (_, idx) => 75 + idx * 2).map((pct) => (
                              <option key={`pct-${pct}`} value={String(pct)}>{pct}%</option>
                            ))}
                          </select>
                          <span className="prediction-glass-select-caret">▾</span>
                        </div>
                      )}
                    </div>
                    {!predictionHolidayUseCustomTarget && (
                      <div className="prediction-gap-hint">Default target is 75%</div>
                    )}
                    <div className="prediction-optimizer-safety-fixed">
                      <span className="prediction-optimizer-chip safe">{predictionHolidaySafeLabel}</span>
                      <span className="prediction-optimizer-note">Applied per subject</span>
                    </div>
                  </div>
                </div>

                <button
                  className="prediction-calculate-btn prediction-optimizer-btn"
                  disabled={!predictionHolidayModel}
                  onClick={calculatePredictionHolidayOptimizer}
                >
                  Optimize holidays
                </button>
                {!predictionHolidayModel && (
                  <div className="prediction-gap-hint">{predictionHolidayDisabledReason}</div>
                )}

                {predictionHolidaySummary && (
                  <div className="prediction-optimizer-results">
                    <div className="prediction-optimizer-meta">
                      <span>
                        Horizon {toCompactDate(predictionHolidaySummary.horizonStart)} to {toCompactDate(predictionHolidaySummary.horizonEnd)}
                      </span>
                      <span>
                        Max stretch {predictionHolidaySummary.maxContiguousLeaveDays}d · Max scattered {predictionHolidaySummary.maxScatteredLeaveDays}d
                      </span>
                      <span>
                        Safety lock: {predictionHolidaySummary.targetPct}% {predictionHolidaySummary.safetyMode === 'plus1' ? '+1 margin' : 'border'} in every subject
                      </span>
                    </div>

                    {predictionHolidaySummary.readinessAttendClasses > 0 && (
                      <div className="prediction-optimizer-readiness">
                        <div className="prediction-optimizer-blocker-title">Attend first, then leave</div>
                        <div className="prediction-optimizer-readiness-main">
                          Attend {predictionHolidaySummary.readinessAttendClasses} classes across {predictionHolidaySummary.readinessAttendDays} working days first.
                        </div>
                        {predictionHolidaySummary.readinessDate && (
                          <div className="prediction-optimizer-readiness-sub">
                            Earliest leave date: after {toPrettyDate(predictionHolidaySummary.readinessDate)}
                          </div>
                        )}
                        {predictionHolidaySummary.readinessNeeds.length > 0 && (
                          <div className="prediction-optimizer-chip-row">
                            {predictionHolidaySummary.readinessNeeds.slice(0, 5).map((need) => (
                              <span key={`${need.courseKey}-need`} className="prediction-optimizer-chip">
                                {need.code} {need.type === 'Practical' ? 'Lab' : 'Theory'} · attend {need.neededClasses}
                              </span>
                            ))}
                            {predictionHolidaySummary.readinessNeeds.length > 5 && (
                              <span className="prediction-optimizer-chip muted">+{predictionHolidaySummary.readinessNeeds.length - 5}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {predictionHolidaySummary.blockers.length > 0 && (
                      <div className="prediction-optimizer-blockers">
                        <div className="prediction-optimizer-blocker-title">Recovery blockers</div>
                        <div className="prediction-optimizer-blocker-list">
                          {predictionHolidaySummary.blockers.slice(0, 4).map((blocker) => (
                            <span key={`${blocker.courseKey}-blocker`} className="prediction-optimizer-chip danger">
                              {blocker.code} {blocker.type === 'Practical' ? 'Lab' : 'Theory'} · best {blocker.bestPossiblePct.toFixed(1)}%
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {predictionHolidaySummary.options.length > 0 && (
                      <>
                        <div className="prediction-optimizer-tabs">
                          {predictionHolidaySummary.options.map((option, idx) => (
                            <button
                              key={option.id}
                              type="button"
                              className={`prediction-optimizer-tab ${predictionHolidayActiveOption?.id === option.id ? 'active' : ''}`}
                              onClick={() => setPredictionHolidaySelectedOptionId(option.id)}
                            >
                              <span className="prediction-optimizer-tab-title">{idx + 1}. {option.label.replace(/^[^A-Za-z0-9]+/, '').trim()}</span>
                              <span className="prediction-optimizer-tab-sub">{option.leaveDays}d · {option.style === 'stretch' ? 'stretch' : 'scattered'}</span>
                            </button>
                          ))}
                        </div>

                        <div className="prediction-optimizer-calendar-shell">
                          <DayPicker
                            mode="single"
                            showOutsideDays
                            fixedWeeks
                            numberOfMonths={1}
                            month={parseLocalIsoDate(`${activePredictionMonth}-01`)}
                            onMonthChange={(month) => setPredictionActiveMonth(toLocalIsoDate(month).slice(0, 7))}
                            onSelect={(date) => {
                              if (!date) return
                              const iso = toLocalIsoDate(date)
                              if (predictionHolidayActiveLeaveDateSet.has(iso)) {
                                setPredictionRanges((prev) => normalizePredictionRanges([...prev, { start: iso, end: iso }]))
                                setPredictionResults(null)
                                setPredictionModeActive(false)
                              }
                            }}
                            modifiers={{
                              optimizer_leave: predictionHolidayMarkerDates.leave,
                              optimizer_hard_block: predictionHolidayMarkerDates.hardBlock,
                              optimizer_unmatched: predictionHolidayMarkerDates.unmatched,
                              optimizer_prep: predictionHolidayMarkerDates.prep,
                              optimizer_today: predictionHolidayMarkerDates.today,
                            }}
                            modifiersClassNames={{
                              optimizer_leave: 'prediction-opt-day-leave',
                              optimizer_hard_block: 'prediction-opt-day-hard',
                              optimizer_unmatched: 'prediction-opt-day-unmatched',
                              optimizer_prep: 'prediction-opt-day-prep',
                              optimizer_today: 'prediction-opt-day-today',
                            }}
                            weekStartsOn={0}
                            className="prediction-daypicker prediction-optimizer-calendar"
                            classNames={{
                              months: 'prediction-dp-months',
                              month: 'prediction-dp-month',
                              month_caption: 'prediction-dp-caption',
                              caption_label: 'prediction-dp-caption-label',
                              month_grid: 'prediction-dp-month-grid',
                              nav: 'prediction-dp-nav',
                              button_previous: 'prediction-dp-nav-btn',
                              button_next: 'prediction-dp-nav-btn',
                              weekdays: 'prediction-dp-weekdays',
                              weekday: 'prediction-dp-weekday',
                              weeks: 'prediction-dp-weeks',
                              week: 'prediction-dp-week',
                              day: 'prediction-dp-day',
                              day_button: 'prediction-dp-day-btn',
                              selected: 'prediction-dp-selected',
                              today: 'prediction-dp-today',
                              outside: 'prediction-dp-outside',
                              hidden: 'prediction-dp-hidden',
                            }}
                          />
                          <div className="prediction-optimizer-legend">
                            <span className="prediction-optimizer-legend-item"><i className="dot leave" />Leave</span>
                            <span className="prediction-optimizer-legend-item"><i className="dot prep" />Attend first</span>
                            <span className="prediction-optimizer-legend-item"><i className="dot hard" />Do not skip</span>
                            <span className="prediction-optimizer-legend-item"><i className="dot unmatched" />Unmatched</span>
                          </div>
                        </div>

                        {predictionHolidayActiveOption && (
                          <article className="prediction-optimizer-card">
                            <div className="prediction-optimizer-card-top">
                              <strong>{predictionHolidayActiveOption.label}</strong>
                              <span>
                                {predictionHolidayActiveOption.style === 'stretch'
                                  ? 'Contiguous'
                                  : `${predictionHolidayActiveRuns} block${predictionHolidayActiveRuns === 1 ? '' : 's'}`}
                              </span>
                            </div>
                            <div className="prediction-optimizer-card-dates">
                              {formatPredictionHolidayOptionDates(predictionHolidayActiveOption)}
                            </div>
                            <div className="prediction-optimizer-card-stats">
                              <span>{predictionHolidayActiveOption.leaveDays} leave days</span>
                              <span>Attend before: {predictionHolidayActiveOption.attendDaysBefore}</span>
                              <span>Buffer: {predictionHolidayActiveOption.safetyMarginClasses >= 0 ? `+${predictionHolidayActiveOption.safetyMarginClasses}` : predictionHolidayActiveOption.safetyMarginClasses}</span>
                            </div>
                            <div className="prediction-optimizer-card-reason">{predictionHolidayActiveOption.reasonText}</div>
                          </article>
                        )}
                      </>
                    )}

                    {predictionHolidaySummary.hardBlockDates.length > 0 && (
                      <div className="prediction-optimizer-hard-blocks">
                        <div className="prediction-optimizer-blocker-title">Do not skip</div>
                        <div className="prediction-optimizer-chip-row">
                          {predictionHolidaySummary.hardBlockDates.slice(0, 6).map((date) => (
                            <span key={`${date}-hard`} className="prediction-optimizer-chip">
                              {toCompactDate(date)}
                            </span>
                          ))}
                          {predictionHolidaySummary.hardBlockDates.length > 6 && (
                            <span className="prediction-optimizer-chip muted">+{predictionHolidaySummary.hardBlockDates.length - 6}</span>
                          )}
                        </div>
                      </div>
                    )}
                    {predictionHolidaySummary.options.length === 0 && (
                      <div className="prediction-gap-hint">No leave plan satisfies the strict per-subject safety lock for the current horizon.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Floating Prediction Button */}
      {!predictionSheetOpen && (
        <motion.button
          className={`prediction-fab${quickMenuOpen ? ' quick-open' : ''}`}
          onClick={() => setActiveInsight('prediction')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
          aria-label="Open predictor"
        >
          <motion.span
            className="prediction-fab-icon-wrap"
            animate={{ rotate: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 16 }}
          >
            <Icons.Trend />
          </motion.span>
          <span className="prediction-fab-label">Attendance predictor</span>
        </motion.button>
      )}

    </>
  )
}

function MarksScreen({ attendance, marks }: { attendance: AttendanceCourse[]; marks: InternalMark[] }) {
  const formatMarkValue = (value: number) => (Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1))

    const renderMarksTooltip = (tooltipProps: unknown) => {
      if (!tooltipProps || typeof tooltipProps !== 'object') return null
      const { active, payload, label } = tooltipProps as {
        active?: boolean
        payload?: ReadonlyArray<{
          dataKey?: string
          value?: number | string | null
          payload?: { pct?: number; scored?: number; max?: number; isOrigin?: boolean }
        }>
        label?: string | number
      }
      if (!active || !payload || payload.length === 0) return null
      const primary = payload.find((item) => item.dataKey === 'pct')
        ?? payload.find((item) => item.dataKey === 'failPct')
        ?? payload[0]
      if (!primary) return null
      const source = primary.payload
      const pctRaw = typeof primary.value === 'number' ? primary.value : Number(primary.value ?? source?.pct ?? 0)
      const pct = Number.isFinite(pctRaw) ? pctRaw : 0
      if (source?.isOrigin) return null
      const scored = source?.scored ?? 0
      const max = source?.max ?? 0
      return (
        <div className="marks-tooltip">
          <div className="marks-tooltip-label">{String(label ?? '')}</div>
          <div className="marks-tooltip-value">
            {formatMarkValue(scored)}/{formatMarkValue(max)} ({pct.toFixed(1)}%)
          </div>
          {pct < 50 && <div className="marks-tooltip-fail">Below pass threshold</div>}
        </div>
      )
    }

  const marksByCode = useMemo(() => {
    const map: Record<string, InternalMark[]> = {}
    for (const mk of marks) {
      const codeKey = normalizeCourseCode(mk.courseCode)
      if (!map[codeKey]) map[codeKey] = []
      map[codeKey]!.push(mk)
    }
    Object.values(map).forEach((items) => items.sort(compareInternalMarks))
    return map
  }, [marks])

  const courseRows = useMemo(() => {
    const groupedCourses = new Map<string, {
      primary: AttendanceCourse
      hasTheory: boolean
      hasPractical: boolean
    }>()

    for (const course of attendance) {
      const codeKey = normalizeCourseCode(course.code)
      const existing = groupedCourses.get(codeKey)
      if (!existing) {
        groupedCourses.set(codeKey, {
          primary: course,
          hasTheory: course.type === 'Theory',
          hasPractical: course.type === 'Practical',
        })
        continue
      }
      existing.hasTheory = existing.hasTheory || course.type === 'Theory'
      existing.hasPractical = existing.hasPractical || course.type === 'Practical'
      if (existing.primary.type === 'Practical' && course.type === 'Theory') {
        existing.primary = course
      }
    }

    return Array.from(groupedCourses.entries()).map(([codeKey, groupedCourse]) => {
      const tests = (marksByCode[codeKey] ?? []).map((entry) => {
        const pct = entry.max > 0 ? (entry.scored / entry.max) * 100 : 0
        return {
          ...entry,
          label: formatAssessmentLabel(entry.test),
          pct,
        }
      })
      const isLab = groupedCourse.hasPractical && !groupedCourse.hasTheory
      const scoredTotal = tests.reduce((sum, t) => sum + t.scored, 0)
      const obtainedMax = tests.reduce((sum, t) => sum + t.max, 0)
      const runningPct = obtainedMax > 0 ? (scoredTotal / obtainedMax) * 100 : 0
      return {
        codeKey,
        course: groupedCourse.primary,
        tests,
        isLab,
        scoredTotal,
        obtainedMax,
        runningPct,
      }
    })
  }, [attendance, marksByCode])

  const theoryRows = courseRows.filter((row) => !row.isLab)
  const practicalRows = courseRows.filter((row) => row.isLab)
  const totalScored = marks.reduce((sum, row) => sum + row.scored, 0)
  const totalPossible = marks.reduce((sum, row) => sum + row.max, 0)

  const marksByCourseCode: Record<string, { scored: number; max: number }> = {}
  for (const mk of marks) {
    const codeKey = normalizeCourseCode(mk.courseCode)
    if (!marksByCourseCode[codeKey]) marksByCourseCode[codeKey] = { scored: 0, max: 0 }
    marksByCourseCode[codeKey]!.scored += mk.scored
    marksByCourseCode[codeKey]!.max += mk.max
  }
  const enteredCourseCount = Object.keys(marksByCourseCode).length
  const renderRow = (row: (typeof courseRows)[number]) => {
    const chartData = row.tests.map((test) => ({
      label: test.label,
      pct: Number(test.pct.toFixed(1)),
      scored: Number(test.scored.toFixed(1)),
      max: Number(test.max.toFixed(1)),
    }))
    const plotData = chartData.length > 0
      ? [{ label: '__origin__', pct: 0, scored: 0, max: 0, isOrigin: true }, ...chartData]
      : chartData

    return (
    <div key={`${row.course.code}|${row.course.type}`} className="course-item">
      <div className="course-item-top">
        <div className="course-item-info">
          <div className="course-item-code">
            {row.course.code}{row.course.credit > 0 ? ` · ${row.course.credit} credits` : ''}
          </div>
          <div className="course-item-title">{shortCourseTitle(row.course.title)}</div>
        </div>
        <div className="marks-course-pct-wrap">
          <div className={`marks-course-pct ${row.runningPct < 50 ? 'danger' : 'ok'}`}>
            {row.tests.length > 0 ? `${formatMarkValue(row.scoredTotal)}/${formatMarkValue(row.obtainedMax)}` : '—'}
          </div>
          <div className="marks-course-pct-sub">Total Marks</div>
        </div>
      </div>

      {row.tests.length === 0 ? (
        <div className="marks-empty-line">No marks entered yet</div>
      ) : (
        <div className="marks-course-body">
          {row.tests.length > 0 && (
            <div className="marks-mini-chart">
              <div className="marks-mini-chart-plot">
                <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={plotData}
                  margin={{ top: 12, right: 10, left: 10, bottom: 26 }}
                >
                  <defs>
                    <linearGradient id={`miniMarksGradient-${row.course.code}-${row.course.type}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4F7EFF" stopOpacity="0.42" />
                      <stop offset="65%" stopColor="#4F7EFF" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#4F7EFF" stopOpacity="0.02" />
                    </linearGradient>
                    <filter id={`miniMarksGlow-${row.course.code}-${row.course.type}`}>
                      <feGaussianBlur stdDeviation="3.2" result="miniGlow" />
                      <feMerge>
                        <feMergeNode in="miniGlow" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(79, 126, 255, 0.26)" vertical={false} horizontal />
                  <XAxis
                    dataKey="label"
                    tickFormatter={(value: string | number) => (value === '__origin__' ? '' : String(value))}
                    tick={{ fill: 'rgba(174, 174, 178, 0.86)', fontSize: 9.2, fontWeight: 800 }}
                    tickLine={{ stroke: 'rgba(79, 126, 255, 0.35)' }}
                    axisLine={{ stroke: 'rgba(79, 126, 255, 0.38)' }}
                    tickMargin={6}
                    height={28}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 50, 100]}
                    tick={{ fill: 'rgba(174, 174, 178, 0.74)', fontSize: 8.8, fontWeight: 700 }}
                    tickLine={{ stroke: 'rgba(79, 126, 255, 0.35)' }}
                    axisLine={{ stroke: 'rgba(79, 126, 255, 0.38)' }}
                    width={26}
                  />
                  <ReferenceLine y={0} stroke="rgba(79, 126, 255, 0.42)" strokeWidth={1.1} />
                  <ReferenceLine y={50} stroke="rgba(255, 152, 0, 0.55)" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: '50%', position: 'right', fill: 'rgba(255, 152, 0, 0.85)', fontSize: 8.8, fontWeight: 700 }} />
                  <Tooltip
                    cursor={{ stroke: 'rgba(79, 126, 255, 0.6)', strokeWidth: 2, strokeDasharray: '4 4' }}
                    content={renderMarksTooltip}
                  />
                  <Area
                    dataKey="pct"
                    type="monotone"
                    fill={`url(#miniMarksGradient-${row.course.code}-${row.course.type})`}
                    fillOpacity={1}
                    stroke="none"
                    isAnimationActive
                    animationDuration={1400}
                    animationEasing="ease-out"
                    animationBegin={0}
                  />
                  {chartData.map((point, idx) => (
                    <ReferenceLine
                      key={`${row.course.code}-${row.course.type}-guide-${point.label}-${idx}`}
                      segment={[{ x: point.label, y: 0 }, { x: point.label, y: point.pct }]}
                      stroke="rgba(107, 160, 255, 0.44)"
                      strokeDasharray="2 3"
                      strokeWidth={1}
                    />
                  ))}
                  <Line
                    dataKey="pct"
                    type="monotone"
                    stroke="#4F7EFF"
                    strokeWidth={4.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    isAnimationActive
                    animationDuration={1700}
                    animationEasing="ease-in-out"
                    animationBegin={300}
                    filter={`url(#miniMarksGlow-${row.course.code}-${row.course.type})`}
                    dot={{
                      fill: '#FFFFFF',
                      stroke: '#4F7EFF',
                      strokeWidth: 3,
                      r: 5.5,
                      filter: 'drop-shadow(0px 3px 6px rgba(79, 126, 255, 0.6))',
                    }}
                    activeDot={{
                      fill: '#6BA0FF',
                      stroke: '#FFFFFF',
                      strokeWidth: 3.5,
                      r: 7.5,
                      filter: 'drop-shadow(0px 3px 10px rgba(79, 126, 255, 0.8))',
                    }}
                  />
                </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="marks-mini-details" role="list" aria-label="Per-test marks details">
                {row.tests.map((test, idx) => (
                  <div
                    key={`${row.course.code}-mini-${idx}`}
                    className={`marks-mini-detail-chip ${test.pct < 50 ? 'fail' : 'ok'}`}
                    role="listitem"
                  >
                    <span>{test.label}</span>
                    <strong>{test.scored.toFixed(1)}/{test.max.toFixed(1)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )}

  return (
    <>
      <div className="attendance-overview-card marks-summary-card">
        <div className="attendance-overview-top">
          <div className="attendance-overview-main">
            <div className="attendance-overview-kicker">Internal marks summary</div>
            <div className="attendance-overview-pct">
              {totalScored.toFixed(1)}/{totalPossible || 0}
            </div>
          </div>
          <div className="attendance-overview-side">
            <div className="attendance-overview-meta">
              <div className="attendance-overview-meta-item">
                <span>Entered</span>
                <strong>{enteredCourseCount}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="section-header">
        <span className="section-title">Theory</span>
      </div>
      <div className="course-list">
        {theoryRows.map(renderRow)}
      </div>

      <div className="section-header">
        <span className="section-title">Practical</span>
      </div>
      <div className="course-list">
        {practicalRows.map(renderRow)}
      </div>

      <div className="page-spacer" />
    </>
  )
}

function CourseRow({ course }: { course: AttendanceCourse }) {
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
    </div>
  )
}

// ─── Schedule ──────────────────────────────────────────────────────────────────
function ScheduleScreen({ initialDay, attendance, timetableByDay, onOpenCalendar }: {
  initialDay: number | null
  attendance: AttendanceCourse[]
  timetableByDay: TimetableByDay
  onOpenCalendar: () => void
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
        <button className="calendar-launch-btn" onClick={onOpenCalendar}>Open Calendar</button>
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

function MessScreen() {
  const mealKeys: MessMealKey[] = ['breakfast', 'lunch', 'snacks', 'dinner']
  const nowTs = useNowTimestamp(60_000)
  const todayDate = useMemo(() => new Date(nowTs), [nowTs])
  const todayDay = getDayKeyFromDate(todayDate)
  const [selectedDay, setSelectedDay] = useState<MessDayKey>(() => getDayKeyFromDate(new Date()))
  const [activeStickerAnimations, setActiveStickerAnimations] = useState<Record<string, boolean>>({})
  const [clickedStickerState, setClickedStickerState] = useState<Record<string, boolean>>({})
  const [specialFruitByKey, setSpecialFruitByKey] = useState<Record<string, string>>({})

  const dayType = useMemo(() => {
    const dayIndex = DAY_KEYS.indexOf(selectedDay)
    return getDayTypeFromDate(new Date(2026, 0, 4 + Math.max(0, dayIndex)))
  }, [selectedDay])

  const dayMenu = getMenuForDay(selectedDay)
  const liveMealToday = getActiveMeal(undefined, getDayTypeFromDate(todayDate), todayDate)

  const formatMealWindow = useCallback((raw: string): string => {
    return raw
      .replace(/\./g, ':')
      .replace(/\s+Noon\b/gi, ' PM')
      .replace(/\s+to\s+/gi, ' – ')
      .replace(/\s+/g, ' ')
      .trim()
  }, [])

  const getMessSticker = useCallback((itemText: string): { emoji: string; tone: 'egg' | 'chicken' | 'icecream' | 'mystery' } | null => {
    const normalized = itemText.toLowerCase()
    if (normalized.includes('special fruit')) return { emoji: '❓', tone: 'mystery' }
    if (normalized.includes('ice cream')) return { emoji: '🍨', tone: 'icecream' }
    if (normalized.includes('chicken')) return { emoji: '🍗', tone: 'chicken' }
    if (normalized.includes('egg')) return { emoji: '🥚', tone: 'egg' }
    return null
  }, [])

  const triggerStickerAnimation = useCallback((stickerKey: string, tone: 'egg' | 'chicken' | 'icecream' | 'mystery') => {
    setClickedStickerState((prev) => ({ ...prev, [stickerKey]: true }))
    if (tone === 'mystery') {
      setSpecialFruitByKey((prev) => {
        const nextEmoji = SPECIAL_FRUIT_SURPRISES[Math.floor(Math.random() * SPECIAL_FRUIT_SURPRISES.length)]
        return { ...prev, [stickerKey]: nextEmoji }
      })
    }
    setActiveStickerAnimations((prev) => ({ ...prev, [stickerKey]: false }))
    requestAnimationFrame(() => {
      setActiveStickerAnimations((prev) => ({ ...prev, [stickerKey]: true }))
    })
  }, [])

  const clearStickerAnimation = useCallback((stickerKey: string) => {
    setActiveStickerAnimations((prev) => {
      if (!prev[stickerKey]) return prev
      return { ...prev, [stickerKey]: false }
    })
  }, [])

  const getStickerEmoji = useCallback((
    tone: 'egg' | 'chicken' | 'icecream' | 'mystery',
    stickerKey: string,
    wasClicked: boolean,
  ): string => {
    if (!wasClicked) {
      if (tone === 'egg') return '🥚'
      if (tone === 'chicken') return '🍗'
      if (tone === 'icecream') return '🍨'
      return '❓'
    }

    if (tone === 'egg') return '🐣'
    if (tone === 'chicken') return '🍖'
    if (tone === 'icecream') return '👅'
    return specialFruitByKey[stickerKey] ?? '✨'
  }, [specialFruitByKey])

  return (
    <>
      <div className="section-header">
        <span className="section-title">Mess</span>
        <span className="section-action">{DAY_LONG_LABEL[selectedDay]}</span>
      </div>

      <div className="day-tab-bar">
        {DAY_KEYS.map((dayKey) => (
          <button
            key={dayKey}
            className={`day-tab${selectedDay === dayKey ? ' active' : ''}${todayDay === dayKey ? ' today' : ''}`}
            onClick={() => setSelectedDay(dayKey)}
            type="button"
            aria-label={`Show ${DAY_LONG_LABEL[dayKey]} menu`}
          >
            {DAY_SHORT_LABEL[dayKey]}
          </button>
        ))}
      </div>

      <div className="course-list mess-course-list">
        {mealKeys.map((mealKey) => {
          const meal = dayMenu[mealKey]
          const specials = meal.specials.filter((item) => item.trim().length > 0)
          const specialSet = new Set(specials.map((item) => item.toLowerCase()))
          const baseItems = meal.items.filter((item) => !specialSet.has(item.toLowerCase()))
          const ordered = [
            ...specials.map((item) => ({ text: item, special: true })),
            ...baseItems.map((item) => ({ text: item, special: false })),
          ]
          const isLive = selectedDay === todayDay && liveMealToday === mealKey

          return (
            <article key={mealKey} className={`course-item mess-meal-card${isLive ? ' live' : ''}`}>
              <div className="course-item-top">
                <div className="course-item-info">
                  <div className="course-item-code">{MEAL_LABEL[mealKey]}</div>
                  <div className="course-item-title mess-meal-time">
                    {formatMealWindow(MEAL_WINDOW_TEXT[dayType][mealKey])}
                  </div>
                </div>
                {isLive && <span className="mess-row-live">Live</span>}
              </div>

              <div className="mess-items-wrap">
                {ordered.map((entry, index) => {
                  const isNonVeg = isNonVegItem(entry.text)
                  const sticker = getMessSticker(entry.text)
                  const stickerKey = `${mealKey}-${index}-${entry.text.toLowerCase()}`
                  const isStickerAnimating = Boolean(activeStickerAnimations[stickerKey])
                  const wasStickerClicked = Boolean(clickedStickerState[stickerKey])
                  return (
                    <span
                      key={`${mealKey}-${entry.text}`}
                      className={`mess-item-chip${entry.special ? ' special' : ''}${isNonVeg ? ' non-veg' : ''}`}
                    >
                      {isNonVeg && <span className="mess-item-dot" aria-hidden="true" />}
                      {entry.text}
                      {sticker && (
                        <span
                          className={`mess-item-sticker ${sticker.tone}${wasStickerClicked && sticker.tone === 'mystery' ? ' surprise' : ''}${isStickerAnimating ? ' animate' : ''}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Animate ${entry.text}`}
                          title={`Animate ${entry.text}`}
                          onClick={() => triggerStickerAnimation(stickerKey, sticker.tone)}
                          onAnimationEnd={() => clearStickerAnimation(stickerKey)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              triggerStickerAnimation(stickerKey, sticker.tone)
                            }
                          }}
                        >
                          {getStickerEmoji(sticker.tone, stickerKey, wasStickerClicked) || sticker.emoji}
                        </span>
                      )}
                    </span>
                  )
                })}
              </div>
            </article>
          )
        })}
      </div>

      <div className="mess-note">Hostel menu can change based on kitchen operations and stock availability.</div>
      <div className="page-spacer" />
    </>
  )
}

function CookingScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="cooking-screen">
      <button className="cooking-floating-back" onClick={onBack} aria-label="Back to profile">
        <Icons.ChevronLeft />
        Profile
      </button>
      <div className="cooking-grainient-bg" aria-hidden="true">
        <Grainient
          color1="#FF9FFC"
          color2="#5227FF"
          color3="#B19EEF"
          timeSpeed={0.25}
          colorBalance={0}
          warpStrength={1}
          warpFrequency={5}
          warpSpeed={2}
          warpAmplitude={50}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.1}
          grainScale={2}
          grainAnimated={false}
          contrast={1.5}
          gamma={1}
          saturation={1}
          centerX={0}
          centerY={0}
          zoom={0.9}
        />
      </div>
      <div className="cooking-grainient-vignette" aria-hidden="true" />
      <div className="cooking-scroll">
        <div className="cooking-hero">
          <div className="cooking-hero-kicker">Arch Release Notes</div>
          <div className="cooking-hero-title">What changed, quickly.</div>
          <div className="cooking-subtitle">Concise updates optimized for mobile scanning.</div>
        </div>

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

      <GradualBlur
        className="cooking-gradual-blur"
        target="page"
        position="bottom"
        height="6.5rem"
        strength={1.05}
        divCount={4}
        curve="ease-out"
        exponential
        opacity={0.52}
      />
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
  const [screen, setScreen] = useState<Screen>(() => bootCache?.lastScreen ?? "home")
  const [globalQuickMenuOpen, setGlobalQuickMenuOpen] = useState(false)
  const [dockDropActive, setDockDropActive] = useState(false)
  const [menuDropActive, setMenuDropActive] = useState(false)
  const [dockInsertIndex, setDockInsertIndex] = useState<number | null>(null)
  const [menuHasScroll, setMenuHasScroll] = useState(false)
  const [menuLiquidActive, setMenuLiquidActive] = useState(false)
  const [draggingFloatingTab, setDraggingFloatingTab] = useState<Screen | null>(null)
  const [dockedFloatingTabs, setDockedFloatingTabs] = useState<Screen[]>(() => {
    try {
      const layoutRaw = localStorage.getItem(FLOATING_LAYOUT_STORAGE_KEY)
      if (layoutRaw) {
        const parsedLayout = normalizeFloatingDockLayout(JSON.parse(layoutRaw) as unknown)
        if (parsedLayout.length > 0) return parsedLayout
      }
      const legacyQuickRaw = localStorage.getItem(QUICK_DOCK_STORAGE_KEY)
      const legacyQuick = legacyQuickRaw ? normalizeFloatingDockLayout(JSON.parse(legacyQuickRaw) as unknown) : []
      const migrated = [...FLOATING_DOCK_DEFAULT_ORDER]
      if (legacyQuick.includes('marks')) migrated.push('marks')
      if (legacyQuick.includes('mess')) migrated.push('mess')
      return migrated
    } catch {
      return [...FLOATING_DOCK_DEFAULT_ORDER]
    }
  })
  const globalQuickMenuRef = useRef<HTMLDivElement | null>(null)
  const globalQuickMenuPanelRef = useRef<HTMLDivElement | null>(null)
  const menuLiquidResetTimeoutRef = useRef<number | null>(null)
  const dragCleanupTimeoutRef = useRef<number | null>(null)
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
  const [courseCredits, setCourseCredits] = useState<Record<string, number>>(() => bootCache?.courseCredits ?? {})
  const [marks, setMarks] = useState<InternalMark[]>(() => bootCache?.marks ?? [])
  const [refreshing, setRefreshing] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPwa, setShowPwa] = useState(false)
  const [showIosPwa, setShowIosPwa] = useState(false)
  const [theme, setTheme] = useState<Theme>(getSavedTheme)
  const [calendarEvents, setCalendarEvents] = useState<AcademicCalendarEvent[]>(() => bootCache?.calendarEvents ?? [])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState('')
  const [attendanceParserStatus, setAttendanceParserStatus] = useState<'ok' | 'structure_mismatch'>('ok')
  const [attendanceParserHint, setAttendanceParserHint] = useState('')
  const [isOffline] = useState(!navigator.onLine)
  const [needUpdate] = useState(false)
  const [timetableByDay, setTimetableByDay] = useState<TimetableByDay>(() => {
    if (bootCache?.timetableByDay) return bootCache.timetableByDay
    return fallbackTimetableForBatch(bootStudentBatch)
  })
  const [courseSlotOverrides, setCourseSlotOverrides] = useState<CourseSlotOverrides>(() => bootCache?.courseSlotOverrides ?? {})
  const [predictionCacheState, setPredictionCacheState] = useState<PredictionCachePayload | null>(() => bootCache?.predictionCache ?? null)
  const [notificationCount, setNotificationCount] = useState(() => bootCache?.notificationCount ?? 0)
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
    if (!loggedIn) return
    setPredictionCacheState((prev) => {
      if (prev?.activeMonth && Array.isArray(prev.ranges)) return prev
      const todayMonth = toLocalIsoDate(new Date()).slice(0, 7)
      return {
        ranges: [],
        startDate: '',
        endDate: '',
        activeMonth: todayMonth,
        leaveType: 'absent',
        gapHandling: 'none',
        summary: null,
        holidayOptimizer: {
          goal: 'max',
          style: 'both',
          safetyMode: 'plus1',
          useCustomTarget: false,
          customTargetPct: 75,
          summary: null,
        },
      }
    })
  }, [loggedIn])

  useEffect(() => {
    cleanupStaleLocalEntries(loggedEmail || bootEmail || null)
  }, [loggedEmail, bootEmail])

  useEffect(() => {
    const previousVersion = localStorage.getItem(APP_RUNTIME_VERSION_KEY)
    if (previousVersion === CURRENT_APP_VERSION) return

    const resetForVersionUpdate = async () => {
      const previousTheme = localStorage.getItem('theme')
      const hadPreviousVersion = Boolean(previousVersion)

      localStorage.clear()
      sessionStorage.clear()

      if (previousTheme) {
        localStorage.setItem('theme', previousTheme)
      }
      localStorage.setItem(APP_RUNTIME_VERSION_KEY, CURRENT_APP_VERSION)

      try {
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((key) => caches.delete(key)))
        }
      } catch (err) {
        console.warn('[version-reset] Failed to clear Cache Storage', err)
      }

      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(registrations.map((registration) => registration.update()))
        }
      } catch (err) {
        console.warn('[version-reset] Failed to refresh service worker registrations', err)
      }

      if (hadPreviousVersion) {
        window.location.reload()
      }
    }

    void resetForVersionUpdate()
  }, [])

  useEffect(() => {
    if (!globalQuickMenuOpen) return
    const handleOutsideClick = (event: MouseEvent) => {
      if (!globalQuickMenuRef.current) return
      if (!globalQuickMenuRef.current.contains(event.target as Node)) {
        setGlobalQuickMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [globalQuickMenuOpen])

  useEffect(() => {
    localStorage.setItem(FLOATING_LAYOUT_STORAGE_KEY, JSON.stringify(dockedFloatingTabs))
    const legacyQuickTabs = dockedFloatingTabs.filter((tab) => tab === 'marks' || tab === 'mess')
    localStorage.setItem(QUICK_DOCK_STORAGE_KEY, JSON.stringify(legacyQuickTabs))
  }, [dockedFloatingTabs])

  useEffect(() => {
    return () => {
      if (menuLiquidResetTimeoutRef.current !== null) {
        window.clearTimeout(menuLiquidResetTimeoutRef.current)
      }
      if (dragCleanupTimeoutRef.current !== null) {
        window.clearTimeout(dragCleanupTimeoutRef.current)
      }
    }
  }, [])

  const triggerMenuLiquidEffect = useCallback(() => {
    setMenuLiquidActive(true)
    if (menuLiquidResetTimeoutRef.current !== null) {
      window.clearTimeout(menuLiquidResetTimeoutRef.current)
    }
    menuLiquidResetTimeoutRef.current = window.setTimeout(() => {
      setMenuLiquidActive(false)
      menuLiquidResetTimeoutRef.current = null
    }, 360)
  }, [])

  useEffect(() => {
    if (!globalQuickMenuOpen) {
      setMenuHasScroll(false)
      setMenuLiquidActive(false)
      return
    }
    const panel = globalQuickMenuPanelRef.current
    setMenuHasScroll((panel?.scrollTop ?? 0) > 1)
  }, [globalQuickMenuOpen, dockedFloatingTabs])

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
      courseCredits,
      calendarEvents,
      timetableByDay,
      courseSlotOverrides,
      studentBatch: student.batch > 0 ? student.batch : null,
      dayOrder,
      notificationCount,
      lastScreen: screen,
      predictionCache: predictionCacheState,
      lastUpdatedIso: lastUpdated ? lastUpdated.toISOString() : null,
      savedAt: Date.now(),
      cacheVersion: TAB_CACHE_VERSION,
    })
  }, [loggedIn, loggedEmail, attendance, marks, courseCredits, calendarEvents, timetableByDay, courseSlotOverrides, student.batch, dayOrder, notificationCount, screen, predictionCacheState, lastUpdated])

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

    for (const update of updates) {
      const statusText = update.status === 'present'
        ? 'Marked present'
        : update.status === 'absent'
          ? 'Marked absent'
          : 'Attendance updated'
      await notify(
        `Attendance update · ${update.courseLabel}`,
        `${update.title} · ${statusText}`,
        `attendance-update-${update.courseLabel}`,
      )
    }
  }, [])

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
    setAttendanceParserStatus('ok')
    setAttendanceParserHint('')
    setTimetableByDay({})
    setNotificationCount(0)
    setAdminMetrics(null)
    setAdminMetricsLoading(false)
    setAdminMetricsError('')
    setPredictionCacheState(null)
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
    setAttendanceParserStatus(res.parserStatus === 'structure_mismatch' ? 'structure_mismatch' : 'ok')
    setAttendanceParserHint(res.hint ?? '')
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

  // Academic planner calendar — fetch on calendar screen and warm-load for attendance predictor.
  useEffect(() => {
    if (!loggedIn) return
    const viewingCalendar = screen === 'calendar'
    const needsPredictorWarmup = screen === 'attendance' && calendarEvents.length === 0
    if (!viewingCalendar && !needsPredictorWarmup) return
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
      setCourseCredits(cache?.courseCredits ?? {})
      setCalendarEvents(cache?.calendarEvents ?? [])
      setCourseSlotOverrides(cache?.courseSlotOverrides ?? {})
      setPredictionCacheState(cache?.predictionCache ?? null)
      const fallbackTimetable = fallbackTimetableForBatch(cache?.studentBatch ?? null)
      setTimetableByDay(cache?.timetableByDay ?? fallbackTimetable)
      setNotificationCount(cache?.notificationCount ?? 0)
      setScreen(cache?.lastScreen ?? 'home')
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

  const floatingTabItems = [
    { key: 'home' as const, title: 'Home', icon: Home },
    { key: 'attendance' as const, title: 'Attendance', icon: BarChart2 },
    { key: 'schedule' as const, title: 'Timetable', icon: Clock3 },
    { key: 'calendar' as const, title: 'Calendar', icon: CalendarDays },
    { key: 'marks' as const, title: 'Marks', icon: TrendingUp },
    { key: 'mess' as const, title: 'Mess', icon: UtensilsCrossed },
    { key: 'profile' as const, title: 'Profile', icon: User, badgeCount: notificationCount },
  ]

  const navTabs = dockedFloatingTabs
    .map((key) => floatingTabItems.find((tab) => tab.key === key))
    .filter((tab): tab is (typeof floatingTabItems)[number] => !!tab)
  const menuFloatingItems = FLOATING_TAB_ORDER
    .map((key) => floatingTabItems.find((tab) => tab.key === key))
    .filter((tab): tab is (typeof floatingTabItems)[number] => !!tab)
    .filter((tab) => !dockedFloatingTabs.includes(tab.key))
  const dockOrderWithoutDragged = draggingFloatingTab
    ? dockedFloatingTabs.filter((key) => key !== draggingFloatingTab)
    : dockedFloatingTabs

  const commitDropToDock = (draggedTab: Screen, insertIndex?: number) => {
    const next = dockedFloatingTabs.filter((key) => key !== draggedTab)
    const safeIndex = Math.max(0, Math.min(insertIndex ?? next.length, next.length))
    next.splice(safeIndex, 0, draggedTab)
    setDockedFloatingTabs(next)
  }

  const startFloatingDrag = (tabKey: string, origin: 'dock' | 'menu', event: React.DragEvent<HTMLElement>) => {
    if (!FLOATING_TAB_KEYS.has(tabKey as Screen)) return
    if (dragCleanupTimeoutRef.current !== null) {
      window.clearTimeout(dragCleanupTimeoutRef.current)
      dragCleanupTimeoutRef.current = null
    }
    const casted = tabKey as Screen
    event.dataTransfer.setData('text/arch-dock-tab', casted)
    event.dataTransfer.setData('text/plain', casted)
    event.dataTransfer.effectAllowed = 'move'
    setDraggingFloatingTab(casted)
    setMenuDropActive(origin === 'dock')
    setDockDropActive(true)
    setDockInsertIndex(Math.max(0, dockOrderWithoutDragged.length))
    setGlobalQuickMenuOpen(true)
  }

  const clearFloatingDragState = () => {
    if (dragCleanupTimeoutRef.current !== null) {
      window.clearTimeout(dragCleanupTimeoutRef.current)
      dragCleanupTimeoutRef.current = null
    }
    setDraggingFloatingTab(null)
    setDockDropActive(false)
    setMenuDropActive(false)
    setDockInsertIndex(null)
  }

  const scheduleClearFloatingDragState = () => {
    if (dragCleanupTimeoutRef.current !== null) {
      window.clearTimeout(dragCleanupTimeoutRef.current)
    }
    dragCleanupTimeoutRef.current = window.setTimeout(() => {
      clearFloatingDragState()
      dragCleanupTimeoutRef.current = null
    }, 16)
  }

  const resolveDraggedTab = (event?: React.DragEvent<HTMLElement>) => {
    if (draggingFloatingTab && FLOATING_TAB_KEYS.has(draggingFloatingTab)) return draggingFloatingTab
    if (!event) return null
    const fromCustom = event.dataTransfer.getData('text/arch-dock-tab')
    if (fromCustom && FLOATING_TAB_KEYS.has(fromCustom as Screen)) return fromCustom as Screen
    const fromText = event.dataTransfer.getData('text/plain')
    if (fromText && FLOATING_TAB_KEYS.has(fromText as Screen)) return fromText as Screen
    return null
  }

  const handleDockItemDragOver = (overKey: string, event: React.DragEvent<HTMLButtonElement>) => {
    if (!draggingFloatingTab) return
    const withoutDragged = dockedFloatingTabs.filter((key) => key !== draggingFloatingTab)
    const overIndex = withoutDragged.indexOf(overKey as Screen)
    if (overIndex < 0) return
    event.stopPropagation()
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    const insertBefore = event.clientX < rect.left + (rect.width / 2)
    setDockInsertIndex(insertBefore ? overIndex : overIndex + 1)
    setDockDropActive(true)
  }

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
            onOpenCooking={() => setScreen('cooking')}
          />
        )}
        {screen === "attendance" && (
          <AttendanceScreen
            attendance={attendance}
            parserStatus={attendanceParserStatus}
            parserHint={attendanceParserHint}
            calendarEvents={calendarEvents}
            timetableByDay={timetableByDay}
            dayOrder={dayOrder}
            predictionCache={predictionCacheState}
            onPredictionCacheChange={setPredictionCacheState}
            quickMenuOpen={globalQuickMenuOpen}
          />
        )}
        {screen === "schedule" && (
          <ScheduleScreen
            key={dayOrder ?? 'none'}
            initialDay={dayOrder}
            attendance={attendance}
            timetableByDay={timetableByDay}
            onOpenCalendar={() => setScreen('calendar')}
          />
        )}
        {screen === "calendar" && (
          <CalendarScreen
            events={calendarEvents}
            loading={calendarLoading}
            error={calendarError}
            onDayOrderSync={setDayOrder}
          />
        )}
        {screen === "marks" && <MarksScreen attendance={attendance} marks={marks} />}
        {screen === "mess" && <MessScreen />}
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
          draggableTabKeys={dockedFloatingTabs}
          dockPlaceholderIndex={dockDropActive ? (dockInsertIndex ?? dockOrderWithoutDragged.length) : null}
          activeKey={screen}
          onTabDragStart={(key, event) => {
            startFloatingDrag(key, 'dock', event)
          }}
          onTabDragOver={(key, event) => {
            handleDockItemDragOver(key, event)
          }}
          onTabDragEnd={() => {
            scheduleClearFloatingDragState()
          }}
          onSelect={(key) => {
            setGlobalQuickMenuOpen(false)
            setScreen(key as Screen)
          }}
          dockDropActive={dockDropActive}
          onDockDragOver={(event) => {
            const dragged = resolveDraggedTab(event)
            if (dragged) {
              if (!draggingFloatingTab) setDraggingFloatingTab(dragged)
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              if (event.target === event.currentTarget) {
                const withoutDragged = dockedFloatingTabs.filter((key) => key !== dragged)
                setDockInsertIndex(withoutDragged.length)
              }
              setDockDropActive(true)
            }
          }}
          onDockDrop={(event) => {
            const dragged = resolveDraggedTab(event)
            if (!dragged) return
            event.preventDefault()
            if (!draggingFloatingTab) setDraggingFloatingTab(dragged)
            const withoutDragged = dockedFloatingTabs.filter((key) => key !== dragged)
            commitDropToDock(dragged, dockInsertIndex ?? withoutDragged.length)
            setGlobalQuickMenuOpen(false)
            clearFloatingDragState()
          }}
          trailing={(
            <div ref={globalQuickMenuRef} className={`global-smooth-menu${globalQuickMenuOpen ? ' open' : ''}`}>
              <button
                className="global-smooth-trigger"
                onClick={() => setGlobalQuickMenuOpen((prev) => !prev)}
                aria-label="Open quick tabs menu"
              >
                <span className="global-smooth-trigger-dots">•••</span>
              </button>
              <div
                ref={globalQuickMenuPanelRef}
                className={`global-smooth-panel${menuDropActive ? ' menu-drop-active' : ''}${menuHasScroll ? ' menu-has-scroll' : ''}${menuLiquidActive ? ' menu-liquid-active' : ''}`}
                onWheel={() => {
                  triggerMenuLiquidEffect()
                }}
                onTouchMove={() => {
                  triggerMenuLiquidEffect()
                }}
                onScroll={(event) => {
                  setMenuHasScroll(event.currentTarget.scrollTop > 1)
                  triggerMenuLiquidEffect()
                }}
                onDragOver={(event) => {
                  const dragged = resolveDraggedTab(event)
                  if (!dragged) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  if (dockedFloatingTabs.includes(dragged)) {
                    event.stopPropagation()
                    if (!draggingFloatingTab) setDraggingFloatingTab(dragged)
                    setMenuDropActive(true)
                    triggerMenuLiquidEffect()
                  }
                }}
                onDragLeave={(event) => {
                  const panelRect = event.currentTarget.getBoundingClientRect()
                  const stillInsidePanel =
                    event.clientX >= panelRect.left &&
                    event.clientX <= panelRect.right &&
                    event.clientY >= panelRect.top &&
                    event.clientY <= panelRect.bottom
                  if (!stillInsidePanel) {
                    setMenuDropActive(false)
                  }
                }}
                onDrop={(event) => {
                  const dragged = resolveDraggedTab(event)
                  if (dragged && dockedFloatingTabs.includes(dragged)) {
                    event.stopPropagation()
                    event.preventDefault()
                    setDockedFloatingTabs((prev) => prev.filter((tab) => tab !== dragged))
                    setGlobalQuickMenuOpen(true)
                    triggerMenuLiquidEffect()
                  }
                  clearFloatingDragState()
                }}
              >
                {menuFloatingItems.length === 0 ? (
                  <div className="global-smooth-empty">All tabs are in the dock</div>
                ) : menuFloatingItems.map((item) => {
                  const Icon = item.icon
                  const isDragging = draggingFloatingTab === item.key
                  return (
                    <div key={item.key} className="global-smooth-item-wrap">
                      <button
                        draggable
                        className={`global-smooth-item${isDragging ? ' dragging' : ''}`}
                        onDragStart={(event) => {
                          startFloatingDrag(item.key, 'menu', event)
                          setMenuDropActive(true)
                        }}
                        onDragEnd={() => {
                          scheduleClearFloatingDragState()
                        }}
                        onClick={() => {
                          setGlobalQuickMenuOpen(false)
                          setScreen(item.key as Screen)
                        }}
                      >
                        <span className="global-smooth-item-icon"><Icon size={16} strokeWidth={2.2} /></span>
                        <span>{item.title}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        />
      )}
    </div>
  )
}

