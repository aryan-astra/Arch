// Exact-number preservation.
//
// Rule: never silently round source data. The `raw` string is the official
// representation (what SRM displayed); `numeric` is a lossy twin used ONLY
// for Arch calculations and must never be rendered as an official value.

export interface ExactValue {
  /** Verbatim source representation, e.g. "74.666...". Empty when missing. */
  raw: string
  /** Numeric twin for math, or null when unparseable/missing. */
  numeric: number | null
}

/** Build an ExactValue from a source string. Never throws. */
export function exact(raw: unknown): ExactValue {
  if (typeof raw !== 'string') {
    return typeof raw === 'number' && Number.isFinite(raw)
      ? { raw: String(raw), numeric: raw }
      : { raw: '', numeric: null }
  }
  const trimmed = raw.trim()
  if (!trimmed) return { raw: '', numeric: null }
  const numeric = Number(trimmed)
  return { raw: trimmed, numeric: Number.isFinite(numeric) ? numeric : null }
}

/** True when the source provided no usable value (missing ≠ zero). */
export function isMissing(value: ExactValue): boolean {
  return value.numeric === null
}

/**
 * Render the official value. Falls back to `fallback` (default '—') when
 * missing — callers must never substitute 0.
 */
export function displayOfficial(value: ExactValue, fallback = '—'): string {
  if (!value.raw) return fallback
  return value.raw
}

/**
 * Compare two exact percentages without float drift for threshold checks.
 * Returns null when either side is missing.
 */
export function comparePct(a: ExactValue, b: ExactValue): number | null {
  if (a.numeric === null || b.numeric === null) return null
  if (a.numeric === b.numeric) return 0
  return a.numeric < b.numeric ? -1 : 1
}
