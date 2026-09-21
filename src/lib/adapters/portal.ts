// Student Portal adapter — typed skeleton, NOT a working integration.
//
// What is verified: the portal lives at sp.srmist.edu.in, is independent
// from Academia auth, may require an image CAPTCHA, and (per prior HAR
// investigation notes — no capture is present in this repo) exposes
// server-rendered JSP tables for attendance/marks.
//
// What is NOT verified: exact endpoint paths, parameters, session-cookie
// shape, CAPTCHA image format. The DOCUMENTED_ENDPOINTS below are reported
// names only. `verified` stays false until a real capture confirms them, and
// every data method refuses while unverified. Do not flip this flag without
// a sanitized fixture proving the parser.

import type { SourceSystem } from '../../domain/types'
import {
  SourceUnavailableError,
  type AdapterCapability,
  type Envelope,
  type SourceAdapter,
} from './types'

export const PORTAL_PARSER_VERSION = 'portal-adapter/0-unverified'

/** Endpoint names reported by prior HAR investigation (UNVERIFIED here). */
export const DOCUMENTED_ENDPOINTS = [
  'studentAttendanceDetails.jsp',
  'studentInternalMarkDetails.jsp',
  'studentInternalMarkDetailsInner.jsp',
] as const

export type PortalSessionState =
  | 'anonymous'
  | 'captcha-required'
  | 'authenticated'
  | 'credentials-invalid'

export interface PortalCaptchaChallenge {
  /** Opaque server-side handle for the partially completed auth attempt. */
  attemptId: string
  /** Image bytes (PNG/JPEG) to render for the user. Never logged. */
  image: Uint8Array
  mime: string
  issuedAt: string
}

export interface PortalCredentials {
  username: string
  /** Stored server-side only; see server credential vault design. */
  passwordRef: string
}

export class StudentPortalAdapter implements SourceAdapter {
  readonly system: SourceSystem = 'student-portal'
  readonly capabilities: AdapterCapability[] = ['attendance', 'marks']

  /** Flipped only after a real capture + fixture proves the parser. */
  readonly verified = false

  private session: PortalSessionState = 'anonymous'

  isAvailable(): boolean {
    return this.verified && this.session === 'authenticated'
  }

  sessionState(): PortalSessionState {
    return this.session
  }

  /** Begin login. Resolves to a user-assisted CAPTCHA challenge when required. */
  async beginLogin(
    _credentials: PortalCredentials,
  ): Promise<{ state: PortalSessionState; captcha?: PortalCaptchaChallenge }> {
    void _credentials
    throw new SourceUnavailableError(
      this.system,
      'portal integration is not implemented (no verified capture in repo)',
    )
  }

  /** Complete login with the user-supplied CAPTCHA text. */
  async submitCaptcha(
    _attemptId: string,
    _text: string,
  ): Promise<{ state: PortalSessionState }> {
    void _attemptId
    void _text
    throw new SourceUnavailableError(
      this.system,
      'portal integration is not implemented (no verified capture in repo)',
    )
  }

  async getAttendance(): Promise<Envelope<never>> {
    throw new SourceUnavailableError(
      this.system,
      'portal attendance parser is unverified — refusing to guess table shapes',
    )
  }

  async getMarks(): Promise<Envelope<never>> {
    throw new SourceUnavailableError(
      this.system,
      'portal marks parser is unverified — refusing to guess table shapes',
    )
  }
}
