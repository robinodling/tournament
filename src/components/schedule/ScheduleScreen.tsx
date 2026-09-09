import { useState } from 'react'
import { tierName } from '../../lib/label'
import { isComplete, isLocked } from '../../state/reducer'
import { useNames, useTournament } from '../../state/TournamentContext'
import type { Group } from '../../types'
import { GroupCard } from '../round/GroupCard'
import { RankingSheet } from '../round/RankingSheet'

export function ScheduleScreen() {
  const { t, dispatch } = useTournament()
  const { player } = useNames()
  const [editing, setEditing] = useState<{ group: Group; context: string; final?: boolean } | null>(null)

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
                <GroupCard key={g.id} group={g} compact onClick={() => setEditing({ group: g, context: `Round ${i + 1}` })} />
              ))}
            </div>
            {r.byePlayerIds.length > 0 && <p className="hint small">Sitting out: {r.byePlayerIds.map(player).join(', ')}</p>}
          </section>
        )
      })}
      {t.final && (
        <section className="schedule-round">
          <div className="status-line">
            <strong>{t.final.groups.length > 1 ? 'Finals' : 'Final'}</strong>
            <span className={`chip${t.final.groups.every((g) => g.result) ? ' chip-ok' : ''}`}>{t.final.groups.every((g) => g.result) ? 'Done' : 'In progress'}</span>
          </div>
          <div className="schedule-groups">
            {t.final.groups.map((g, i) => (
              <GroupCard key={g.id} group={g} compact seeded onClick={() => setEditing({ group: g, context: tierName(i, t.final!.groups.length), final: true })} />
            ))}
          </div>
        </section>
      )}
      <RankingSheet context={editing?.context ?? ''} group={editing?.group ?? null} showPoints={!editing?.final} onClose={() => setEditing(null)} />
    </div>
  )
}
