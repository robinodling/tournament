import { describe, expect, it } from 'vitest'
import { bracketOrder, initialTournament, isFinalComplete, isLocked, matchSlots, pickRandomArena, reducer, validateSetup, type Action } from '../../state/reducer'
import { computeFinalRanking, computeStandings } from '../scoring'
import { describeSchedule } from '../scheduler'
import type { Tournament } from '../../types'

function run(actions: Action[], start: Tournament | null = initialTournament()): Tournament {
  let s: Tournament | null = start
  for (const a of actions) s = reducer(s, a)
  if (!s) throw new Error('no state')
  return s
}

function setupEight(): Tournament {
  return run([
    { type: 'SET_NAME', name: 'Pinball' },
    { type: 'UPDATE_SETTINGS', settings: { arenaLabel: 'Machine', groupSize: 4, roundCount: 4 } },
    { type: 'SET_PLAYER_COUNT', count: 8 },
    { type: 'SET_ARENA_COUNT', count: 4 },
    { type: 'GENERATE_SCHEDULE', seed: 42 },
  ])
}

describe('reducer', () => {
  it('quick-fills players and arenas with placeholder names using the label', () => {
    const t = setupEight()
    expect(t.players.map((p) => p.name)).toEqual(['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7', 'Player 8'])
    expect(t.arenas.map((a) => a.name)).toEqual(['Machine 1', 'Machine 2', 'Machine 3', 'Machine 4'])
    expect(validateSetup(t)).toEqual([])
    expect(t.rounds).toHaveLength(4)
    expect(describeSchedule(t).everyoneAllArenasOnce).toBe(true)
  })

  it('shrinking the count removes from the end; roster changes invalidate the schedule in setup', () => {
    let t = setupEight()
    t = reducer(t, { type: 'SET_PLAYER_COUNT', count: 6 })!
    expect(t.players).toHaveLength(6)
    expect(t.rounds).toHaveLength(0)
  })

  it('validation flags missing players / arenas', () => {
    const t = run([{ type: 'SET_PLAYER_COUNT', count: 2 }])
    expect(validateSetup(t).join(' ')).toMatch(/at least 3 players/) // groups of 4 may shrink to 3, not to 2
    expect(validateSetup(t).join(' ')).toMatch(/at least one arena/)
    expect(reducer(t, { type: 'GENERATE_SCHEDULE' })!.rounds).toHaveLength(0)
  })

  it('records results, advances rounds and finishes', () => {
    let t = run([{ type: 'START' }], setupEight())
    expect(t.phase).toBe('running')
    for (let r = 0; r < 4; r++) {
      for (const g of t.rounds[r].groups) {
        t = reducer(t, { type: 'SET_RESULT', groupId: g.id, order: [...g.playerIds].reverse() })!
      }
      expect(isLocked(t.rounds[r])).toBe(true)
      t = reducer(t, { type: 'NEXT_ROUND' })!
    }
    expect(t.phase).toBe('finished')
  })

  it('rejects a result that is not a permutation of the group', () => {
    let t = run([{ type: 'START' }], setupEight())
    const g = t.rounds[0].groups[0]
    const before = t
    t = reducer(t, { type: 'SET_RESULT', groupId: g.id, order: g.playerIds.slice(0, 3) })!
    expect(t).toBe(before)
  })

  it('removing a player mid-tournament keeps locked rounds and re-draws the rest', () => {
    let t = run([{ type: 'START' }], setupEight())
    for (let r = 0; r < 2; r++)
      for (const g of t.rounds[r].groups) t = reducer(t, { type: 'SET_RESULT', groupId: g.id, order: g.playerIds })!
    t = reducer(t, { type: 'NEXT_ROUND' })!
    t = reducer(t, { type: 'NEXT_ROUND' })!
    const lockedBefore = [t.rounds[0], t.rounds[1]]
    const gone = t.players[0]
    t = reducer(t, { type: 'REMOVE_PLAYER', id: gone.id })!
    expect(t.players.find((p) => p.id === gone.id)?.active).toBe(false)
    expect(t.rounds).toHaveLength(4)
    expect(t.rounds[0]).toBe(lockedBefore[0])
    expect(t.rounds[1]).toBe(lockedBefore[1])
    for (const r of t.rounds.slice(2)) {
      expect(r.groups.flatMap((g) => g.playerIds)).not.toContain(gone.id)
      expect(r.groups.map((g) => g.playerIds.length).sort()).toEqual([3, 4]) // 7 players → 4 + 3, nobody sits out
      expect(r.byePlayerIds).toHaveLength(0)
    }
    expect(t.currentRound).toBe(2)
  })

  it('replacing an arena moves only unplayed groups to the new arena', () => {
    let t = run([{ type: 'START' }], setupEight())
    const g0 = t.rounds[0].groups[0]
    t = reducer(t, { type: 'SET_RESULT', groupId: g0.id, order: g0.playerIds })!
    const broken = g0.arenaId
    t = reducer(t, { type: 'REPLACE_ARENA', id: broken, name: 'Spare' })!
    const spare = t.arenas.find((a) => a.name === 'Spare')!
    expect(spare.replacesId).toBe(broken)
    expect(t.arenas.find((a) => a.id === broken)?.active).toBe(false)
    expect(t.rounds[0].groups[0].arenaId).toBe(broken) // played: history intact
    for (const r of t.rounds) for (const g of r.groups) if (!g.result) expect(g.arenaId).not.toBe(broken)
    // the schedule still counts as full coverage because Spare inherits the broken arena's history
    expect(describeSchedule(t).everyoneAllArenasOnce).toBe(true)
  })

  it('changing the round count while running adds/removes unplayed rounds only', () => {
    let t = run([{ type: 'START' }], setupEight())
    for (const g of t.rounds[0].groups) t = reducer(t, { type: 'SET_RESULT', groupId: g.id, order: g.playerIds })!
    t = reducer(t, { type: 'UPDATE_SETTINGS', settings: { roundCount: 6 } })!
    expect(t.rounds).toHaveLength(6)
    t = reducer(t, { type: 'UPDATE_SETTINGS', settings: { roundCount: 1 } })!
    expect(t.rounds).toHaveLength(1)
    expect(isLocked(t.rounds[0])).toBe(true)
  })

  it('group size cannot change while running', () => {
    let t = run([{ type: 'START' }], setupEight())
    t = reducer(t, { type: 'UPDATE_SETTINGS', settings: { groupSize: 2 } })!
    expect(t.settings.groupSize).toBe(4)
  })

  function playAllRounds(t: Tournament): Tournament {
    for (let r = 0; r < t.rounds.length; r++) {
      for (const g of t.rounds[r].groups) t = reducer(t, { type: 'SET_RESULT', groupId: g.id, order: [...g.playerIds].sort() })!
      t = reducer(t, { type: 'NEXT_ROUND' })!
    }
    return t
  }

  it('without a final stage the tournament finishes after the last round', () => {
    const t = playAllRounds(run([{ type: 'START' }], setupEight()))
    expect(t.phase).toBe('finished')
    expect(t.final).toBeUndefined()
  })

  it('tiered finals: everyone is seeded by standings into A/B finals whose results decide the order', () => {
    let t = run([{ type: 'UPDATE_SETTINGS', settings: { finalStage: 'tiers' } }, { type: 'START' }], setupEight())
    t = playAllRounds(t)
    expect(t.phase).toBe('final')
    expect(t.final!.groups).toHaveLength(2)
    const standings = computeStandings(t).map((r) => r.playerId)
    expect(t.final!.groups[0].playerIds).toEqual(standings.slice(0, 4))
    expect(t.final!.groups[1].playerIds).toEqual(standings.slice(4, 8))
    expect(t.final!.groups[0].arenaId).not.toBe(t.final!.groups[1].arenaId)
    // provisional ranking follows standings until played
    expect(computeFinalRanking(t).decidedByFinal).toBe(false)
    // B-final played in reverse seeding order → its last seed takes 5th
    const b = t.final!.groups[1]
    t = reducer(t, { type: 'SET_RESULT', groupId: b.id, order: [...b.playerIds].reverse() })!
    const a = t.final!.groups[0]
    t = reducer(t, { type: 'SET_RESULT', groupId: a.id, order: [...a.playerIds].reverse() })!
    expect(isFinalComplete(t)).toBe(true)
    const ranking = computeFinalRanking(t)
    expect(ranking.decidedByFinal).toBe(true)
    expect(ranking.rows.map((r) => r.playerId)).toEqual([...[...a.playerIds].reverse(), ...[...b.playerIds].reverse()])
    expect(ranking.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    t = reducer(t, { type: 'FINISH' })!
    expect(t.phase).toBe('finished')
    expect(t.final).toBeDefined()
  })

  it('top final: only the best four play, the rest keep their standings positions', () => {
    let t = run([{ type: 'UPDATE_SETTINGS', settings: { finalStage: 'top' } }, { type: 'START' }], setupEight())
    t = playAllRounds(t)
    expect(t.final!.groups).toHaveLength(1)
    const g = t.final!.groups[0]
    const fourth = g.playerIds[3]
    t = reducer(t, { type: 'SET_RESULT', groupId: g.id, order: [fourth, ...g.playerIds.slice(0, 3)] })!
    const rows = computeFinalRanking(t).rows
    expect(rows[0].playerId).toBe(fourth)
    expect(rows.slice(4).map((r) => r.playerId)).toEqual(computeStandings(t).slice(4).map((r) => r.playerId))
  })

  it('a final can be re-seeded before results and skipped entirely', () => {
    let t = run([{ type: 'UPDATE_SETTINGS', settings: { finalStage: 'top' } }, { type: 'START' }], setupEight())
    t = playAllRounds(t)
    const arena = t.final!.groups[0].arenaId
    const other = t.arenas.find((a) => a.id !== arena)!.id
    t = reducer(t, { type: 'SET_GROUP_ARENA', groupId: t.final!.groups[0].id, arenaId: other })!
    expect(t.final!.groups[0].arenaId).toBe(other)
    const reseeded = reducer(t, { type: 'RESEED_FINAL' })!
    expect(reseeded.final!.groups[0].playerIds).toEqual(t.final!.groups[0].playerIds)
    t = reducer(t, { type: 'SKIP_FINAL' })!
    expect(t.phase).toBe('finished')
    expect(t.final).toBeUndefined()
    expect(computeFinalRanking(t).decidedByFinal).toBe(false)
  })

  it('old saves without finalStage are normalised on hydrate', () => {
    const old = setupEight()
    delete (old.settings as Partial<typeof old.settings>).finalStage
    const t = reducer(null, { type: 'HYDRATE', tournament: old })!
    expect(t.settings.finalStage).toBe('none')
  })

  it('random arena for a final avoids other finals and always changes when it can', () => {
    let t = run([{ type: 'UPDATE_SETTINGS', settings: { finalStage: 'tiers' } }, { type: 'START' }], setupEight())
    t = playAllRounds(t)
    const [a, b] = t.final!.groups
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const pick = pickRandomArena(t, a.id, () => r)!
      expect(pick).not.toBe(a.arenaId)
      expect(pick).not.toBe(b.arenaId)
      expect(t.arenas.map((x) => x.id)).toContain(pick)
    }
    // played finals cannot be moved
    t = reducer(t, { type: 'SET_RESULT', groupId: a.id, order: a.playerIds })!
    expect(pickRandomArena(t, a.id)).toBeNull()
    // with only one arena left there is no alternative → keeps the current one
    const single = { ...t, arenas: t.arenas.map((x) => ({ ...x, active: x.id === b.arenaId })) }
    expect(pickRandomArena(single, b.id)).toBe(b.arenaId)
  })

  it('randomizing all finals deals distinct arenas and leaves played finals alone', () => {
    let t = run([{ type: 'UPDATE_SETTINGS', settings: { finalStage: 'tiers' } }, { type: 'START' }], setupEight())
    t = playAllRounds(t)
    const before = t.final!.groups.map((g) => g.arenaId)
    let changed = false
    for (const seed of [1, 2, 3, 4, 5]) {
      const next = reducer(t, { type: 'RANDOMIZE_FINAL_ARENAS', seed })!
      const arenas = next.final!.groups.map((g) => g.arenaId)
      expect(new Set(arenas).size).toBe(arenas.length)
      if (arenas.join() !== before.join()) changed = true
    }
    expect(changed).toBe(true)
    const a = t.final!.groups[0]
    t = reducer(t, { type: 'SET_RESULT', groupId: a.id, order: a.playerIds })!
    const after = reducer(t, { type: 'RANDOMIZE_FINAL_ARENAS', seed: 9 })!
    expect(after.final!.groups[0].arenaId).toBe(a.arenaId)
    expect(after.final!.groups[1].arenaId).not.toBe(a.arenaId)
  })

  describe('knockout bracket', () => {
    const win = (t: Tournament, groupId: string, winner: string) => {
      const g = [...t.final!.bracket!.rounds.flat(), t.final!.bracket!.bronze!].find((m) => m.id === groupId)!
      return reducer(t, { type: 'SET_RESULT', groupId, order: [winner, ...g.playerIds.filter((p) => p !== winner)] })!
    }

    it('seed order pairs 1 vs last and keeps the top two apart until the final', () => {
      expect(bracketOrder(4)).toEqual([1, 4, 2, 3])
      expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
    })

    it('8 players: quarterfinals seeded from standings, winners flow to semis, final and bronze', () => {
      let t = run([{ type: 'UPDATE_SETTINGS', settings: { finalStage: 'bracket' } }, { type: 'START' }], setupEight())
      t = playAllRounds(t)
      expect(t.phase).toBe('final')
      expect(t.final!.kind).toBe('bracket')
      const b = t.final!.bracket!
      const s = computeStandings(t).map((r) => r.playerId) // s[0] = seed 1
      expect(b.size).toBe(8)
      expect(b.seeds).toEqual(s)
      expect(b.rounds.map((r) => r.length)).toEqual([4, 2, 1])
      expect(b.rounds[0].map((m) => m.playerIds)).toEqual([[s[0], s[7]], [s[3], s[4]], [s[1], s[6]], [s[2], s[5]]])
      expect(new Set(b.rounds[0].map((m) => m.arenaId)).size).toBe(4)
      expect(b.bronze).toBeDefined()
      expect(computeFinalRanking(t).decidedByFinal).toBe(false)

      // higher seed wins every quarterfinal
      for (const m of b.rounds[0]) t = win(t, m.id, m.playerIds[0])
      let semis = t.final!.bracket!.rounds[1]
      expect(semis[0].playerIds).toEqual([s[0], s[3]])
      expect(semis[1].playerIds).toEqual([s[1], s[2]])
      expect(semis[0].arenaId).not.toBe(semis[1].arenaId)
      t = win(t, semis[0].id, s[0])
      t = win(t, semis[1].id, s[1])
      const fin = t.final!.bracket!.rounds[2][0]
      const bronze = t.final!.bracket!.bronze!
      expect(fin.playerIds).toEqual([s[0], s[1]])
      expect(bronze.playerIds).toEqual([s[3], s[2]])
      expect(fin.arenaId).not.toBe(bronze.arenaId)
      expect(isFinalComplete(t)).toBe(false)
      t = win(t, bronze.id, s[2])
      t = win(t, fin.id, s[1]) // upset in the final
      expect(isFinalComplete(t)).toBe(true)
      const ranking = computeFinalRanking(t)
      expect(ranking.decidedByFinal).toBe(true)
      expect(ranking.rows.slice(0, 4).map((r) => r.playerId)).toEqual([s[1], s[0], s[2], s[3]])
      // quarterfinal losers 5–8 in standings order
      expect(ranking.rows.slice(4).map((r) => r.playerId)).toEqual([s[4], s[5], s[6], s[7]])
      expect(ranking.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    })

    it('editing an earlier match clears everything that depended on it', () => {
      let t = run([{ type: 'UPDATE_SETTINGS', settings: { finalStage: 'bracket' } }, { type: 'START' }], setupEight())
      t = playAllRounds(t)
      const s = computeStandings(t).map((r) => r.playerId)
      for (const m of t.final!.bracket!.rounds[0]) t = win(t, m.id, m.playerIds[0])
      const semi0 = t.final!.bracket!.rounds[1][0]
      t = win(t, semi0.id, s[0])
      expect(t.final!.bracket!.rounds[2][0].playerIds).toEqual([s[0]])
      // flip quarterfinal 2: seed 5 beats seed 4 → semi 1 changes and loses its result, final loses its participant
      const qf2 = t.final!.bracket!.rounds[0][1]
      t = win(t, qf2.id, s[4])
      expect(t.final!.bracket!.rounds[1][0].playerIds).toEqual([s[0], s[4]])
      expect(t.final!.bracket!.rounds[1][0].result).toBeUndefined()
      expect(t.final!.bracket!.rounds[2][0].playerIds).toEqual([])
    })

    it('7 players: the top seed gets a bye and advances automatically', () => {
      let t = run([
        { type: 'UPDATE_SETTINGS', settings: { finalStage: 'bracket' } },
        { type: 'SET_PLAYER_COUNT', count: 7 },
        { type: 'SET_ARENA_COUNT', count: 4 },
        { type: 'START' },
      ])
      t = playAllRounds(t)
      const b = t.final!.bracket!
      const s = computeStandings(t).map((r) => r.playerId)
      expect(b.size).toBe(8)
      expect(b.seeds).toHaveLength(7)
      expect(b.rounds[0][0].playerIds).toEqual([s[0]])
      expect(b.rounds[0][0].result).toEqual([s[0]])
      expect(matchSlots(b, 1, 0)).toEqual([s[0], undefined])
      expect(b.rounds[1][0].playerIds).toEqual([s[0]])
      t = win(t, b.rounds[0][1].id, s[3])
      expect(t.final!.bracket!.rounds[1][0].playerIds).toEqual([s[0], s[3]])
    })

    it('top-4 bracket: non-entrants keep their standings positions below the bracket', () => {
      let t = run([{ type: 'UPDATE_SETTINGS', settings: { finalStage: 'bracket', bracketSize: 4 } }, { type: 'START' }], setupEight())
      t = playAllRounds(t)
      const b = t.final!.bracket!
      const s = computeStandings(t).map((r) => r.playerId)
      expect(b.size).toBe(4)
      expect(b.rounds.map((r) => r.length)).toEqual([2, 1])
      expect(b.rounds[0].map((m) => m.playerIds)).toEqual([[s[0], s[3]], [s[1], s[2]]])
      const rows = computeFinalRanking(t).rows
      expect(rows.slice(4).map((r) => r.playerId)).toEqual(s.slice(4))
    })

    it('random arena for a match avoids the other playable matches of the same round', () => {
      let t = run([{ type: 'UPDATE_SETTINGS', settings: { finalStage: 'bracket' } }, { type: 'START' }], setupEight())
      t = playAllRounds(t)
      const [m0, ...others] = t.final!.bracket!.rounds[0]
      for (const r of [0, 0.5, 0.99]) {
        const pick = pickRandomArena(t, m0.id, () => r)
        // four matches, four arenas → the only arena not used by the other three is m0's own
        expect(pick).toBe(m0.arenaId)
        expect(others.map((m) => m.arenaId)).not.toContain(pick)
      }
      const next = reducer(t, { type: 'RANDOMIZE_FINAL_ARENAS', seed: 3 })!
      const arenas = next.final!.bracket!.rounds[0].map((m) => m.arenaId)
      expect(new Set(arenas).size).toBe(4)
    })
  })
})
