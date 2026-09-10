import { useState } from 'react'
import { tierName } from '../../lib/label'
import { computeFinalRanking, formatPoints, standingsAsText } from '../../lib/scoring'
import { BracketRounds } from '../final/BracketRounds'
import { GroupCard } from '../round/GroupCard'
import { useTournament } from '../../state/TournamentContext'
import { StandingsTable } from '../standings/StandingsTable'

export function FinishedScreen() {
  const { t, dispatch, readOnly } = useTournament()
  const { rows, decidedByFinal, finalists } = computeFinalRanking(t)
  const finals = t.final?.groups ?? []
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
      {t.final?.kind === 'bracket' && t.final.bracket && (
        <section className="section">
          <h3 className="section-title">Knockout</h3>
          <BracketRounds bracket={t.final.bracket} compact />
        </section>
      )}
      {t.final?.kind !== 'bracket' && finals.length > 0 && (
        <section className="section">
          <h3 className="section-title">{finals.length > 1 ? 'Finals' : 'Final'}</h3>
          <div className="schedule-groups">
            {finals.map((g, i) => (
              <div key={g.id} className="stack" style={{ gap: 4 }}>
                <span className="muted small">{tierName(i, finals.length)}</span>
                <GroupCard group={g} compact seeded />
              </div>
            ))}
          </div>
        </section>
      )}
      <StandingsTable rows={rows} />
      <p className="hint">
        {decidedByFinal
          ? `Positions 1–${finalists} were decided by the ${t.final?.kind === 'bracket' ? 'knockout bracket' : `final${finals.length > 1 ? 's' : ''}`}; points shown are from the group stage.`
          : 'Ties are broken by most 1st places, then 2nd places, and so on.'}
      </p>
      <div className="row">
        <button type="button" className="btn grow" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy standings as text'}
        </button>
        {!readOnly && (
          <button type="button" className="btn grow" onClick={() => window.confirm('Start a new tournament? This one is kept in backups.') && dispatch({ type: 'RESET' })}>
            New tournament
          </button>
        )}
      </div>
    </div>
  )
}
