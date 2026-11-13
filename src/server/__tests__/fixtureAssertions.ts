/** Assert a fixture's required field at runtime before reading its contents. */
export function requireFixtureValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected fixture value to be present')
  return value
}

/** Fetch fixtures must model Bun's callable fetch plus its preconnect member. */
export function withFetchPreconnect(
  implementation: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => ReturnType<typeof fetch>,
): typeof fetch {
  return Object.assign(implementation, { preconnect: () => {} })
}

/** Complete unrelated envelope fields while requiring the workflow identity under test. */
type SessionFixtureOverrides = Omit<Partial<import('../services/sessionService.js').SessionDetail>, 'workflow'> & {
  workflow?: Partial<import('../services/workflowTypes.js').WorkflowSessionMetadata> & Pick<import('../services/workflowTypes.js').WorkflowSessionMetadata, 'templateId' | 'templateVersion' | 'templateSource'>
}
export function makeSessionDetailFixture(overrides: SessionFixtureOverrides): import('../services/sessionService.js').SessionDetail {
  const id = overrides.id ?? 'fixture-session'
  const now = '2026-05-20T00:00:00.000Z'
  const { workflow, ...session } = overrides
  return {
    id, title: 'Fixture session', createdAt: now, modifiedAt: now,
    messageCount: 0, projectPath: 'fixture-project', projectRoot: null,
    workDir: null, workDirExists: false, messages: [], ...session,
    ...(workflow ? { workflow: {
      mode: 'workflow', schemaVersion: 1,
      templateSnapshotId: `${workflow.templateId}-v${workflow.templateVersion}`,
      workflowStatus: workflow.status ?? 'created', activePhaseId: null, updatedAt: now,
      statePointer: { kind: 'workflow-state', sessionId: id, artifactId: 'state', schemaVersion: 1, createdAt: now },
      ...workflow,
    } } : {}),
  }
}

/** Exercise malformed external input against a runtime validator without claiming it is a valid contract. */
export function invokeUncheckedFixture(
  callable: (...args: never[]) => unknown,
  receiver: unknown,
  args: unknown[],
): unknown {
  return Reflect.apply(callable, receiver, args)
}

function isFixtureRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
export function requireFixtureRecord(value: unknown): Record<string, unknown> {
  if (!isFixtureRecord(value)) throw new Error('Expected fixture JSON object')
  return value
}
export function requireFixtureArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected fixture JSON array')
  return value
}
