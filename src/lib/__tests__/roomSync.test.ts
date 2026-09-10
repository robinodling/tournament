import { describe, expect, it } from 'vitest'
import { canSubmitFor, newRoomCode, normalizeRoomCode, pickNewResults, ROOM_CODE_ALPHABET } from '../roomSync'

describe('room codes', () => {
  it('generates 6 unambiguous characters', () => {
    for (let i = 0; i < 50; i++) {
      const code = newRoomCode()
      expect(code).toHaveLength(6)
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch)
    }
    expect(newRoomCode(() => 0)).toBe('AAAAAA')
  })

  it('normalises user input', () => {
    expect(normalizeRoomCode(' ab-c d2 3 ')).toBe('ABCD23')
    expect(normalizeRoomCode('abc')).toBeNull()
    expect(normalizeRoomCode('ABCDEF!')).toBeNull()
    expect(normalizeRoomCode(null)).toBeNull()
  })
})

describe('pickNewResults', () => {
  it('returns only results newer than the last applied one per group', () => {
    const results = [
      { groupId: 'g1', order: ['a', 'b'], at: 100 },
      { groupId: 'g2', order: ['c', 'd'], at: 200 },
      { groupId: 'g3', order: [], at: 300 },
    ]
    expect(pickNewResults(results, { g1: 100 }).map((r) => r.groupId)).toEqual(['g2'])
    expect(pickNewResults(results, {}).map((r) => r.groupId)).toEqual(['g1', 'g2'])
  })
})

describe('canSubmitFor', () => {
  const group = { id: 'g', arenaId: 'a', playerIds: ['p1', 'p2'] }
  it('only players in the group may send its result; spectators never', () => {
    expect(canSubmitFor('p1', group)).toBe(true)
    expect(canSubmitFor('p3', group)).toBe(false)
    expect(canSubmitFor(null, group)).toBe(false)
    expect(canSubmitFor(undefined, group)).toBe(false)
  })
})
