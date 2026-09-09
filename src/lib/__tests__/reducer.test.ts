import { describe, expect, it } from 'vitest'
import { initialTournament, isLocked, reducer, validateSetup, type Action } from '../../state/reducer'
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
    const t = run([{ type: 'SET_PLAYER_COUNT', count: 3 }])
    expect(validateSetup(t).join(' ')).toMatch(/at least 4 players/)
    expect(validateSetup(t).join(' ')).toMatch(/at least one arena/)
    expect(reducer(t, { type: 'GENERATE_SCHEDULE' })!.rounds).toHaveLength(0)
  })

  it('records results, advances rounds and finishes', () => {
    let t = run([{ type: 'START' }], setupEight())
    expect(t.phase).toBe('running')
    for (let r = 0; r < 4; r++) {
      for (const g of t.rounds[r].groups) {
        t = reducer(t, { type: 'SET_RESULT', roundIndex: r, groupId: g.id, order: [...g.playerIds].reverse() })!
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
    t = reducer(t, { type: 'SET_RESULT', roundIndex: 0, groupId: g.id, order: g.playerIds.slice(0, 3) })!
    expect(t).toBe(before)
  })

  it('removing a player mid-tournament keeps locked rounds and re-draws the rest', () => {
    let t = run([{ type: 'START' }], setupEight())
    for (let r = 0; r < 2; r++)
      for (const g of t.rounds[r].groups) t = reducer(t, { type: 'SET_RESULT', roundIndex: r, groupId: g.id, order: g.playerIds })!
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
      expect(r.groups).toHaveLength(1) // 7 players → one group of 4, 3 byes
      expect(r.byePlayerIds).toHaveLength(3)
    }
    expect(t.currentRound).toBe(2)
  })

  it('replacing an arena moves only unplayed groups to the new arena', () => {
    let t = run([{ type: 'START' }], setupEight())
    const g0 = t.rounds[0].groups[0]
    t = reducer(t, { type: 'SET_RESULT', roundIndex: 0, groupId: g0.id, order: g0.playerIds })!
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
    for (const g of t.rounds[0].groups) t = reducer(t, { type: 'SET_RESULT', roundIndex: 0, groupId: g.id, order: g.playerIds })!
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
})
