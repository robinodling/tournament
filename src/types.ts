export type Id = string

export interface Player {
  id: Id
  name: string
  /** Inactive players keep their history but are not scheduled in unplayed rounds. */
  active: boolean
}

export interface Arena {
  id: Id
  name: string
  active: boolean
  /** Set when this arena replaced a broken one; the new arena inherits the old one's coverage history. */
  replacesId?: Id
}

export interface Group {
  id: Id
  arenaId: Id
  playerIds: Id[]
  /** Player ids in finishing order (index 0 = 1st place). Absent until the group has played. */
  result?: Id[]
}

export interface Round {
  groups: Group[]
  byePlayerIds: Id[]
}

export type ByePoints = 'average' | 'zero'

/**
 * Optional stage after the rounds. 'top': the best `groupSize` players play one
 * final that decides positions 1..k. 'tiers': everyone plays a final in tiers by
 * standing (A-final, B-final, …, one per arena); placements decide the order.
 * 'bracket': seeded single-elimination tree (1st vs last, 2nd vs second-last, …)
 * with head-to-head matches down to a single final plus a bronze match.
 */
export type FinalStage = 'none' | 'top' | 'tiers' | 'bracket'

export interface Settings {
  groupSize: number
  roundCount: number
  byePoints: ByePoints
  /** Display word for "the thing a group plays on": Arena, Machine, Table, Court… */
  arenaLabel: string
  finalStage: FinalStage
  /** Bracket entrants cap: 0 = everyone, otherwise 4 / 8 / 16 top seeds. */
  bracketSize: number
  seed: number
}

export interface Bracket {
  /** Number of slots (power of two); slots beyond `seeds.length` are byes for the top seeds. */
  size: number
  /** Entrants in seeding (standings) order. */
  seeds: Id[]
  /** rounds[0] is the first round; the last round holds the single final. Matches are Groups of ≤ 2 players. */
  rounds: Group[][]
  /** Semifinal losers play for 3rd place (absent for a 2-player bracket). */
  bronze?: Group
}

export interface Final {
  kind: 'groups' | 'bracket'
  /** 'groups': tier order, groups[0] is the A-final; playerIds in seeding (standings) order. Empty for a bracket. */
  groups: Group[]
  bracket?: Bracket
  seededAt: number
}

export type Phase = 'setup' | 'running' | 'final' | 'finished'

export interface Tournament {
  version: 1
  id: Id
  name: string
  phase: Phase
  players: Player[]
  arenas: Arena[]
  settings: Settings
  rounds: Round[]
  final?: Final
  currentRound: number
  createdAt: number
  updatedAt: number
}
