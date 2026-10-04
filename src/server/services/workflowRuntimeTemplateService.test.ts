import { describe, expect, it } from 'bun:test'
import {
  resolveWorkflowTemplateForRun,
  workflowTemplateSnapshotHash,
} from './workflowRuntimeTemplateService.js'
import type { WorkflowSessionState, WorkflowTemplate } from './workflowTypes.js'

function template(version: string, instructions: string): WorkflowTemplate {
  return {
    schemaVersion: 2,
    id: 'efficient-constrained-dev-debug-workflow-v5',
    source: 'pack',
    version,
    displayName: 'Development',
    phases: [{
      id: 'route-context',
      label: 'Route',
      instructions,
      requestedModel: null,
      skills: [],
      skillDeclarations: [],
      requiredArtifacts: [],
      completionCriteria: [],
      transitionAuthority: 'user-confirmation',
    }],
  }
}

function state(snapshot?: WorkflowTemplate): WorkflowSessionState {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    mode: 'workflow',
    template: { id: 'efficient-constrained-dev-debug-workflow-v5', version: '22', source: 'pack', snapshotId: 'snapshot-22', sourceState: 'current' },
    ...(snapshot ? { templateSnapshot: snapshot } : {}),
    templateIdentity: { id: 'efficient-constrained-dev-debug-workflow-v5', version: '22', source: 'pack' },
    sourceTemplateStatus: 'current',
    status: 'running',
    workflowStatus: 'running',
    activePhaseId: 'route-context',
    phases: [{ id: 'route-context', index: 0, status: 'running', artifactPointers: [] }],
    phaseRuns: [],
    transitionHistory: [],
    artifactIndex: [],
    finalReportRef: null,
    stateVersion: 1,
    revision: 1,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
  }
}

describe('workflow runtime template snapshots', () => {
  it('keeps the run pinned to its snapshot when the installed same-id ZIP is newer', () => {
    const pinned = template('22', 'old rules')
    const installed = template('23', 'new rules')
    const session = state(pinned)
    session.templateIdentity.contentHash = workflowTemplateSnapshotHash(pinned)

    expect(resolveWorkflowTemplateForRun(session, installed)).toEqual(pinned)
    expect(session.templateSnapshot).toEqual(pinned)
  })

  it('hydrates a legacy missing snapshot only when identity and hash match', () => {
    const installed = template('22', 'same rules')
    const session = state()
    session.templateIdentity.contentHash = workflowTemplateSnapshotHash(installed)

    expect(resolveWorkflowTemplateForRun(session, installed)).toEqual(installed)
    expect(session.templateSnapshot).toEqual(installed)
    expect(session.templateSnapshotHash).toBe(workflowTemplateSnapshotHash(installed))
  })

  it('fails closed when a legacy run cannot prove the installed ZIP matches', () => {
    const installed = template('23', 'different rules')
    const session = state()

    expect(resolveWorkflowTemplateForRun(session, installed)).toBeNull()
    expect(session.sourceTemplateStatus).toBe('stale-template')
  })
})
