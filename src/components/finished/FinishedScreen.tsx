import { useState } from 'react'
import { computeStandings, formatPoints, standingsAsText } from '../../lib/scoring'
import { useTournament } from '../../state/TournamentContext'
import { StandingsTable } from '../standings/StandingsTable'

export function FinishedScreen() {
  const { t, dispatch } = useTournament()
  const rows = computeStandings(t)
  const [copied, setCopied] = useState(false)
  const top = [rows[1], rows[0], rows[2]] // silver, gold, bronze layout
  const classes = ['second', 'first', 'third']
  const medals = ['🥈', '🥇', '🥉']

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(standingsAsText(t))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy the standings:', standingsAsText(t))
    }
  }

  return (
    <div className="screen">
      <h2>Final results</h2>
      {rows.length >= 3 && (
        <div className="podium">
          {top.map((r, i) =>
            r ? (
              <div key={r.playerId} className={`podium-step ${classes[i]}`}>
                <span className="podium-medal">{medals[i]}</span>
                <span className="podium-name">{r.name}</span>
                <span className="muted small">{formatPoints(r.points)} pts</span>
              </div>
            ) : null,
          )}
        </div>
      )}
      <StandingsTable rows={rows} />
      <div className="row">
        <button type="button" className="btn grow" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy standings as text'}
        </button>
        <button type="button" className="btn grow" onClick={() => window.confirm('Start a new tournament? This one is kept in backups.') && dispatch({ type: 'RESET' })}>
          New tournament
        </button>
      </div>
    </div>
  )
}
