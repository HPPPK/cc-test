/**
 * Format a duration in milliseconds to a human-readable string.
 * Returns format like "5m 30s" or "1h 20m", capped at 2 units.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string or "--" for invalid input
 */
export function formatDuration(ms: number): string {
  // Handle invalid inputs
  if (ms < 0 || !Number.isFinite(ms)) {
    return '--'
  }

  const totalSeconds = Math.floor(ms / 1000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (totalMinutes > 0) {
    return `${totalMinutes}m ${seconds}s`
  }
  return `${totalSeconds}s`
}
