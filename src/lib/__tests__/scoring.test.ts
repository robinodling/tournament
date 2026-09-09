import { describe, expect, it } from 'vitest'
import { computeStandings, pointsForBye, pointsForPlacement, standingsAsText } from '../scoring'
import type { Tournament } from '../../types'

function tournament(): Tournament {
  return {
    version: 1,
    id: 't',
    name: 'Test',
    phase: 'running',
    players: ['Anna', 'Bo', 'Cid', 'Dee', 'Eve'].map((name, i) => ({ id: `p${i}`, name, active: true })),
    arenas: [
      { id: 'a1', name: 'A1', active: true },
      { id: 'a2', name: 'A2', active: true },
    ],
    settings: { groupSize: 4, roundCount: 2, byePoints: 'average', arenaLabel: 'Arena', seed: 1 },
    rounds: [
      { groups: [{ id: 'g1', arenaId: 'a1', playerIds: ['p0', 'p1', 'p2', 'p3'], result: ['p0', 'p1', 'p2', 'p3'] }], byePlayerIds: ['p4'] },
      { groups: [{ id: 'g2', arenaId: 'a2', playerIds: ['p4', 'p1', 'p2', 'p3'], result: ['p1', 'p4', 'p3', 'p2'] }], byePlayerIds: ['p0'] },
      { groups: [{ id: 'g3', arenaId: 'a1', playerIds: ['p0', 'p1', 'p2', 'p4'] }], byePlayerIds: ['p3'] },
    ],
    currentRound: 2,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('scoring', () => {
  it('awards k points for 1st down to 1 for last', () => {
    expect(pointsForPlacement(1, 4)).toBe(4)
    expect(pointsForPlacement(4, 4)).toBe(1)
    expect(pointsForPlacement(1, 2)).toBe(2)
  })

  it('bye points', () => {
    expect(pointsForBye(4, 'average')).toBe(2.5)
    expect(pointsForBye(4, 'zero')).toBe(0)
  })

  it('computes standings with countback tiebreak and shared ranks', () => {
    const rows = computeStandings(tournament())
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]))
    // Anna: 4 (1st) + 2.5 bye = 6.5 ; Bo: 3 + 4 = 7 ; Cid: 2 + 1 = 3 ; Dee: 1 + 2 = 3 ; Eve: 2.5 bye + 3 = 5.5
    expect(byName.Bo.points).toBe(7)
    expect(byName.Anna.points).toBe(6.5)
    expect(byName.Eve.points).toBe(5.5)
    expect(byName.Cid.points).toBe(3)
    expect(byName.Dee.points).toBe(3)
    // Cid and Dee are fully tied (3 pts, one 3rd + one 4th each) → name order, shared rank
    expect(rows.map((r) => r.name)).toEqual(['Bo', 'Anna', 'Eve', 'Cid', 'Dee'])
    expect(byName.Cid.rank).toBe(4)
    expect(byName.Dee.rank).toBe(4)
    // unplayed round 3 does not count byes
    expect(byName.Dee.byes).toBe(0)
    expect(byName.Anna.arenasPlayed).toEqual(['a1'])
    expect(byName.Bo.avgPlacement).toBe(1.5)
  })

  it('renders text standings', () => {
    const text = standingsAsText(tournament())
    expect(text).toContain('1. Bo — 7 pts')
    expect(text).toContain('2. Anna — 6.5 pts')
  })
})
