import type { ReactNode } from 'react'
import { useNames, useTournament } from '../../state/TournamentContext'
import type { Group, Id } from '../../types'

interface Props {
  match: Group
  /** Two slots; undefined = not yet known. */
  slots: (Id | undefined)[]
  /** Text for an unknown slot, e.g. "Winner of Quarterfinal 1". */
  placeholders: string[]
  seedOf: (id: Id) => number | undefined
  onClick?: () => void
  compact?: boolean
  /** Arena dropdown + dice, rendered in the header when the match is playable. */
  controls?: ReactNode
  /** The viewer's own match. */
  highlight?: boolean
}

export function MatchCard({ match, slots, placeholders, seedOf, onClick, compact, controls, highlight }: Props) {
  const { player, arena } = useNames()
  const { readOnly } = useTournament()
  const bye = match.playerIds.length === 1
  const done = match.result !== undefined && !bye
  const ready = match.playerIds.length >= 2 && !done
  const tappable = ready || done ? onClick : undefined
  const winner = match.result?.[0]

  return (
    <div
      className={`card match${tappable ? ' tappable' : ''}${done ? ' done' : ''}${bye ? ' bye-card' : ''}${highlight ? ' mine' : ''}`}
      onClick={tappable}
      role={tappable ? 'button' : undefined}
      tabIndex={tappable ? 0 : undefined}
      onKeyDown={(e) => {
        if (tappable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          tappable()
        }
      }}
    >
      <div className="card-header">
        <span className="arena-name" style={{ fontSize: compact ? '1rem' : undefined }}>
          {bye ? 'Bye' : match.arenaId ? arena(match.arenaId) : 'Waiting for players'}
        </span>
        {!compact &&
          (done ? (
            <span className="chip chip-ok">✓ Done</span>
          ) : bye ? (
            <span className="chip">Advances</span>
          ) : ready && onClick ? (
            <span className="chip">{readOnly ? 'Your match · tap to send' : 'Tap to enter result'}</span>
          ) : null)}
      </div>
      {controls && !compact && ready && (
        <div className="row" style={{ marginBottom: 8 }} onClick={(e) => e.stopPropagation()}>
          {controls}
        </div>
      )}
      <div>
        {slots.map((pid, i) => {
          if (!pid) {
            if (bye && i === 1) return null
            return (
              <div key={i} className="player-line">
                <span className="tbd">{placeholders[i]}</span>
              </div>
            )
          }
          const seed = seedOf(pid)
          const isWinner = done && winner === pid
          const isLoser = done && winner !== pid
          return (
            <div key={pid} className={`player-line${isWinner ? ' winner' : ''}${isLoser ? ' loser' : ''}`}>
              <span className="muted small" style={{ minWidth: '2.2em' }}>
                {seed ? `#${seed}` : ''}
              </span>
              <span className="grow">{player(pid)}</span>
              {isWinner && <span className="chip chip-ok">W</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
