type ObservableTool = {
  name: string
  backfillObservableInput?: (input: Record<string, unknown>) => void
}

const SEND_MESSAGE_DERIVED_FIELDS = new Set(['type', 'recipient', 'content', 'request_id', 'approve'])

/** Compatibility for SendMessage observer/transcript copies, never arbitrary fields. */
export function sendMessageInputForWorkflowGuard(
  tool: ObservableTool,
  raw: Record<string, unknown>,
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  if (tool.name !== 'SendMessage' || !tool.backfillObservableInput) return raw
  // Reconstruct from schema-validated data, not the possibly forged aliases.
  const expected = structuredClone(parsed)
  tool.backfillObservableInput(expected)
  const canonical = { ...raw }
  for (const key of SEND_MESSAGE_DERIVED_FIELDS) {
    if (!Object.hasOwn(parsed, key) && Object.hasOwn(expected, key)
      && Object.hasOwn(raw, key) && Object.is(raw[key], expected[key])) {
      delete canonical[key]
    }
  }
  return canonical
}
