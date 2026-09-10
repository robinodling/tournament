import { useState } from 'react'
import { currentBracketMatches, isFinalComplete } from '../../state/reducer'
import { useNames, useTournament } from '../../state/TournamentContext'
import type { Group } from '../../types'
import { RankingSheet } from '../round/RankingSheet'
import { BracketRounds } from './BracketRounds'

export function BracketScreen() {
  const { t, dispatch } = useTournament()
  const { label } = useNames()
  const [editing, setEditing] = useState<{ group: Group; context: string } | null>(null)
  const bracket = t.final?.bracket
  if (!bracket) return null
  const complete = isFinalComplete(t)
  const playable = currentBracketMatches(t)
  const byes = bracket.size - bracket.seeds.length

  return (
    <div className="screen">
      <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
        <h2 className="round-title">Knockout</h2>
        <p className="hint" style={{ textAlign: 'center' }}>
          Top {bracket.seeds.length} by standings after {t.rounds.length} rounds, seeded 1st vs {bracket.size}th, 2nd vs {bracket.size - 1}th…
          {byes > 0 ? ` The top ${byes} ${byes === 1 ? 'seed skips' : 'seeds skip'} the first round.` : ''} Winners advance
          {bracket.bronze ? '; semifinal losers play for bronze.' : '.'}
        </p>
        {playable.length > 1 && t.arenas.filter((a) => a.active).length > 1 && (
          <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'RANDOMIZE_FINAL_ARENAS' })}>
            🎲 Random {label(2).toLowerCase()} for this round
          </button>
        )}
      </div>

      <BracketRounds bracket={bracket} onEdit={(group, context) => setEditing({ group, context })} />

      {complete ? (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => dispatch({ type: 'FINISH' })}>
          🏁 Finish tournament
        </button>
      ) : (
        <p className="hint" style={{ textAlign: 'center' }}>
          Tap a match to enter who won. Re-seed or skip the knockout under Manage.
        </p>
      )}

      <RankingSheet context={editing?.context ?? ''} group={editing?.group ?? null} showPoints={false} onClose={() => setEditing(null)} />
    </div>
  )
}
