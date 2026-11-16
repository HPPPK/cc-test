/** Observer enrichment must never prevent recording or validating a tool call. */
export function toolObservableInput(
  input: Record<string, unknown>,
  backfill: (input: Record<string, unknown>) => void,
  onError: (error: unknown) => void,
): Record<string, unknown> | undefined {
  const copy = structuredClone(input)
  try {
    backfill(copy)
  } catch (error) {
    // Keep the original argument (including invalid bytes) for the execution
    // boundary to reject. This does not run or repair the tool itself.
    onError(error)
    return undefined
  }
  return Object.keys(copy).some(key => !(key in input)) ? copy : undefined
}
