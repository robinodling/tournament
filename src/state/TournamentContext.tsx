import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react'
import { plural } from '../lib/label'
import { canSubmitFor } from '../lib/roomSync'
import { loadTournament, requestPersistentStorage, saveTournament } from '../lib/storage'
import type { Group, Id, Tournament } from '../types'
import { initialTournament, reducer, type Action } from './reducer'

interface Ctx {
  t: Tournament
  dispatch: Dispatch<Action>
  /** Viewer mode (live room): no local mutations, results are sent to the organiser instead. */
  readOnly: boolean
  /** In viewer mode: the player this phone claimed, or null when just watching. */
  viewerPlayerId: Id | null
}

const TournamentCtx = createContext<Ctx | null>(null)

export function TournamentProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null)
  const latest = useRef<Tournament | null>(null)
  latest.current = state

  // Hydrate from storage once; ask the browser to keep our data.
  useEffect(() => {
    let cancelled = false
    loadTournament().then((t) => {
      if (!cancelled) dispatch({ type: 'HYDRATE', tournament: t ?? initialTournament() })
    })
    void requestPersistentStorage()
    return () => {
      cancelled = true
    }
  }, [])

  // Persist every change (debounced) and flush when the page is hidden.
  useEffect(() => {
    if (!state) return
    const handle = setTimeout(() => void saveTournament(state), 150)
    return () => clearTimeout(handle)
  }, [state])
  useEffect(() => {
    const flush = () => {
      if (latest.current) void saveTournament(latest.current)
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  const value = useMemo(() => (state ? { t: state, dispatch, readOnly: false, viewerPlayerId: null } : null), [state])
  if (!value) return <div className="loading">Loading…</div>
  return <TournamentCtx.Provider value={value}>{children}</TournamentCtx.Provider>
}

const noop: Dispatch<Action> = () => {}

/** Read-only tournament from a live room (viewer mode). */
export function StaticTournamentProvider({ t, viewerPlayerId, children }: { t: Tournament; viewerPlayerId: Id | null; children: ReactNode }) {
  const value = useMemo(() => ({ t, dispatch: noop, readOnly: true, viewerPlayerId }), [t, viewerPlayerId])
  return <TournamentCtx.Provider value={value}>{children}</TournamentCtx.Provider>
}

/** Whether this device may enter/send a result for a group: always for the organiser, own groups only for a claimed viewer. */
export function useCanEdit(): (group: Group) => boolean {
  const { readOnly, viewerPlayerId } = useTournament()
  return useCallback((group: Group) => (readOnly ? canSubmitFor(viewerPlayerId, group) : true), [readOnly, viewerPlayerId])
}

export function useTournament(): Ctx {
  const ctx = useContext(TournamentCtx)
  if (!ctx) throw new Error('useTournament must be used inside TournamentProvider')
  return ctx
}

/** Name lookups plus the user's word for "arena", pluralised on demand. */
export function useNames() {
  const { t } = useTournament()
  const players = useMemo(() => new Map(t.players.map((p) => [p.id, p.name])), [t.players])
  const arenas = useMemo(() => new Map(t.arenas.map((a) => [a.id, a.name])), [t.arenas])
  const base = t.settings.arenaLabel.trim() || 'Arena'
  const player = useCallback((id: Id) => players.get(id) ?? '?', [players])
  const arena = useCallback((id: Id) => arenas.get(id) ?? '?', [arenas])
  const label = useCallback((n = 1) => plural(base, n), [base])
  return { player, arena, label }
}
