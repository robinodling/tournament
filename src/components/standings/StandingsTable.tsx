import { formatPoints, type StandingRow } from '../../lib/scoring'
import { useNames, useTournament } from '../../state/TournamentContext'

export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  const { t } = useTournament()
  const { label } = useNames()
  const arenaCount = t.arenas.filter((a) => a.active).length
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Player</th>
            <th className="num">Pts</th>
            <th className="num">1st</th>
            <th className="num">Avg</th>
            <th title={`Distinct ${label(2).toLowerCase()} played`}>{label(2)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId} className={r.active ? '' : 'inactive'}>
              <td className="num">{r.rank}</td>
              <td>
                {r.name}
                {!r.active && <span className="muted small"> (left)</span>}
              </td>
              <td className="num points">{formatPoints(r.points)}</td>
              <td className="num">{r.placements[0] ?? 0}</td>
              <td className="num">{r.avgPlacement === null ? '–' : r.avgPlacement.toFixed(2)}</td>
              <td>
                <span className="coverage" aria-label={`${r.arenasPlayed.length} of ${arenaCount}`}>
                  {Array.from({ length: Math.max(arenaCount, r.arenasPlayed.length) }, (_, i) => (
                    <span key={i} className={`dot${i < r.arenasPlayed.length ? ' filled' : ''}`} />
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
