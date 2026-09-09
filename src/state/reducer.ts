import { newId } from '../lib/id'
import { randomSeed } from '../lib/rng'
import { generateRounds, roundShape } from '../lib/scheduler'
import type { Arena, Id, Player, Round, Settings, Tournament } from '../types'

export type Action =
  | { type: 'HYDRATE'; tournament: Tournament }
  | { type: 'RESET' }
  | { type: 'IMPORT'; tournament: Tournament }
  | { type: 'SET_NAME'; name: string }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  | { type: 'ADD_PLAYERS'; names: string[] }
  | { type: 'SET_PLAYER_COUNT'; count: number }
  | { type: 'RENAME_PLAYER'; id: Id; name: string }
  | { type: 'REMOVE_PLAYER'; id: Id }
  | { type: 'REACTIVATE_PLAYER'; id: Id }
  | { type: 'ADD_ARENAS'; names: string[] }
  | { type: 'SET_ARENA_COUNT'; count: number }
  | { type: 'RENAME_ARENA'; id: Id; name: string }
  | { type: 'REMOVE_ARENA'; id: Id }
  | { type: 'REPLACE_ARENA'; id: Id; name: string }
  | { type: 'GENERATE_SCHEDULE'; seed?: number }
  | { type: 'START' }
  | { type: 'SET_RESULT'; roundIndex: number; groupId: Id; order: Id[] }
  | { type: 'CLEAR_RESULT'; roundIndex: number; groupId: Id }
  | { type: 'SET_CURRENT_ROUND'; index: number }
  | { type: 'NEXT_ROUND' }
  | { type: 'FINISH' }
  | { type: 'REOPEN' }

export function initialTournament(): Tournament {
  const now = Date.now()
  return {
    version: 1,
    id: newId(),
    name: 'Tournament',
    phase: 'setup',
    players: [],
    arenas: [],
    settings: { groupSize: 4, roundCount: 4, byePoints: 'average', arenaLabel: 'Arena', seed: randomSeed() },
    rounds: [],
    currentRound: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/** A round is locked once any of its groups has a result; locked rounds are never re-drawn. */
export function isLocked(round: Round): boolean {
  return round.groups.some((g) => g.result !== undefined)
}

export function isComplete(round: Round): boolean {
  return round.groups.length > 0 && round.groups.every((g) => g.result !== undefined)
}

export function activePlayers(t: Tournament): Player[] {
  return t.players.filter((p) => p.active)
}

export function activeArenas(t: Tournament): Arena[] {
  return t.arenas.filter((a) => a.active)
}

export function arenaAlias(arenas: Arena[]): Record<Id, Id> {
  const alias: Record<Id, Id> = {}
  for (const a of arenas) if (a.replacesId) alias[a.replacesId] = a.id
  // follow chains (a replaced by b replaced by c)
  for (const from of Object.keys(alias)) {
    let to = alias[from]
    while (alias[to] && alias[to] !== to) to = alias[to]
    alias[from] = to
  }
  return alias
}

/** Problems that prevent a schedule from being generated. Empty array = OK. */
export function validateSetup(t: Tournament): string[] {
  const problems: string[] = []
  const players = activePlayers(t)
  const arenas = activeArenas(t)
  const { groupSize, roundCount } = t.settings
  const label = t.settings.arenaLabel.toLowerCase()
  if (groupSize < 2) problems.push('Group size must be at least 2.')
  if (players.length < 2) problems.push('Add at least 2 players.')
  else if (players.length < groupSize) problems.push(`Need at least ${groupSize} players for groups of ${groupSize}.`)
  if (arenas.length < 1) problems.push(`Add at least one ${label}.`)
  if (roundCount < 1) problems.push('Play at least one round.')
  const names = new Set<string>()
  for (const p of t.players) {
    const n = p.name.trim().toLowerCase()
    if (!n) problems.push('Every player needs a name.')
    else if (names.has(n)) problems.push(`Duplicate player name: ${p.name}.`)
    names.add(n)
  }
  const anames = new Set<string>()
  for (const a of t.arenas) {
    const n = a.name.trim().toLowerCase()
    if (!n) problems.push(`Every ${label} needs a name.`)
    else if (anames.has(n) && a.active) problems.push(`Duplicate ${label} name: ${a.name}.`)
    anames.add(n)
  }
  return [...new Set(problems)]
}

function touch(t: Tournament): Tournament {
  return { ...t, updatedAt: Date.now() }
}

function nextPlaceholder(existing: { name: string }[], base: string): string {
  const taken = new Set(existing.map((e) => e.name.trim().toLowerCase()))
  let n = existing.length + 1
  while (taken.has(`${base} ${n}`.toLowerCase())) n++
  return `${base} ${n}`
}

function makePlayers(names: string[], existing: Player[]): Player[] {
  const out: Player[] = []
  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue
    out.push({ id: newId(), name, active: true })
  }
  return [...existing, ...out]
}

/**
 * Re-draw every unlocked round so the schedule matches the current roster,
 * arenas and round count. Locked rounds keep their position and content.
 */
export function regenerateUnlocked(t: Tournament, seed = randomSeed()): Tournament {
  const locked = t.rounds.filter(isLocked)
  const desired = Math.max(t.settings.roundCount, locked.length)
  const players = activePlayers(t)
  const arenas = activeArenas(t)
  const toGenerate = desired - locked.length
  let generated: Round[] = []
  if (toGenerate > 0) {
    try {
      generated = generateRounds({
        playerIds: players.map((p) => p.id),
        arenaIds: arenas.map((a) => a.id),
        groupSize: t.settings.groupSize,
        roundsToGenerate: toGenerate,
        history: locked,
        arenaAlias: arenaAlias(t.arenas),
        seed,
      })
    } catch {
      generated = []
    }
  }
  // Keep locked rounds where they are; fill the remaining slots in order.
  const rounds: Round[] = []
  const queue = generated.slice()
  for (const r of t.rounds) {
    if (isLocked(r)) rounds.push(r)
    else if (queue.length) rounds.push(queue.shift()!)
  }
  rounds.push(...queue)
  const currentRound = Math.min(t.currentRound, Math.max(0, rounds.length - 1))
  return touch({ ...t, rounds, currentRound, settings: { ...t.settings, seed } })
}

function setupOnly(t: Tournament): boolean {
  return t.phase === 'setup'
}

/** After a roster/arena change: in setup the schedule is simply invalidated, when running it is re-drawn. */
function afterRosterChange(t: Tournament): Tournament {
  if (setupOnly(t)) return touch({ ...t, rounds: [] })
  return regenerateUnlocked(t)
}

export function reducer(state: Tournament | null, action: Action): Tournament | null {
  if (action.type === 'HYDRATE') return action.tournament
  if (state === null) return state
  const t = state

  switch (action.type) {
    case 'RESET':
      return initialTournament()

    case 'IMPORT':
      return touch({ ...action.tournament })

    case 'SET_NAME':
      return touch({ ...t, name: action.name })

    case 'UPDATE_SETTINGS': {
      const settings = { ...t.settings, ...action.settings }
      if (!setupOnly(t)) {
        // Only round count / bye points / label may change mid-tournament.
        settings.groupSize = t.settings.groupSize
        const next = touch({ ...t, settings })
        return action.settings.roundCount !== undefined && action.settings.roundCount !== t.settings.roundCount
          ? regenerateUnlocked(next)
          : next
      }
      return touch({ ...t, settings, rounds: [] })
    }

    case 'ADD_PLAYERS':
      return afterRosterChange({ ...t, players: makePlayers(action.names, t.players) })

    case 'SET_PLAYER_COUNT': {
      if (!setupOnly(t)) return t
      const count = Math.max(0, Math.floor(action.count))
      let players = t.players.slice()
      while (players.length < count) players = makePlayers([nextPlaceholder(players, 'Player')], players)
      if (players.length > count) players = players.slice(0, count)
      return afterRosterChange({ ...t, players })
    }

    case 'RENAME_PLAYER':
      return touch({ ...t, players: t.players.map((p) => (p.id === action.id ? { ...p, name: action.name } : p)) })

    case 'REMOVE_PLAYER': {
      if (setupOnly(t)) return afterRosterChange({ ...t, players: t.players.filter((p) => p.id !== action.id) })
      const hasHistory = t.rounds.some(
        (r) => isLocked(r) && (r.groups.some((g) => g.playerIds.includes(action.id)) || r.byePlayerIds.includes(action.id)),
      )
      const players = hasHistory
        ? t.players.map((p) => (p.id === action.id ? { ...p, active: false } : p))
        : t.players.filter((p) => p.id !== action.id)
      return afterRosterChange({ ...t, players })
    }

    case 'REACTIVATE_PLAYER':
      return afterRosterChange({ ...t, players: t.players.map((p) => (p.id === action.id ? { ...p, active: true } : p)) })

    case 'ADD_ARENAS': {
      const arenas = [...t.arenas]
      for (const raw of action.names) {
        const name = raw.trim()
        if (name) arenas.push({ id: newId(), name, active: true })
      }
      return afterRosterChange({ ...t, arenas })
    }

    case 'SET_ARENA_COUNT': {
      if (!setupOnly(t)) return t
      const count = Math.max(0, Math.floor(action.count))
      let arenas = t.arenas.slice()
      while (arenas.length < count) arenas.push({ id: newId(), name: nextPlaceholder(arenas, t.settings.arenaLabel), active: true })
      if (arenas.length > count) arenas = arenas.slice(0, count)
      return afterRosterChange({ ...t, arenas })
    }

    case 'RENAME_ARENA':
      return touch({ ...t, arenas: t.arenas.map((a) => (a.id === action.id ? { ...a, name: action.name } : a)) })

    case 'REMOVE_ARENA': {
      if (setupOnly(t)) return afterRosterChange({ ...t, arenas: t.arenas.filter((a) => a.id !== action.id) })
      return afterRosterChange({ ...t, arenas: t.arenas.map((a) => (a.id === action.id ? { ...a, active: false } : a)) })
    }

    case 'REPLACE_ARENA': {
      const old = t.arenas.find((a) => a.id === action.id)
      if (!old) return t
      const name = action.name.trim()
      if (!name) return t
      if (setupOnly(t)) return touch({ ...t, arenas: t.arenas.map((a) => (a.id === old.id ? { ...a, name } : a)) })
      const replacement: Arena = { id: newId(), name, active: true, replacesId: old.id }
      const arenas = [...t.arenas.map((a) => (a.id === old.id ? { ...a, active: false } : a)), replacement]
      // Every group that has not played yet moves to the replacement.
      const rounds = t.rounds.map((r) => ({
        ...r,
        groups: r.groups.map((g) => (g.arenaId === old.id && !g.result ? { ...g, arenaId: replacement.id } : g)),
      }))
      return touch({ ...t, arenas, rounds })
    }

    case 'GENERATE_SCHEDULE': {
      if (validateSetup(t).length) return t
      return regenerateUnlocked(t, action.seed ?? randomSeed())
    }

    case 'START': {
      if (t.phase !== 'setup') return t
      let next = t
      if (next.rounds.length === 0) {
        if (validateSetup(t).length) return t
        next = regenerateUnlocked(t)
      }
      if (next.rounds.length === 0) return t
      return touch({ ...next, phase: 'running', currentRound: 0 })
    }

    case 'SET_RESULT': {
      const round = t.rounds[action.roundIndex]
      const group = round?.groups.find((g) => g.id === action.groupId)
      if (!round || !group) return t
      const same =
        action.order.length === group.playerIds.length &&
        [...action.order].sort().join() === [...group.playerIds].sort().join()
      if (!same) return t
      const rounds = t.rounds.map((r, i) =>
        i !== action.roundIndex
          ? r
          : { ...r, groups: r.groups.map((g) => (g.id === action.groupId ? { ...g, result: action.order } : g)) },
      )
      return touch({ ...t, rounds })
    }

    case 'CLEAR_RESULT': {
      const rounds = t.rounds.map((r, i) =>
        i !== action.roundIndex
          ? r
          : {
              ...r,
              groups: r.groups.map((g) => {
                if (g.id !== action.groupId) return g
                const { result: _drop, ...rest } = g
                return rest
              }),
            },
      )
      return touch({ ...t, rounds })
    }

    case 'SET_CURRENT_ROUND': {
      const index = Math.max(0, Math.min(action.index, t.rounds.length - 1))
      return touch({ ...t, currentRound: index })
    }

    case 'NEXT_ROUND': {
      if (t.currentRound >= t.rounds.length - 1) return touch({ ...t, phase: 'finished' })
      return touch({ ...t, currentRound: t.currentRound + 1 })
    }

    case 'FINISH':
      return touch({ ...t, phase: 'finished' })

    case 'REOPEN':
      return t.phase === 'finished' ? touch({ ...t, phase: 'running' }) : t

    default:
      return t
  }
}

/** Human-readable summary of the per-round shape for the current setup. */
export function shapeSummary(t: Tournament) {
  return roundShape(activePlayers(t).length, activeArenas(t).length, t.settings.groupSize)
}
