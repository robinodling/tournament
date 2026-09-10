import { useState } from 'react'
import { syncConfigured } from '../../lib/firebaseConfig'
import { loadSync, roomLink } from '../../lib/roomSync'
import { useTournament } from '../../state/TournamentContext'
import { useRoomSyncStatus } from '../../state/useRoomSync'

/** Organiser controls for sharing the tournament with players' phones. */
export function LiveScoringSection() {
  const { t, dispatch } = useTournament()
  const sync = useRoomSyncStatus()
  const setup = t.phase === 'setup'
  const pending = sync.registrations.filter((r) => !t.players.some((p) => p.uid === r.uid))
  const joined = t.players.filter((p) => p.uid).length
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const s = await loadSync()
      const code = await s.createRoom(t)
      dispatch({ type: 'SET_ROOM', room: { code, createdAt: Date.now() } })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy this link:', text)
    }
  }

  const share = async (link: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: t.name, text: `Follow ${t.name} live and send your group's results:`, url: link })
        return
      } catch {
        /* cancelled */
      }
    }
    await copy(link)
  }

  return (
    <section className="section">
      <h3 className="section-title">Live scoring</h3>
      <div className="card stack">
        {!syncConfigured ? (
          <p className="hint small" style={{ margin: 0 }}>
            Not enabled in this build. Fill in <code>src/lib/firebaseConfig.ts</code> (see README → Live scoring) to let players follow along and send results from their own phones.
          </p>
        ) : !t.room ? (
          <>
            <p className="hint small" style={{ margin: 0 }}>
              {setup
                ? 'Create a room and share its link: players put themselves on the roster from their own phones, then follow the tournament live and send their own results.'
                : "Create a room and share its link: players see the schedule and standings live and can send their group's result. You stay in charge — every result still lands in your app and can be corrected."}
            </p>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void create()}>
              {busy ? 'Creating…' : 'Create room for players'}
            </button>
          </>
        ) : (
          <>
            <div className="row wrap">
              <span className="room-code">{t.room.code}</span>
              <span className={`chip ${sync.status === 'live' ? 'chip-ok' : sync.status === 'error' ? 'chip-warn' : ''}`}>
                {sync.status === 'live' ? '● Live' : sync.status === 'connecting' ? 'Connecting…' : sync.status === 'error' ? '! Offline' : sync.status}
              </span>
            </div>
            {sync.error && <p className="problem">{sync.error}</p>}
            <p className="hint small" style={{ margin: 0, overflowWrap: 'anywhere' }}>
              {roomLink(t.room.code)}
            </p>
            {setup && (
              <p className="hint small" style={{ margin: 0 }}>
                {joined === 0 ? 'Nobody has joined via the link yet.' : `${joined} ${joined === 1 ? 'player has' : 'players have'} joined via the link — they appear in the player list above.`}
              </p>
            )}
            {!setup && pending.length > 0 && (
              <div className="stack">
                <span className="small muted">Want to join:</span>
                <div className="list">
                  {pending.map((r) => (
                    <div key={r.uid} className="list-item">
                      <span className="grow">{r.name}</span>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() =>
                          window.confirm(`Add ${r.name} to the tournament? Unplayed rounds will be re-drawn.`) && dispatch({ type: 'REGISTER_PLAYER', uid: r.uid, name: r.name })
                        }
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="row wrap">
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void share(roomLink(t.room!.code))}>
                Share link
              </button>
              <button type="button" className="btn btn-sm" onClick={() => void copy(roomLink(t.room!.code))}>
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => window.confirm('Stop sharing? Players lose the live view; nothing in your app changes.') && dispatch({ type: 'CLEAR_ROOM' })}
              >
                Stop sharing
              </button>
            </div>
          </>
        )}
        {error && <p className="problem">{error}</p>}
      </div>
    </section>
  )
}
