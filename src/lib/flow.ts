import type { Group, Id, Tournament } from '../types'

/**
 * Game flow independent of any "current round": a group can start once every
 * player in it has finished their earlier rounds and its arena is free.
 */

export type GroupState = 'done' | 'ready' | 'waiting'

export interface GroupFlow {
  roundIndex: number
  group: Group
  state: GroupState
  /** Players still busy with an earlier round (when waiting). */
  waitingForPlayers: Id[]
  /** The arena is still occupied by an unfinished earlier-round group (when waiting). */
  waitingForArena: boolean
}

/** Has this player finished every round before `roundIndex`? (Byes and rounds they are not part of count as finished.) */
export function finishedBefore(t: Tournament, playerId: Id, roundIndex: number): boolean {
  for (let r = 0; r < roundIndex; r++) {
    const round = t.rounds[r]
    if (!round) continue
    const g = round.groups.find((x) => x.playerIds.includes(playerId))
    if (g && g.result === undefined) return false
  }
  return true
}

export function groupFlow(t: Tournament, roundIndex: number, group: Group): GroupFlow {
  if (group.result !== undefined) return { roundIndex, group, state: 'done', waitingForPlayers: [], waitingForArena: false }
  const waitingForPlayers = group.playerIds.filter((p) => !finishedBefore(t, p, roundIndex))
  let waitingForArena = false
  for (let r = 0; r < roundIndex && !waitingForArena; r++) {
    waitingForArena = (t.rounds[r]?.groups ?? []).some((g) => g.arenaId === group.arenaId && g.result === undefined)
  }
  return {
    roundIndex,
    group,
    state: waitingForPlayers.length === 0 && !waitingForArena ? 'ready' : 'waiting',
    waitingForPlayers,
    waitingForArena,
  }
}

/** Every group of the group stage with its flow state, in schedule order. */
export function allGroupFlows(t: Tournament): GroupFlow[] {
  return t.rounds.flatMap((round, r) => round.groups.map((g) => groupFlow(t, r, g)))
}

/** Unplayed groups that can be played right now. */
export function gamesNow(t: Tournament): GroupFlow[] {
  return allGroupFlows(t).filter((f) => f.state === 'ready')
}

/** The player's next unplayed group (ready or waiting), or null when they have played everything. */
export function nextGameFor(t: Tournament, playerId: Id): GroupFlow | null {
  for (let r = 0; r < t.rounds.length; r++) {
    const g = t.rounds[r].groups.find((x) => x.playerIds.includes(playerId))
    if (g && g.result === undefined) return groupFlow(t, r, g)
  }
  return null
}

/** Rounds in which the player sits out and that are still ahead of their next game. */
export function upcomingByesFor(t: Tournament, playerId: Id): number[] {
  const next = nextGameFor(t, playerId)
  const limit = next ? next.roundIndex : t.rounds.length
  const out: number[] = []
  for (let r = 0; r < limit; r++) if (t.rounds[r].byePlayerIds.includes(playerId) && t.rounds[r].groups.some((g) => g.result === undefined)) out.push(r)
  return out
}

/** First round that still has an unplayed group; the last round when everything is done. */
export function activeRoundIndex(t: Tournament): number {
  const i = t.rounds.findIndex((r) => r.groups.some((g) => g.result === undefined))
  return i === -1 ? Math.max(0, t.rounds.length - 1) : i
}

export function groupStageComplete(t: Tournament): boolean {
  return t.rounds.length > 0 && t.rounds.every((r) => r.groups.every((g) => g.result !== undefined))
}

export function gamesPlayed(t: Tournament): { played: number; total: number } {
  const groups = t.rounds.flatMap((r) => r.groups)
  return { played: groups.filter((g) => g.result !== undefined).length, total: groups.length }
}
