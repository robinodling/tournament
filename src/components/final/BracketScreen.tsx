import { useState } from 'react'
import { currentBracketMatches, isFinalComplete } from '../../state/reducer'
import { useCanEdit } from '../../state/TournamentContext'
import { useNames, useTournament } from '../../state/TournamentContext'
import type { Group } from '../../types'
import { RankingSheet } from '../round/RankingSheet'
import { BracketRounds, bracketItems } from './BracketRounds'
import { MatchCard } from './MatchCard'

export function BracketScreen() {
  const { t, dispatch, readOnly, viewerPlayerId } = useTournament()
  const { label } = useNames()
  const [editing, setEditing] = useState<{ group: Group; context: string } | null>(null)
  const bracket = t.final?.bracket
  if (!bracket) return null
  const complete = isFinalComplete(t)
  const playable = currentBracketMatches(t)
  const byes = bracket.size - bracket.seeds.length
  const canEdit = useCanEdit()
  const seedOf = (id: string) => {
    const i = bracket.seeds.indexOf(id)
    return i >= 0 ? i + 1 : undefined
  }
  // Viewer: the match you are in (or waiting for) goes on top.
  const allItems = readOnly && viewerPlayerId ? bracket.rounds.flatMap((_, r) => bracketItems(bracket, r)) : []
  const myMatch = allItems.find((it) => it.m.playerIds.length >= 2 && !it.m.result && it.m.playerIds.includes(viewerPlayerId!))
  const myPending = !myMatch ? allItems.find((it) => !it.m.result && it.m.playerIds.length < 2 && it.slots.includes(viewerPlayerId!)) : undefined

  return (
    <div className="screen">
      <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
        <h2 className="round-title">Knockout</h2>
        <p className="hint" style={{ textAlign: 'center' }}>
          Top {bracket.seeds.length} by standings after {t.rounds.length} rounds, seeded 1st vs {bracket.size}th, 2nd vs {bracket.size - 1}th…
          {byes > 0 ? ` The top ${byes} ${byes === 1 ? 'seed skips' : 'seeds skip'} the first round.` : ''} Winners advance
          {bracket.bronze ? '; semifinal losers play for bronze.' : '.'}
        </p>
        {!readOnly && playable.length > 1 && t.arenas.filter((a) => a.active).length > 1 && (
          <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'RANDOMIZE_FINAL_ARENAS' })}>
            🎲 Random {label(2).toLowerCase()} for this round
          </button>
        )}
      </div>

      {myMatch && (
        <section className="section">
          <h3 className="section-title mine-title">
            <span className="live-dot" aria-hidden /> Your match · {myMatch.context}
          </h3>
          <MatchCard
            match={myMatch.m}
            slots={myMatch.slots}
            placeholders={myMatch.placeholders}
            seedOf={seedOf}
            highlight
            onClick={canEdit(myMatch.m) ? () => setEditing({ group: myMatch.m, context: myMatch.context }) : undefined}
          />
        </section>
      )}
      {myPending && (
        <section className="section">
          <h3 className="section-title mine-title">
            <span className="live-dot" aria-hidden /> Up next · {myPending.context}
          </h3>
          <div className="card mine">
            <strong>You're through.</strong>
            <div className="muted small">Waiting for your opponent: {myPending.placeholders[myPending.slots.findIndex((s) => s === undefined)] || 'to be decided'}.</div>
          </div>
        </section>
      )}
      {(myMatch || myPending) && <h3 className="section-title">Whole bracket</h3>}
      <BracketRounds bracket={bracket} onEdit={(group, context) => setEditing({ group, context })} />

      {readOnly ? (
        <p className="hint" style={{ textAlign: 'center' }}>
          {viewerPlayerId === null ? "You're watching. Results are entered by the players and the organiser." : 'Tap your match to send who won to the organiser.'}
        </p>
      ) : complete ? (
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
