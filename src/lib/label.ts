/** Pluralise the user-chosen arena label ("Machine" → "Machines", "Match" → "Matches"). */
export function plural(label: string, n = 2): string {
  if (n === 1) return label
  if (/(s|x|z|ch|sh)$/i.test(label)) return label + 'es'
  if (/[^aeiou]y$/i.test(label)) return label.slice(0, -1) + 'ies'
  return label + 's'
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

/** "Final" when there is one, otherwise "A-final", "B-final", … */
export function tierName(index: number, total: number): string {
  return total <= 1 ? 'Final' : `${String.fromCharCode(65 + index)}-final`
}

/** Name of a knockout round by its number of matches. */
export function roundName(matches: number): string {
  if (matches === 1) return 'Final'
  if (matches === 2) return 'Semifinal'
  if (matches === 4) return 'Quarterfinal'
  return `Round of ${matches * 2}`
}

/** "Quarterfinal 2", or just "Final" for the last round. */
export function matchLabel(matchesInRound: number, index: number): string {
  const name = roundName(matchesInRound)
  return matchesInRound === 1 ? name : `${name} ${index + 1}`
}
