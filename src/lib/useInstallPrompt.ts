import { useCallback, useEffect, useState } from 'react'

/** Chrome/Edge/Android fire this when the app meets the install criteria. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __deferredInstallPrompt?: BeforeInstallPromptEvent | null
  }
}

export const INSTALL_PROMPT_EVENT = 'installpromptavailable'

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * Install state for the UI. The `beforeinstallprompt` event is captured in
 * main.tsx (it can fire before React mounts) and handed over via a window field.
 */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(() => window.__deferredInstallPrompt ?? null)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const onAvailable = () => setPrompt(window.__deferredInstallPrompt ?? null)
    const onInstalled = () => {
      setInstalled(true)
      setPrompt(null)
      window.__deferredInstallPrompt = null
    }
    window.addEventListener(INSTALL_PROMPT_EVENT, onAvailable)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener(INSTALL_PROMPT_EVENT, onAvailable)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!prompt) return false
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      setPrompt(null)
      window.__deferredInstallPrompt = null
    }
    return outcome === 'accepted'
  }, [prompt])

  return { canPrompt: prompt !== null, install, installed, ios: isIos() }
}
