import { useEffect, useState } from 'react'
import { exportJson, requestPersistentStorage, storageStatus, type StorageStatus } from '../../lib/storage'
import { isLocked } from '../../state/reducer'
import { useNames, useTournament } from '../../state/TournamentContext'
import { Stepper } from '../common/Stepper'
import { RestoreSection } from './RestoreSection'

function unlockedRange(rounds: { groups: { result?: unknown }[] }[]): string {
  const idx = rounds.map((r, i) => (isLocked(r as never) ? -1 : i + 1)).filter((i) => i > 0)
  if (idx.length === 0) return 'no rounds'
  if (idx.length === 1) return `round ${idx[0]}`
  return `rounds ${idx[0]}–${idx[idx.length - 1]}`
}

export function ManageScreen() {
  const { t, dispatch } = useTournament()
  const { label } = useNames()
  const [newPlayer, setNewPlayer] = useState('')
  const [newArena, setNewArena] = useState('')
  const [status, setStatus] = useState<StorageStatus | null>(null)

  useEffect(() => {
    storageStatus().then(setStatus)
  }, [t.updatedAt])

  const redraw = unlockedRange(t.rounds)
  const confirmRedraw = (what: string) => window.confirm(`${what}\n\nUnplayed ${redraw} will be re-drawn. Played rounds are kept.`)

  const exportFile = () => {
    const blob = new Blob([exportJson(t)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${t.name.replace(/[^\w.-]+/g, '_') || 'tournament'}-${new Date(t.updatedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const persist = async () => {
    const granted = await requestPersistentStorage()
    setStatus(await storageStatus())
    if (granted === false) window.alert('The browser did not grant persistent storage yet. Installing the app (Add to Home Screen) usually does the trick.')
  }

  return (
    <div className="screen">
      <h2>Manage</h2>

      <section className="section">
        <h3 className="section-title">Tournament</h3>
        <input className="input" value={t.name} onChange={(e) => dispatch({ type: 'SET_NAME', name: e.target.value })} aria-label="Tournament name" />
        <Stepper
          label="Rounds"
          hint={`${t.rounds.filter(isLocked).length} locked`}
          value={t.settings.roundCount}
          min={Math.max(1, t.rounds.filter(isLocked).length)}
          max={30}
          onChange={(n) => dispatch({ type: 'UPDATE_SETTINGS', settings: { roundCount: n } })}
        />
        <label className="stepper">
          <span className="stepper-label">Points for sitting out</span>
          <select className="input" style={{ width: 'auto' }} value={t.settings.byePoints} onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', settings: { byePoints: e.target.value as 'average' | 'zero' } })}>
            <option value="average">Average</option>
            <option value="zero">None</option>
          </select>
        </label>
        {t.phase === 'running' && (
          <button type="button" className="btn" onClick={() => window.confirm('Finish the tournament now? Unplayed rounds are ignored.') && dispatch({ type: 'FINISH' })}>
            🏁 Finish tournament now
          </button>
        )}
        {t.phase === 'finished' && (
          <button type="button" className="btn" onClick={() => dispatch({ type: 'REOPEN' })}>
            Reopen tournament
          </button>
        )}
      </section>

      <section className="section">
        <h3 className="section-title">Players</h3>
        <div className="list">
          {t.players.map((p) => (
            <div key={p.id} className={`list-item${p.active ? '' : ' inactive'}`}>
              <input className="input grow" value={p.name} onChange={(e) => dispatch({ type: 'RENAME_PLAYER', id: p.id, name: e.target.value })} aria-label={`Player ${p.name}`} />
              {p.active ? (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => confirmRedraw(`Remove ${p.name} from the tournament?`) && dispatch({ type: 'REMOVE_PLAYER', id: p.id })}>
                  Remove
                </button>
              ) : (
                <button type="button" className="btn btn-sm" onClick={() => confirmRedraw(`Bring ${p.name} back?`) && dispatch({ type: 'REACTIVATE_PLAYER', id: p.id })}>
                  Bring back
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="row">
          <input className="input grow" placeholder="New player" value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} />
          <button
            type="button"
            className="btn"
            disabled={!newPlayer.trim()}
            onClick={() => {
              if (confirmRedraw(`Add ${newPlayer.trim()}?`)) {
                dispatch({ type: 'ADD_PLAYERS', names: [newPlayer] })
                setNewPlayer('')
              }
            }}
          >
            Add
          </button>
        </div>
      </section>

      <section className="section">
        <h3 className="section-title">{label(2)}</h3>
        <div className="list">
          {t.arenas.map((a) => (
            <div key={a.id} className={`list-item${a.active ? '' : ' inactive'}`}>
              <input className="input grow" value={a.name} onChange={(e) => dispatch({ type: 'RENAME_ARENA', id: a.id, name: e.target.value })} aria-label={`${label(1)} ${a.name}`} />
              {a.active ? (
                <>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      const name = window.prompt(`${a.name} is out of order. Name of the replacement ${label(1).toLowerCase()}:`)
                      if (name?.trim()) dispatch({ type: 'REPLACE_ARENA', id: a.id, name })
                    }}
                  >
                    Swap
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => confirmRedraw(`Remove ${a.name}?`) && dispatch({ type: 'REMOVE_ARENA', id: a.id })}>
                    Remove
                  </button>
                </>
              ) : (
                <span className="muted small">{a.replacesId ? 'replaced' : 'removed'}</span>
              )}
            </div>
          ))}
        </div>
        <div className="row">
          <input className="input grow" placeholder={`New ${label(1).toLowerCase()}`} value={newArena} onChange={(e) => setNewArena(e.target.value)} />
          <button
            type="button"
            className="btn"
            disabled={!newArena.trim()}
            onClick={() => {
              if (confirmRedraw(`Add ${newArena.trim()}?`)) {
                dispatch({ type: 'ADD_ARENAS', names: [newArena] })
                setNewArena('')
              }
            }}
          >
            Add
          </button>
        </div>
        <p className="hint small">
          <strong>Swap</strong> keeps the schedule and moves unplayed groups to the replacement. <strong>Remove</strong> re-draws unplayed rounds without it.
        </p>
      </section>

      <section className="section">
        <h3 className="section-title">Storage</h3>
        <div className="card stack">
          <div className="row wrap">
            {status?.persisted === true ? (
              <span className="chip chip-ok">✓ Persistent storage granted</span>
            ) : status?.persisted === false ? (
              <span className="chip chip-warn">! Best-effort storage</span>
            ) : (
              <span className="chip">Storage status unknown</span>
            )}
            {status?.standalone && <span className="chip chip-ok">✓ Installed app</span>}
            {status && !status.indexedDb && <span className="chip chip-warn">! IndexedDB unavailable — using localStorage</span>}
          </div>
          <p className="hint small">
            Saved automatically on every change to IndexedDB and localStorage on this device, with the last 40 states kept as backups. For maximum safety
            {status?.persisted !== true && ' grant persistent storage and'} add this page to your home screen — installed apps are exempt from browser
            storage clean-ups — and export a copy now and then.
          </p>
          <div className="row wrap">
            {status?.persisted !== true && (
              <button type="button" className="btn btn-sm" onClick={persist}>
                Request persistent storage
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={exportFile}>
              Export JSON
            </button>
          </div>
        </div>
      </section>

      <RestoreSection />

      <section className="section">
        <h3 className="section-title">Danger zone</h3>
        <div className="card danger-zone stack">
          <p className="hint small">Starts a fresh tournament. The current one stays in backups (see Restore).</p>
          <button type="button" className="btn btn-danger" onClick={() => window.confirm('Start a new tournament? The current one is kept in backups.') && dispatch({ type: 'RESET' })}>
            Start a new tournament
          </button>
        </div>
      </section>
    </div>
  )
}
