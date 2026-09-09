import { newId } from '../lib/id'
import { randomSeed } from '../lib/rng'
import { generateRounds, roundShape } from '../lib/scheduler'
import { computeStandings } from '../lib/scoring'
import type { Arena, Final, Group, Id, Player, Round, Settings, Tournament } from '../types'

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
  | { type: 'SET_RESULT'; groupId: Id; order: Id[] }
  | { type: 'CLEAR_RESULT'; groupId: Id }
  | { type: 'SET_GROUP_ARENA'; groupId: Id; arenaId: Id }
  | { type: 'SET_CURRENT_ROUND'; index: number }
  | { type: 'NEXT_ROUND' }
  | { type: 'START_FINAL' }
  | { type: 'RESEED_FINAL' }
  | { type: 'SKIP_FINAL' }
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
    settings: { groupSize: 4, roundCount: 4, byePoints: 'average', arenaLabel: 'Arena', finalStage: 'none', seed: randomSeed() },
    rounds: [],
    currentRound: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/** Fill in fields that older saved tournaments may lack. */
export function normalize(t: Tournament): Tournament {
  return { ...t, settings: { ...initialTournament().settings, ...t.settings } }
}

/** A round is locked once any of its groups has a result; locked rounds are never re-drawn. */
export function isLocked(round: Round): boolean {
  return round.groups.some((g) => g.result !== undefined)
}

export function isComplete(round: Round): boolean {
  return round.groups.length > 0 && round.groups.every((g) => g.result !== undefined)
}

export function isFinalComplete(t: Tournament): boolean {
  return !!t.final && t.final.groups.length > 0 && t.final.groups.every((g) => g.result !== undefined)
}

export function finalHasResults(t: Tournament): boolean {
  return !!t.final && t.final.groups.some((g) => g.result !== undefined)
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

/** How many final groups the current setup would produce (0 = no final). */
export function finalShape(t: Tournament): { groups: number; finalists: number } {
  const k = t.settings.groupSize
  const P = activePlayers(t).length
  const A = activeArenas(t).length
  if (t.settings.finalStage === 'none' || A < 1 || P < k) return { groups: 0, finalists: 0 }
  const groups = t.settings.finalStage === 'top' ? 1 : Math.min(A, Math.floor(P / k))
  return { groups, finalists: groups * k }
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

/**
 * Seed the final stage from the group-stage standings. Each final group gets
 * the active arena its members have played least (ties → arena order).
 */
export function buildFinal(t: Tournament): Final | null {
  const { groups: G } = finalShape(t)
  if (G < 1) return null
  const k = t.settings.groupSize
  const active = new Set(activePlayers(t).map((p) => p.id))
  const seeded = computeStandings(t)
    .map((r) => r.playerId)
    .filter((id) => active.has(id))
  const alias = arenaAlias(t.arenas)
  const plays = new Map<string, number>() // `${player}:${arena}` → count
  for (const r of t.rounds)
    for (const g of r.groups) {
      const arena = alias[g.arenaId] ?? g.arenaId
      for (const pid of g.playerIds) plays.set(`${pid}:${arena}`, (plays.get(`${pid}:${arena}`) ?? 0) + 1)
    }
  const free = activeArenas(t).map((a) => a.id)
  const groups: Group[] = []
  for (let gi = 0; gi < G; gi++) {
    const members = seeded.slice(gi * k, gi * k + k)
    if (members.length < 2) break
    let best = free[0]
    let bestCost = Infinity
    for (const a of free) {
      const cost = members.reduce((sum, pid) => sum + (plays.get(`${pid}:${a}`) ?? 0), 0)
      if (cost < bestCost) {
        bestCost = cost
        best = a
      }
    }
    free.splice(free.indexOf(best), 1)
    groups.push({ id: newId(), arenaId: best, playerIds: members })
  }
  return groups.length ? { groups, seededAt: Date.now() } : null
}

/** Group stage is over: move to the final if one is configured and possible, otherwise finish. */
function finishGroupStage(t: Tournament): Tournament {
  const final = buildFinal(t)
  if (final) return touch({ ...t, phase: 'final', final })
  const { final: _drop, ...rest } = t
  return touch({ ...rest, phase: 'finished' })
}

function setupOnly(t: Tournament): boolean {
  return t.phase === 'setup'
}

/** After a roster/arena change: in setup the schedule is simply invalidated, when running it is re-drawn. */
function afterRosterChange(t: Tournament): Tournament {
  if (setupOnly(t)) return touch({ ...t, rounds: [] })
  return regenerateUnlocked(t)
}

function findGroup(t: Tournament, groupId: Id): Group | undefined {
  for (const r of t.rounds) for (const g of r.groups) if (g.id === groupId) return g
  return t.final?.groups.find((g) => g.id === groupId)
}

function mapGroup(t: Tournament, groupId: Id, fn: (g: Group) => Group): Tournament {
  const rounds = t.rounds.map((r) => ({ ...r, groups: r.groups.map((g) => (g.id === groupId ? fn(g) : g)) }))
  const final = t.final ? { ...t.final, groups: t.final.groups.map((g) => (g.id === groupId ? fn(g) : g)) } : undefined
  return touch(final ? { ...t, rounds, final } : { ...t, rounds })
}

export function reducer(state: Tournament | null, action: Action): Tournament | null {
  if (action.type === 'HYDRATE') return normalize(action.tournament)
  if (state === null) return state
  const t = state

  switch (action.type) {
    case 'RESET':
      return initialTournament()

    case 'IMPORT':
      return touch(normalize(action.tournament))

    case 'SET_NAME':
      return touch({ ...t, name: action.name })

    case 'UPDATE_SETTINGS': {
      const settings = { ...t.settings, ...action.settings }
      if (!setupOnly(t)) {
        // Group size is fixed once play has started; the final format is fixed once the final has started.
        settings.groupSize = t.settings.groupSize
        if (t.phase !== 'running') settings.finalStage = t.settings.finalStage
        const next = touch({ ...t, settings })
        return action.settings.roundCount !== undefined && action.settings.roundCount !== t.settings.roundCount
          ? regenerateUnlocked(next)
          : next
      }
      const affectsSchedule =
        (action.settings.groupSize !== undefined && action.settings.groupSize !== t.settings.groupSize) ||
        (action.settings.roundCount !== undefined && action.settings.roundCount !== t.settings.roundCount)
      return touch(affectsSchedule ? { ...t, settings, rounds: [] } : { ...t, settings })
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
      const swap = (g: Group) => (g.arenaId === old.id && !g.result ? { ...g, arenaId: replacement.id } : g)
      const rounds = t.rounds.map((r) => ({ ...r, groups: r.groups.map(swap) }))
      const final = t.final ? { ...t.final, groups: t.final.groups.map(swap) } : undefined
      return touch(final ? { ...t, arenas, rounds, final } : { ...t, arenas, rounds })
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
      const group = findGroup(t, action.groupId)
      if (!group) return t
      const same =
        action.order.length === group.playerIds.length &&
        [...action.order].sort().join() === [...group.playerIds].sort().join()
      if (!same) return t
      return mapGroup(t, action.groupId, (g) => ({ ...g, result: action.order }))
    }

    case 'CLEAR_RESULT':
      return mapGroup(t, action.groupId, (g) => {
        const { result: _drop, ...rest } = g
        return rest
      })

    case 'SET_GROUP_ARENA': {
      if (!t.arenas.some((a) => a.id === action.arenaId && a.active)) return t
      return mapGroup(t, action.groupId, (g) => (g.result ? g : { ...g, arenaId: action.arenaId }))
    }

    case 'SET_CURRENT_ROUND': {
      const index = Math.max(0, Math.min(action.index, t.rounds.length - 1))
      return touch({ ...t, currentRound: index })
    }

    case 'NEXT_ROUND': {
      if (t.phase !== 'running') return t
      if (t.currentRound >= t.rounds.length - 1) return finishGroupStage(t)
      return touch({ ...t, currentRound: t.currentRound + 1 })
    }

    case 'START_FINAL':
      return t.phase === 'running' ? finishGroupStage(t) : t

    case 'RESEED_FINAL': {
      if (t.phase !== 'final' || finalHasResults(t)) return t
      return finishGroupStage(t)
    }

    case 'SKIP_FINAL': {
      if (t.phase !== 'final') return t
      const { final: _drop, ...rest } = t
      return touch({ ...rest, phase: 'finished' })
    }

    case 'FINISH': {
      if (t.phase === 'final') return touch({ ...t, phase: 'finished' })
      const { final: _drop, ...rest } = t
      return touch({ ...rest, phase: 'finished' })
    }

    case 'REOPEN':
      return t.phase === 'finished' ? touch({ ...t, phase: t.final ? 'final' : 'running' }) : t

    default:
      return t
  }
}

/** Human-readable summary of the per-round shape for the current setup. */
export function shapeSummary(t: Tournament) {
  return roundShape(activePlayers(t).length, activeArenas(t).length, t.settings.groupSize)
}
