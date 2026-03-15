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

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

// Disable SSL verification for SRM portal (self-signed cert handling)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function makeClient(jar) {
  return wrapper(axios.create({
    jar,
    withCredentials: true,
    maxRedirects: 5,
    validateStatus: s => s < 500,
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

function getActiveSession(token) {
  if (!token || typeof token !== 'string') return null
  const session = sessions.get(token)
  if (!session) return null
  if (typeof session.expiresAt === 'number' && session.expiresAt <= Date.now()) {
    sessions.delete(token)
    return null
  }
  return session
}

function touchSession(token, session) {
  const ttl = session.trusted ? TRUSTED_TTL_MS : BROWSER_TTL_MS
  const now = Date.now()
  session.lastSeenAt = now
  session.expiresAt = now + ttl
  sessions.set(token, session)
}

// POST /auth/login — authenticate with Zoho, return sessionToken
app.post('/auth/login', async (req, res) => {
  const { email, password, trusted = false } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

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

    if (!userId) return res.status(401).json({ error: 'User not found. Check your SRM email.' })

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
      return res.status(401).json({ error: msg })
    }
    // Also guard: if no redirect_uri at all, auth definitely failed
    const pwRedirectUri = pwData?.passwordauth?.redirect_uri
    if (!pwRedirectUri) {
      return res.status(401).json({ error: 'Authentication failed. No redirect URI.' })
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
      return res.status(401).json({ error: 'Authentication failed. Could not obtain session.' })
    }

    const sessionToken = randomBytes(32).toString('hex')
    const now = Date.now()
    const ttl = trusted ? TRUSTED_TTL_MS : BROWSER_TTL_MS
    sessions.set(sessionToken, {
      cookieString,
      email,
      trusted: Boolean(trusted),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + ttl,
    })

    res.json({ success: true, sessionToken, trusted: Boolean(trusted), expiresAt: now + ttl })
  } catch (err) {
    console.error('Login error:', err.message)
    if (isTimeoutError(err)) {
      return res.status(504).json({ error: 'Login timed out while contacting the SRM portal. Please retry once.' })
    }
    res.status(500).json({ error: `Login failed: ${err.message}` })
  }
})

// DELETE /auth/sessions — terminate all active sessions for a logged-in user
app.delete('/auth/sessions', async (req, res) => {
  const token = req.headers['x-session-token']
  const session = getActiveSession(token)
  if (!session) return res.status(401).json({ error: 'Not authenticated' })

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
        validateStatus: () => true,
      }
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /auth/logout — clear session
app.post('/auth/logout', (req, res) => {
  const token = req.headers['x-session-token']
  if (token) sessions.delete(token)
  res.json({ success: true })
})

// GET /auth/validate — check if a session token is still alive
app.get('/auth/validate', (req, res) => {
  const token = req.headers['x-session-token']
  const session = getActiveSession(token)
  if (!session) return res.status(401).json({ valid: false })
  touchSession(token, session)
  res.json({ valid: true, email: session.email, trusted: Boolean(session.trusted), expiresAt: session.expiresAt })
})

// GET /proxy/* — proxy authenticated requests
app.use('/proxy', async (req, res) => {
  const token = req.headers['x-session-token']
  const session = getActiveSession(token)
  if (!session) return res.status(401).json({ error: 'Not authenticated' })
  touchSession(token, session)

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
      timeout: PROXY_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: () => true,
    })

    console.log(`[proxy] ${path} → status ${resp.status}, size ${JSON.stringify(resp.data || '').length}`)
    res.status(resp.status)
    const ct = resp.headers['content-type'] || 'text/html'
    res.set('Content-Type', ct)
    res.send(resp.data)
  } catch (err) {
    console.error('[proxy] error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

// Health check
app.get('/auth/health', (req, res) => res.json({ ok: true, sessions: sessions.size }))

setInterval(() => {
  const now = Date.now()
  for (const [token, session] of sessions.entries()) {
    if (typeof session.expiresAt !== 'number' || session.expiresAt <= now) {
      sessions.delete(token)
    }
  }
}, 60 * 1000)

const PORT = Number(process.env.PORT || 3001)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Academia auth server running on http://0.0.0.0:${PORT}`)
})
