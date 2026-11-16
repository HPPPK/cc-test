/** Require a value before resuming or connecting to a session. */
export function requireSessionValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message)
  return value
}
