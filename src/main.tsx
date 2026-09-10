import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { INSTALL_PROMPT_EVENT, type BeforeInstallPromptEvent } from './lib/useInstallPrompt'
import './styles.css'

// Capture the install prompt before React mounts; the UI shows an Install button when available.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__deferredInstallPrompt = e as BeforeInstallPromptEvent
  window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT))
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline shell + installability. Installed web apps also get far more durable storage.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // A new deploy takes over automatically (the worker is network-first and calls
  // skipWaiting); when that happens while the app is open we offer a reload.
  let hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) window.dispatchEvent(new Event('appupdated'))
    hadController = true
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        const check = () => reg.update().catch(() => {})
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check()
        })
        setInterval(check, 60 * 60 * 1000)
      })
      .catch(() => {})
  })
}
