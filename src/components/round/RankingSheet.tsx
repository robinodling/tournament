import { useEffect, useState } from 'react'
import { loadSync } from '../../lib/roomSync'
import { pointsForPlacement, pts } from '../../lib/scoring'
import { ordinal } from '../../lib/label'
import { useNames, useTournament } from '../../state/TournamentContext'
import type { Group, Id } from '../../types'
import { Sheet } from '../common/Sheet'

interface Props {
  /** Where this group belongs, e.g. "Round 2" or "A-final". */
  context: string
  group: Group | null
  /** Finals decide positions, not points. */
  showPoints?: boolean
  onClose: () => void
}

/** Tap players in finishing order. */
export function RankingSheet({ context, group, showPoints = true, onClose }: Props) {
  const { t, dispatch, readOnly } = useTournament()
  const { player, arena } = useNames()
  const [order, setOrder] = useState<Id[]>([])
  const [sending, setSending] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    setOrder(group?.result ?? [])
    setSending('idle')
    setSendError(null)
  }, [group])

  if (!group) return null
  const k = group.playerIds.length
  const remaining = group.playerIds.filter((id) => !order.includes(id))
  const complete = order.length === k

  const save = () => {
    if (readOnly) {
      // Viewer: send to the organiser's room instead of changing anything locally.
      const code = t.room?.code
      if (!code) return
      setSending('sending')
      loadSync()
        .then((s) => s.submitResult(code, group.id, order))
        .then(() => {
          setSending('sent')
          setTimeout(onClose, 900)
        })
        .catch((e: Error) => {
          setSending('error')
          setSendError(e.message)
        })
      return
    }
    dispatch({ type: 'SET_RESULT', groupId: group.id, order })
    onClose()
  }
  const clear = () => {
    if (!group.result || window.confirm('Remove this result?')) {
      dispatch({ type: 'CLEAR_RESULT', groupId: group.id })
      onClose()
    }
  }

  return (
    <Sheet open title={`${context} · ${arena(group.arenaId)}`} onClose={onClose}>
      {order.length > 0 && (
        <div className="ranked-list">
          {order.map((id, i) => (
            <div key={id} className="ranked-item">
              <span className={`placement p${i + 1}`}>{ordinal(i + 1)}</span>
              <span className="grow">{player(id)}</span>
              {showPoints && <span className="pts">{pts(pointsForPlacement(i + 1, k))}</span>}
              {i === order.length - 1 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOrder(order.slice(0, -1))} aria-label={`Undo ${player(id)}`}>
                  ↩︁ Undo
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {remaining.length > 0 && (
        <div className="stack">
          <p className="hint">
            Who finished <strong>{ordinal(order.length + 1)}</strong>?
          </p>
          {remaining.map((id) => (
            <button
              key={id}
              type="button"
              className="btn rank-btn"
              onClick={() => {
                const next = [...order, id]
                const rest = group.playerIds.filter((p) => !next.includes(p))
                // The last player left is implied — fill them in.
                setOrder(rest.length === 1 ? [...next, rest[0]] : next)
              }}
            >
              <span className="placement">{ordinal(order.length + 1)}</span>
              {player(id)}
            </button>
          ))}
        </div>
      )}
      {readOnly && <p className="hint small">This is sent to the organiser, who can still correct it.</p>}
      {sendError && <p className="problem">Could not send: {sendError}</p>}
      <div className="row">
        {group.result && !readOnly && (
          <button type="button" className="btn btn-danger" onClick={clear}>
            Clear
          </button>
        )}
        <button type="button" className="btn grow" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary grow" disabled={!complete || sending === 'sending' || sending === 'sent'} onClick={save}>
          {readOnly ? (sending === 'sending' ? 'Sending…' : sending === 'sent' ? '✓ Sent' : 'Send result') : 'Save result'}
        </button>
      </div>
    </Sheet>
  )
}
