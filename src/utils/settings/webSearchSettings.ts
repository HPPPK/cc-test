/** Forward upgrade for old unversioned WebSearch records. Preserve future fields
 * and credentials; adding a trial choice never opts an existing user into it.
 */
export function upgradeWebSearchSettings(value: unknown): Record<string, unknown> {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return { ...record, ...(record.mode === undefined ? { mode: 'auto' } : {}) }
}
