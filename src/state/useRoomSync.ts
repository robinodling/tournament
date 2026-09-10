import { createContext, useContext, useEffect, useRef, useState, type Dispatch } from 'react'
import { syncConfigured } from '../lib/firebaseConfig'
import { loadApplied, loadSync, pickNewResults, saveApplied } from '../lib/roomSync'
import type { Tournament } from '../types'
import type { Action } from './reducer'

export type SyncStatus = 'off' | 'unconfigured' | 'connecting' | 'live' | 'error'

export interface RoomSync {
  status: SyncStatus
  error?: string
}

export const RoomSyncCtx = createContext<RoomSync>({ status: 'off' })

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
  const [sync, setSync] = useState<RoomSync>({ status: 'off' })
  const applied = useRef<Record<string, number>>({})

  useEffect(() => {
    if (!code) {
      setSync({ status: 'off' })
      return
    }
    if (!syncConfigured) {
      setSync({ status: 'unconfigured' })
      return
    }
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    applied.current = loadApplied(code)
    setSync({ status: 'connecting' })
    loadSync()
      .then((s) =>
        s.subscribeResults(
          code,
          (results) => {
            if (cancelled) return
            for (const r of pickNewResults(results, applied.current)) {
              applied.current[r.groupId] = r.at
              dispatch({ type: 'SET_RESULT', groupId: r.groupId, order: r.order })
            }
            saveApplied(code, applied.current)
            setSync({ status: 'live' })
          },
          (e) => !cancelled && setSync({ status: 'error', error: e.message }),
        ),
      )
      .then((u) => {
        if (cancelled) u?.()
        else unsubscribe = u
      })
      .catch((e: Error) => !cancelled && setSync({ status: 'error', error: e.message }))
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [code, dispatch])

  // Publish the state whenever it changes (debounced).
  useEffect(() => {
    if (!code || !syncConfigured) return
    const handle = setTimeout(() => {
      loadSync()
        .then((s) => s.publishState(code, t))
        .catch((e: Error) => setSync({ status: 'error', error: e.message }))
    }, 300)
    return () => clearTimeout(handle)
  }, [code, t])

  return sync
}
