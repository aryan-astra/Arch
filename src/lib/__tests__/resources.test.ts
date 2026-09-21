import { describe, expect, it } from 'vitest'
import {
  canonicalFilename,
  MAX_PDF_BYTES,
  missingMetadata,
  sha256Hex,
  validatePdf,
} from '../resources'

const pdfBytes = (size = 64): Uint8Array => {
  const b = new Uint8Array(size)
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-
  magic.forEach((v, i) => {
    b[i] = v
  })
  return b
}

describe('pdf resources', () => {
  it('accepts a minimal valid PDF by magic bytes', () => {
    expect(validatePdf(pdfBytes())).toEqual({ ok: true })
  })

  it('rejects non-PDF, tiny, and oversized payloads', () => {
    expect(validatePdf(new Uint8Array([1, 2, 3]))).toEqual({ ok: false, reason: 'too-small' })
    expect(validatePdf(new Uint8Array(64))).toEqual({ ok: false, reason: 'bad-magic' })
    expect(validatePdf(new Uint8Array(MAX_PDF_BYTES + 1)).ok).toBe(false)
  })

  it('produces stable sha-256 digests for dedupe keys', async () => {
    const a = await sha256Hex(pdfBytes())
    const b = await sha256Hex(pdfBytes())
    const c = await sha256Hex(pdfBytes(65))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('builds year-first canonical filenames', async () => {
    const hash = await sha256Hex(pdfBytes())
    const name = canonicalFilename(
      { year: '2025', unit: '3', subject: 'Operating Systems', examType: 'Cycle Test 2', uploaderId: 'u1' },
      hash,
    )
    expect(name.startsWith('2025-unit-3-operating-systems')).toBe(true)
    expect(name.endsWith('.pdf')).toBe(true)
    expect(name).toContain(hash.slice(0, 8))
  })

  it('gates uploads on required metadata', () => {
    expect(missingMetadata({})).toEqual(['year', 'unit', 'subject', 'uploaderId'])
    expect(missingMetadata({ year: '2025', unit: '1', subject: 'DBMS', uploaderId: 'u1' })).toEqual([])
  })
})
