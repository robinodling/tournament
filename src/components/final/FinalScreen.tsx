import { useState } from 'react'
import { tierName } from '../../lib/label'
import { activeArenas, isFinalComplete, pickRandomArena } from '../../state/reducer'
import { useNames, useTournament } from '../../state/TournamentContext'
import type { Group } from '../../types'
import { GroupCard } from '../round/GroupCard'
import { RankingSheet } from '../round/RankingSheet'

export function FinalScreen() {
  const { t, dispatch } = useTournament()
  const { label } = useNames()
  const [editing, setEditing] = useState<{ group: Group; context: string } | null>(null)
  const final = t.final
  if (!final) return null

  const total = final.groups.length
  const k = t.settings.groupSize
  const complete = isFinalComplete(t)
  const arenas = activeArenas(t)
  let offset = 0
  const unplayed = final.groups.filter((g) => !g.result).length

  return (
    <div className="screen">
      <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
        <h2 className="round-title">{total > 1 ? 'Finals' : 'Final'}</h2>
        <p className="hint" style={{ textAlign: 'center' }}>
          Seeded from the standings after {t.rounds.length} rounds.{' '}
          {total > 1 ? 'Placements decide the overall order within each tier.' : `Placements decide positions 1–${k}.`}
        </p>
        {unplayed > 1 && arenas.length > 1 && (
          <button type="button" className="btn btn-sm" onClick={() => dispatch({ type: 'RANDOMIZE_FINAL_ARENAS' })}>
            🎲 Random {label(2).toLowerCase()} for all finals
          </button>
        )}
      </div>

      {final.groups.map((g, i) => {
        const first = offset + 1
        offset += g.playerIds.length
        const name = tierName(i, total)
        return (
          <div key={g.id} className="stack" style={{ gap: 6 }}>
            <div className="status-line">
              <strong style={{ whiteSpace: 'nowrap' }}>{name}</strong>
              <span className="muted small" style={{ whiteSpace: 'nowrap' }}>
                positions {first}–{offset}
              </span>
            </div>
            {!g.result && arenas.length > 1 && (
              <div className="row">
                <select
                  className="input grow"
                  value={g.arenaId}
                  onChange={(e) => dispatch({ type: 'SET_GROUP_ARENA', groupId: g.id, arenaId: e.target.value })}
                  aria-label={`${label(1)} for the ${name}`}
                >
                  {arenas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Random ${label(1).toLowerCase()} for the ${name}`}
                  title={`Pick a random ${label(1).toLowerCase()}`}
                  onClick={() => {
                    const arenaId = pickRandomArena(t, g.id)
                    if (arenaId) dispatch({ type: 'SET_GROUP_ARENA', groupId: g.id, arenaId })
                  }}
                >
                  🎲
                </button>
              </div>
            )}
            <GroupCard group={g} seeded onClick={() => setEditing({ group: g, context: name })} />
          </div>
        )
      })}

      {complete ? (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => dispatch({ type: 'FINISH' })}>
          🏁 Finish tournament
        </button>
      ) : (
        <p className="hint" style={{ textAlign: 'center' }}>
          Tap a final to enter its result. Re-seed or skip the final under Manage.
        </p>
      )}

      <RankingSheet context={editing?.context ?? ''} group={editing?.group ?? null} showPoints={false} onClose={() => setEditing(null)} />
    </div>
  )
}
