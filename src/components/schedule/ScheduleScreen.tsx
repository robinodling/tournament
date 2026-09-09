import { useState } from 'react'
import { isComplete, isLocked } from '../../state/reducer'
import { useNames, useTournament } from '../../state/TournamentContext'
import type { Group } from '../../types'
import { GroupCard } from '../round/GroupCard'
import { RankingSheet } from '../round/RankingSheet'

export function ScheduleScreen() {
  const { t, dispatch } = useTournament()
  const { player } = useNames()
  const [editing, setEditing] = useState<{ roundIndex: number; group: Group } | null>(null)

  return (
    <div className="screen">
      <h2>Schedule</h2>
      <p className="hint">Tap any group to enter or correct its result.</p>
      {t.rounds.map((r, i) => {
        const status = isComplete(r) ? 'Done' : isLocked(r) ? 'In progress' : i === t.currentRound && t.phase === 'running' ? 'Current' : 'Upcoming'
        return (
          <section key={i} className="schedule-round">
            <div className="status-line">
              <strong>Round {i + 1}</strong>
              <span className={`chip${status === 'Done' ? ' chip-ok' : ''}`}>{status}</span>
              <span className="grow" />
              {t.phase === 'running' && i !== t.currentRound && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'SET_CURRENT_ROUND', index: i })}>
                  Go to round
                </button>
              )}
            </div>
            <div className="schedule-groups">
              {r.groups.map((g) => (
                <GroupCard key={g.id} group={g} compact onClick={() => setEditing({ roundIndex: i, group: g })} />
              ))}
            </div>
            {r.byePlayerIds.length > 0 && <p className="hint small">Sitting out: {r.byePlayerIds.map(player).join(', ')}</p>}
          </section>
        )
      })}
      <RankingSheet roundIndex={editing?.roundIndex ?? 0} group={editing?.group ?? null} onClose={() => setEditing(null)} />
    </div>
  )
}
