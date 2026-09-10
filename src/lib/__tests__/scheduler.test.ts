import { describe, expect, it } from 'vitest'
import { describeSchedule, generateRounds, minRoundsForFullCoverage, roundShape, suggestRounds } from '../scheduler'
import type { Arena, Player, Round } from '../../types'

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

function mk(P: number, A: number) {
  const players: Player[] = ids('p', P).map((id) => ({ id, name: id, active: true }))
  const arenas: Arena[] = ids('a', A).map((id) => ({ id, name: id, active: true }))
  return { players, arenas }
}

function assertInvariants(rounds: Round[], playerIds: string[], arenaIds: string[], k: number) {
  const shape = roundShape(playerIds.length, arenaIds.length, k)
  for (const r of rounds) {
    expect(r.groups.length).toBe(shape.groups)
    for (const g of r.groups) {
      expect(g.playerIds.length).toBe(k)
      expect(arenaIds).toContain(g.arenaId)
    }
    const arenasUsed = r.groups.map((g) => g.arenaId)
    expect(new Set(arenasUsed).size).toBe(arenasUsed.length)
    const everyone = [...r.groups.flatMap((g) => g.playerIds), ...r.byePlayerIds].sort()
    expect(everyone).toEqual([...playerIds].sort())
    expect(r.byePlayerIds.length).toBe(shape.byes)
  }
}

describe('generateRounds', () => {
  it('8 players / 4 arenas / groups of 4 / 4 rounds: everyone plays every arena exactly once', () => {
    const { players, arenas } = mk(8, 4)
    const pid = players.map((p) => p.id)
    const aid = arenas.map((a) => a.id)
    for (const seed of [1, 2, 3, 42, 1337]) {
      const rounds = generateRounds({ playerIds: pid, arenaIds: aid, groupSize: 4, roundsToGenerate: 4, history: [], seed })
      assertInvariants(rounds, pid, aid, 4)
      const q = describeSchedule({ players, arenas, rounds })
      expect(q.everyoneAllArenasOnce).toBe(true)
      expect(q.arenaRepeats).toBe(0)
      // Best achievable mixing under full coverage: one pair meets 4×, nobody meets more.
      expect(q.maxMates).toBeLessThanOrEqual(4)
    }
  })

  it('8 players / 4 arenas / head-to-head / 4 rounds: full coverage and no repeated opponent', () => {
    const { players, arenas } = mk(8, 4)
    const pid = players.map((p) => p.id)
    const aid = arenas.map((a) => a.id)
    for (const seed of [1, 7, 99]) {
      const rounds = generateRounds({ playerIds: pid, arenaIds: aid, groupSize: 2, roundsToGenerate: 4, history: [], seed })
      assertInvariants(rounds, pid, aid, 2)
      const q = describeSchedule({ players, arenas, rounds })
      expect(q.everyoneAllArenasOnce).toBe(true)
      expect(q.maxMates).toBe(1)
    }
  })

  it('7 players / 4 arenas / groups of 4: byes rotate fairly', () => {
    const { players, arenas } = mk(7, 4)
    const pid = players.map((p) => p.id)
    const aid = arenas.map((a) => a.id)
    const rounds = generateRounds({ playerIds: pid, arenaIds: aid, groupSize: 4, roundsToGenerate: 7, history: [], seed: 5 })
    assertInvariants(rounds, pid, aid, 4)
    const q = describeSchedule({ players, arenas, rounds })
    // 3 byes per round × 7 rounds = 21 byes over 7 players → exactly 3 each
    expect(q.byesMin).toBe(3)
    expect(q.byesMax).toBe(3)
  })

  it('more groups than arenas: extra players sit out', () => {
    const { players, arenas } = mk(12, 2)
    const pid = players.map((p) => p.id)
    const aid = arenas.map((a) => a.id)
    const rounds = generateRounds({ playerIds: pid, arenaIds: aid, groupSize: 4, roundsToGenerate: 3, history: [], seed: 9 })
    assertInvariants(rounds, pid, aid, 4)
    const q = describeSchedule({ players, arenas, rounds })
    expect(q.byesMax - q.byesMin).toBeLessThanOrEqual(1)
  })

  it('respects history when generating remaining rounds', () => {
    const { players, arenas } = mk(8, 4)
    const pid = players.map((p) => p.id)
    const aid = arenas.map((a) => a.id)
    const first = generateRounds({ playerIds: pid, arenaIds: aid, groupSize: 4, roundsToGenerate: 2, history: [], seed: 3 })
    const rest = generateRounds({ playerIds: pid, arenaIds: aid, groupSize: 4, roundsToGenerate: 2, history: first, seed: 4 })
    const q = describeSchedule({ players, arenas, rounds: [...first, ...rest] })
    expect(q.everyoneAllArenasOnce).toBe(true)
  })

  it('a replaced arena inherits the history of the one it replaced', () => {
    const { players, arenas } = mk(8, 4)
    const pid = players.map((p) => p.id)
    const aid = arenas.map((a) => a.id)
    const first = generateRounds({ playerIds: pid, arenaIds: aid, groupSize: 4, roundsToGenerate: 2, history: [], seed: 3 })
    // a1 breaks and is replaced by a5
    const newArenas = [...arenas.filter((a) => a.id !== 'a1'), { id: 'a5', name: 'a5', active: true, replacesId: 'a1' }]
    const rest = generateRounds({
      playerIds: pid,
      arenaIds: newArenas.map((a) => a.id),
      groupSize: 4,
      roundsToGenerate: 2,
      history: first,
      arenaAlias: { a1: 'a5' },
      seed: 4,
    })
    const q = describeSchedule({ players, arenas: [...arenas.map((a) => (a.id === 'a1' ? { ...a, active: false } : a)), newArenas[3]], rounds: [...first, ...rest] })
    expect(q.everyoneAllArenasOnce).toBe(true)
  })

  it('is deterministic for a given seed', () => {
    const { players, arenas } = mk(9, 3)
    const pid = players.map((p) => p.id)
    const aid = arenas.map((a) => a.id)
    const strip = (rs: Round[]) => rs.map((r) => ({ ...r, groups: r.groups.map(({ id: _id, ...g }) => g) }))
    const a = generateRounds({ playerIds: pid, arenaIds: aid, groupSize: 3, roundsToGenerate: 5, history: [], seed: 11 })
    const b = generateRounds({ playerIds: pid, arenaIds: aid, groupSize: 3, roundsToGenerate: 5, history: [], seed: 11 })
    expect(strip(a)).toEqual(strip(b))
  })

  it('throws when no group can be formed', () => {
    expect(() => generateRounds({ playerIds: ['p1', 'p2', 'p3'], arenaIds: ['a1'], groupSize: 4, roundsToGenerate: 1, history: [], seed: 1 })).toThrow()
  })

  it('suggests the fewest rounds for everyone to play every arena', () => {
    expect(minRoundsForFullCoverage(8, 4, 4)).toBe(4)
    expect(minRoundsForFullCoverage(8, 4, 2)).toBe(4)
    expect(minRoundsForFullCoverage(7, 4, 4)).toBe(7)
    expect(minRoundsForFullCoverage(12, 2, 4)).toBe(3)
    expect(minRoundsForFullCoverage(3, 2, 4)).toBeNull()

    expect(suggestRounds(ids('p', 8), ids('a', 4), 4)).toEqual({ rounds: 4, verified: true, exact: true })
    expect(suggestRounds(ids('p', 8), ids('a', 4), 2)).toEqual({ rounds: 4, verified: true, exact: true })
    const seven = suggestRounds(ids('p', 7), ids('a', 4), 4)!
    expect(seven.verified).toBe(true)
    expect(seven.rounds).toBeGreaterThanOrEqual(7)
    const twelve = suggestRounds(ids('p', 12), ids('a', 2), 4)!
    expect(twelve.verified).toBe(true)
    expect(twelve.rounds).toBe(3)
  })
})
