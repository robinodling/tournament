import { useInstallPrompt } from '../../lib/useInstallPrompt'

/** Install button where the browser offers a prompt; instructions elsewhere. */
export function InstallCard({ compact = false }: { compact?: boolean }) {
  const { canPrompt, install, installed, ios } = useInstallPrompt()
  if (installed) return compact ? null : <span className="chip chip-ok">✓ Running as an installed app</span>

  if (compact) {
    if (!canPrompt) return null
    return (
      <button type="button" className="btn btn-block" onClick={() => void install()}>
        📲 Install app — works offline, keeps its data safer
      </button>
    )
  }

  return (
    <div className="card stack">
      <strong>Install the app</strong>
      <p className="hint small" style={{ margin: 0 }}>
        Installed apps open full-screen, work offline, and their storage is protected from browser clean-ups.
      </p>
      {canPrompt ? (
        <button type="button" className="btn btn-primary" onClick={() => void install()}>
          📲 Install app
        </button>
      ) : ios ? (
        <p className="hint small" style={{ margin: 0 }}>
          On iPhone/iPad: tap <strong>Share</strong> (the square with an arrow) and then <strong>Add to Home Screen</strong>.
        </p>
      ) : (
        <p className="hint small" style={{ margin: 0 }}>
          Open the browser menu (⋮) and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. If neither appears yet, reload once —
          the offline cache must finish first.
        </p>
      )}
    </div>
  )
}
