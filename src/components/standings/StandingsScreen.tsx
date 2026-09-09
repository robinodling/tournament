import { computeStandings } from '../../lib/scoring'
import { isComplete } from '../../state/reducer'
import { useTournament } from '../../state/TournamentContext'
import { StandingsTable } from './StandingsTable'

export function StandingsScreen() {
  const { t } = useTournament()
  const rows = computeStandings(t)
  const played = t.rounds.filter(isComplete).length
  return (
    <div className="screen">
      <div className="section-header">
        <h2>Standings</h2>
        <span className="muted small">
          after {played} of {t.rounds.length} rounds
        </span>
      </div>
      <StandingsTable rows={rows} />
      <p className="hint">Ties are broken by most 1st places, then 2nd places, and so on.</p>
      {t.phase === 'final' && <p className="hint">The final stage is in progress — these are the group-stage standings; the final decides the top positions.</p>}
    </div>
  )
}
