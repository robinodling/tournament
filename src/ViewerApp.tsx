import { useEffect, useState } from 'react'
import { JoinScreen } from './components/viewer/JoinScreen'
import { isIosBrowser, loadNotifyPref, notificationSupport, requestNotificationPermission, saveNotifyPref, unlockAudio } from './lib/notify'
import { useGameReadyNotifier } from './state/useGameReadyNotifier'
import { FinalScreen } from './components/final/FinalScreen'
import { FinishedScreen } from './components/finished/FinishedScreen'
import { RoundScreen } from './components/round/RoundScreen'
import { ScheduleScreen } from './components/schedule/ScheduleScreen'
import { StandingsScreen } from './components/standings/StandingsScreen'
import { syncConfigured } from './lib/firebaseConfig'
import { loadSync, loadViewerIdentity, saveLastRoom, saveViewerIdentity, type ViewerIdentity } from './lib/roomSync'
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
  const [myUid, setMyUid] = useState<string | null>(null)
  const [notify, setNotify] = useState(() => loadNotifyPref(code))
  const [permission, setPermission] = useState(notificationSupport)
  const choose = (next: ViewerIdentity | undefined) => {
    unlockAudio() // user gesture: lets the "game ready" beep play later
    saveViewerIdentity(code, next)
    setIdentity(next)
  }
  const toggleNotify = async () => {
    unlockAudio()
    const next = !notify
    setNotify(next)
    saveNotifyPref(code, next)
    if (next && permission === 'default') setPermission(await requestNotificationPermission())
  }
  const allowNotifications = async () => {
    unlockAudio()
    setPermission(await requestNotificationPermission())
  }

  useEffect(() => saveLastRoom(code), [code])

  // Our anonymous identity — lets a phone that registered skip "Who are you?".
  useEffect(() => {
    if (!syncConfigured) return
    loadSync()
      .then((s) => s.ensureSignedIn())
      .then(setMyUid)
      .catch(() => {})
  }, [])
  const registeredAs = state.status === 'live' && myUid ? state.t.players.find((p) => p.uid === myUid) : undefined
  // A phone that registered is recognised without asking; remember that choice like a manual one.
  const effectiveIdentity: ViewerIdentity | undefined = identity ?? (registeredAs ? { playerId: registeredAs.id } : undefined)
  const [toast, dismissToast] = useGameReadyNotifier(state.status === 'live' ? state.t : null, effectiveIdentity?.playerId ?? null, notify)
  useEffect(() => {
    if (identity === undefined && registeredAs) saveViewerIdentity(code, { playerId: registeredAs.id })
  }, [identity, registeredAs, code])

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
  const claimed = effectiveIdentity?.playerId ? t.players.find((p) => p.id === effectiveIdentity.playerId) : undefined
  if (t.phase === 'setup') return <JoinScreen code={code} t={t} myUid={myUid} />
  // Not chosen yet (and not registered), or the claimed player left the tournament → ask.
  if (effectiveIdentity === undefined || (effectiveIdentity.playerId !== null && !claimed)) {
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
    <StaticTournamentProvider t={t} viewerPlayerId={effectiveIdentity?.playerId ?? null}>
      <div className="app">
        <header className="topbar">
          <h1 className="topbar-title">{t.name}</h1>
          <span className="muted small" style={{ textAlign: 'right' }}>
            <span className="live-dot" aria-hidden /> Live · {code}
            <br />
            {claimed ? `You: ${claimed.name}` : 'Watching'}{' '}
            <button type="button" className="link-btn" onClick={() => choose(undefined)}>
              change
            </button>
            {' · '}
            <a className="link-btn" href={import.meta.env.BASE_URL}>
              leave
            </a>
            {claimed && (
              <>
                {' · '}
                <button type="button" className="link-btn" onClick={() => void toggleNotify()} aria-pressed={notify} aria-label={notify ? 'Turn off game alerts' : 'Turn on game alerts'} title="Alert me when my game is ready">
                  {notify ? '🔔 on' : '🔕 off'}
                </button>
              </>
            )}
          </span>
        </header>
        {toast && (
          <div className="ready-toast" role="status">
            <span className="grow">
              <strong>🎯 Your game is ready — {toast.context}</strong>
              <br />
              <span className="small">
                {toast.arena}
                {toast.others.length ? ` with ${toast.others.join(', ')}` : ''}
              </span>
            </span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={dismissToast} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
        {claimed && notify && permission !== 'granted' && (
          <div className="notice">
            {permission === 'default' ? (
              <>
                <span className="grow small">Get a notification when your game is ready.</span>
                <button type="button" className="btn btn-sm" onClick={() => void allowNotifications()}>
                  Allow
                </button>
              </>
            ) : permission === 'unsupported' && isIosBrowser() ? (
              <span className="grow small">On iPhone, add this page to your Home Screen to get notifications; in the browser you'll get a sound and a banner instead.</span>
            ) : (
              <span className="grow small">Notifications are blocked for this site; you'll still get a sound and a banner here.</span>
            )}
          </div>
        )}
        <main className="content">
          {tab === 'round' && (t.phase === 'final' ? <FinalScreen /> : t.phase === 'finished' ? <FinishedScreen /> : <RoundScreen />)}
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
