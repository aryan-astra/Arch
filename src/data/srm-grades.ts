export type GradeCode = 'O' | 'A+' | 'A' | 'B+' | 'B' | 'C' | 'Ab' | '*' | 'I' | 'W' | 'F'

export interface GradeBand {
  code: GradeCode
  label: string
  minPct: number
  maxPct: number
  gradePoint: number
  result: 'PASS' | 'FAIL' | 'INCOMPLETE' | 'WITHHELD'
  showInProjector: boolean
}

export const SRM_GRADE_BANDS: GradeBand[] = [
  { code: 'O', label: 'O', minPct: 91, maxPct: 100, gradePoint: 10, result: 'PASS', showInProjector: true },
  { code: 'A+', label: 'A+', minPct: 81, maxPct: 90, gradePoint: 9, result: 'PASS', showInProjector: true },
  { code: 'A', label: 'A', minPct: 71, maxPct: 80, gradePoint: 8, result: 'PASS', showInProjector: true },
  { code: 'B+', label: 'B+', minPct: 61, maxPct: 70, gradePoint: 7, result: 'PASS', showInProjector: true },
  { code: 'B', label: 'B', minPct: 56, maxPct: 60, gradePoint: 6, result: 'PASS', showInProjector: true },
  { code: 'C', label: 'C', minPct: 50, maxPct: 55, gradePoint: 5, result: 'PASS', showInProjector: true },
  { code: 'F', label: 'RA', minPct: 0, maxPct: 49, gradePoint: 0, result: 'FAIL', showInProjector: false },
  { code: 'Ab', label: 'Absent', minPct: 0, maxPct: 100, gradePoint: 0, result: 'INCOMPLETE', showInProjector: false },
  { code: '*', label: 'Withheld', minPct: 0, maxPct: 100, gradePoint: 0, result: 'WITHHELD', showInProjector: false },
  { code: 'I', label: 'Incomplete', minPct: 0, maxPct: 100, gradePoint: 0, result: 'FAIL', showInProjector: false },
  { code: 'W', label: 'Withheld', minPct: 0, maxPct: 100, gradePoint: 0, result: 'WITHHELD', showInProjector: false },
]

export const TEST_LABEL_DISPLAY: Record<string, string> = {
  'FT-I': 'Formative Test I',
  'FT-II': 'Formative Test II',
  'FT-III': 'Formative Test III',
  'FP-I': 'Formative Practical I',
  'FP-II': 'Formative Practical II',
  'FJ-I': 'Formative Test I',
  'FJ-II': 'Formative Test II',
  'FJ 1': 'Formative Test I',
  'FJ 2': 'Formative Test II',
}

export const TEST_LABEL_SHORT: Record<string, string> = {
  'FT-I': 'FT-I',
  'FT-II': 'FT-II',
  'FT-III': 'FT-III',
  'FP-I': 'FP-I',
  'FP-II': 'FP-II',
  'FJ-I': 'FT-I',
  'FJ-II': 'FT-II',
  'FJ 1': 'FT-I',
  'FJ 2': 'FT-II',
}

export function parseTestCell(cell: string): { label: string; max: number } {
  const [rawLabel, rawMax] = String(cell ?? '').split('/')
  return {
    label: (rawLabel ?? '').trim(),
    max: parseFloat(rawMax ?? '0') || 0,
  }
}

const PASS_BANDS = SRM_GRADE_BANDS
  .filter((band) => band.showInProjector)
  .sort((a, b) => a.minPct - b.minPct)

const FAIL_BAND = SRM_GRADE_BANDS.find((band) => band.code === 'F')

export function getGradeBand(pct: number): GradeBand {
  if (!Number.isFinite(pct)) {
    return FAIL_BAND ?? SRM_GRADE_BANDS[0]
  }

  if (pct < 50) {
    return FAIL_BAND ?? SRM_GRADE_BANDS[0]
  }

  let lo = 0
  let hi = PASS_BANDS.length - 1
  let result = PASS_BANDS[0]

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const current = PASS_BANDS[mid]
    if (!current) break

    if (current.minPct <= pct) {
      result = current
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return result ?? FAIL_BAND ?? SRM_GRADE_BANDS[0]
}

export function minEndSemNeeded(
  internalScored: number,
  targetGrade: GradeCode,
  isLabCourse = false,
): { needed: number; achievable: boolean; maxGrade: GradeCode } {
  const band = SRM_GRADE_BANDS.find((candidate) => candidate.code === targetGrade)
  if (!band) {
    throw new Error(`Unknown grade: ${targetGrade}`)
  }

  const internalWeight = isLabCourse ? 60 : 40
  const endSemWeight = isLabCourse ? 40 : 60
  const boundedInternal = Math.max(0, Math.min(internalWeight, internalScored))
  const neededRaw = band.minPct - boundedInternal
  const needed = Math.ceil(neededRaw)
  const achievable = needed <= endSemWeight && needed >= 0
  const maxAchievablePct = boundedInternal + endSemWeight
  const maxGrade = getGradeBand(maxAchievablePct).code

  return {
    needed,
    achievable,
    maxGrade,
  }
}
