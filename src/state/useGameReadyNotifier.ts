import { useEffect, useRef, useState } from 'react'
import { alertGameReady, readyGameFor } from '../lib/notify'
import type { Id, Tournament } from '../types'

export interface ReadyToast {
  context: string
  arena: string
  others: string[]
}

/**
 * Fires once each time the viewer's next game becomes playable (not on the
 * first render, so opening the page never alerts about a game that was
 * already waiting for you). Returns the current in-app banner, if any.
 */
export function useGameReadyNotifier(t: Tournament | null, playerId: Id | null, enabled: boolean): [ReadyToast | null, () => void] {
  const [toast, setToast] = useState<ReadyToast | null>(null)
  const lastReady = useRef<string | null | undefined>(undefined) // undefined = not initialised

  useEffect(() => {
    if (!t || !playerId) {
      lastReady.current = undefined
      return
    }
    const ready = readyGameFor(t, playerId)
    const id = ready?.id ?? null
    const previous = lastReady.current
    lastReady.current = id
    if (previous === undefined || id === null || id === previous) return
    if (!enabled) return
    const names = (x: Id) => t.players.find((p) => p.id === x)?.name ?? '?'
    const others = ready!.playerIds.filter((p) => p !== playerId).map(names)
    const arena = t.arenas.find((a) => a.id === ready!.arenaId)?.name ?? ''
    setToast({ context: ready!.context, arena, others })
    void alertGameReady({
      title: `Your game is ready — ${ready!.context}`,
      body: `${arena}${others.length ? ` with ${others.join(', ')}` : ''}`,
      tag: `game-${ready!.id}`,
    })
  }, [t, playerId, enabled])

  return [toast, () => setToast(null)]
}
