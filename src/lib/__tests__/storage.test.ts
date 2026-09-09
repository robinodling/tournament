import { describe, expect, it } from 'vitest'
import { initialTournament } from '../../state/reducer'
import { exportJson, parseTournament } from '../storage'
import type { Phase } from '../../types'

describe('parseTournament', () => {
  it('round-trips every phase, including the final stage', () => {
    for (const phase of ['setup', 'running', 'final', 'finished'] as Phase[]) {
      const t = { ...initialTournament(), phase }
      expect(parseTournament(exportJson(t)).phase).toBe(phase)
    }
  })

  it('rejects garbage', () => {
    expect(() => parseTournament('{"version":1}')).toThrow()
    expect(() => parseTournament('[]')).toThrow()
    expect(() => parseTournament(JSON.stringify({ ...initialTournament(), phase: 'bogus' }))).toThrow()
  })
})
