import { useEffect, useState } from 'react'
import { loadSync } from '../../lib/roomSync'
import type { Tournament } from '../../types'

const NAME_KEY = (code: string) => `tournament:regname:${code}`

/** Before the start: players put themselves on the roster from their own phone. */
export function JoinScreen({ code, t, myUid }: { code: string; t: Tournament; myUid: string | null }) {
  const me = myUid ? t.players.find((p) => p.uid === myUid) : undefined
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY(code)) ?? ''
    } catch {
      return ''
    }
  })
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<'idle' | 'joining' | 'leaving'>('idle')
  const [sent, setSent] = useState(false) // registered, organiser has not published yet
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (me) {
      setSent(false)
      setEditing(false)
    }
  }, [me?.id])

  const join = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy('joining')
    setError(null)
    try {
      const s = await loadSync()
      await s.register(code, trimmed)
      try {
        localStorage.setItem(NAME_KEY(code), trimmed)
      } catch {
        /* ignore */
      }
      setSent(true)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('idle')
    }
  }

  const leave = async () => {
    if (!window.confirm('Leave the tournament roster?')) return
    setBusy('leaving')
    setError(null)
    try {
      const s = await loadSync()
      await s.unregister(code)
      setSent(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('idle')
    }
  }

  const roster = [...t.players].filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name))
  const showForm = !me || editing

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="topbar-title">{t.name}</h1>
        <span className="muted small">
          <span className="live-dot" aria-hidden /> Room {code}
        </span>
      </header>
      <main className="content screen">
        <section className="section">
          <h2>{me ? `You're in, ${me.name}!` : sent ? 'Registered — waiting for the organiser' : 'Join the tournament'}</h2>
          <p className="hint">
            {me
              ? 'The organiser has you on the roster. Keep this page open or come back with the same link once the tournament starts — your phone will be recognised.'
              : sent
                ? 'Your name has been sent. It appears in the list as soon as the organiser\u2019s app picks it up.'
                : 'Put yourself on the roster before the organiser starts. Everyone can see all scores; you will be able to send results for your own games.'}
          </p>
          {showForm ? (
            <div className="row">
              <input
                className="input grow"
                placeholder="Your name"
                value={name}
                maxLength={40}
                autoFocus={editing}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void join()
                }}
              />
              <button type="button" className="btn btn-primary" disabled={!name.trim() || busy !== 'idle'} onClick={() => void join()}>
                {busy === 'joining' ? 'Sending…' : me ? 'Save' : 'Join'}
              </button>
              {editing && (
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              )}
            </div>
          ) : (
            <div className="row wrap">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setName(me!.name)
                  setEditing(true)
                }}
              >
                Change name
              </button>
              <button type="button" className="btn btn-sm btn-danger" disabled={busy !== 'idle'} onClick={() => void leave()}>
                {busy === 'leaving' ? 'Leaving…' : 'Leave'}
              </button>
            </div>
          )}
          {error && <p className="problem">Could not send: {error}</p>}
        </section>

        <section className="section">
          <h3 className="section-title">Players so far ({roster.length})</h3>
          {roster.length === 0 ? (
            <p className="hint">Nobody yet — be the first.</p>
          ) : (
            <div className="list">
              {roster.map((p) => (
                <div key={p.id} className="list-item">
                  <span className="grow">{p.name}</span>
                  {p.id === me?.id && <span className="chip chip-ok">you</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
