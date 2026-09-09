import type { ByePoints, Id, Tournament } from '../types'

/** 1st place in a group of k earns k points, last place earns 1. */
export function pointsForPlacement(rank: number, groupSize: number): number {
  return groupSize - rank + 1
}

export function pointsForBye(groupSize: number, mode: ByePoints): number {
  return mode === 'zero' ? 0 : (groupSize + 1) / 2
}

export interface StandingRow {
  playerId: Id
  name: string
  active: boolean
  rank: number
  points: number
  played: number
  byes: number
  /** placements[i] = number of times finishing in position i+1 */
  placements: number[]
  avgPlacement: number | null
  arenasPlayed: Id[]
}

export function formatPoints(p: number): string {
  return Number.isInteger(p) ? String(p) : p.toFixed(1)
}

export function pts(p: number): string {
  return `${formatPoints(p)} ${p === 1 ? 'pt' : 'pts'}`
}

/** Points → countback (more 1sts, then more 2nds, …) → name. */
export function compareRows(a: StandingRow, b: StandingRow): number {
  if (b.points !== a.points) return b.points - a.points
  const n = Math.max(a.placements.length, b.placements.length)
  for (let i = 0; i < n; i++) {
    const d = (b.placements[i] ?? 0) - (a.placements[i] ?? 0)
    if (d !== 0) return d
  }
  return a.name.localeCompare(b.name)
}

function tied(a: StandingRow, b: StandingRow): boolean {
  if (a.points !== b.points) return false
  const n = Math.max(a.placements.length, b.placements.length)
  for (let i = 0; i < n; i++) if ((a.placements[i] ?? 0) !== (b.placements[i] ?? 0)) return false
  return true
}

export function computeStandings(t: Tournament): StandingRow[] {
  const k = t.settings.groupSize
  const rows = new Map<Id, StandingRow>()
  for (const p of t.players) {
    rows.set(p.id, {
      playerId: p.id,
      name: p.name,
      active: p.active,
      rank: 0,
      points: 0,
      played: 0,
      byes: 0,
      placements: new Array<number>(k).fill(0),
      avgPlacement: null,
      arenasPlayed: [],
    })
  }
  let placementSum = new Map<Id, number>()
  for (const round of t.rounds) {
    for (const g of round.groups) {
      if (!g.result) continue
      g.result.forEach((pid, i) => {
        const row = rows.get(pid)
        if (!row) return
        const rank = i + 1
        row.points += pointsForPlacement(rank, g.result!.length)
        row.played++
        if (row.placements.length < rank) row.placements.length = rank
        row.placements[rank - 1] = (row.placements[rank - 1] ?? 0) + 1
        if (!row.arenasPlayed.includes(g.arenaId)) row.arenasPlayed.push(g.arenaId)
        placementSum.set(pid, (placementSum.get(pid) ?? 0) + rank)
      })
    }
    // A bye only counts once the round has actually been played (some result entered).
    if (round.groups.some((g) => g.result)) {
      for (const pid of round.byePlayerIds) {
        const row = rows.get(pid)
        if (!row) continue
        row.byes++
        row.points += pointsForBye(k, t.settings.byePoints)
      }
    }
  }
  const list = [...rows.values()]
  for (const row of list) {
    row.placements = Array.from({ length: k }, (_, i) => row.placements[i] ?? 0)
    row.avgPlacement = row.played ? (placementSum.get(row.playerId) ?? 0) / row.played : null
  }
  list.sort(compareRows)
  list.forEach((row, i) => {
    row.rank = i > 0 && tied(row, list[i - 1]) ? list[i - 1].rank : i + 1
  })
  return list
}

export function standingsAsText(t: Tournament): string {
  const rows = computeStandings(t)
  const lines = [`${t.name} — final standings`, '']
  for (const r of rows) {
    lines.push(`${String(r.rank).padStart(2)}. ${r.name} — ${formatPoints(r.points)} pts (${r.placements[0]}× 1st)`)
  }
  return lines.join('\n')
}
