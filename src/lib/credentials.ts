// Credential vault — used for silent auto re-login when Academia kicks the
// user out due to its 2-concurrent-session limit or session expiry.
//
// Storage model:
//   - 256-bit AES-GCM CryptoKey, generated client-side, marked NON-EXTRACTABLE,
//     held in IndexedDB. This means no JS path (including ours) can read the
//     raw key bytes; only `crypto.subtle.encrypt`/`decrypt` can use it.
//   - Ciphertext + per-message random IV lives in localStorage under a single
//     versioned key.
//
// Threat model: protects against trivial inspection of localStorage and
// cross-tab read-outs. Does NOT protect against malicious same-origin JS
// (which is game-over anyway). User opts in via an explicit consent checkbox.

const DB_NAME = 'arch.credentials'
const STORE_NAME = 'keystore'
const KEY_ID = 'wrap-key-v1'
const CRED_STORAGE_KEY = 'academia.credentials.v1'
const OPT_IN_KEY = 'academia.credentials.optIn'

export interface StoredCredentials {
  email: string
  password: string
  savedAt: number
}

interface CipherPayload {
  v: 1
  iv: number[]
  ct: number[]
  email: string // plaintext (used as account hint)
  savedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const db = await openDb()
  try {
    const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(KEY_ID)
      req.onsuccess = () => resolve(req.result as CryptoKey | undefined)
      req.onerror = () => reject(req.error)
    })
    if (existing) return existing
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt']
    )
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(key, KEY_ID)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return key
  } finally {
    db.close()
  }
}

export function isAutoReloginOptedIn(): boolean {
  try {
    return localStorage.getItem(OPT_IN_KEY) === '1'
  } catch {
    return false
  }
}

export function setAutoReloginOptIn(optedIn: boolean): void {
  try {
    if (optedIn) localStorage.setItem(OPT_IN_KEY, '1')
    else localStorage.removeItem(OPT_IN_KEY)
  } catch {
    /* ignore */
  }
}

export async function persistCredentials(email: string, password: string): Promise<void> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return
  const key = await getOrCreateKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(password)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  const payload: CipherPayload = {
    v: 1,
    iv: Array.from(iv),
    ct: Array.from(new Uint8Array(ct)),
    email,
    savedAt: Date.now(),
  }
  localStorage.setItem(CRED_STORAGE_KEY, JSON.stringify(payload))
}

export async function loadCredentials(): Promise<StoredCredentials | null> {
  const raw = localStorage.getItem(CRED_STORAGE_KEY)
  if (!raw) return null
  let payload: CipherPayload
  try {
    payload = JSON.parse(raw) as CipherPayload
    if (payload.v !== 1 || !Array.isArray(payload.iv) || !Array.isArray(payload.ct)) return null
  } catch {
    return null
  }
  try {
    const key = await getOrCreateKey()
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(payload.iv) },
      key,
      new Uint8Array(payload.ct)
    )
    const password = new TextDecoder().decode(pt)
    return { email: payload.email, password, savedAt: payload.savedAt }
  } catch {
    // Key rotated or storage corrupted — drop the stale blob.
    localStorage.removeItem(CRED_STORAGE_KEY)
    return null
  }
}

export function clearCredentials(): void {
  try {
    localStorage.removeItem(CRED_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function hasStoredCredentials(): boolean {
  try {
    return localStorage.getItem(CRED_STORAGE_KEY) !== null
  } catch {
    return false
  }
}
