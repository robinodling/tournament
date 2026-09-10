import { describe, expect, it } from 'vitest'
import { activeRoundIndex, gamesNow, groupFlow, groupStageComplete, nextGameFor } from '../flow'
import { initialTournament } from '../../state/reducer'
import type { Tournament } from '../../types'

function t(): Tournament {
  const base = initialTournament()
  const p = (n: number) => `p${n}`
  return {
    ...base,
    phase: 'running',
    players: Array.from({ length: 8 }, (_, i) => ({ id: p(i), name: p(i), active: true })),
    arenas: ['a1', 'a2', 'a3', 'a4'].map((id) => ({ id, name: id, active: true })),
    rounds: [
      { groups: [{ id: 'g1', arenaId: 'a1', playerIds: [p(0), p(1), p(2), p(3)] }, { id: 'g2', arenaId: 'a2', playerIds: [p(4), p(5), p(6), p(7)] }], byePlayerIds: [] },
      // round 2: g3 reuses arena a1 with players from g1 only; g4 mixes both round-1 groups on a fresh arena
      { groups: [{ id: 'g3', arenaId: 'a1', playerIds: [p(0), p(1), p(2), p(3)] }, { id: 'g4', arenaId: 'a3', playerIds: [p(4), p(5), p(0), p(1)] }], byePlayerIds: [] },
    ],
  }
}

const withResult = (x: Tournament, id: string): Tournament => ({
  ...x,
  rounds: x.rounds.map((r) => ({ ...r, groups: r.groups.map((g) => (g.id === id ? { ...g, result: g.playerIds } : g)) })),
})

describe('game flow', () => {
  it('round-1 groups are ready, round-2 groups wait for their players', () => {
    const x = t()
    expect(gamesNow(x).map((f) => f.group.id)).toEqual(['g1', 'g2'])
    const g3 = groupFlow(x, 1, x.rounds[1].groups[0])
    expect(g3.state).toBe('waiting')
    expect(g3.waitingForPlayers).toEqual(['p0', 'p1', 'p2', 'p3'])
    expect(g3.waitingForArena).toBe(true) // a1 still busy with g1
    expect(activeRoundIndex(x)).toBe(0)
  })

  it('a round-2 group becomes ready as soon as its own players and arena are done, regardless of other games', () => {
    const x = withResult(t(), 'g1')
    const g3 = groupFlow(x, 1, x.rounds[1].groups[0])
    expect(g3.state).toBe('ready') // g1 done: players free and a1 free, even though g2 is still playing
    const g4 = groupFlow(x, 1, x.rounds[1].groups[1])
    expect(g4.state).toBe('waiting')
    expect(g4.waitingForPlayers).toEqual(['p4', 'p5']) // still in g2
    expect(g4.waitingForArena).toBe(false)
    expect(gamesNow(x).map((f) => f.group.id)).toEqual(['g2', 'g3'])
    expect(nextGameFor(x, 'p0')?.group.id).toBe('g3')
    expect(nextGameFor(x, 'p4')?.group.id).toBe('g2')
    expect(activeRoundIndex(x)).toBe(0) // g2 unplayed
  })

  it('arena occupancy alone can hold a group back', () => {
    const x = t()
    x.rounds[1].groups[1].arenaId = 'a2' // g4 on a2, still used by g2
    const y = withResult(withResult(x, 'g1'), 'g2')
    // both round-1 groups done → everything free
    expect(groupFlow(y, 1, y.rounds[1].groups[1]).state).toBe('ready')
    const z = withResult(x, 'g1')
    const g4 = groupFlow({ ...z, rounds: z.rounds.map((r, i) => (i === 1 ? { ...r, groups: [r.groups[0], { ...r.groups[1], playerIds: ['p0', 'p1', 'p2', 'p3'] }] } : r)) }, 1, {
      id: 'g4',
      arenaId: 'a2',
      playerIds: ['p0', 'p1', 'p2', 'p3'],
    })
    expect(g4.waitingForPlayers).toEqual([])
    expect(g4.waitingForArena).toBe(true)
    expect(g4.state).toBe('waiting')
  })

  it('complete when every group has a result; a player with nothing left has no next game', () => {
    let x = t()
    for (const id of ['g1', 'g2', 'g3', 'g4']) x = withResult(x, id)
    expect(groupStageComplete(x)).toBe(true)
    expect(nextGameFor(x, 'p0')).toBeNull()
    expect(activeRoundIndex(x)).toBe(1)
  })
})
