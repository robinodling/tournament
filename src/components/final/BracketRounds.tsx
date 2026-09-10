import { matchLabel, roundName } from '../../lib/label'
import { activeArenas, isReady, matchSlots, pickRandomArena } from '../../state/reducer'
import { useNames, useTournament } from '../../state/TournamentContext'
import type { Bracket, Group, Id } from '../../types'
import { MatchCard } from './MatchCard'

interface Props {
  bracket: Bracket
  compact?: boolean
  /** Enables tap-to-enter and, unless compact, the arena controls. */
  onEdit?: (match: Group, context: string) => void
}

export function BracketRounds({ bracket, compact, onEdit }: Props) {
  const { t, dispatch, readOnly } = useTournament()
  const { label } = useNames()
  const arenas = activeArenas(t)
  const seedOf = (id: Id) => {
    const i = bracket.seeds.indexOf(id)
    return i >= 0 ? i + 1 : undefined
  }

  const controlsFor = (m: Group, context: string) => {
    if (compact || readOnly || !onEdit || arenas.length < 2 || !isReady(m)) return undefined
    return (
      <>
        <select
          className="input grow"
          value={m.arenaId}
          onChange={(e) => dispatch({ type: 'SET_GROUP_ARENA', groupId: m.id, arenaId: e.target.value })}
          aria-label={`${label(1)} for ${context}`}
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
          aria-label={`Random ${label(1).toLowerCase()} for ${context}`}
          onClick={() => {
            const arenaId = pickRandomArena(t, m.id)
            if (arenaId) dispatch({ type: 'SET_GROUP_ARENA', groupId: m.id, arenaId })
          }}
        >
          🎲
        </button>
      </>
    )
  }

  const lastIdx = bracket.rounds.length - 1
  return (
    <div className="stack" style={{ gap: 16 }}>
      {bracket.rounds.map((matches, r) => {
        const done = matches.every((m) => m.result !== undefined)
        const isFinalRound = r === lastIdx
        const items: { m: Group; context: string; slots: (Id | undefined)[]; placeholders: string[] }[] = matches.map((m, i) => ({
          m,
          context: matchLabel(matches.length, i),
          slots: matchSlots(bracket, r, i),
          placeholders: r === 0 ? ['', ''] : [0, 1].map((s) => `Winner of ${matchLabel(bracket.rounds[r - 1].length, 2 * i + s)}`),
        }))
        if (isFinalRound && bracket.bronze) {
          items.push({
            m: bracket.bronze,
            context: 'Bronze match',
            slots: matchSlots(bracket, r, 0, true),
            placeholders: ['Loser of Semifinal 1', 'Loser of Semifinal 2'],
          })
        }
        return (
          <section key={r} className="schedule-round">
            <div className="status-line">
              <strong>{isFinalRound && bracket.bronze ? 'Final & bronze' : roundName(matches.length) + (matches.length > 1 ? 's' : '')}</strong>
              {done && (!isFinalRound || !bracket.bronze || bracket.bronze.result) && <span className="chip chip-ok">Done</span>}
            </div>
            <div className={compact ? 'schedule-groups' : 'stack'}>
              {items.map(({ m, context, slots, placeholders }) => (
                <div key={m.id} className="stack" style={{ gap: 4 }}>
                  {(matches.length > 1 || context === 'Bronze match' || bracket.bronze) && <span className="muted small">{context}</span>}
                  <MatchCard
                    match={m}
                    slots={slots}
                    placeholders={placeholders}
                    seedOf={seedOf}
                    compact={compact}
                    controls={controlsFor(m, context)}
                    onClick={onEdit && m.playerIds.length >= 2 ? () => onEdit(m, context) : undefined}
                  />
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
