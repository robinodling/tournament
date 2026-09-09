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
 */
export type FinalStage = 'none' | 'top' | 'tiers'

export interface Settings {
  groupSize: number
  roundCount: number
  byePoints: ByePoints
  /** Display word for "the thing a group plays on": Arena, Machine, Table, Court… */
  arenaLabel: string
  finalStage: FinalStage
  seed: number
}

export interface Final {
  /** Tier order: groups[0] is the A-final. playerIds are in seeding (standings) order. */
  groups: Group[]
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
