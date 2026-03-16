/**
 * Academia Auth Server — real Zoho IAM login for any SRM user
 * Handles: login, auto-terminate sessions, proxying authenticated requests
 */

const express = require('express')
const axios = require('axios')
const { wrapper } = require('axios-cookiejar-support')
const { CookieJar } = require('tough-cookie')
const cors = require('cors')
const { randomBytes } = require('crypto')
const https = require('https')
const { createClient } = require('redis')

const app = express()
app.use(express.json())
app.use(cors({ origin: true, credentials: true }))

const BASE = 'https://academia.srmist.edu.in'
const ORG = '40-10002227248'
const PORTAL_URL = `${BASE}/portal/academia-academic-services`
const SERVICE_URL = `${PORTAL_URL}/redirectFromLogin`

// In-memory session store: token -> cookieString
const sessions = new Map()
const TRUSTED_TTL_MS = 180 * 24 * 60 * 60 * 1000
const BROWSER_TTL_MS = 2 * 24 * 60 * 60 * 1000
const LOGIN_TIMEOUT_MS = 45000
const PROXY_TIMEOUT_MS = 30000
const LOGIN_TIMEOUT_RETRIES = 1
const RETRY_BACKOFF_MS = 700
const SESSION_KEY_PREFIX = 'arch:session:'
const SESSION_REDIS_WRITE_INTERVAL_MS = 10 * 60 * 1000
const REDIS_URL = process.env.REDIS_URL || process.env.RENDER_REDIS_URL || ''
const SRM_TLS_INSECURE = process.env.SRM_TLS_INSECURE === '1'
const WEB_PUSH_PUBLIC_KEY = String(process.env.WEB_PUSH_PUBLIC_KEY || '').trim()
const WEB_PUSH_PRIVATE_KEY = String(process.env.WEB_PUSH_PRIVATE_KEY || '').trim()
const WEB_PUSH_SUBJECT = String(process.env.WEB_PUSH_SUBJECT || '').trim()
const ADMIN_USER = String(process.env.ADMIN_USER || 'as6977').trim().toLowerCase()
const ADMIN_METRICS_TOKEN = process.env.ADMIN_METRICS_TOKEN || ''
const AUTH_EVENT_LIMIT = 200
const SRM_HTTPS_AGENT = SRM_TLS_INSECURE
  ? new https.Agent({ rejectUnauthorized: false })
  : undefined
let redisClient = null
const authEvents = []

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

if (SRM_TLS_INSECURE) {
  console.warn('[tls] SRM_TLS_INSECURE=1 enabled. Certificate validation is bypassed only for SRM requests.')
}

function makeClient(jar) {
  return wrapper(axios.create({
    jar,
    withCredentials: true,
    maxRedirects: 5,
    validateStatus: s => s < 500,
    ...(SRM_HTTPS_AGENT ? { httpsAgent: SRM_HTTPS_AGENT } : {}),
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json, text/html, */*',
      'Accept-Language': 'en-IN,en;q=0.9',
    },
    timeout: LOGIN_TIMEOUT_MS,
  }))
}

function isTimeoutError(err) {
  if (!err) return false
  const msg = String(err.message || '')
  return err.code === 'ECONNABORTED' || /timeout/i.test(msg)
}

async function withTimeoutRetry(requestFn, label) {
  for (let attempt = 0; attempt <= LOGIN_TIMEOUT_RETRIES; attempt += 1) {
    try {
      return await requestFn()
    } catch (err) {
      if (!isTimeoutError(err) || attempt === LOGIN_TIMEOUT_RETRIES) throw err
      const delay = RETRY_BACKOFF_MS * (attempt + 1)
      console.warn(`[login] ${label} timed out. Retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

function csrfFromJar(jar) {
  const cookies = jar.toJSON().cookies || []
  const c = cookies.find(c => c.key === 'iamcsr')
  return c ? c.value : ''
}

function sessionKey(token) {
  return `${SESSION_KEY_PREFIX}${token}`
}

async function initRedisStore() {
  if (!REDIS_URL) {
    console.warn('[session-store] REDIS_URL not set. Using in-memory session store.')
    return
  }

  const client = createClient({ url: REDIS_URL })
  client.on('error', (err) => {
    console.error('[session-store] Redis error:', err.message)
  })
  await client.connect()
  redisClient = client
  console.log('[session-store] Redis session store connected.')
}

async function persistSession(token, session) {
  if (redisClient) {
    const ttlMs = Math.max(1000, (session.expiresAt || Date.now()) - Date.now())
    await redisClient.set(sessionKey(token), JSON.stringify(session), { PX: ttlMs })
    return
  }
  sessions.set(token, session)
}

async function deleteSession(token) {
  if (!token || typeof token !== 'string') return
  if (redisClient) {
    await redisClient.del(sessionKey(token))
    return
  }
  sessions.delete(token)
}

async function getActiveSession(token) {
  if (!token || typeof token !== 'string') return null
  let session = null
  let fromRedis = false
  if (redisClient) {
    fromRedis = true
    const raw = await redisClient.get(sessionKey(token))
    if (!raw) return null
    try {
      session = JSON.parse(raw)
    } catch (err) {
      console.warn('[session-store] Invalid session payload, deleting token:', token)
      await redisClient.del(sessionKey(token))
      return null
    }
  } else {
    session = sessions.get(token)
  }
  if (!session) return null
  if (!fromRedis && typeof session.expiresAt === 'number' && session.expiresAt <= Date.now()) {
    await deleteSession(token)
    return null
  }
  if (fromRedis && (!session.cookieString || !session.email)) {
    await deleteSession(token)
    return null
  }
  return session
}

async function touchSession(token, session) {
  const ttl = session.trusted ? TRUSTED_TTL_MS : BROWSER_TTL_MS
  const now = Date.now()
  session.expiresAt = now + ttl

  if (redisClient) {
    const key = sessionKey(token)
    const shouldRewritePayload =
      typeof session.lastSeenAt !== 'number' ||
      (now - session.lastSeenAt) >= SESSION_REDIS_WRITE_INTERVAL_MS

    if (shouldRewritePayload) {
      session.lastSeenAt = now
      await persistSession(token, session)
      return
    }

    if (typeof redisClient.pExpire === 'function') {
      await redisClient.pExpire(key, ttl)
    } else {
      await redisClient.expire(key, Math.max(1, Math.ceil(ttl / 1000)))
    }
    return
  }

  session.lastSeenAt = now
  await persistSession(token, session)
}

async function sessionCount() {
  if (redisClient) {
    let cursor = '0'
    let count = 0
    do {
      const result = await redisClient.scan(cursor, {
        MATCH: `${SESSION_KEY_PREFIX}*`,
        COUNT: 250,
      })
      const nextCursor = Array.isArray(result) ? result[0] : result.cursor
      const keys = Array.isArray(result) ? (result[1] || []) : result.keys
      count += Array.isArray(keys) ? keys.length : 0
      cursor = nextCursor
    } while (cursor !== '0')
    return count
  }
  return sessions.size
}

function hasUpstreamAuthDrift(contentType, payload) {
  if (typeof payload !== 'string') return false
  const ct = String(contentType || '').toLowerCase()
  if (!ct.includes('text/html')) return false
  const snippet = payload.slice(0, 6000).toLowerCase()
  const hasZohoSignin = snippet.includes('/accounts/p/') && snippet.includes('signin')
  const hasLoginIdentifiers =
    snippet.includes('name="login_id"') ||
    snippet.includes("name='login_id'") ||
    snippet.includes('id="password"') ||
    snippet.includes('signin/v2/lookup')
  const hasSessionGate = snippet.includes('block-sessions') || snippet.includes('sessions-reminder')
  return hasZohoSignin && (hasLoginIdentifiers || hasSessionGate)
}

function normalizeIdentity(value) {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const first = forwarded.split(',')[0] || ''
    return first.trim()
  }
  return req.ip || req.socket?.remoteAddress || ''
}

function recordAuthEvent(type, details = {}) {
  const event = {
    ts: new Date().toISOString(),
    type,
    ...details,
  }
  authEvents.push(event)
  if (authEvents.length > AUTH_EVENT_LIMIT) {
    authEvents.splice(0, authEvents.length - AUTH_EVENT_LIMIT)
  }
}

function checkAdminAccess(req) {
  const adminToken = String(req.headers['x-admin-token'] || '')
  const adminUser = normalizeIdentity(String(req.headers['x-admin-user'] || ''))
  if (!ADMIN_METRICS_TOKEN) {
    return { ok: false, reason: 'admin_token_not_configured' }
  }
  if (!adminToken || adminToken !== ADMIN_METRICS_TOKEN) {
    return { ok: false, reason: 'invalid_admin_token' }
  }
  if (!adminUser || adminUser !== ADMIN_USER) {
    return { ok: false, reason: 'admin_user_not_allowed' }
  }
  return { ok: true }
}

async function listActiveSessions() {
  if (redisClient) {
    let cursor = '0'
    const keys = []
    do {
      const result = await redisClient.scan(cursor, {
        MATCH: `${SESSION_KEY_PREFIX}*`,
        COUNT: 250,
      })
      const nextCursor = Array.isArray(result) ? result[0] : result.cursor
      const pageKeys = Array.isArray(result) ? (result[1] || []) : result.keys
      if (Array.isArray(pageKeys) && pageKeys.length > 0) {
        keys.push(...pageKeys)
      }
      cursor = nextCursor
    } while (cursor !== '0')

    if (keys.length === 0) return []
    const payloads =
      typeof redisClient.mGet === 'function'
        ? await redisClient.mGet(keys)
        : await Promise.all(keys.map((key) => redisClient.get(key)))
    const active = []
    for (let idx = 0; idx < keys.length; idx += 1) {
      const key = keys[idx]
      const raw = payloads[idx]
      if (!raw) continue
      try {
        const session = JSON.parse(raw)
        if (!session?.email || !session?.cookieString) continue
        active.push({ token: key.replace(SESSION_KEY_PREFIX, ''), session })
      } catch {
        await redisClient.del(key)
      }
    }
    return active
  }

  const now = Date.now()
  const active = []
  for (const [token, session] of sessions.entries()) {
    if (typeof session?.expiresAt === 'number' && session.expiresAt <= now) {
      sessions.delete(token)
      continue
    }
    active.push({ token, session })
  }
  return active
}

function summarizeActiveUsers(activeSessions) {
  const map = new Map()
  for (const { session } of activeSessions) {
    const email = normalizeIdentity(session?.email || 'unknown')
    const prev = map.get(email) || {
      email,
      sessions: 0,
      trustedSessions: 0,
      firstSeenAt: null,
      lastSeenAt: null,
    }
    prev.sessions += 1
    if (session?.trusted) prev.trustedSessions += 1
    const createdAt = typeof session?.createdAt === 'number' ? session.createdAt : null
    const lastSeenAt = typeof session?.lastSeenAt === 'number' ? session.lastSeenAt : null
    if (createdAt && (!prev.firstSeenAt || createdAt < prev.firstSeenAt)) prev.firstSeenAt = createdAt
    if (lastSeenAt && (!prev.lastSeenAt || lastSeenAt > prev.lastSeenAt)) prev.lastSeenAt = lastSeenAt
    map.set(email, prev)
  }

  return Array.from(map.values())
    .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0))
    .map((row) => ({
      email: row.email,
      sessions: row.sessions,
      trustedSessions: row.trustedSessions,
      firstSeenAt: row.firstSeenAt ? new Date(row.firstSeenAt).toISOString() : null,
      lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
    }))
}

function pushDesignStatusPayload() {
  const hasPublicKey = WEB_PUSH_PUBLIC_KEY.length > 0
  const hasPrivateKey = WEB_PUSH_PRIVATE_KEY.length > 0
  const hasSubject = WEB_PUSH_SUBJECT.length > 0
  const enabled = hasPublicKey && hasPrivateKey && hasSubject

  return {
    enabled,
    phase: enabled ? 'subscription-ready' : 'design-only',
    requirements: [
      hasPublicKey ? 'WEB_PUSH_PUBLIC_KEY configured' : 'Configure WEB_PUSH_PUBLIC_KEY',
      hasPrivateKey ? 'WEB_PUSH_PRIVATE_KEY configured' : 'Configure WEB_PUSH_PRIVATE_KEY',
      hasSubject ? 'WEB_PUSH_SUBJECT configured' : 'Configure WEB_PUSH_SUBJECT',
      'Store PushSubscription endpoint per authenticated user',
      'Run attendance-diff sender worker to dispatch notifications',
    ],
    notes: enabled
      ? [
        'Push keys are configured. Next step is subscription persistence and sender worker trigger.',
      ]
      : [
        'Closed-app web push design is ready; backend keys and sender worker are pending.',
      ],
  }
}

// POST /auth/login — authenticate with Zoho, return sessionToken
app.post('/auth/login', async (req, res) => {
  const { email, password, trusted = false } = req.body || {}
  const normalizedEmail = normalizeIdentity(email)
  if (!email || !password) {
    recordAuthEvent('login_rejected', {
      reason: 'missing_credentials',
      email: normalizedEmail,
      ip: clientIp(req),
    })
    return res.status(400).json({ error: 'Email and password required', reason: 'missing_credentials' })
  }

  const jar = new CookieJar()
  const client = makeClient(jar)
  const cliTime = Date.now()
  const headers = () => {
    const csrf = csrfFromJar(jar)
    return {
      'Origin': BASE,
      'Referer': `${BASE}/accounts/p/${ORG}/signin`,
      ...(csrf ? { 'X-ZCSRF-TOKEN': `iamcsrcoo=${csrf}` } : {}),
    }
  }

  try {
    // Step 1: Load sign-in page — seeds CSRF + session cookies
    await withTimeoutRetry(
      () => client.get(`${BASE}/accounts/p/${ORG}/signin`, {
        params: {
          hide_fp: 'true',
          orgtype: '40',
          service_language: 'en',
          css_url: '/srm_university/academia-academic-services/downloadPortalCustomCss/login',
          dcc: 'true',
          serviceurl: SERVICE_URL,
        },
      }),
      'signin bootstrap'
    )

    // Step 2: Locate (org discovery)
    await client.post(
      `${BASE}/accounts/p/${ORG}/accounts/public/api/locate`,
      null,
      { params: { cli_time: cliTime, orgtype: '40', service_language: 'en' }, headers: headers() }
    )

    // Step 3: Lookup — get userId + digest
    const lookupResp = await withTimeoutRetry(
      () => client.post(
        `${BASE}/accounts/p/${ORG}/signin/v2/lookup/${encodeURIComponent(email)}`,
        new URLSearchParams({
          mode: 'primary',
          cli_time: String(cliTime),
          orgtype: '40',
          service_language: 'en',
          serviceurl: SERVICE_URL,
        }),
        { headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } }
      ),
      'account lookup'
    )

    const lookupData = lookupResp.data
    // Zoho response: { lookup: { identifier: "userId", digest: "...", ... } }
    let userId = lookupData?.lookup?.identifier || lookupData?.data?.userId || lookupData?.userId
    let digest = lookupData?.lookup?.digest || lookupData?.data?.digest || lookupData?.digest

    if (!userId) {
      recordAuthEvent('login_failed', {
        reason: 'user_not_found',
        email: normalizedEmail,
        ip: clientIp(req),
      })
      return res.status(401).json({ error: 'User not found. Check your SRM email.', reason: 'user_not_found' })
    }

    // Step 4: Submit password
    const pwUrl = `${BASE}/accounts/p/${ORG}/signin/v2/primary/${userId}/password`
    const pwResp = await withTimeoutRetry(
      () => client.post(
        pwUrl,
        JSON.stringify({ passwordauth: { password } }),
        {
          params: {
            ...(digest ? { digest } : {}),
            cli_time: cliTime,
            orgtype: '40',
            service_language: 'en',
            serviceurl: SERVICE_URL,
          },
          headers: {
            ...headers(),
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          },
        }
      ),
      'password submit'
    )

    const pwData = pwResp.data
    // Zoho signals wrong password via status_code >= 400 in the body (HTTP status is still 200)
    // e.g. { status_code: 500, errors: [{ code: "IN102", message: "Invalid password" }] }
    const pwStatusCode = pwData?.status_code ?? 0
    const pwErrors = pwData?.errors
    if (pwStatusCode >= 400 || (Array.isArray(pwErrors) && pwErrors.length > 0)) {
      const msg = pwErrors?.[0]?.message || pwData?.message || pwData?.localized_message || 'Incorrect password'
      recordAuthEvent('login_failed', {
        reason: 'invalid_password',
        email: normalizedEmail,
        ip: clientIp(req),
      })
      return res.status(401).json({ error: msg, reason: 'invalid_password' })
    }
    // Also guard: if no redirect_uri at all, auth definitely failed
    const pwRedirectUri = pwData?.passwordauth?.redirect_uri
    if (!pwRedirectUri) {
      recordAuthEvent('login_failed', {
        reason: 'missing_redirect_uri',
        email: normalizedEmail,
        ip: clientIp(req),
      })
      return res.status(401).json({ error: 'Authentication failed. No redirect URI.', reason: 'missing_redirect_uri' })
    }

    const isBlockSessions = pwRedirectUri.includes('block-sessions')

    try {
      await client.get(pwRedirectUri, {
        headers: headers(),
        maxRedirects: 1,
        validateStatus: () => true,
      })
    } catch { /* ignore redirect errors */ }

    // Terminate using the correct endpoint for this flow
    if (isBlockSessions) {
      await client.delete(
        `${BASE}/accounts/p/${ORG}/webclient/v1/announcement/pre/blocksessions`,
        { headers: { ...headers(), 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, validateStatus: () => true }
      )
      await client.get(
        `${BASE}/accounts/p/${ORG}/preannouncement/block-sessions/next`,
        { params: { status: '2', serviceurl: SERVICE_URL }, headers: headers(), maxRedirects: 5, validateStatus: () => true }
      )
    } else {
      await client.delete(
        `${BASE}/accounts/p/${ORG}/webclient/v1/account/self/user/self/activesessions`,
        { headers: headers(), validateStatus: () => true }
      )
      await client.get(
        `${BASE}/accounts/p/${ORG}/announcement/sessions-reminder/next`,
        { params: { status: '2', serviceurl: SERVICE_URL }, headers: headers(), maxRedirects: 5, validateStatus: () => true }
      )
    }

    // Step 6: Access portal to get JSESSIONID
    await withTimeoutRetry(
      () => client.get(`${PORTAL_URL}/redirectFromLogin`, {
        headers: headers(),
        maxRedirects: 10,
        validateStatus: () => true,
      }),
      'portal redirect'
    )
    // Warm up the attendance page to ensure JSESSIONID is valid for the app
    const warmupResp = await withTimeoutRetry(
      () => client.get(`${BASE}/srm_university/academia-academic-services/page/My_Attendance`, {
        headers: headers(),
        validateStatus: () => true,
      }),
      'attendance warmup'
    )
    console.log(`[login] Warmup attendance page status: ${warmupResp.status}`)

    // Collect all cookies for this domain
    const allCookies = jar.toJSON().cookies || []
    console.log(`[login] Total cookies collected: ${allCookies.length} — ${allCookies.map(c => c.key).join(', ')}`)
    const cookieString = allCookies.map(c => `${c.key}=${c.value}`).join('; ')

    if (!cookieString) {
      recordAuthEvent('login_failed', {
        reason: 'cookie_not_obtained',
        email: normalizedEmail,
        ip: clientIp(req),
      })
      return res.status(401).json({ error: 'Authentication failed. Could not obtain session.', reason: 'cookie_not_obtained' })
    }

    const sessionToken = randomBytes(32).toString('hex')
    const now = Date.now()
    const ttl = trusted ? TRUSTED_TTL_MS : BROWSER_TTL_MS
    await persistSession(sessionToken, {
      cookieString,
      email: normalizedEmail,
      trusted: Boolean(trusted),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + ttl,
    })

    recordAuthEvent('login_success', {
      reason: 'authenticated',
      email: normalizedEmail,
      trusted: Boolean(trusted),
      ip: clientIp(req),
    })
    res.json({ success: true, sessionToken, trusted: Boolean(trusted), expiresAt: now + ttl })
  } catch (err) {
    console.error('Login error:', err.message)
    if (isTimeoutError(err)) {
      recordAuthEvent('login_failed', {
        reason: 'upstream_timeout',
        email: normalizedEmail,
        ip: clientIp(req),
      })
      return res.status(504).json({ error: 'Login timed out while contacting the SRM portal. Please retry once.', reason: 'upstream_timeout' })
    }
    recordAuthEvent('login_failed', {
      reason: 'upstream_error',
      email: normalizedEmail,
      ip: clientIp(req),
      detail: err.message,
    })
    res.status(500).json({ error: `Login failed: ${err.message}`, reason: 'upstream_error' })
  }
})

// DELETE /auth/sessions — terminate all active sessions for a logged-in user
app.delete('/auth/sessions', async (req, res) => {
  const token = req.headers['x-session-token']
  const session = await getActiveSession(token)
  if (!session) {
    recordAuthEvent('session_action_denied', {
      reason: 'session_missing',
      route: '/auth/sessions',
      ip: clientIp(req),
    })
    return res.status(401).json({ error: 'Not authenticated', reason: 'session_missing' })
  }

  try {
    await axios.delete(
      `${BASE}/accounts/p/${ORG}/webclient/v1/account/self/user/self/activesessions`,
      {
        headers: {
          Cookie: session.cookieString,
          'User-Agent': UA,
          'Origin': BASE,
          'Referer': `${BASE}/accounts/p/10002227248/signin`,
        },
        ...(SRM_HTTPS_AGENT ? { httpsAgent: SRM_HTTPS_AGENT } : {}),
        validateStatus: () => true,
      }
    )
    recordAuthEvent('manual_session_terminate', {
      reason: 'manual_terminate_all',
      email: normalizeIdentity(session.email),
      ip: clientIp(req),
    })
    res.json({ success: true })
  } catch (err) {
    recordAuthEvent('session_action_failed', {
      reason: 'terminate_failed',
      email: normalizeIdentity(session.email),
      ip: clientIp(req),
      detail: err.message,
    })
    res.status(500).json({ error: err.message })
  }
})

// POST /auth/logout — clear session
app.post('/auth/logout', async (req, res) => {
  const token = req.headers['x-session-token']
  try {
    const existing = await getActiveSession(token)
    if (token) await deleteSession(token)
    recordAuthEvent('logout', {
      reason: 'manual_logout',
      email: normalizeIdentity(existing?.email || ''),
      ip: clientIp(req),
    })
    res.json({ success: true })
  } catch (err) {
    recordAuthEvent('logout_failed', {
      reason: 'manual_logout_failed',
      ip: clientIp(req),
      detail: err.message,
    })
    res.status(500).json({ error: err.message })
  }
})

// GET /auth/validate — check if a session token is still alive
app.get('/auth/validate', async (req, res) => {
  const token = req.headers['x-session-token']
  const session = await getActiveSession(token)
  if (!session) {
    recordAuthEvent('session_invalid', {
      reason: 'session_missing',
      route: '/auth/validate',
      ip: clientIp(req),
    })
    return res.status(401).json({ valid: false, reason: 'session_missing' })
  }
  await touchSession(token, session)
  res.json({ valid: true, email: session.email, trusted: Boolean(session.trusted), expiresAt: session.expiresAt })
})

// GET /auth/push/status — closed-app push rollout design status
app.get('/auth/push/status', async (req, res) => {
  const token = req.headers['x-session-token']
  const session = await getActiveSession(token)
  if (!session) {
    recordAuthEvent('session_invalid', {
      reason: 'session_missing',
      route: '/auth/push/status',
      ip: clientIp(req),
    })
    return res.status(401).json({ error: 'Not authenticated', reason: 'session_missing' })
  }
  await touchSession(token, session)
  res.json(pushDesignStatusPayload())
})

// GET /proxy/* — proxy authenticated requests
app.use('/proxy', async (req, res) => {
  const token = req.headers['x-session-token']
  const session = await getActiveSession(token)
  if (!session) {
    recordAuthEvent('session_invalid', {
      reason: 'session_missing',
      route: '/proxy',
      path: req.path,
      ip: clientIp(req),
    })
    return res.status(401).json({ error: 'Not authenticated', reason: 'session_missing' })
  }
  await touchSession(token, session)

  const path = req.path
  const target = `${BASE}/srm_university/academia-academic-services${path}`
  console.log(`[proxy] ${session.email} → ${path}`)

  try {
    const resp = await axios.get(target, {
      headers: {
        Cookie: session.cookieString,
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': `${PORTAL_URL}/`,
      },
      ...(SRM_HTTPS_AGENT ? { httpsAgent: SRM_HTTPS_AGENT } : {}),
      timeout: PROXY_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: () => true,
    })

    console.log(`[proxy] ${path} → status ${resp.status}, size ${JSON.stringify(resp.data || '').length}`)
    const ct = resp.headers['content-type'] || 'text/html'
    if (resp.status === 401 || hasUpstreamAuthDrift(ct, resp.data)) {
      await deleteSession(token)
      recordAuthEvent('session_invalid', {
        reason: 'upstream_auth_drift',
        route: '/proxy',
        path,
        email: normalizeIdentity(session.email),
        ip: clientIp(req),
      })
      return res.status(401).json({ error: 'Session expired — please log in again', reason: 'upstream_auth_drift' })
    }

    res.status(resp.status)
    res.set('Content-Type', ct)
    res.send(resp.data)
  } catch (err) {
    console.error('[proxy] error:', err.message)
    recordAuthEvent('proxy_error', {
      reason: 'upstream_proxy_error',
      path,
      email: normalizeIdentity(session.email),
      ip: clientIp(req),
      detail: err.message,
    })
    res.status(502).json({ error: err.message, reason: 'upstream_proxy_error' })
  }
})

app.get('/auth/admin/metrics', async (req, res) => {
  const access = checkAdminAccess(req)
  if (!access.ok) {
    recordAuthEvent('admin_metrics_denied', {
      reason: access.reason,
      ip: clientIp(req),
    })
    return res.status(403).json({ error: 'Forbidden', reason: access.reason })
  }

  try {
    const activeSessions = await listActiveSessions()
    const activeUsers = summarizeActiveUsers(activeSessions)
    res.json({
      ok: true,
      store: redisClient ? 'redis' : 'memory',
      activeSessionCount: activeSessions.length,
      activeUserCount: activeUsers.length,
      activeUsers,
      recentAuthEvents: [...authEvents].slice(-80).reverse(),
      serverTime: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Health check
app.get('/auth/health', async (req, res) => {
  try {
    const activeSessions = await sessionCount()
    const activeUsers = summarizeActiveUsers(await listActiveSessions())
    res.json({
      ok: true,
      sessions: activeSessions,
      users: activeUsers.length,
      store: redisClient ? 'redis' : 'memory',
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, store: redisClient ? 'redis' : 'memory' })
  }
})

function sweepExpiredInMemorySessions() {
  if (redisClient) return
  const now = Date.now()
  for (const [token, session] of sessions.entries()) {
    if (typeof session.expiresAt !== 'number' || session.expiresAt <= now) {
      sessions.delete(token)
    }
  }
}

const PORT = Number(process.env.PORT || 3001)
async function startServer() {
  try {
    await initRedisStore()
  } catch (err) {
    console.error('[session-store] Failed to connect to Redis. Falling back to in-memory store:', err.message)
    redisClient = null
  }
  if (!ADMIN_METRICS_TOKEN) {
    console.warn('[admin] ADMIN_METRICS_TOKEN not configured. /auth/admin/metrics will reject all requests.')
  }
  setInterval(sweepExpiredInMemorySessions, 60 * 1000)
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Academia auth server running on http://0.0.0.0:${PORT}`)
  })
}

startServer().catch((err) => {
  console.error('Server bootstrap failed:', err.message)
  process.exit(1)
})
