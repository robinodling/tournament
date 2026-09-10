import { newId } from '../lib/id'
import { mulberry32, randomSeed, shuffle } from '../lib/rng'
import { generateRounds, roundShape } from '../lib/scheduler'
import { computeStandings } from '../lib/scoring'
import type { Arena, Bracket, Final, Group, Id, Player, Round, Settings, Tournament } from '../types'

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
  | { type: 'RANDOMIZE_FINAL_ARENAS'; seed?: number }
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
    settings: { groupSize: 4, roundCount: 4, byePoints: 'average', arenaLabel: 'Arena', finalStage: 'none', bracketSize: 0, seed: randomSeed() },
    rounds: [],
    currentRound: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/** Fill in fields that older saved tournaments may lack. */
export function normalize(t: Tournament): Tournament {
  const final = t.final ? { ...t.final, kind: t.final.kind ?? 'groups' } : undefined
  const base = { ...t, settings: { ...initialTournament().settings, ...t.settings } }
  return final ? { ...base, final } : base
}

/** A round is locked once any of its groups has a result; locked rounds are never re-drawn. */
export function isLocked(round: Round): boolean {
  return round.groups.some((g) => g.result !== undefined)
}

export function isComplete(round: Round): boolean {
  return round.groups.length > 0 && round.groups.every((g) => g.result !== undefined)
}

/** Every group/match of the final stage, byes included. */
export function finalGroups(final: Final | undefined): Group[] {
  if (!final) return []
  if (final.kind === 'bracket' && final.bracket) {
    const all = final.bracket.rounds.flat()
    return final.bracket.bronze ? [...all, final.bracket.bronze] : all
  }
  return final.groups
}

/** A match that can be played: two known players and no result yet. */
export function isReady(g: Group): boolean {
  return g.playerIds.length >= 2 && g.result === undefined
}

export function isFinalComplete(t: Tournament): boolean {
  if (!t.final) return false
  if (t.final.kind === 'bracket' && t.final.bracket) {
    const { rounds, bronze } = t.final.bracket
    const last = rounds[rounds.length - 1]?.[0]
    return !!last?.result && (!bronze || !!bronze.result)
  }
  return t.final.groups.length > 0 && t.final.groups.every((g) => g.result !== undefined)
}

/** True once any real (non-bye) group or match has a result. */
export function finalHasResults(t: Tournament): boolean {
  return finalGroups(t.final).some((g) => g.result !== undefined && g.playerIds.length >= 2)
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
export function finalShape(t: Tournament): { groups: number; finalists: number; size: number } {
  const k = t.settings.groupSize
  const P = activePlayers(t).length
  const A = activeArenas(t).length
  if (t.settings.finalStage === 'none' || A < 1) return { groups: 0, finalists: 0, size: 0 }
  if (t.settings.finalStage === 'bracket') {
    const entrants = bracketEntrants(t)
    if (entrants < 2) return { groups: 0, finalists: 0, size: 0 }
    const size = nextPow2(entrants)
    return { groups: size / 2, finalists: entrants, size }
  }
  if (P < k) return { groups: 0, finalists: 0, size: 0 }
  const groups = t.settings.finalStage === 'top' ? 1 : Math.min(A, Math.floor(P / k))
  return { groups, finalists: groups * k, size: groups * k }
}

export function nextPow2(n: number): number {
  let s = 1
  while (s < n) s *= 2
  return s
}

/**
 * Seed order for a bracket of `size` slots: [1, size, size/2, size/2+1, …] so
 * that consecutive pairs are first-round matches (1 vs size, 2 vs size−1, …)
 * and the top two seeds can only meet in the final.
 */
export function bracketOrder(size: number): number[] {
  let order = [1]
  for (let n = 2; n <= size; n *= 2) {
    const next: number[] = []
    for (const s of order) next.push(s, n + 1 - s)
    order = next
  }
  return order
}

function bracketEntrants(t: Tournament): number {
  const P = activePlayers(t).length
  const cap = t.settings.bracketSize > 0 ? t.settings.bracketSize : P
  return Math.min(P, cap)
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
  if (t.settings.finalStage === 'bracket') return buildBracket(t)
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
  return groups.length ? { kind: 'groups', groups, seededAt: Date.now() } : null
}

/**
 * A random active arena for a final group: prefers arenas no other final uses,
 * and never returns the group's current arena when any alternative exists.
 * Returns null when the group has no unplayed final to change.
 */
export function pickRandomArena(t: Tournament, groupId: Id, rng: () => number = Math.random): Id | null {
  const group = finalGroups(t.final).find((g) => g.id === groupId)
  if (!group || group.result) return null
  const active = activeArenas(t).map((a) => a.id)
  if (active.length === 0) return null
  const takenByOthers = new Set(arenaSiblings(t, groupId).filter((g) => g.result === undefined).map((g) => g.arenaId))
  let pool = active.filter((a) => !takenByOthers.has(a))
  if (pool.length === 0) pool = active
  if (pool.length > 1) pool = pool.filter((a) => a !== group.arenaId)
  return pool[Math.floor(rng() * pool.length)]
}

/** How often each player has played each arena in the group stage (arena aliases resolved). */
function arenaPlays(t: Tournament): Map<string, number> {
  const alias = arenaAlias(t.arenas)
  const plays = new Map<string, number>()
  for (const r of t.rounds)
    for (const g of r.groups) {
      const arena = alias[g.arenaId] ?? g.arenaId
      for (const pid of g.playerIds) plays.set(`${pid}:${arena}`, (plays.get(`${pid}:${arena}`) ?? 0) + 1)
    }
  return plays
}

/** Slot players for a match: round 0 from its own list, later rounds from the upstream winners (bronze: semifinal losers). */
export function matchSlots(bracket: Bracket, roundIndex: number, matchIndex: number, bronze = false): (Id | undefined)[] {
  if (bronze) {
    const semis = bracket.rounds[bracket.rounds.length - 2] ?? []
    return [semis[0]?.result?.[1], semis[1]?.result?.[1]]
  }
  if (roundIndex === 0) {
    const m = bracket.rounds[0][matchIndex]
    return [m.playerIds[0], m.playerIds[1]]
  }
  const up = bracket.rounds[roundIndex - 1]
  return [up[2 * matchIndex]?.result?.[0], up[2 * matchIndex + 1]?.result?.[0]]
}

/**
 * Push winners (and semifinal losers) down the tree. A match whose participants
 * changed loses its result, so editing an early match cascades correctly.
 */
function propagateBracket(bracket: Bracket): Bracket {
  const rounds = bracket.rounds.map((r) => r.map((m) => ({ ...m })))
  const next: Bracket = { ...bracket, rounds }
  const sync = (m: Group, slots: (Id | undefined)[]): Group => {
    const players = slots.filter((p): p is Id => p !== undefined)
    if ([...players].sort().join() === [...m.playerIds].sort().join()) return m
    const { result: _drop, ...rest } = m
    return { ...rest, playerIds: players }
  }
  for (let r = 1; r < rounds.length; r++) rounds[r] = rounds[r].map((m, i) => sync(m, matchSlots(next, r, i)))
  if (bracket.bronze) next.bronze = sync({ ...bracket.bronze }, matchSlots(next, 0, 0, true))
  return next
}

/**
 * Give every playable match without a usable arena one that no other playable
 * match in the same round uses, preferring what its players have played least.
 */
function assignBracketArenas(t: Tournament, bracket: Bracket): Bracket {
  const active = activeArenas(t).map((a) => a.id)
  if (active.length === 0) return bracket
  const plays = arenaPlays(t)
  const assign = (matches: Group[]): Group[] => {
    const used = new Set(matches.filter((m) => isReady(m) && active.includes(m.arenaId)).map((m) => m.arenaId))
    return matches.map((m) => {
      if (!isReady(m) || active.includes(m.arenaId)) return m
      const free = active.filter((a) => !used.has(a))
      const pool = free.length ? free : active
      let best = pool[0]
      let bestCost = Infinity
      for (const a of pool) {
        const cost = m.playerIds.reduce((sum, pid) => sum + (plays.get(`${pid}:${a}`) ?? 0), 0)
        if (cost < bestCost) {
          bestCost = cost
          best = a
        }
      }
      used.add(best)
      return { ...m, arenaId: best }
    })
  }
  const rounds = bracket.rounds.map((r) => assign(r))
  let bronze = bracket.bronze
  if (bronze) {
    // The bronze match runs alongside the final: keep them on different arenas.
    const lastIdx = rounds.length - 1
    const both = assign([...rounds[lastIdx], bronze])
    rounds[lastIdx] = both.slice(0, -1)
    bronze = both[both.length - 1]
  }
  return { ...bracket, rounds, bronze }
}

/** Re-derive downstream matches and arenas after any change to a bracket. */
function settleBracket(t: Tournament): Tournament {
  if (t.final?.kind !== 'bracket' || !t.final.bracket) return t
  return { ...t, final: { ...t.final, bracket: assignBracketArenas(t, propagateBracket(t.final.bracket)) } }
}

function buildBracket(t: Tournament): Final | null {
  const entrants = bracketEntrants(t)
  if (entrants < 2 || activeArenas(t).length < 1) return null
  const active = new Set(activePlayers(t).map((p) => p.id))
  const seeds = computeStandings(t)
    .map((r) => r.playerId)
    .filter((id) => active.has(id))
    .slice(0, entrants)
  const size = nextPow2(entrants)
  const order = bracketOrder(size)
  const first: Group[] = []
  for (let i = 0; i < size / 2; i++) {
    const players = [order[2 * i], order[2 * i + 1]].map((seed) => seeds[seed - 1]).filter((id): id is Id => id !== undefined)
    // A lone player has a bye: the match is already decided in their favour.
    first.push(players.length === 1 ? { id: newId(), arenaId: '', playerIds: players, result: players.slice() } : { id: newId(), arenaId: '', playerIds: players })
  }
  const rounds: Group[][] = [first]
  for (let n = size / 4; n >= 1; n /= 2) rounds.push(Array.from({ length: n }, () => ({ id: newId(), arenaId: '', playerIds: [] })))
  const bronze: Group | undefined = size >= 4 ? { id: newId(), arenaId: '', playerIds: [] } : undefined
  const bracket = assignBracketArenas(t, propagateBracket({ size, seeds, rounds, bronze }))
  return { kind: 'bracket', groups: [], bracket, seededAt: Date.now() }
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
  return finalGroups(t.final).find((g) => g.id === groupId)
}

function mapFinal(final: Final, fn: (g: Group) => Group): Final {
  if (final.kind === 'bracket' && final.bracket) {
    const b = final.bracket
    return { ...final, bracket: { ...b, rounds: b.rounds.map((r) => r.map(fn)), bronze: b.bronze ? fn(b.bronze) : undefined } }
  }
  return { ...final, groups: final.groups.map(fn) }
}

function mapGroup(t: Tournament, groupId: Id, fn: (g: Group) => Group): Tournament {
  const only = (g: Group) => (g.id === groupId ? fn(g) : g)
  const rounds = t.rounds.map((r) => ({ ...r, groups: r.groups.map(only) }))
  const final = t.final ? mapFinal(t.final, only) : undefined
  return touch(settleBracket(final ? { ...t, rounds, final } : { ...t, rounds }))
}

/** Groups that compete with `groupId` for an arena right now (same final tier set, or same bracket round). */
function arenaSiblings(t: Tournament, groupId: Id): Group[] {
  if (!t.final) return []
  if (t.final.kind === 'bracket' && t.final.bracket) {
    const b = t.final.bracket
    const lastIdx = b.rounds.length - 1
    for (let r = 0; r < b.rounds.length; r++) {
      const round = r === lastIdx && b.bronze ? [...b.rounds[r], b.bronze] : b.rounds[r]
      if (round.some((g) => g.id === groupId)) return round.filter((g) => g.id !== groupId)
    }
    return []
  }
  return t.final.groups.filter((g) => g.id !== groupId)
}

/** Playable, unplayed matches of the bracket round currently in progress (bronze runs with the final). */
export function currentBracketMatches(t: Tournament): Group[] {
  if (t.final?.kind !== 'bracket' || !t.final.bracket) return []
  const b = t.final.bracket
  const lastIdx = b.rounds.length - 1
  for (let r = 0; r < b.rounds.length; r++) {
    const round = r === lastIdx && b.bronze ? [...b.rounds[r], b.bronze] : b.rounds[r]
    const ready = round.filter(isReady)
    if (ready.length) return ready
  }
  return []
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
        if (t.phase !== 'running') {
          settings.finalStage = t.settings.finalStage
          settings.bracketSize = t.settings.bracketSize
        }
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
      const final = t.final ? mapFinal(t.final, swap) : undefined
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

    case 'RANDOMIZE_FINAL_ARENAS': {
      // Deal distinct random arenas to every unplayed final (or every playable match of the current
      // bracket round); anything already played keeps its arena.
      if (!t.final) return t
      const rng = mulberry32(action.seed ?? randomSeed())
      const targets = new Set((t.final.kind === 'bracket' ? currentBracketMatches(t) : t.final.groups.filter((g) => !g.result)).map((g) => g.id))
      if (targets.size === 0) return t
      const pool = shuffle(
        activeArenas(t).map((a) => a.id),
        rng,
      )
      if (pool.length === 0) return t
      let i = 0
      const final = mapFinal(t.final, (g) => (targets.has(g.id) ? { ...g, arenaId: pool[i++ % pool.length] } : g))
      return touch({ ...t, final })
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
