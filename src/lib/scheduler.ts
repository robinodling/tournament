import type { Id, Round, Tournament } from '../types'
import { newId } from './id'
import { mulberry32, randInt, shuffle, type Rng } from './rng'

/**
 * Schedule generator.
 *
 * Every round, the active players are split into groups of exactly `groupSize`;
 * each group plays on a distinct arena. Leftover players (or players for whom
 * there is no free arena) get a bye. Across all rounds we try to minimise, in
 * priority order: arena repeats per player, byes imbalance, repeated
 * group-mates, uneven arena usage.
 *
 * The search is a randomised greedy construction + hill-climbing per round,
 * followed by a global refinement pass over all generated rounds. Deterministic
 * for a given seed.
 */

export interface ScheduleInput {
  /** Players to schedule (active). */
  playerIds: Id[]
  /** Arenas available (active). */
  arenaIds: Id[]
  groupSize: number
  roundsToGenerate: number
  /** Already played / locked rounds — used for balancing only, returned untouched. */
  history: Round[]
  /** Map from a replaced arena id to the arena that inherits its history. */
  arenaAlias?: Record<Id, Id>
  seed: number
}

const W_ARENA = 10
const W_MATES = 1
const W_BYES = 20
const W_USAGE = 1

const RESTARTS = 40
const ITERATIONS = 300
const REFINE_ITERATIONS = 4000
/** Whole-schedule restarts; the best total score wins. */
const GLOBAL_RESTARTS = 8
/** Simulated-annealing temperature range for the refinement pass. */
const T_START = 4
const T_END = 0.2

interface Draft {
  groups: { arena: number; players: number[] }[]
  byes: number[]
}

class Stats {
  readonly count: Int32Array // player * A + arena
  readonly mates: Int32Array // player * P + player
  readonly byes: Int32Array
  readonly usage: Int32Array

  constructor(
    readonly P: number,
    readonly A: number,
    src?: Stats,
  ) {
    this.count = src ? src.count.slice() : new Int32Array(P * A)
    this.mates = src ? src.mates.slice() : new Int32Array(P * P)
    this.byes = src ? src.byes.slice() : new Int32Array(P)
    this.usage = src ? src.usage.slice() : new Int32Array(A)
  }

  clone(): Stats {
    return new Stats(this.P, this.A, this)
  }

  addRound(d: Draft): void {
    for (const g of d.groups) {
      this.usage[g.arena]++
      for (let i = 0; i < g.players.length; i++) {
        const p = g.players[i]
        this.count[p * this.A + g.arena]++
        for (let j = i + 1; j < g.players.length; j++) {
          const q = g.players[j]
          this.mates[p * this.P + q]++
          this.mates[q * this.P + p]++
        }
      }
    }
    for (const p of d.byes) this.byes[p]++
  }

  score(): number {
    let s = 0
    for (let i = 0; i < this.count.length; i++) s += W_ARENA * this.count[i] * this.count[i]
    for (let p = 0; p < this.P; p++)
      for (let q = p + 1; q < this.P; q++) {
        const m = this.mates[p * this.P + q]
        s += W_MATES * m * m
      }
    for (let i = 0; i < this.P; i++) s += W_BYES * this.byes[i] * this.byes[i]
    for (let i = 0; i < this.A; i++) s += W_USAGE * this.usage[i] * this.usage[i]
    return s
  }

  /** Increase in score() if `d` were added — cheaper than clone+addRound+score. */
  marginal(d: Draft): number {
    let s = 0
    for (const g of d.groups) {
      s += W_USAGE * (2 * this.usage[g.arena] + 1)
      for (let i = 0; i < g.players.length; i++) {
        const p = g.players[i]
        s += W_ARENA * (2 * this.count[p * this.A + g.arena] + 1)
        for (let j = i + 1; j < g.players.length; j++) {
          s += W_MATES * (2 * this.mates[p * this.P + g.players[j]] + 1)
        }
      }
    }
    for (const p of d.byes) s += W_BYES * (2 * this.byes[p] + 1)
    return s
  }
}

function cloneDraft(d: Draft): Draft {
  return { groups: d.groups.map((g) => ({ arena: g.arena, players: g.players.slice() })), byes: d.byes.slice() }
}

/** Apply a random neighbourhood move in place. Returns false if no move was possible. */
function mutate(d: Draft, A: number, base: Stats, rng: Rng): boolean {
  const G = d.groups.length
  const kind = randInt(rng, 4)
  if (kind === 0 && G >= 2) {
    // swap two players between two different groups
    const a = randInt(rng, G)
    let b = randInt(rng, G - 1)
    if (b >= a) b++
    const i = randInt(rng, d.groups[a].players.length)
    const j = randInt(rng, d.groups[b].players.length)
    const t = d.groups[a].players[i]
    d.groups[a].players[i] = d.groups[b].players[j]
    d.groups[b].players[j] = t
    return true
  }
  if (kind === 1 && G >= 2) {
    // swap the arenas of two groups
    const a = randInt(rng, G)
    let b = randInt(rng, G - 1)
    if (b >= a) b++
    const t = d.groups[a].arena
    d.groups[a].arena = d.groups[b].arena
    d.groups[b].arena = t
    return true
  }
  if (kind === 2 && A > G) {
    // move a group to an unused arena
    const used = new Set(d.groups.map((g) => g.arena))
    const free: number[] = []
    for (let a = 0; a < A; a++) if (!used.has(a)) free.push(a)
    d.groups[randInt(rng, G)].arena = free[randInt(rng, free.length)]
    return true
  }
  if (kind === 3 && d.byes.length > 0) {
    // swap a bye player with a playing player who has sat out equally often (keeps bye fairness)
    const bi = randInt(rng, d.byes.length)
    const g = d.groups[randInt(rng, G)]
    const pi = randInt(rng, g.players.length)
    if (base.byes[d.byes[bi]] !== base.byes[g.players[pi]]) return false
    const t = d.byes[bi]
    d.byes[bi] = g.players[pi]
    g.players[pi] = t
    return true
  }
  return false
}

/**
 * Cross-round move that preserves every player's arena counts: find players x, y
 * and rounds r, s with x on arena a in r and b in s, while y is on b in r and a
 * in s — then exchange them in both rounds. Only group-mates change, which is
 * what lets the search improve opponent variety without breaking arena coverage.
 * Mutates `drafts` in place; returns false if no such pair was found.
 */
function crossRoundSwap(drafts: Draft[], rng: Rng): boolean {
  const R = drafts.length
  if (R < 2) return false
  const r = randInt(rng, R)
  let s = randInt(rng, R - 1)
  if (s >= r) s++
  const dr = drafts[r]
  const ds = drafts[s]
  if (dr.groups.length === 0 || ds.groups.length === 0) return false

  const groupOf = (d: Draft, p: number) => d.groups.find((g) => g.players.includes(p))

  const ga = dr.groups[randInt(rng, dr.groups.length)]
  const x = ga.players[randInt(rng, ga.players.length)]
  const gxs = groupOf(ds, x)
  if (!gxs || gxs.arena === ga.arena) return false
  const gb = dr.groups.find((g) => g.arena === gxs.arena)
  if (!gb) return false
  const candidates = gb.players.filter((y) => groupOf(ds, y)?.arena === ga.arena)
  if (candidates.length === 0) return false
  const y = candidates[randInt(rng, candidates.length)]
  const gys = groupOf(ds, y)!

  ga.players[ga.players.indexOf(x)] = y
  gb.players[gb.players.indexOf(y)] = x
  gxs.players[gxs.players.indexOf(x)] = y
  gys.players[gys.players.indexOf(y)] = x
  return true
}

function chooseByes(P: number, byeCount: number, base: Stats, rng: Rng): { byes: number[]; playing: number[] } {
  const order = shuffle([...Array(P).keys()], rng).sort((a, b) => base.byes[a] - base.byes[b])
  return { byes: order.slice(0, byeCount).sort((a, b) => a - b), playing: order.slice(byeCount) }
}

/** Random partition, then each group takes the free arena its members have played least. */
function constructRandom(playing: number[], G: number, k: number, base: Stats, rng: Rng, byes: number[]): Draft {
  const players = shuffle(playing, rng)
  const groups: Draft['groups'] = []
  const used = new Set<number>()
  for (let g = 0; g < G; g++) {
    const members = players.slice(g * k, (g + 1) * k)
    let bestArena = -1
    let bestCost = Infinity
    for (const a of shuffle([...Array(base.A).keys()], rng)) {
      if (used.has(a)) continue
      let cost = 0
      for (const p of members) cost += base.count[p * base.A + a]
      cost = cost * W_ARENA + base.usage[a] * W_USAGE
      if (cost < bestCost) {
        bestCost = cost
        bestArena = a
      }
    }
    used.add(bestArena)
    groups.push({ arena: bestArena, players: members })
  }
  return { groups, byes }
}

/** Pick the least-used arenas, then fill each with the players who have played it least. */
function constructArenaFirst(playing: number[], G: number, k: number, base: Stats, rng: Rng, byes: number[]): Draft {
  const arenas = shuffle([...Array(base.A).keys()], rng)
    .sort((a, b) => base.usage[a] - base.usage[b])
    .slice(0, G)
  const pool = new Set(playing)
  const groups: Draft['groups'] = []
  for (const a of arenas) {
    const ranked = shuffle([...pool], rng).sort((p, q) => base.count[p * base.A + a] - base.count[q * base.A + a])
    const members = ranked.slice(0, k)
    for (const p of members) pool.delete(p)
    groups.push({ arena: a, players: members })
  }
  return { groups, byes }
}

function hillClimb(start: Draft, base: Stats, rng: Rng): { draft: Draft; score: number } {
  let current = cloneDraft(start)
  let currentScore = base.marginal(current)
  let best = cloneDraft(current)
  let bestScore = currentScore
  for (let it = 0; it < ITERATIONS; it++) {
    const cand = cloneDraft(current)
    if (!mutate(cand, base.A, base, rng)) continue
    const s = base.marginal(cand)
    if (s <= currentScore) {
      current = cand
      currentScore = s
      if (s < bestScore) {
        best = cloneDraft(cand)
        bestScore = s
      }
    }
  }
  return { draft: best, score: bestScore }
}

function generateOne(P: number, k: number, base: Stats, rng: Rng): Draft {
  const G = Math.min(Math.floor(P / k), base.A)
  if (G < 1) throw new Error('Not enough players or arenas for a single group')
  const byeCount = P - G * k
  let best: Draft | null = null
  let bestScore = Infinity
  for (let r = 0; r < RESTARTS; r++) {
    const { byes, playing } = chooseByes(P, byeCount, base, rng)
    const start =
      r % 2 === 0
        ? constructRandom(playing, G, k, base, rng, byes)
        : constructArenaFirst(playing, G, k, base, rng, byes)
    const { draft, score } = hillClimb(start, base, rng)
    if (score < bestScore) {
      bestScore = score
      best = draft
    }
  }
  return best!
}

/**
 * Large-neighbourhood step: rebuild one round at a time, treating every other
 * round as fixed history. Repeats until a full pass makes no improvement.
 */
function reoptimiseRounds(drafts: Draft[], base: Stats, P: number, k: number, rng: Rng): Draft[] {
  let current = drafts.map(cloneDraft)
  let currentScore = totalScore(current, base)
  for (let pass = 0; pass < 6; pass++) {
    let improved = false
    for (let i = 0; i < current.length; i++) {
      const others = base.clone()
      current.forEach((d, j) => {
        if (j !== i) others.addRound(d)
      })
      const rebuilt = generateOne(P, k, others, rng)
      const next = current.slice()
      next[i] = rebuilt
      const s = totalScore(next, base)
      if (s < currentScore) {
        current = next
        currentScore = s
        improved = true
      }
    }
    if (!improved) break
  }
  return current
}

function totalScore(drafts: Draft[], base: Stats): number {
  const s = base.clone()
  for (const d of drafts) s.addRound(d)
  return s.score()
}

/**
 * Global refinement across all generated rounds with simulated annealing, so a
 * bad early choice can be undone even when the fix needs a temporarily worse
 * intermediate state.
 */
function refine(drafts: Draft[], base: Stats, rng: Rng): Draft[] {
  if (drafts.length === 0) return drafts
  let current = drafts.map(cloneDraft)
  let currentScore = totalScore(current, base)
  let best = current
  let bestScore = currentScore
  for (let it = 0; it < REFINE_ITERATIONS; it++) {
    const temperature = T_START * Math.pow(T_END / T_START, it / REFINE_ITERATIONS)
    let next: Draft[]
    if (current.length >= 2 && rng() < 0.5) {
      next = current.map(cloneDraft)
      if (!crossRoundSwap(next, rng)) continue
    } else {
      const idx = randInt(rng, current.length)
      const cand = cloneDraft(current[idx])
      if (!mutate(cand, base.A, base, rng)) continue
      next = current.slice()
      next[idx] = cand
    }
    const s = totalScore(next, base)
    const delta = s - currentScore
    if (delta <= 0 || rng() < Math.exp(-delta / temperature)) {
      current = next
      currentScore = s
      if (s < bestScore) {
        best = next
        bestScore = s
      }
    }
  }
  return best
}

export function generateRounds(input: ScheduleInput): Round[] {
  const { playerIds, arenaIds, groupSize: k, roundsToGenerate, history, seed } = input
  const alias = input.arenaAlias ?? {}
  const P = playerIds.length
  const A = arenaIds.length
  if (roundsToGenerate <= 0) return []
  if (k < 2) throw new Error('Group size must be at least 2')
  if (P < k || A < 1) throw new Error('Not enough players or arenas for a single group')

  const pIndex = new Map(playerIds.map((id, i) => [id, i]))
  const aIndex = new Map(arenaIds.map((id, i) => [id, i]))
  const resolveArena = (id: Id): number | undefined => aIndex.get(alias[id] ?? id)

  const base = new Stats(P, A)
  for (const round of history) {
    const draft: Draft = { groups: [], byes: [] }
    for (const g of round.groups) {
      const arena = resolveArena(g.arenaId)
      const players = g.playerIds.map((id) => pIndex.get(id)).filter((i): i is number => i !== undefined)
      if (arena === undefined) {
        // Arena no longer exists: still record who played together.
        for (let i = 0; i < players.length; i++)
          for (let j = i + 1; j < players.length; j++) {
            base.mates[players[i] * P + players[j]]++
            base.mates[players[j] * P + players[i]]++
          }
        continue
      }
      draft.groups.push({ arena, players })
    }
    draft.byes = round.byePlayerIds.map((id) => pIndex.get(id)).filter((i): i is number => i !== undefined)
    base.addRound(draft)
  }

  let bestDrafts: Draft[] = []
  let bestScore = Infinity
  for (let attempt = 0; attempt < GLOBAL_RESTARTS; attempt++) {
    const rng = mulberry32((seed + attempt * 7919) >>> 0)
    const drafts: Draft[] = []
    const running = base.clone()
    for (let r = 0; r < roundsToGenerate; r++) {
      const d = generateOne(P, k, running, rng)
      running.addRound(d)
      drafts.push(d)
    }
    const refined = reoptimiseRounds(refine(drafts, base, rng), base, P, k, rng)
    const score = totalScore(refined, base)
    if (score < bestScore) {
      bestScore = score
      bestDrafts = refined
    }
  }

  return bestDrafts.map((d) => ({
    groups: d.groups.map((g) => ({
      id: newId(),
      arenaId: arenaIds[g.arena],
      playerIds: g.players.map((p) => playerIds[p]),
    })),
    byePlayerIds: d.byes.map((p) => playerIds[p]),
  }))
}

/** How many groups play per round, and how many players sit out. */
export function roundShape(playerCount: number, arenaCount: number, groupSize: number) {
  const groups = groupSize >= 2 ? Math.min(Math.floor(playerCount / groupSize), arenaCount) : 0
  return { groups, playing: groups * groupSize, byes: Math.max(0, playerCount - groups * groupSize) }
}

export interface ScheduleQuality {
  players: number
  arenas: number
  rounds: number
  /** Every player plays every arena at least once. */
  everyoneAllArenas: boolean
  /** Every player plays every arena exactly once. */
  everyoneAllArenasOnce: boolean
  /** Sum over players of (plays − distinct arenas). */
  arenaRepeats: number
  /** Distinct arenas played by the player with the fewest. */
  minDistinctArenas: number
  /** Highest number of times any two players share a group. */
  maxMates: number
  /** Number of player pairs who never share a group. */
  pairsNeverMet: number
  byesMin: number
  byesMax: number
}

export function describeSchedule(t: Pick<Tournament, 'players' | 'arenas' | 'rounds'>): ScheduleQuality {
  const players = t.players.filter((p) => p.active)
  const pIndex = new Map(players.map((p, i) => [p.id, i]))
  const alias: Record<Id, Id> = {}
  for (const a of t.arenas) if (a.replacesId) alias[a.replacesId] = a.id
  const arenaIds = [...new Set(t.arenas.filter((a) => a.active).map((a) => a.id))]
  const P = players.length
  const A = arenaIds.length
  const distinct = players.map(() => new Set<Id>())
  const plays = new Array<number>(P).fill(0)
  const byes = new Array<number>(P).fill(0)
  const mates = new Map<string, number>()
  for (const r of t.rounds) {
    for (const g of r.groups) {
      const arena = alias[g.arenaId] ?? g.arenaId
      const idx = g.playerIds.map((id) => pIndex.get(id)).filter((i): i is number => i !== undefined)
      for (const i of idx) {
        distinct[i].add(arena)
        plays[i]++
      }
      for (let i = 0; i < idx.length; i++)
        for (let j = i + 1; j < idx.length; j++) {
          const key = idx[i] < idx[j] ? `${idx[i]}:${idx[j]}` : `${idx[j]}:${idx[i]}`
          mates.set(key, (mates.get(key) ?? 0) + 1)
        }
    }
    for (const id of r.byePlayerIds) {
      const i = pIndex.get(id)
      if (i !== undefined) byes[i]++
    }
  }
  let arenaRepeats = 0
  let minDistinct = P ? Infinity : 0
  let allOnce = P > 0 && A > 0
  let all = P > 0 && A > 0
  for (let i = 0; i < P; i++) {
    arenaRepeats += plays[i] - distinct[i].size
    minDistinct = Math.min(minDistinct, distinct[i].size)
    if (distinct[i].size < A) all = false
    if (distinct[i].size !== A || plays[i] !== A) allOnce = false
  }
  let maxMates = 0
  for (const v of mates.values()) maxMates = Math.max(maxMates, v)
  const totalPairs = (P * (P - 1)) / 2
  return {
    players: P,
    arenas: A,
    rounds: t.rounds.length,
    everyoneAllArenas: all,
    everyoneAllArenasOnce: allOnce,
    arenaRepeats,
    minDistinctArenas: minDistinct,
    maxMates,
    pairsNeverMet: totalPairs - mates.size,
    byesMin: P ? Math.min(...byes) : 0,
    byesMax: P ? Math.max(...byes) : 0,
  }
}
