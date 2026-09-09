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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
