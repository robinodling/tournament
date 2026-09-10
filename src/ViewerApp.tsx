import { useEffect, useState } from 'react'
import { FinalScreen } from './components/final/FinalScreen'
import { FinishedScreen } from './components/finished/FinishedScreen'
import { RoundScreen } from './components/round/RoundScreen'
import { ScheduleScreen } from './components/schedule/ScheduleScreen'
import { StandingsScreen } from './components/standings/StandingsScreen'
import { syncConfigured } from './lib/firebaseConfig'
import { loadSync, loadViewerIdentity, saveViewerIdentity, type ViewerIdentity } from './lib/roomSync'
import { normalize } from './state/reducer'
import { StaticTournamentProvider } from './state/TournamentContext'
import type { Tournament } from './types'

type Tab = 'round' | 'standings' | 'schedule'
type State =
  | { status: 'connecting' }
  | { status: 'unconfigured' }
  | { status: 'empty' }
  | { status: 'error'; error: string }
  | { status: 'live'; t: Tournament; at: number }

/** Player view of an organiser's live room: read-only, plus "send result" for your group. */
export function ViewerApp({ code }: { code: string }) {
  const [state, setState] = useState<State>({ status: 'connecting' })
  const [tab, setTab] = useState<Tab>('round')
  const [identity, setIdentity] = useState<ViewerIdentity | undefined>(() => loadViewerIdentity(code))
  const choose = (next: ViewerIdentity | undefined) => {
    saveViewerIdentity(code, next)
    setIdentity(next)
  }

  useEffect(() => {
    if (!syncConfigured) {
      setState({ status: 'unconfigured' })
      return
    }
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    loadSync()
      .then((s) =>
        s.subscribeState(
          code,
          (t) => !cancelled && setState(t ? { status: 'live', t: normalize(t), at: Date.now() } : { status: 'empty' }),
          (e) => !cancelled && setState({ status: 'error', error: e.message }),
        ),
      )
      .then((u) => {
        if (cancelled) u?.()
        else unsubscribe = u
      })
      .catch((e: Error) => !cancelled && setState({ status: 'error', error: e.message }))
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [code])

  if (state.status !== 'live') {
    const message =
      state.status === 'connecting'
        ? 'Connecting…'
        : state.status === 'unconfigured'
          ? 'Live scoring is not enabled in this build.'
          : state.status === 'empty'
            ? `Room ${code} is empty or does not exist. Check the code with the organiser.`
            : `Could not connect: ${state.error}`
    return (
      <div className="app">
        <main className="content screen" style={{ textAlign: 'center', paddingTop: '30vh' }}>
          <h1>Room {code}</h1>
          <p className="hint">{message}</p>
          <a className="btn" href={import.meta.env.BASE_URL}>
            Open the app instead
          </a>
        </main>
      </div>
    )
  }

  const t = state.t
  const roster = t.players.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name))
  const claimed = identity?.playerId ? t.players.find((p) => p.id === identity.playerId) : undefined
  // Not chosen yet, or the claimed player left the tournament → ask again.
  if (t.phase !== 'setup' && (identity === undefined || (identity.playerId !== null && !claimed))) {
    return (
      <div className="app">
        <header className="topbar">
          <h1 className="topbar-title">{t.name}</h1>
          <span className="muted small">
            <span className="live-dot" aria-hidden /> Live · {code}
          </span>
        </header>
        <main className="content screen">
          <h2>Who are you?</h2>
          <p className="hint">Pick your name to send results for your own games. Everyone can see all scores either way.</p>
          <div className="stack">
            {roster.map((p) => (
              <button key={p.id} type="button" className="btn rank-btn" onClick={() => choose({ playerId: p.id })}>
                {p.name}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => choose({ playerId: null })}>
            Just watching
          </button>
        </main>
      </div>
    )
  }
  const firstTab =
    t.phase === 'final' ? { id: 'round' as Tab, label: 'Final', icon: '🏁' } : t.phase === 'finished' ? { id: 'round' as Tab, label: 'Results', icon: '🏆' } : { id: 'round' as Tab, label: 'Round', icon: '🎯' }
  const tabs: { id: Tab; label: string; icon: string }[] = [firstTab, { id: 'standings', label: 'Standings', icon: '🏆' }, { id: 'schedule', label: 'Schedule', icon: '📋' }]
  if (t.phase === 'finished') tabs.splice(1, 1)

  return (
    <StaticTournamentProvider t={t} viewerPlayerId={identity?.playerId ?? null}>
      <div className="app">
        <header className="topbar">
          <h1 className="topbar-title">{t.name}</h1>
          <span className="muted small" style={{ textAlign: 'right' }}>
            <span className="live-dot" aria-hidden /> Live · {code}
            {t.phase !== 'setup' && (
              <>
                <br />
                {claimed ? `You: ${claimed.name}` : 'Watching'}{' '}
                <button type="button" className="link-btn" onClick={() => choose(undefined)}>
                  change
                </button>
              </>
            )}
          </span>
        </header>
        <main className="content">
          {t.phase === 'setup' && <p className="hint">The organiser hasn't started the tournament yet.</p>}
          {t.phase !== 'setup' && tab === 'round' && (t.phase === 'final' ? <FinalScreen /> : t.phase === 'finished' ? <FinishedScreen /> : <RoundScreen />)}
          {tab === 'standings' && <StandingsScreen />}
          {tab === 'schedule' && <ScheduleScreen />}
        </main>
        <nav className="tabbar" aria-label="Sections">
          {tabs.map((x) => (
            <button key={x.id} type="button" className={`tab${tab === x.id ? ' active' : ''}`} onClick={() => setTab(x.id)} aria-current={tab === x.id ? 'page' : undefined}>
              <span className="tab-icon" aria-hidden>
                {x.icon}
              </span>
              {x.label}
            </button>
          ))}
        </nav>
      </div>
    </StaticTournamentProvider>
  )
}
