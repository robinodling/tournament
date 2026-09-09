import { useEffect, useRef, useState } from 'react'
import { listBackups, loadBackup, parseTournament, type BackupMeta } from '../../lib/storage'
import { useTournament } from '../../state/TournamentContext'

/** Import a JSON export or restore one of the automatic backups. */
export function RestoreSection() {
  const { t, dispatch } = useTournament()
  const [backups, setBackups] = useState<BackupMeta[]>([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) listBackups().then(setBackups)
  }, [open, t.updatedAt])

  const others = backups.filter((b) => b.tournamentId !== t.id || t.phase === 'setup')

  const importFile = async (file: File) => {
    try {
      const parsed = parseTournament(await file.text())
      if (window.confirm(`Replace the current tournament with "${parsed.name}"?`)) dispatch({ type: 'IMPORT', tournament: parsed })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read file')
    }
  }

  const restore = async (b: BackupMeta) => {
    const backup = await loadBackup(b.key)
    if (!backup) return
    if (window.confirm(`Restore "${b.name}" from ${new Date(b.savedAt).toLocaleString()}? The current tournament is kept in backups.`))
      dispatch({ type: 'IMPORT', tournament: backup })
  }

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Restore</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && (
        <div className="stack">
          <div className="row">
            <button type="button" className="btn grow" onClick={() => fileRef.current?.click()}>
              Import JSON file…
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          </div>
          {error && <p className="problem">{error}</p>}
          {others.length === 0 ? (
            <p className="hint">No earlier backups on this device.</p>
          ) : (
            <div className="list">
              {others.slice(0, 15).map((b) => (
                <div key={b.key} className="list-item">
                  <div className="grow">
                    <div>
                      <strong>{b.name}</strong> <span className="muted small">· {b.phase}</span>
                    </div>
                    <div className="muted small">
                      {new Date(b.savedAt).toLocaleString()} · {b.players} players · {b.roundsPlayed}/{b.roundCount} rounds played
                    </div>
                  </div>
                  <button type="button" className="btn btn-sm" onClick={() => restore(b)}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
