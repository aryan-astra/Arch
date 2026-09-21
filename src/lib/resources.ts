// Question-paper resource utilities (pure, testable).
//
// Pipeline rules enforced here: validate → sha256 → dedupe → canonical
// filename → metadata. Storage/network live in adapters, not here.

export const MAX_PDF_BYTES = 25 * 1024 * 1024

export interface PdfMetadata {
  year: string
  unit: string
  subject: string
  courseCode?: string
  semester?: string
  program?: string
  department?: string
  examType?: string
  academicYear?: string
  uploaderId: string
}

export type PdfValidation = { ok: true } | { ok: false; reason: string }

/** Validate magic bytes + size. Never throws. */
export function validatePdf(bytes: Uint8Array): PdfValidation {
  if (!(bytes instanceof Uint8Array)) return { ok: false, reason: 'not-bytes' }
  if (bytes.length < 5) return { ok: false, reason: 'too-small' }
  if (bytes.length > MAX_PDF_BYTES) return { ok: false, reason: 'too-large' }
  const magic = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0, bytes[4] ?? 0)
  if (!magic.startsWith('%PDF-')) return { ok: false, reason: 'bad-magic' }
  return { ok: true }
}

/** SHA-256 hex digest (exact-duplicate key). Uses WebCrypto (browser + node). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function slug(part: string): string {
  return part
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'unknown'
}

/**
 * Canonical filename: YEAR first, then UNIT, then subject/course, exam, hash.
 * Example: `2025-unit-3-operating-systems-cycle-test-2-a1b2c3d4.pdf`
 */
export function canonicalFilename(meta: PdfMetadata, hashHex: string): string {
  const parts = [
    slug(meta.year || 'unknown-year'),
    slug(meta.unit ? `unit-${meta.unit}` : 'unit-unknown'),
    slug(meta.subject),
  ]
  if (meta.courseCode) parts.push(slug(meta.courseCode))
  if (meta.examType) parts.push(slug(meta.examType))
  parts.push(hashHex.slice(0, 8))
  return `${parts.join('-')}.pdf`
}

/** Metadata completeness check for upload gating. */
export function missingMetadata(meta: Partial<PdfMetadata>): string[] {
  const missing: string[] = []
  if (!meta.year?.trim()) missing.push('year')
  if (!meta.unit?.trim()) missing.push('unit')
  if (!meta.subject?.trim()) missing.push('subject')
  if (!meta.uploaderId?.trim()) missing.push('uploaderId')
  return missing
}
