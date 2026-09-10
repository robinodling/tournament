import type { Id } from '../types'

/** Unambiguous characters only (no 0/O, 1/I). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6

export function newRoomCode(rng: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)]
  return code
}

/** Upper-cases and strips separators; null if it is not a plausible room code. */
export function normalizeRoomCode(input: string | null | undefined): string | null {
  if (!input) return null
  const code = input.replace(/[\s-]/g, '').toUpperCase()
  return /^[A-Z0-9]{6}$/.test(code) ? code : null
}

export function roomLink(code: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`
  return `${base}?room=${code}`
}

export interface RemoteResult {
  groupId: Id
  order: Id[]
  /** Server timestamp (ms). */
  at: number
}

/** Results newer than what has already been applied (by group). */
export function pickNewResults(results: RemoteResult[], applied: Record<string, number>): RemoteResult[] {
  return results.filter((r) => r.at > (applied[r.groupId] ?? 0) && Array.isArray(r.order) && r.order.length > 0)
}

const APPLIED_KEY = (code: string) => `tournament:applied:${code}`

export function loadApplied(code: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(APPLIED_KEY(code)) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

export function saveApplied(code: string, applied: Record<string, number>): void {
  try {
    localStorage.setItem(APPLIED_KEY(code), JSON.stringify(applied))
  } catch {
    /* ignore */
  }
}

/** The Firebase client is only loaded when a room is actually used. */
export function loadSync() {
  return import('./sync')
}
