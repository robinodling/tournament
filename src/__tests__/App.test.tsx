import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

/** Full admin flow through the real UI (jsdom, localStorage only — IndexedDB is unavailable here). */

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function setupEightPlayers() {
  render(<App />)
  await screen.findByText('New tournament')

  fireEvent.change(screen.getByPlaceholderText('Arena'), { target: { value: 'Machine' } })
  fireEvent.change(screen.getByLabelText('How many players?'), { target: { value: '8' } })
  fireEvent.change(screen.getByLabelText('How many machines?'), { target: { value: '4' } })
  expect(screen.getByDisplayValue('Player 8')).toBeTruthy()
  expect(screen.getByDisplayValue('Machine 4')).toBeTruthy()

  fireEvent.click(screen.getByText('🎲 Generate schedule'))
  await screen.findByText(/Every player plays every machine exactly once/)
  fireEvent.click(screen.getByText('Start tournament'))
  await screen.findByText('Round 1', { selector: 'h2' })
}

function enterResultsForCurrentRound() {
  const cards = screen.getAllByText('Tap to enter result')
  for (let i = 0; i < cards.length; i++) {
    fireEvent.click(screen.getAllByText('Tap to enter result')[0])
    const dialog = screen.getByRole('dialog')
    // tap rank buttons in order until none are left (the last player is filled in automatically)
    for (;;) {
      const buttons = within(dialog).queryAllByRole('button').filter((b) => b.className.includes('rank-btn'))
      if (buttons.length === 0) break
      fireEvent.click(buttons[0])
    }
    fireEvent.click(within(dialog).getByText('Save result'))
  }
}

describe('App', () => {
  it('runs a full 8-player / 4-machine / 4-round tournament', async () => {
    await setupEightPlayers()

    for (let round = 1; round <= 4; round++) {
      expect(screen.getByText(`Round ${round}`, { selector: 'h2' })).toBeTruthy()
      enterResultsForCurrentRound()
      expect(screen.getAllByText('✓ Done')).toHaveLength(2)
      fireEvent.click(screen.getByText(round === 4 ? '🏁 Finish tournament' : 'Next round →'))
    }

    await screen.findByText('Final results')
    // every round hands out (4+3+2+1) points per group × 2 groups → 80 in total
    const total = Array.from(document.querySelectorAll('td.points')).reduce((sum, td) => sum + Number(td.textContent), 0)
    expect(total).toBe(80)
    expect(document.querySelectorAll('tbody tr')).toHaveLength(8)
    expect(screen.getByText('🥇')).toBeTruthy()
  })

  it('persists to localStorage and reloads', async () => {
    await setupEightPlayers()
    await new Promise((r) => setTimeout(r, 250)) // debounce
    const saved = JSON.parse(localStorage.getItem('tournament:v1')!)
    expect(saved.phase).toBe('running')
    expect(saved.players).toHaveLength(8)
    cleanup()
    render(<App />)
    await screen.findByText('Round 1', { selector: 'h2' })
  })

  it('removing a player mid-tournament re-draws only unplayed rounds', async () => {
    await setupEightPlayers()
    enterResultsForCurrentRound()
    fireEvent.click(screen.getByText('Next round →'))
    fireEvent.click(screen.getByText('Manage'))
    const removeButtons = screen.getAllByText('Remove').filter((b) => b.closest('.list-item')?.querySelector('input')?.getAttribute('aria-label')?.startsWith('Player '))
    fireEvent.click(removeButtons[0])
    expect(screen.getByText('Bring back')).toBeTruthy()
    fireEvent.click(screen.getByText('Round'))
    // 7 active players → one group of 4 plus 3 sitting out
    expect(screen.getByText('Sitting out this round')).toBeTruthy()
    fireEvent.click(screen.getByText('Schedule'))
    expect(screen.getByText('Done')).toBeTruthy() // round 1 kept
  })
})
