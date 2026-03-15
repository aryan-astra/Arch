// Session persistence — trusted device (180d) or browser session (2d)

const TRUSTED_KEY = 'academia.trusted-session'
const BROWSER_KEY = 'academia.browser-session'

const TRUSTED_TTL_MS = 180 * 24 * 60 * 60 * 1000
const BROWSER_TTL_MS = 2 * 24 * 60 * 60 * 1000

export interface SessionSnapshot {
  email: string
  trusted: boolean
  loginAt: number
  expiresAt: number
}

export const loadSessionSnapshot = (): SessionSnapshot | null => {
  const now = Date.now()
  for (const [store, key] of [
    [window.localStorage, TRUSTED_KEY],
    [window.sessionStorage, BROWSER_KEY],
  ] as [Storage, string][]) {
    const raw = store.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as SessionSnapshot
      if (typeof parsed.expiresAt === 'number' && parsed.expiresAt > now) return parsed
      store.removeItem(key)
    } catch {
      store.removeItem(key)
    }
  }
  return null
}

export const persistSessionSnapshot = (opts: { email: string; trusted: boolean; loginAt: number }): void => {
  const ttl = opts.trusted ? TRUSTED_TTL_MS : BROWSER_TTL_MS
  const snapshot: SessionSnapshot = { ...opts, expiresAt: opts.loginAt + ttl }
  const raw = JSON.stringify(snapshot)
  window.localStorage.removeItem(TRUSTED_KEY)
  window.sessionStorage.removeItem(BROWSER_KEY)
  if (opts.trusted) {
    window.localStorage.setItem(TRUSTED_KEY, raw)
  } else {
    window.sessionStorage.setItem(BROWSER_KEY, raw)
  }
}

export const refreshSessionSnapshot = (heartbeatAt = Date.now()): SessionSnapshot | null => {
  const current = loadSessionSnapshot()
  if (!current) return null
  const ttl = current.trusted ? TRUSTED_TTL_MS : BROWSER_TTL_MS
  const next: SessionSnapshot = { ...current, expiresAt: heartbeatAt + ttl }
  const raw = JSON.stringify(next)
  if (current.trusted) {
    window.localStorage.setItem(TRUSTED_KEY, raw)
    window.sessionStorage.removeItem(BROWSER_KEY)
  } else {
    window.sessionStorage.setItem(BROWSER_KEY, raw)
    window.localStorage.removeItem(TRUSTED_KEY)
  }
  return next
}

export const clearSessionSnapshot = (): void => {
  window.localStorage.removeItem(TRUSTED_KEY)
  window.sessionStorage.removeItem(BROWSER_KEY)
}
