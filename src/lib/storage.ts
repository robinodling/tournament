import type { Tournament } from '../types'

/**
 * Persistence: IndexedDB is the primary store with a localStorage mirror, so
 * the tournament survives if either one is unavailable. Every save also lands
 * in a rolling backup store so a mistaken reset or import can be undone.
 *
 * Nothing on the web can make storage truly un-clearable — the user (or a
 * "clear site data" action) always can. What we can do: ask for persistent
 * storage (`navigator.storage.persist()`), which stops the browser evicting
 * this origin under storage pressure, and offer the app as installable — a
 * home-screen web app is exempt from Safari's 7-day eviction.
 */

const DB_NAME = 'tournament'
const DB_VERSION = 1
const STATE_STORE = 'state'
const BACKUP_STORE = 'backups'
const CURRENT_KEY = 'current'
const LS_KEY = 'tournament:v1'
const MAX_BACKUPS = 40

export interface BackupMeta {
  key: number
  tournamentId: string
  name: string
  phase: Tournament['phase']
  savedAt: number
  roundsPlayed: number
  roundCount: number
  players: number
}

/** IndexedDB can hang without ever calling back (private modes, locked-down profiles); never let that block the app. */
const IDB_OPEN_TIMEOUT_MS = 2500
const IDB_LOAD_TIMEOUT_MS = 3000

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    const giveUp = setTimeout(() => resolve(null), IDB_OPEN_TIMEOUT_MS)
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onsuccess = () => {
        clearTimeout(giveUp)
        resolve(req.result)
      }
      req.onerror = () => {
        clearTimeout(giveUp)
        resolve(null)
      }
      req.onblocked = () => {
        clearTimeout(giveUp)
        resolve(null)
      }
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE)
        if (!db.objectStoreNames.contains(BACKUP_STORE)) db.createObjectStore(BACKUP_STORE)
      }
    } catch {
      clearTimeout(giveUp)
      resolve(null)
    }
  })
  return dbPromise
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb()
  if (!db) return undefined
  try {
    return await request(db.transaction(store, 'readonly').objectStore(store).get(key) as IDBRequest<T | undefined>)
  } catch {
    return undefined
  }
}

async function idbPut(store: string, value: unknown, key: IDBValidKey): Promise<boolean> {
  const db = await openDb()
  if (!db) return false
  try {
    await request(db.transaction(store, 'readwrite').objectStore(store).put(value, key))
    return true
  } catch {
    return false
  }
}

async function idbKeys(store: string): Promise<IDBValidKey[]> {
  const db = await openDb()
  if (!db) return []
  try {
    return await request(db.transaction(store, 'readonly').objectStore(store).getAllKeys())
  } catch {
    return []
  }
}

async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    await request(db.transaction(store, 'readwrite').objectStore(store).delete(key))
  } catch {
    /* ignore */
  }
}

function readLocal(): Tournament | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? parseTournament(raw) : null
  } catch {
    return null
  }
}

function writeLocal(t: Tournament): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(t))
  } catch {
    /* quota or private mode — IndexedDB still has it */
  }
}

/** Load whichever copy is newest. */
export async function loadTournament(): Promise<Tournament | null> {
  const fromLocal = readLocal()
  const fromIdb = (await withTimeout(idbGet<Tournament>(STATE_STORE, CURRENT_KEY), IDB_LOAD_TIMEOUT_MS, undefined)) ?? null
  if (fromIdb && fromLocal) return fromIdb.updatedAt >= fromLocal.updatedAt ? fromIdb : fromLocal
  return fromIdb ?? fromLocal
}

export async function saveTournament(t: Tournament): Promise<void> {
  writeLocal(t)
  await idbPut(STATE_STORE, t, CURRENT_KEY)
  await saveBackup(t)
}

async function saveBackup(t: Tournament): Promise<void> {
  const ok = await idbPut(BACKUP_STORE, t, t.updatedAt)
  if (!ok) return
  const keys = (await idbKeys(BACKUP_STORE)).map(Number).sort((a, b) => a - b)
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_BACKUPS))) await idbDelete(BACKUP_STORE, k)
}

export async function listBackups(): Promise<BackupMeta[]> {
  const keys = (await idbKeys(BACKUP_STORE)).map(Number).sort((a, b) => b - a)
  const out: BackupMeta[] = []
  for (const key of keys) {
    const t = await idbGet<Tournament>(BACKUP_STORE, key)
    if (!t) continue
    out.push({
      key,
      tournamentId: t.id,
      name: t.name,
      phase: t.phase,
      savedAt: t.updatedAt,
      roundsPlayed: t.rounds.filter((r) => r.groups.length > 0 && r.groups.every((g) => g.result)).length,
      roundCount: t.rounds.length,
      players: t.players.length,
    })
  }
  return out
}

export async function loadBackup(key: number): Promise<Tournament | null> {
  return (await idbGet<Tournament>(BACKUP_STORE, key)) ?? null
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export interface StorageStatus {
  /** true = granted, false = best-effort, null = API unavailable */
  persisted: boolean | null
  usage: number | null
  quota: number | null
  indexedDb: boolean
  standalone: boolean
}

export async function storageStatus(): Promise<StorageStatus> {
  let persisted: boolean | null = null
  let usage: number | null = null
  let quota: number | null = null
  try {
    if (navigator.storage?.persisted) persisted = await navigator.storage.persisted()
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate()
      usage = e.usage ?? null
      quota = e.quota ?? null
    }
  } catch {
    /* ignore */
  }
  const standalone =
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  return { persisted, usage, quota, indexedDb: (await openDb()) !== null, standalone }
}

export function exportJson(t: Tournament): string {
  return JSON.stringify(t, null, 2)
}

/** Parse and minimally validate an exported tournament. Throws on garbage. */
export function parseTournament(text: string): Tournament {
  const data = JSON.parse(text) as Partial<Tournament>
  if (!data || typeof data !== 'object') throw new Error('Not a tournament file')
  if (data.version !== 1) throw new Error('Unsupported tournament version')
  if (!Array.isArray(data.players) || !Array.isArray(data.arenas) || !Array.isArray(data.rounds) || !data.settings)
    throw new Error('Tournament file is missing data')
  if (!['setup', 'running', 'finished'].includes(String(data.phase))) throw new Error('Tournament file is corrupt')
  return {
    ...(data as Tournament),
    currentRound: typeof data.currentRound === 'number' ? data.currentRound : 0,
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
  }
}
