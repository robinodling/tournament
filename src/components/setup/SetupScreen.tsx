import { useState } from 'react'
import { describeSchedule, minRoundsForFullCoverage, roundShape, suggestRounds } from '../../lib/scheduler'
import { formatPoints, pointsForBye, pointsForPlacement } from '../../lib/scoring'
import { ordinal } from '../../lib/label'
import { activeArenas, activePlayers, finalShape, validateSetup } from '../../state/reducer'
import type { FinalStage } from '../../types'
import { useNames, useTournament } from '../../state/TournamentContext'
import { Stepper } from '../common/Stepper'
import { InstallCard } from '../common/InstallCard'
import { GroupCard } from '../round/GroupCard'
import { NamedList } from './NamedList'
import { QualitySummary } from './QualitySummary'

export function SetupScreen() {
  const { t, dispatch } = useTournament()
  const { label } = useNames()
  const [showPreview, setShowPreview] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState<{ rounds: number; verified: boolean; exact: boolean } | null>(null)

  const players = activePlayers(t)
  const arenas = activeArenas(t)
  const { groupSize, roundCount, byePoints, finalStage, unevenGroups } = t.settings
  const fin = finalShape(t)
  const shape = roundShape(players.length, arenas.length, groupSize, unevenGroups)
  const problems = validateSetup(t)
  const hasSchedule = t.rounds.length > 0
  const quality = hasSchedule ? describeSchedule(t) : null

  const pointsPreview = Array.from({ length: groupSize }, (_, i) => `${ordinal(i + 1)} ${pointsForPlacement(i + 1, groupSize)}`).join(' · ')

  const minRounds = minRoundsForFullCoverage(players.length, arenas.length, groupSize, unevenGroups)
  const hints: string[] = []
  if (players.length >= 2 && arenas.length >= 1 && groupSize >= 2 && shape.groups > 0) {
    const sizesText = shape.sizes.every((n) => n === groupSize) ? `${shape.groups} ${shape.groups === 1 ? 'group' : 'groups'} of ${groupSize}` : `${shape.groups} groups (${shape.sizes.join(' + ')})`
    hints.push(
      `${players.length} players → ${sizesText} per round on ${shape.groups} of ${arenas.length} ${label(arenas.length).toLowerCase()}` +
        (shape.byes ? `; ${shape.byes} ${shape.byes === 1 ? 'player sits' : 'players sit'} out each round.` : '; nobody sits out.'),
    )
    if (shape.sizes.some((n) => n < groupSize)) {
      const small = Math.min(...shape.sizes)
      hints.push(`A group of ${small} scores ${Array.from({ length: small }, (_, i) => formatPoints(pointsForPlacement(i + 1, small, groupSize))).join(' · ')} — same top, bottom and average as a group of ${groupSize}.`)
    }
    if (minRounds !== null) {
      if (roundCount < minRounds) hints.push(`Everyone needs at least ${minRounds} rounds to play every ${label(1).toLowerCase()}; with ${roundCount} some ${label(2).toLowerCase()} are missed.`)
      else if (roundCount === minRounds) hints.push(`${roundCount} rounds is the minimum for everyone to play every ${label(1).toLowerCase()}${shape.byes === 0 ? ' — exactly once' : ''}.`)
      else hints.push(`${roundCount} rounds ⇒ everyone can play every ${label(1).toLowerCase()} (${minRounds} would be enough for one visit each).`)
    }
  }

  const suggest = () => {
    setSuggesting(true)
    // Let the button repaint before the scheduler runs for a few hundred ms.
    setTimeout(() => {
      const result = suggestRounds(
        players.map((p) => p.id),
        arenas.map((a) => a.id),
        groupSize,
        unevenGroups,
      )
      setSuggestion(result)
      if (result) dispatch({ type: 'UPDATE_SETTINGS', settings: { roundCount: result.rounds } })
      setSuggesting(false)
    }, 20)
  }

  return (
    <div className="screen">
      <header className="section">
        <h1>New tournament</h1>
        <p className="hint">
          Set up players, {label(2).toLowerCase()} and the format. Everything can be changed until you start; players and{' '}
          {label(2).toLowerCase()} can also be adjusted mid-tournament.
        </p>
        <InstallCard compact />
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
        {groupSize >= 3 && (
          <label className="stepper">
            <span className="stepper-label">
              Uneven groups <span className="muted small">one player fewer in some groups instead of sitting out</span>
            </span>
            <input type="checkbox" className="switch" checked={unevenGroups} onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', settings: { unevenGroups: e.target.checked } })} />
          </label>
        )}
        <Stepper label="Rounds" value={roundCount} min={1} max={30} onChange={(n) => dispatch({ type: 'UPDATE_SETTINGS', settings: { roundCount: n } })} />
        {minRounds !== null && (
          <div className="row">
            <button type="button" className="btn btn-sm" disabled={suggesting} onClick={suggest}>
              {suggesting ? 'Checking…' : `Suggest rounds so everyone plays every ${label(1).toLowerCase()}`}
            </button>
          </div>
        )}
        {suggestion && suggestion.rounds === roundCount && (
          <p className="hint">
            {suggestion.verified
              ? `✓ Checked with the scheduler: in ${suggestion.rounds} rounds every player plays every ${label(1).toLowerCase()}${suggestion.exact ? ' exactly once' : ' at least once'}.`
              : `Could not confirm full coverage within a few extra rounds; ${suggestion.rounds} is the theoretical minimum.`}
          </p>
        )}
        <label className="stepper">
          <span className="stepper-label">Points for sitting out</span>
          <select className="input" style={{ width: 'auto' }} value={byePoints} onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', settings: { byePoints: e.target.value as 'average' | 'zero' } })}>
            <option value="average">Average ({pointsForBye(groupSize, 'average')} pts)</option>
            <option value="zero">None (0 pts)</option>
          </select>
        </label>
        <label className="stepper">
          <span className="stepper-label">Final stage</span>
          <select className="input" style={{ width: 'auto' }} value={finalStage} onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', settings: { finalStage: e.target.value as FinalStage } })}>
            <option value="none">None</option>
            <option value="top">Top {groupSize} final</option>
            <option value="tiers">Finals for everyone</option>
            <option value="bracket">Knockout bracket</option>
          </select>
        </label>
        {finalStage === 'bracket' && (
          <label className="stepper">
            <span className="stepper-label">Bracket</span>
            <select className="input" style={{ width: 'auto' }} value={t.settings.bracketSize} onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', settings: { bracketSize: Number(e.target.value) } })}>
              <option value={0}>Everyone</option>
              <option value={4}>Top 4</option>
              <option value={8}>Top 8</option>
              <option value={16}>Top 16</option>
            </select>
          </label>
        )}
        <p className="hint">
          Points per round: <strong>{pointsPreview}</strong>
        </p>
        {finalStage === 'top' && (
          <p className="hint">
            After the rounds, the top {groupSize} in the standings play one final; its placements decide positions 1–{groupSize}. Everyone else keeps their standings position.
          </p>
        )}
        {finalStage === 'tiers' && fin.groups > 0 && (
          <p className="hint">
            After the rounds, standings 1–{groupSize} play the A-final{fin.groups > 1 ? `, ${groupSize + 1}–${2 * groupSize} the B-final` : ''}
            {fin.groups > 2 ? ', and so on' : ''} — {fin.groups} {fin.groups === 1 ? 'final' : 'finals'} on {fin.groups} {label(fin.groups).toLowerCase()}. Final placements decide the overall order
            {fin.finalists < players.length ? `; players below ${fin.finalists} keep their standings position` : ''}.
          </p>
        )}
        {finalStage === 'bracket' && fin.groups > 0 && (
          <p className="hint">
            After the rounds, the top {fin.finalists} by standings enter a {fin.size}-player knockout: 1st plays {fin.size}th, 2nd plays {fin.size - 1}th, and so on
            {fin.size > fin.finalists ? `; the top ${fin.size - fin.finalists} ${fin.size - fin.finalists === 1 ? 'seed skips' : 'seeds skip'} the first round` : ''}. Winners
            advance head-to-head to a single final{fin.size >= 4 ? ', semifinal losers play for bronze' : ''}
            {fin.finalists < players.length ? `; players below ${fin.finalists} keep their standings position` : ''}.
          </p>
        )}
        {finalStage !== 'none' && fin.groups === 0 && players.length > 0 && <p className="problem">⚠︁ No final possible with these numbers — it will be skipped.</p>}
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
    </div>
  )
}
