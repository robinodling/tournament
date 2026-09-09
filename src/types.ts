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

export interface Settings {
  groupSize: number
  roundCount: number
  byePoints: ByePoints
  /** Display word for "the thing a group plays on": Arena, Machine, Table, Court… */
  arenaLabel: string
  seed: number
}

export type Phase = 'setup' | 'running' | 'finished'

export interface Tournament {
  version: 1
  id: Id
  name: string
  phase: Phase
  players: Player[]
  arenas: Arena[]
  settings: Settings
  rounds: Round[]
  currentRound: number
  createdAt: number
  updatedAt: number
}
