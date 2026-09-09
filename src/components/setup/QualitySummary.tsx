import type { ScheduleQuality } from '../../lib/scheduler'
import { useNames } from '../../state/TournamentContext'

export function QualitySummary({ q }: { q: ScheduleQuality }) {
  const { label } = useNames()
  const arena = label(1).toLowerCase()
  const arenas = label(2).toLowerCase()
  const items: { ok: boolean | null; text: string }[] = []

  if (q.everyoneAllArenasOnce) items.push({ ok: true, text: `Every player plays every ${arena} exactly once.` })
  else if (q.everyoneAllArenas) items.push({ ok: true, text: `Every player plays every ${arena} at least once (${q.arenaRepeats} repeat plays in total).` })
  else items.push({ ok: false, text: `Not everyone gets every ${arena}: the least-travelled player sees ${q.minDistinctArenas} of ${q.arenas} ${arenas}.` })

  if (q.players > 1) {
    // Informational: with full arena coverage some repeat group-mates are often unavoidable.
    items.push({
      ok: q.maxMates <= Math.max(1, Math.ceil(q.rounds / 2)) ? true : null,
      text: `The most any two players share a group: ${q.maxMates}×. ${q.pairsNeverMet === 0 ? 'Everyone meets everyone.' : `${q.pairsNeverMet} pairs never meet.`}`,
    })
  }

  if (q.byesMax > 0) items.push({ ok: q.byesMax - q.byesMin <= 1, text: `Sitting out: between ${q.byesMin} and ${q.byesMax} rounds per player.` })
  else items.push({ ok: true, text: 'Nobody sits out.' })

  return (
    <ul className="quality">
      {items.map((it) => (
        <li key={it.text}>
          <span className={`chip ${it.ok === true ? 'chip-ok' : it.ok === false ? 'chip-warn' : ''}`}>{it.ok === true ? '✓' : it.ok === false ? '!' : 'i'}</span> {it.text}
        </li>
      ))}
    </ul>
  )
}
