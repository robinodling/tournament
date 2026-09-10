import { pointsForPlacement, pts } from '../../lib/scoring'
import { ordinal } from '../../lib/label'
import { useNames, useTournament } from '../../state/TournamentContext'
import type { Group } from '../../types'

interface Props {
  group: Group
  onClick?: () => void
  compact?: boolean
  /** Final groups: show seeding order and no points. */
  seeded?: boolean
  /** The viewer's own group. */
  highlight?: boolean
}

export function GroupCard({ group, onClick, compact, seeded, highlight }: Props) {
  const { player, arena } = useNames()
  const { t, readOnly } = useTournament()
  const done = group.result !== undefined
  const order = group.result ?? group.playerIds
  const k = group.playerIds.length

  return (
    <div
      className={`card${onClick ? ' tappable' : ''}${done ? ' done' : ''}${highlight ? ' mine' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <div className="card-header">
        <span className={compact ? 'arena-name small' : 'arena-name'} style={compact ? { fontSize: '1rem' } : undefined}>
          {arena(group.arenaId)}
        </span>
        {!compact && (done ? <span className="chip chip-ok">✓ Done</span> : onClick ? <span className="chip">{readOnly ? 'Your group · tap to send result' : 'Tap to enter result'}</span> : null)}
      </div>
      <div>
        {order.map((pid, i) => (
          <div key={pid} className="player-line">
            {done ? (
              <span className={`placement p${i + 1}`}>{ordinal(i + 1)}</span>
            ) : seeded ? (
              <span className="muted small" style={{ minWidth: '3.2em' }}>
                seed {i + 1}
              </span>
            ) : (
              <span className="muted small" style={{ minWidth: '1.2em' }}>
                •
              </span>
            )}
            <span className="grow">{player(pid)}</span>
            {done && !seeded && <span className="pts">{pts(pointsForPlacement(i + 1, k, t.settings.groupSize))}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
