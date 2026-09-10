import { createContext, useContext, useEffect, useRef, useState, type Dispatch } from 'react'
import { syncConfigured } from '../lib/firebaseConfig'
import { loadApplied, loadSync, pickNewResults, saveApplied, type Registration } from '../lib/roomSync'
import type { Tournament } from '../types'
import type { Action } from './reducer'

export type SyncStatus = 'off' | 'unconfigured' | 'connecting' | 'live' | 'error'

export interface RoomSync {
  status: SyncStatus
  error?: string
  /** Everyone who has registered from their phone (applied ones included). */
  registrations: Registration[]
}

export const RoomSyncCtx = createContext<RoomSync>({ status: 'off', registrations: [] })

export function useRoomSyncStatus(): RoomSync {
  return useContext(RoomSyncCtx)
}

/**
 * Organiser side of a live room: publish every state change and apply results
 * that players submit. Only ever dispatches SET_RESULT, which the reducer
 * validates (the order must be a permutation of the group).
 */
export function useRoomSync(t: Tournament, dispatch: Dispatch<Action>): RoomSync {
  const code = t.room?.code
  const phase = t.phase
  const [sync, setSync] = useState<RoomSync>({ status: 'off', registrations: [] })
  const applied = useRef<Record<string, number>>({})
  const latestPhase = useRef(phase)
  latestPhase.current = phase
  const latestPlayers = useRef(t.players)
  latestPlayers.current = t.players

  useEffect(() => {
    if (!code) {
      setSync({ status: 'off', registrations: [] })
      return
    }
    if (!syncConfigured) {
      setSync({ status: 'unconfigured', registrations: [] })
      return
    }
    const unsubscribers: (() => void)[] = []
    let cancelled = false
    applied.current = loadApplied(code)
    setSync((prev) => ({ ...prev, status: 'connecting' }))
    const fail = (e: Error) => !cancelled && setSync((prev) => ({ ...prev, status: 'error', error: e.message }))
    loadSync()
      .then(async (s) => {
        unsubscribers.push(
          await s.subscribeResults(
            code,
            (results) => {
              if (cancelled) return
              for (const r of pickNewResults(results, applied.current)) {
                applied.current[r.groupId] = r.at
                dispatch({ type: 'SET_RESULT', groupId: r.groupId, order: r.order })
              }
              saveApplied(code, applied.current)
              setSync((prev) => ({ ...prev, status: 'live', error: undefined }))
            },
            fail,
          ),
        )
        unsubscribers.push(
          await s.subscribeRegistrations(
            code,
            (regs) => {
              if (cancelled) return
              // Before the start, joiners are added (and leavers removed) straight away; later the organiser adds them by hand.
              if (latestPhase.current === 'setup') {
                for (const r of regs) dispatch({ type: 'REGISTER_PLAYER', uid: r.uid, name: r.name })
                dispatch({ type: 'PRUNE_REGISTERED', uids: regs.map((r) => r.uid) })
              } else {
                for (const r of regs) if (latestPlayers.current.some((p) => p.uid === r.uid)) dispatch({ type: 'REGISTER_PLAYER', uid: r.uid, name: r.name })
              }
              setSync((prev) => ({ ...prev, registrations: regs }))
            },
            fail,
          ),
        )
        if (cancelled) unsubscribers.forEach((u) => u())
      })
      .catch(fail)
    return () => {
      cancelled = true
      unsubscribers.forEach((u) => u())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, dispatch])

  // Publish the state whenever it changes (debounced).
  useEffect(() => {
    if (!code || !syncConfigured) return
    const handle = setTimeout(() => {
      loadSync()
        .then((s) => s.publishState(code, t))
        .catch((e: Error) => setSync((prev) => ({ ...prev, status: 'error', error: e.message })))
    }, 300)
    return () => clearTimeout(handle)
  }, [code, t])

  return sync
}
