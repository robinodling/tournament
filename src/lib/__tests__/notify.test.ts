import { describe, expect, it } from 'vitest'
import { readyGameFor } from '../notify'
import { initialTournament, reducer, type Action } from '../../state/reducer'
import type { Tournament } from '../../types'

const run = (actions: Action[], start: Tournament | null = initialTournament()) => actions.reduce<Tournament | null>((s, a) => reducer(s, a), start)!

describe('readyGameFor', () => {
  it('follows a player through group stage, final and knockout', () => {
    let t = run([
      { type: 'UPDATE_SETTINGS', settings: { finalStage: 'bracket' } },
      { type: 'SET_PLAYER_COUNT', count: 8 },
      { type: 'SET_ARENA_COUNT', count: 4 },
      { type: 'GENERATE_SCHEDULE', seed: 42 },
      { type: 'START' },
    ])
    const me = t.players[0].id
    // round 1: my game is ready
    const r1 = t.rounds[0].groups.find((g) => g.playerIds.includes(me))!
    expect(readyGameFor(t, me)).toMatchObject({ id: r1.id, context: 'Round 1' })
    // I finish round 1 but my round-2 mates have not → nothing ready for me
    t = reducer(t, { type: 'SET_RESULT', groupId: r1.id, order: r1.playerIds })!
    const r2 = t.rounds[1].groups.find((g) => g.playerIds.includes(me))!
    const othersBusy = r2.playerIds.some((p) => t.rounds[0].groups.some((g) => g.playerIds.includes(p) && !g.result))
    expect(readyGameFor(t, me)?.id === r2.id).toBe(!othersBusy)
    // play everything → knockout: I am a seed in some first-round match (or waiting for one)
    for (const r of t.rounds) for (const g of r.groups) if (!g.result) t = reducer(t, { type: 'SET_RESULT', groupId: g.id, order: [...g.playerIds].sort() })!
    t = reducer(t, { type: 'START_FINAL' })!
    expect(t.phase).toBe('final')
    const mine = t.final!.bracket!.rounds[0].find((m) => m.playerIds.includes(me))!
    expect(readyGameFor(t, me)).toMatchObject({ id: mine.id })
    expect(readyGameFor(t, me)!.context).toMatch(/Quarterfinal \d/)
    // a spectator or unknown id has nothing
    expect(readyGameFor(t, 'nobody')).toBeNull()
  })
})
