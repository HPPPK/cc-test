import { describe, expect, test } from 'bun:test'
import {
  applyWorkflowPhaseProgress,
  getWorkflowCompletionEligibility,
  migrateWorkflowRuntimeContract,
  rebuildWorkflowCompletionContract,
  recordAskUserQuestionAnswer,
  recordAskUserQuestionIssue,
} from './workflowCompletionGate.js'
import type { WorkflowSessionState, WorkflowTemplate } from './workflowTypes.js'

const NOW = '2026-07-23T00:00:00.000Z'
const SESSION_ID = 'workflow-completion-gate-test'
const PHASE_ID = 'analysis'

function template(): WorkflowTemplate {
  return {
    schemaVersion: 1,
    id: 'generic-completion-contract',
    source: 'builtin',
    version: '1',
    displayName: 'Generic completion contract',
    description: 'Fixture',
    phases: [{
      id: PHASE_ID,
      label: 'Analysis',
      instructions: 'Produce the required decision artifact.',
      skillDeclarations: [],
      requiredArtifacts: [{ id: 'decision-record', kind: 'markdown', description: 'Decision record', required: true }],
      completionCriteria: ['Decision record was reviewed.'],
      transitionAuthority: 'user-confirmation',
    }],
  }
}

function legacyState(): WorkflowSessionState {
  const snapshot = template()
  return {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    mode: 'workflow',
    template: { id: snapshot.id, source: snapshot.source, version: snapshot.version, snapshotId: 'fixture', sourceState: 'current' },
    templateSnapshot: snapshot,
    templateIdentity: { id: snapshot.id, source: snapshot.source, version: snapshot.version, registryKey: 'fixture', contentHash: 'fixture' },
    sourceTemplateStatus: 'current',
    status: 'running',
    workflowStatus: 'running',
    runStatus: 'active',
    activePhaseId: PHASE_ID,
    phases: [{ id: PHASE_ID, index: 0, status: 'running', artifactPointers: [] }],
    phaseRuns: [],
    transitionHistory: [],
    artifactIndex: [{ kind: 'phase-artifact', sessionId: SESSION_ID, artifactId: 'decision-record', schemaVersion: 1, createdAt: NOW }],
    finalReportRef: null,
    stateVersion: 7,
    revision: 3,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

describe('workflow completion contract', () => {
  test('migrates legacy state fail-closed and requires an explicit rebuild and verified work', () => {
    const migrated = migrateWorkflowRuntimeContract(legacyState(), template(), NOW)

    expect(migrated.runtimeContract?.migrationStatus).toBe('needs-rebuild')
    expect(getWorkflowCompletionEligibility(migrated)).toMatchObject({ status: 'ineligible' })
    expect(getWorkflowCompletionEligibility(migrated).reasons.join(' ')).toContain('rebuilt')

    const rebuilt = rebuildWorkflowCompletionContract(migrated, template(), NOW, 'Re-evaluated current phase state.')
    expect(rebuilt.runtimeContract?.migrationStatus).toBe('current')
    expect(getWorkflowCompletionEligibility(rebuilt).status).toBe('ineligible')
    expect(getWorkflowCompletionEligibility(rebuilt).reasons).toEqual(expect.arrayContaining([
      'Phase work is not ready for completion review.',
      'Required artifact is not verified: decision-record',
      'Required completion check is not passed: completion-criteria:0',
    ]))
  })

  test('keeps AskUserQuestion answers blocking until explicit processing and linked evidence are complete', () => {
    let state = rebuildWorkflowCompletionContract(legacyState(), template(), NOW, 'Re-evaluated current phase state.')
    state = applyWorkflowPhaseProgress(state, PHASE_ID, {
      type: 'work-ready-for-review', actor: 'user', rationale: 'The active phase work is ready for review.',
    }, NOW)
    state = applyWorkflowPhaseProgress(state, PHASE_ID, {
      type: 'artifact-satisfied', actor: 'user', artifactRequirementId: 'decision-record', artifactIds: ['decision-record'], rationale: 'Verified the decision record.',
    }, NOW)
    state = applyWorkflowPhaseProgress(state, PHASE_ID, {
      type: 'check-passed', actor: 'user', checkId: 'completion-criteria:0', evidenceArtifactIds: ['decision-record'], rationale: 'Reviewed the decision record.',
    }, NOW)
    expect(getWorkflowCompletionEligibility(state).status).toBe('eligible')

    state = recordAskUserQuestionIssue(state, {
      requestId: 'question-1',
      toolUseId: 'tool-1',
      questions: [{ id: 'decision-option', header: 'Decision', question: 'Which option should the phase use?' }],
      now: NOW,
    })
    state = recordAskUserQuestionAnswer(state, {
      requestId: 'question-1',
      answers: { 'decision-option': 'Use option B.' },
      now: NOW,
    })
    const question = state.runtimeContract!.phaseStates[PHASE_ID]!.issues[0]!
    expect(question).toMatchObject({
      status: 'answered-pending-processing',
      blocksCompletion: true,
      answer: { 'decision-option': 'Use option B.' },
    })
    expect(getWorkflowCompletionEligibility(state).status).toBe('ineligible')

    state = applyWorkflowPhaseProgress(state, PHASE_ID, {
      type: 'process-issue',
      actor: 'user',
      issueId: question.id,
      status: 'resolved',
      artifactIds: ['decision-record'],
      checkIds: ['completion-criteria:0'],
      rationale: 'Applied the answer and verified the affected decision record.',
    }, NOW)
    expect(getWorkflowCompletionEligibility(state)).toMatchObject({ status: 'eligible', reasons: [] })
  })

  test('fails closed when a progress update references an artifact that is not persisted for this session', () => {
    const state = rebuildWorkflowCompletionContract(legacyState(), template(), NOW, 'Re-evaluated current phase state.')
    expect(() => applyWorkflowPhaseProgress(state, PHASE_ID, {
      type: 'artifact-satisfied', actor: 'user', artifactRequirementId: 'decision-record', artifactIds: ['not-persisted'], rationale: 'Claimed evidence.',
    }, NOW)).toThrow('unknown workflow artifact')
  })
})
