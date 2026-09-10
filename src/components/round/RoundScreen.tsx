import { useEffect, useRef, useState } from 'react'
import { activeRoundIndex, gamesNow, gamesPlayed, groupFlow, groupStageComplete, nextGameFor, upcomingByesFor, type GroupFlow } from '../../lib/flow'
import { useCanEdit, useNames, useTournament } from '../../state/TournamentContext'
import type { Group } from '../../types'
import { GroupCard } from './GroupCard'
import { RankingSheet } from './RankingSheet'
import { WhoPlaysWhere } from './WhoPlaysWhere'

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Why a group cannot start yet. */
function WaitingNote({ flow }: { flow: GroupFlow }) {
  const { player, arena } = useNames()
  if (flow.state !== 'waiting') return null
  const parts: string[] = []
  if (flow.waitingForPlayers.length) parts.push(`${joinNames(flow.waitingForPlayers.map(player))} ${flow.waitingForPlayers.length === 1 ? 'is' : 'are'} still playing`)
  if (flow.waitingForArena) parts.push(`${arena(flow.group.arenaId)} is still in use`)
  return <p className="hint small flow-note">⏳ Waiting: {parts.join('; ')}.</p>
}

function ProgressDots({ current }: { current?: number }) {
  const { t } = useTournament()
  return (
    <div className="progress" aria-label="Rounds">
      {t.rounds.map((r, i) => (
        <span key={i} className={`dot${r.groups.every((g) => g.result !== undefined) ? ' filled' : ''}${i === current ? ' current' : ''}`} />
      ))}
    </div>
  )
}

/** Player / spectator view: your next game and everything that is being played right now. */
function ViewerFlow() {
  const { t, viewerPlayerId } = useTournament()
  const { arena, label } = useNames()
  const canEdit = useCanEdit()
  const [editing, setEditing] = useState<{ group: Group; context: string } | null>(null)
  const { played, total } = gamesPlayed(t)
  const complete = groupStageComplete(t)
  const mine = viewerPlayerId ? nextGameFor(t, viewerPlayerId) : null
  const byes = viewerPlayerId ? upcomingByesFor(t, viewerPlayerId) : []
  const now = gamesNow(t).filter((f) => f.group.id !== mine?.group.id)

  return (
    <div className="screen">
      <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
        <h2 className="round-title">Group stage</h2>
        <ProgressDots />
        <span className="muted small">
          {played} of {total} games played
        </span>
      </div>

      {viewerPlayerId && (
        <section className="section">
          <h3 className="section-title mine-title">
            <span className="live-dot" aria-hidden /> {mine ? (mine.state === 'ready' ? `Your game · Round ${mine.roundIndex + 1}` : `Up next · Round ${mine.roundIndex + 1}`) : 'You'}
          </h3>
          {byes.map((r) => (
            <div key={r} className="card bye-card">
              <strong>You sit out round {r + 1}.</strong>
              <div className="muted small">You get the average points for that round.</div>
            </div>
          ))}
          {mine ? (
            <>
              <GroupCard group={mine.group} highlight onClick={mine.state === 'ready' && canEdit(mine.group) ? () => setEditing({ group: mine.group, context: `Round ${mine.roundIndex + 1}` }) : undefined} />
              <WaitingNote flow={mine} />
              {mine.state === 'ready' && <p className="hint small">Go to {arena(mine.group.arenaId)} — tap the card when you're done to send the result.</p>}
            </>
          ) : (
            <div className="card">
              <strong>{complete ? 'Group stage done.' : "You've played all your games."}</strong>
              <div className="muted small">{complete ? 'Waiting for the organiser to continue.' : 'Waiting for the others to finish.'}</div>
            </div>
          )}
        </section>
      )}

      <section className="section">
        <h3 className="section-title">{viewerPlayerId ? 'Other games now' : 'Games now'}</h3>
        {now.length === 0 ? (
          <p className="hint">{complete ? 'All games have been played.' : 'Nothing else is being played right now.'}</p>
        ) : (
          now.map((f) => (
            <div key={f.group.id} className="stack" style={{ gap: 4 }}>
              <span className="muted small">Round {f.roundIndex + 1}</span>
              <GroupCard group={f.group} />
            </div>
          ))
        )}
        <p className="hint small">The full plan is under Schedule. A game starts as soon as its players and its {label(1).toLowerCase()} are free.</p>
      </section>

      <RankingSheet context={editing?.context ?? ''} group={editing?.group ?? null} onClose={() => setEditing(null)} />
    </div>
  )
}

export function RoundScreen() {
  const { t, dispatch, readOnly } = useTournament()
  const { player } = useNames()
  const [editing, setEditing] = useState<Group | null>(null)
  const [showWho, setShowWho] = useState(false)
  const active = activeRoundIndex(t)
  const [viewIdx, setViewIdx] = useState(active)
  // Follow the flow; the organiser can still browse other rounds with the arrows.
  const lastActive = useRef(active)
  useEffect(() => {
    if (lastActive.current !== active) {
      lastActive.current = active
      setViewIdx(active)
    }
  }, [active])

  if (t.rounds.length === 0) {
    return (
      <div className="screen">
        <p className="hint">No rounds scheduled. Add players and {t.settings.arenaLabel.toLowerCase()}s under Manage.</p>
      </div>
    )
  }
  if (readOnly) return <ViewerFlow />

  const idx = Math.min(viewIdx, t.rounds.length - 1)
  const round = t.rounds[idx]
  const flows = round.groups.map((g) => groupFlow(t, idx, g))
  const complete = groupStageComplete(t)
  const { played, total } = gamesPlayed(t)
  const finalLabel = t.settings.finalStage === 'none' ? '🏁 Finish tournament' : t.settings.finalStage === 'bracket' ? 'Start the knockout →' : 'Start the final →'

  return (
    <div className="screen">
      <div className="round-nav">
        <button type="button" className="btn btn-ghost" disabled={idx === 0} onClick={() => setViewIdx(idx - 1)} aria-label="Previous round">
          ‹
        </button>
        <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
          <h2 className="round-title">Round {idx + 1}</h2>
          <ProgressDots current={idx} />
        </div>
        <button type="button" className="btn btn-ghost" disabled={idx === t.rounds.length - 1} onClick={() => setViewIdx(idx + 1)} aria-label="Next round">
          ›
        </button>
      </div>

      <div className="row">
        <span className="muted small grow">
          {played} of {total} games played
        </span>
        <button type="button" className="btn btn-sm" onClick={() => setShowWho((v) => !v)}>
          {showWho ? 'Hide' : 'Who plays where'}
        </button>
      </div>
      {showWho && <WhoPlaysWhere round={round} />}

      <div className="stack">
        {flows.map((f) => (
          <div key={f.group.id} className="stack" style={{ gap: 4 }}>
            <GroupCard group={f.group} onClick={() => setEditing(f.group)} />
            <WaitingNote flow={f} />
          </div>
        ))}
        {round.byePlayerIds.length > 0 && (
          <div className="card bye-card">
            <div className="card-header">
              <span className="arena-name" style={{ fontSize: '1rem' }}>
                Sitting out this round
              </span>
            </div>
            <div className="muted">{round.byePlayerIds.map(player).join(', ')}</div>
          </div>
        )}
      </div>

      {complete ? (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => dispatch({ type: 'START_FINAL' })}>
          {finalLabel}
        </button>
      ) : (
        <p className="hint" style={{ textAlign: 'center' }}>
          Tap a group to enter its result. Games can be played in any order — each starts when its players and {t.settings.arenaLabel.toLowerCase()} are free.
        </p>
      )}

      <RankingSheet context={`Round ${idx + 1}`} group={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
