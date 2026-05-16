/**
 * Format a number to a compact representation.
 * Returns format like "1.2k" for numbers >= 1000.
 * Removes trailing .0 for whole numbers.
 *
 * @param n - Number to format
 * @returns Formatted string
 */
export function formatCompact(n: number): string {
  if (n < 1000 && n > -1000) {
    return n.toString()
  }

  const absN = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const thousands = absN / 1000

  // Format with one decimal place, remove trailing .0
  const formatted = thousands.toFixed(1).replace(/\.0$/, '')

  return `${sign}${formatted}k`
}
