import { useState } from 'react'
import { syncConfigured } from '../../lib/firebaseConfig'
import { loadLastRoom, normalizeRoomCode, roomLink } from '../../lib/roomSync'
import { InstallCard } from '../common/InstallCard'

/** First screen on a fresh device: organise, or join someone else's room. */
export function StartScreen({ onOrganise }: { onOrganise: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const lastRoom = loadLastRoom()

  const join = (raw: string) => {
    const normalized = normalizeRoomCode(raw)
    if (!normalized) {
      setError('A room code has 6 letters and digits, e.g. K7QF3M.')
      return
    }
    window.location.assign(roomLink(normalized))
  }

  return (
    <div className="app">
      <main className="content screen start">
        <header className="start-hero">
          <div className="start-logo" aria-hidden>
            🏆
          </div>
          <h1>Tournament</h1>
          <p className="hint">Group play on shared arenas, live standings, finals. Pick your side.</p>
        </header>

        <section className="card stack">
          <h2 className="start-card-title">🛠️ Organise a tournament</h2>
          <p className="hint small" style={{ margin: 0 }}>
            Set up players, arenas and the format, run it from this phone, and share a room so players can follow along and send their results.
          </p>
          <button type="button" className="btn btn-primary btn-lg" onClick={onOrganise}>
            Create a tournament
          </button>
        </section>

        <section className="card stack">
          <h2 className="start-card-title">📱 Join a room</h2>
          {syncConfigured ? (
            <>
              <p className="hint small" style={{ margin: 0 }}>
                Got a code from the organiser? Enter it to join the roster, follow the games and send your own results.
              </p>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault()
                  join(code)
                }}
              >
                <input
                  className="input grow room-input"
                  placeholder="ROOM CODE"
                  value={code}
                  maxLength={8}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  aria-label="Room code"
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase())
                    setError(null)
                  }}
                />
                <button type="submit" className="btn btn-lg" disabled={code.replace(/[\s-]/g, '').length < 6}>
                  Join
                </button>
              </form>
              {error && <p className="problem">{error}</p>}
              {lastRoom && (
                <button type="button" className="btn btn-ghost" onClick={() => join(lastRoom)}>
                  Rejoin room {lastRoom}
                </button>
              )}
            </>
          ) : (
            <p className="hint small" style={{ margin: 0 }}>
              Live rooms are not enabled in this build.
            </p>
          )}
        </section>

        <InstallCard compact />
      </main>
    </div>
  )
}
