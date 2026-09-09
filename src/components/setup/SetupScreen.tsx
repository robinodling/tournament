import { useState } from 'react'
import { describeSchedule, roundShape } from '../../lib/scheduler'
import { pointsForBye, pointsForPlacement } from '../../lib/scoring'
import { ordinal } from '../../lib/label'
import { activeArenas, activePlayers, validateSetup } from '../../state/reducer'
import { useNames, useTournament } from '../../state/TournamentContext'
import { Stepper } from '../common/Stepper'
import { RestoreSection } from '../manage/RestoreSection'
import { GroupCard } from '../round/GroupCard'
import { NamedList } from './NamedList'
import { QualitySummary } from './QualitySummary'

export function SetupScreen() {
  const { t, dispatch } = useTournament()
  const { label } = useNames()
  const [showPreview, setShowPreview] = useState(false)

  const players = activePlayers(t)
  const arenas = activeArenas(t)
  const { groupSize, roundCount, byePoints } = t.settings
  const shape = roundShape(players.length, arenas.length, groupSize)
  const problems = validateSetup(t)
  const hasSchedule = t.rounds.length > 0
  const quality = hasSchedule ? describeSchedule(t) : null

  const pointsPreview = Array.from({ length: groupSize }, (_, i) => `${ordinal(i + 1)} ${pointsForPlacement(i + 1, groupSize)}`).join(' · ')

  const hints: string[] = []
  if (players.length >= 2 && arenas.length >= 1 && groupSize >= 2) {
    if (shape.groups > 0) {
      hints.push(
        `${players.length} players ÷ ${groupSize} = ${shape.groups} ${shape.groups === 1 ? 'group' : 'groups'} per round on ${shape.groups} of ${arenas.length} ${label(arenas.length).toLowerCase()}` +
          (shape.byes ? `; ${shape.byes} ${shape.byes === 1 ? 'player sits' : 'players sit'} out each round.` : '.'),
      )
      if (shape.byes === 0) {
        if (roundCount === arenas.length) hints.push(`${roundCount} rounds ⇒ every player can play every ${label(1).toLowerCase()} exactly once.`)
        else if (roundCount > arenas.length) hints.push(`${roundCount} rounds ⇒ every player can play every ${label(1).toLowerCase()} at least once.`)
        else hints.push(`${roundCount} rounds ⇒ each player will see ${roundCount} of the ${arenas.length} ${label(arenas.length).toLowerCase()}.`)
      }
    }
  }

  return (
    <div className="screen screen-setup">
      <header className="section">
        <h1>New tournament</h1>
        <p className="hint">
          Set up players, {label(2).toLowerCase()} and the format. Everything can be changed until you start; players and{' '}
          {label(2).toLowerCase()} can also be adjusted mid-tournament.
        </p>
      </header>

      <section className="section">
        <h2 className="section-title">Tournament</h2>
        <label className="stack">
          <span className="small muted">Name</span>
          <input className="input" value={t.name} onChange={(e) => dispatch({ type: 'SET_NAME', name: e.target.value })} />
        </label>
        <label className="stack">
          <span className="small muted">What do you call the thing a group plays on? (Arena, Machine, Table, Court…)</span>
          <input
            className="input"
            value={t.settings.arenaLabel}
            placeholder="Arena"
            onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', settings: { arenaLabel: e.target.value } })}
          />
        </label>
      </section>

      <section className="section">
        <h2 className="section-title">Players</h2>
        <Stepper label="How many players?" value={t.players.length} min={0} max={64} onChange={(n) => dispatch({ type: 'SET_PLAYER_COUNT', count: n })} />
        <NamedList
          items={t.players}
          placeholder="Player name"
          onRename={(id, name) => dispatch({ type: 'RENAME_PLAYER', id, name })}
          onRemove={(id) => dispatch({ type: 'REMOVE_PLAYER', id })}
          onAdd={(names) => dispatch({ type: 'ADD_PLAYERS', names })}
        />
      </section>

      <section className="section">
        <h2 className="section-title">{label(2)}</h2>
        <Stepper label={`How many ${label(2).toLowerCase()}?`} value={t.arenas.length} min={0} max={32} onChange={(n) => dispatch({ type: 'SET_ARENA_COUNT', count: n })} />
        <NamedList
          items={t.arenas}
          placeholder={`${label(1)} name`}
          onRename={(id, name) => dispatch({ type: 'RENAME_ARENA', id, name })}
          onRemove={(id) => dispatch({ type: 'REMOVE_ARENA', id })}
          onAdd={(names) => dispatch({ type: 'ADD_ARENAS', names })}
        />
      </section>

      <section className="section">
        <h2 className="section-title">Format</h2>
        <Stepper
          label="Group size"
          hint="players per group"
          value={groupSize}
          min={2}
          max={Math.max(2, players.length || 8)}
          onChange={(n) => dispatch({ type: 'UPDATE_SETTINGS', settings: { groupSize: n } })}
        />
        <Stepper label="Rounds" value={roundCount} min={1} max={30} onChange={(n) => dispatch({ type: 'UPDATE_SETTINGS', settings: { roundCount: n } })} />
        <label className="stepper">
          <span className="stepper-label">Points for sitting out</span>
          <select className="input" style={{ width: 'auto' }} value={byePoints} onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', settings: { byePoints: e.target.value as 'average' | 'zero' } })}>
            <option value="average">Average ({pointsForBye(groupSize, 'average')} pts)</option>
            <option value="zero">None (0 pts)</option>
          </select>
        </label>
        <p className="hint">
          Points per round: <strong>{pointsPreview}</strong>
        </p>
        {hints.map((h) => (
          <p key={h} className="hint">
            {h}
          </p>
        ))}
      </section>

      <section className="section">
        <h2 className="section-title">Schedule</h2>
        {problems.map((p) => (
          <p key={p} className="problem">
            ⚠︁ {p}
          </p>
        ))}
        <div className="row">
          <button type="button" className="btn grow" disabled={problems.length > 0} onClick={() => dispatch({ type: 'GENERATE_SCHEDULE' })}>
            {hasSchedule ? '🎲 Re-draw schedule' : '🎲 Generate schedule'}
          </button>
          {hasSchedule && (
            <button type="button" className="btn" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? 'Hide rounds' : 'Show rounds'}
            </button>
          )}
        </div>
        {quality && <QualitySummary q={quality} />}
        {hasSchedule && showPreview && (
          <div className="stack">
            {t.rounds.map((r, i) => (
              <div key={i} className="schedule-round">
                <div className="status-line">
                  <strong>Round {i + 1}</strong>
                  {r.byePlayerIds.length > 0 && <span className="muted small">sitting out: {r.byePlayerIds.map((id) => t.players.find((p) => p.id === id)?.name).join(', ')}</span>}
                </div>
                <div className="schedule-groups">
                  {r.groups.map((g) => (
                    <GroupCard key={g.id} group={g} compact />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={problems.length > 0} onClick={() => dispatch({ type: 'START' })}>
          {hasSchedule ? 'Start tournament' : 'Generate & start tournament'}
        </button>
      </section>

      <RestoreSection />
    </div>
  )
}
