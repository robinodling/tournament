import { useState } from 'react'
import { isComplete } from '../../state/reducer'
import { useNames, useTournament } from '../../state/TournamentContext'
import type { Group } from '../../types'
import { GroupCard } from './GroupCard'
import { RankingSheet } from './RankingSheet'
import { WhoPlaysWhere } from './WhoPlaysWhere'

export function RoundScreen() {
  const { t, dispatch } = useTournament()
  const { player } = useNames()
  const [editing, setEditing] = useState<Group | null>(null)
  const [showWho, setShowWho] = useState(false)

  const idx = t.currentRound
  const round = t.rounds[idx]
  if (!round) {
    return (
      <div className="screen">
        <p className="hint">No rounds scheduled. Add players and {t.settings.arenaLabel.toLowerCase()}s under Manage.</p>
      </div>
    )
  }
  const complete = isComplete(round)
  const isLast = idx === t.rounds.length - 1
  const doneCount = round.groups.filter((g) => g.result).length

  return (
    <div className="screen">
      <div className="round-nav">
        <button type="button" className="btn btn-ghost" disabled={idx === 0} onClick={() => dispatch({ type: 'SET_CURRENT_ROUND', index: idx - 1 })} aria-label="Previous round">
          ‹
        </button>
        <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
          <h2 className="round-title">Round {idx + 1}</h2>
          <div className="progress" aria-label="Rounds">
            {t.rounds.map((r, i) => (
              <span key={i} className={`dot${isComplete(r) ? ' filled' : ''}${i === idx ? ' current' : ''}`} />
            ))}
          </div>
        </div>
        <button type="button" className="btn btn-ghost" disabled={isLast} onClick={() => dispatch({ type: 'SET_CURRENT_ROUND', index: idx + 1 })} aria-label="Next round">
          ›
        </button>
      </div>

      <div className="row">
        <span className="muted small grow">
          {doneCount} of {round.groups.length} groups done
        </span>
        <button type="button" className="btn btn-sm" onClick={() => setShowWho((v) => !v)}>
          {showWho ? 'Hide' : 'Who plays where'}
        </button>
      </div>
      {showWho && <WhoPlaysWhere round={round} />}

      <div className="stack">
        {round.groups.map((g) => (
          <GroupCard key={g.id} group={g} onClick={() => setEditing(g)} />
        ))}
        {round.byePlayerIds.length > 0 && (
          <div className="card bye-card">
            <div className="card-header">
              <span className="arena-name" style={{ fontSize: '1rem' }}>
                Sitting out this round
              </span>
            </div>
            <div className="muted">{round.byePlayerIds.map(player).join(', ')}</div>
          </div>
        )}
      </div>

      {complete ? (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => dispatch({ type: 'NEXT_ROUND' })}>
          {isLast ? '🏁 Finish tournament' : `Next round →`}
        </button>
      ) : (
        <p className="hint" style={{ textAlign: 'center' }}>
          Tap a group to enter its result.
        </p>
      )}

      <RankingSheet context={`Round ${idx + 1}`} group={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
