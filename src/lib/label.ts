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
