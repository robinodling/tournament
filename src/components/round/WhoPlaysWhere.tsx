import { useNames, useTournament } from '../../state/TournamentContext'
import type { Round } from '../../types'

export function WhoPlaysWhere({ round }: { round: Round }) {
  const { t } = useTournament()
  const { player, arena } = useNames()
  const where = new Map<string, string>()
  for (const g of round.groups) for (const pid of g.playerIds) where.set(pid, arena(g.arenaId))
  for (const pid of round.byePlayerIds) where.set(pid, 'sits out')
  const ids = [...where.keys()].sort((a, b) => player(a).localeCompare(player(b)))
  if (ids.length === 0) return null
  return (
    <div className="card">
      <ul className="who-list">
        {ids.map((pid) => (
          <li key={pid}>
            <span>{player(pid)}</span>
            <span className={where.get(pid) === 'sits out' ? 'muted' : ''} style={{ fontWeight: 600 }}>
              {where.get(pid)}
            </span>
          </li>
        ))}
      </ul>
      {t.players.some((p) => !p.active) && <p className="hint small">Players who left are not listed.</p>}
    </div>
  )
}
