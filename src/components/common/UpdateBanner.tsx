import { useEffect, useState } from 'react'

/** Shown when a newer build has been installed by the service worker; a reload picks it up. */
export function UpdateBanner() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const on = () => setReady(true)
    window.addEventListener('appupdated', on)
    return () => window.removeEventListener('appupdated', on)
  }, [])
  if (!ready) return null
  return (
    <div className="update-banner" role="status">
      <span className="grow">A new version is ready.</span>
      <button type="button" className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>
        Reload
      </button>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setReady(false)} aria-label="Later">
        ✕
      </button>
    </div>
  )
}
