import { createRoot } from 'react-dom/client'
import './index.css'

declare global {
  interface Window {
    __ARCH_BOOTSTRAP_STATE__?: 'booting' | 'mounted' | 'failed'
    __ARCH_BOOTSTRAP_STARTED_AT__?: number
  }
}

const BOOTSTRAP_RECOVERY_KEY = 'arch.bootstrap.recovered'
const DEV_CSS_FALLBACK_ATTR = 'data-arch-dev-css-fallback'
const DEV_VITE_STYLE_SELECTOR = 'style[data-vite-dev-id]'
const DEV_SRC_INDEX_CSS_ID_RE = /(?:^|[\\/])src[\\/]index\.css(?:$|\?)/
const ROOT_COMMIT_TIMEOUT_MS = 2800
let devCssHotBound = false
const appModulePromise = import('./App.tsx')

async function clearClientCaches() {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((reg) => reg.unregister()))
  }
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
  }
}

async function ensureDevCssFallback() {
  if (!import.meta.env.DEV) return

  const resolveViteIndexStyle = () => (
    Array.from(document.head.querySelectorAll<HTMLStyleElement>(DEV_VITE_STYLE_SELECTOR)).find((node) => {
      const viteId = node.getAttribute('data-vite-dev-id') ?? ''
      return DEV_SRC_INDEX_CSS_ID_RE.test(viteId)
    }) ?? null
  )

  let viteIndexStyle = resolveViteIndexStyle()
  if (viteIndexStyle?.textContent?.trim()) return
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })

  viteIndexStyle = resolveViteIndexStyle()
  if (viteIndexStyle?.textContent?.trim()) return

  const inlineModule = await import('./index.css?inline')
  const cssText = typeof inlineModule.default === 'string' ? inlineModule.default : ''
  if (!cssText.trim()) return

  let fallbackStyle = document.head.querySelector<HTMLStyleElement>(`style[${DEV_CSS_FALLBACK_ATTR}="1"]`)
  if (!fallbackStyle) {
    fallbackStyle = document.createElement('style')
    fallbackStyle.setAttribute(DEV_CSS_FALLBACK_ATTR, '1')
    document.head.appendChild(fallbackStyle)
  }
  fallbackStyle.textContent = cssText

  if (import.meta.hot && !devCssHotBound) {
    devCssHotBound = true
    import.meta.hot.accept('./index.css?inline', (nextModule: unknown) => {
      const nextCss =
        typeof nextModule === 'object' &&
        nextModule !== null &&
        'default' in nextModule &&
        typeof (nextModule as { default?: unknown }).default === 'string'
          ? (nextModule as { default: string }).default
          : null
      if (!nextCss) return
      const target = document.head.querySelector<HTMLStyleElement>(`style[${DEV_CSS_FALLBACK_ATTR}="1"]`)
      if (target) target.textContent = nextCss
    })
    import.meta.hot.dispose(() => {
      devCssHotBound = false
      const target = document.head.querySelector<HTMLStyleElement>(`style[${DEV_CSS_FALLBACK_ATTR}="1"]`)
      target?.remove()
    })
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderBootstrapFallback(error: unknown) {
  const host = document.getElementById('root')
  if (!host) return
  const detail = error instanceof Error ? error.message : String(error)
  host.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#000;color:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Helvetica Neue',Arial,sans-serif;">
      <div style="width:min(92vw,430px);padding:18px;border:1px solid rgba(255,255,255,0.14);border-radius:16px;background:rgba(255,255,255,0.06);box-shadow:0 18px 40px rgba(0,0,0,0.35);">
        <h1 style="margin:0 0 8px;font-size:20px;line-height:1.15;">Arch failed to start</h1>
        <p style="margin:0 0 12px;font-size:13px;line-height:1.45;color:rgba(242,242,247,0.82);">
          The app could not boot on this device state. You can retry immediately or clear local app caches and try again.
        </p>
        <pre style="margin:0 0 12px;padding:10px 11px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:rgba(0,0,0,0.42);font-size:11px;line-height:1.4;white-space:pre-wrap;word-break:break-word;color:rgba(242,242,247,0.86);">${escapeHtml(detail)}</pre>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="arch-boot-retry" style="border:0;border-radius:999px;padding:9px 14px;font-size:12px;font-weight:700;background:#ffffff;color:#111;cursor:pointer;">Reload</button>
          <button id="arch-boot-reset" style="border:1px solid rgba(255,255,255,0.24);border-radius:999px;padding:9px 14px;font-size:12px;font-weight:700;background:transparent;color:#f2f2f7;cursor:pointer;">Clear cache + reload</button>
        </div>
      </div>
    </div>
  `
  const retryBtn = document.getElementById('arch-boot-retry')
  retryBtn?.addEventListener('click', () => window.location.reload())
  const resetBtn = document.getElementById('arch-boot-reset')
  resetBtn?.addEventListener('click', async () => {
    try {
      sessionStorage.removeItem(BOOTSTRAP_RECOVERY_KEY)
      await clearClientCaches()
    } catch (resetError) {
      console.error('Arch bootstrap cache reset failed', resetError)
    } finally {
      window.location.reload()
    }
  })
}

async function mountApp() {
  const host = document.getElementById('root')
  if (!host) throw new Error('Root container not found')
  const root = createRoot(host)
  const { default: App } = await appModulePromise
  root.render(<App />)

  const startedAt = performance.now()
  while (performance.now() - startedAt <= ROOT_COMMIT_TIMEOUT_MS) {
    const hasMountedElements = host.childElementCount > 0
    const hasMountedText = (host.textContent ?? '').trim().length > 0
    if (hasMountedElements || hasMountedText) break
    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), 50)
    })
  }

  const hasContent = host.childElementCount > 0 || (host.textContent ?? '').trim().length > 0
  if (!hasContent) {
    throw new Error('App shell mount returned an empty root')
  }

  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

async function bootstrap() {
  if (!window.__ARCH_BOOTSTRAP_STARTED_AT__) {
    window.__ARCH_BOOTSTRAP_STARTED_AT__ = Date.now()
  }
  window.__ARCH_BOOTSTRAP_STATE__ = 'booting'
  try {
    await ensureDevCssFallback()
    await mountApp()
    window.__ARCH_BOOTSTRAP_STATE__ = 'mounted'
    window.dispatchEvent(new Event('arch:bootstrap-mounted'))
    sessionStorage.removeItem(BOOTSTRAP_RECOVERY_KEY)
  } catch (error) {
    window.__ARCH_BOOTSTRAP_STATE__ = 'failed'
    console.error('Arch bootstrap failed', error)
    const alreadyRecovered = sessionStorage.getItem(BOOTSTRAP_RECOVERY_KEY) === '1'
    if (alreadyRecovered) {
      renderBootstrapFallback(error)
      return
    }
    sessionStorage.setItem(BOOTSTRAP_RECOVERY_KEY, '1')
    try {
      await clearClientCaches()
    } catch (cacheError) {
      console.error('Arch bootstrap cache clear failed', cacheError)
    }
    window.location.reload()
  }
}

void bootstrap()
