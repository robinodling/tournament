import { getApps, initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import { get, getDatabase, onValue, ref, serverTimestamp, set } from 'firebase/database'
import type { Tournament } from '../types'
import { firebaseConfig } from './firebaseConfig'
import { newRoomCode, type Registration, type RemoteResult } from './roomSync'
import { parseTournament } from './storage'

/**
 * Realtime Database layout (see database.rules.json):
 *   rooms/{code}/adminUid           written once by the creator
 *   rooms/{code}/state              JSON string of the tournament, admin-only writes
 *   rooms/{code}/results/{groupId}  { order: JSON string, at, by } — anyone with the code
 *   rooms/{code}/registrations/{uid} { name, at } — a player signing up from their own phone
 *
 * Everything is stored as JSON strings: the database drops empty arrays and turns
 * sparse arrays into objects, which would corrupt the tournament structure.
 */

function app() {
  return getApps()[0] ?? initializeApp(firebaseConfig)
}

function db() {
  return getDatabase(app())
}

/** Anonymous identity, persisted by the SDK on this device. */
export function ensureSignedIn(): Promise<string> {
  const auth = getAuth(app())
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid)
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          stop()
          resolve(user.uid)
        } else {
          signInAnonymously(auth).catch((e) => {
            stop()
            reject(e)
          })
        }
      },
      (e) => {
        stop()
        reject(e)
      },
    )
  })
}

export async function createRoom(t: Tournament): Promise<string> {
  const uid = await ensureSignedIn()
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newRoomCode()
    try {
      await set(ref(db(), `rooms/${code}/adminUid`), uid) // rules reject if the code is taken
      await publishState(code, t)
      return code
    } catch (e) {
      if (attempt === 4) throw e
    }
  }
  throw new Error('Could not create a room')
}

export async function publishState(code: string, t: Tournament): Promise<void> {
  await ensureSignedIn()
  await set(ref(db(), `rooms/${code}/state`), JSON.stringify(t))
}

export async function isAdminOf(code: string): Promise<boolean> {
  const uid = await ensureSignedIn()
  const snap = await get(ref(db(), `rooms/${code}/adminUid`))
  return snap.val() === uid
}

export async function subscribeState(code: string, cb: (t: Tournament | null) => void, onError: (e: Error) => void): Promise<() => void> {
  await ensureSignedIn()
  return onValue(
    ref(db(), `rooms/${code}/state`),
    (snap) => {
      const raw = snap.val()
      if (typeof raw !== 'string') return cb(null)
      try {
        cb(parseTournament(raw))
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)))
      }
    },
    (e) => onError(e),
  )
}

export async function subscribeResults(code: string, cb: (results: RemoteResult[]) => void, onError: (e: Error) => void): Promise<() => void> {
  await ensureSignedIn()
  return onValue(
    ref(db(), `rooms/${code}/results`),
    (snap) => {
      const out: RemoteResult[] = []
      snap.forEach((child) => {
        const v = child.val() as { order?: unknown; at?: unknown }
        if (typeof v?.order !== 'string' || typeof v.at !== 'number') return
        try {
          const order = JSON.parse(v.order) as unknown
          if (Array.isArray(order) && order.every((x) => typeof x === 'string')) out.push({ groupId: child.key, order, at: v.at })
        } catch {
          /* ignore malformed */
        }
      })
      cb(out)
    },
    (e) => onError(e),
  )
}

export async function submitResult(code: string, groupId: string, order: string[]): Promise<void> {
  const uid = await ensureSignedIn()
  await set(ref(db(), `rooms/${code}/results/${groupId}`), { order: JSON.stringify(order), at: serverTimestamp(), by: uid })
}

export async function register(code: string, name: string): Promise<string> {
  const uid = await ensureSignedIn()
  await set(ref(db(), `rooms/${code}/registrations/${uid}`), { name: name.trim().slice(0, 40), at: serverTimestamp() })
  return uid
}

export async function unregister(code: string): Promise<void> {
  const uid = await ensureSignedIn()
  await set(ref(db(), `rooms/${code}/registrations/${uid}`), null)
}

export async function subscribeRegistrations(code: string, cb: (regs: Registration[]) => void, onError: (e: Error) => void): Promise<() => void> {
  await ensureSignedIn()
  return onValue(
    ref(db(), `rooms/${code}/registrations`),
    (snap) => {
      const out: Registration[] = []
      snap.forEach((child) => {
        const v = child.val() as { name?: unknown; at?: unknown }
        if (typeof v?.name === 'string' && v.name.trim() && typeof v.at === 'number' && child.key) out.push({ uid: child.key, name: v.name.trim(), at: v.at })
      })
      cb(out.sort((a, b) => a.at - b.at))
    },
    (e) => onError(e),
  )
}
