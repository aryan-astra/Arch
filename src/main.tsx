import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const BOOTSTRAP_RECOVERY_KEY = 'arch.bootstrap.recovered'

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

async function mountApp() {
  const host = document.getElementById('root')
  if (!host) throw new Error('Root container not found')
  const root = createRoot(host)
  const { default: App } = await import('./App.tsx')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

async function bootstrap() {
  try {
    await mountApp()
    sessionStorage.removeItem(BOOTSTRAP_RECOVERY_KEY)
  } catch (error) {
    console.error('Arch bootstrap failed', error)
    const alreadyRecovered = sessionStorage.getItem(BOOTSTRAP_RECOVERY_KEY) === '1'
    if (alreadyRecovered) throw error
    sessionStorage.setItem(BOOTSTRAP_RECOVERY_KEY, '1')
    await clearClientCaches()
    window.location.reload()
  }
}

void bootstrap()
