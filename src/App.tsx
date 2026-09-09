import { useEffect, useState } from 'react'
import { FinalScreen } from './components/final/FinalScreen'
import { FinishedScreen } from './components/finished/FinishedScreen'
import { ManageScreen } from './components/manage/ManageScreen'
import { RoundScreen } from './components/round/RoundScreen'
import { ScheduleScreen } from './components/schedule/ScheduleScreen'
import { SetupScreen } from './components/setup/SetupScreen'
import { StandingsScreen } from './components/standings/StandingsScreen'
import { TournamentProvider, useTournament } from './state/TournamentContext'

type Tab = 'setup' | 'round' | 'standings' | 'schedule' | 'manage'

const RUNNING_TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'round', label: 'Round', icon: '🎯' },
  { id: 'standings', label: 'Standings', icon: '🏆' },
  { id: 'schedule', label: 'Schedule', icon: '📋' },
  { id: 'manage', label: 'Manage', icon: '⚙️' },
]

const SETUP_TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'setup', label: 'Setup', icon: '🛠️' },
  { id: 'manage', label: 'Manage', icon: '⚙️' },
]

const FINAL_TABS: { id: Tab; label: string; icon: string }[] = [{ id: 'round', label: 'Final', icon: '🏁' }, ...RUNNING_TABS.slice(1)]

const FINISHED_TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'standings', label: 'Results', icon: '🏆' },
  { id: 'schedule', label: 'Schedule', icon: '📋' },
  { id: 'manage', label: 'Manage', icon: '⚙️' },
]

function Shell() {
  const { t } = useTournament()
  const [tab, setTab] = useState<Tab>(t.phase === 'setup' ? 'setup' : 'round')

  // Land on the right tab when the phase changes.
  useEffect(() => {
    if (t.phase === 'setup') setTab('setup')
    if (t.phase === 'running' || t.phase === 'final') setTab('round')
    if (t.phase === 'finished') setTab('standings')
  }, [t.phase])

  const tabs = t.phase === 'setup' ? SETUP_TABS : t.phase === 'running' ? RUNNING_TABS : t.phase === 'final' ? FINAL_TABS : FINISHED_TABS
  const active = tabs.some((x) => x.id === tab) ? tab : tabs[0].id

  return (
    <div className="app">
      {t.phase !== 'setup' && (
        <header className="topbar">
          <h1 className="topbar-title">{t.name}</h1>
          <span className="muted">
            {t.phase === 'running' ? `Round ${t.currentRound + 1} of ${t.rounds.length}` : t.phase === 'final' ? 'Final stage' : 'Finished'}
          </span>
        </header>
      )}
      <main className="content">
        {active === 'setup' && <SetupScreen />}
        {active === 'round' && (t.phase === 'final' ? <FinalScreen /> : <RoundScreen />)}
        {active === 'standings' && (t.phase === 'finished' ? <FinishedScreen /> : <StandingsScreen />)}
        {active === 'schedule' && <ScheduleScreen />}
        {active === 'manage' && <ManageScreen />}
      </main>
      <nav className="tabbar" aria-label="Sections">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            className={`tab${active === x.id ? ' active' : ''}`}
            onClick={() => setTab(x.id)}
            aria-current={active === x.id ? 'page' : undefined}
          >
            <span className="tab-icon" aria-hidden>
              {x.icon}
            </span>
            {x.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <TournamentProvider>
      <Shell />
    </TournamentProvider>
  )
}
