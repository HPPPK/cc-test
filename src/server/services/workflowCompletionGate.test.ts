import { describe, expect, test } from 'bun:test'
import {
  applyWorkflowPhaseProgress,
  getWorkflowCompletionEligibility,
  markAskUserQuestionIssuesStale,
  migrateWorkflowRuntimeContract,
  rebuildWorkflowCompletionContract,
  recordAskUserQuestionAnswer,
  recordAskUserQuestionIssue,
  recalculateWorkflowCompletionEligibility,
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



  test('keeps old workflow fixtures compatible and strips malformed automatic recovery metadata', () => {
    const legacy = legacyState()
    const migratedLegacy = migrateWorkflowRuntimeContract(legacy, template(), NOW)
    expect(migratedLegacy).not.toHaveProperty('autoRecovery')
    expect(migratedLegacy).not.toHaveProperty('autoRecoveryAttempts')

    const malformed = {
      ...rebuildWorkflowCompletionContract(legacyState(), template(), NOW, 'Build the current contract before recovery metadata migration.'),
      autoRecovery: {
        phaseId: 'unknown-phase',
        startedAt: 'not-a-date',
        expiresAt: 'not-a-date',
        attempt: 0,
        source: 'unknown-source',
      },
      autoRecoveryAttempts: {
        run: { [PHASE_ID]: 1, invalid: -1 },
        invalid: 'not-a-record',
      },
    } as WorkflowSessionState
    const migrated = migrateWorkflowRuntimeContract(malformed, template(), NOW)

    expect(migrated).not.toHaveProperty('autoRecovery')
    expect(migrated.autoRecoveryAttempts).toEqual({ run: { [PHASE_ID]: 1 } })
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
      questions: [{ id: 'decision-option', header: 'Decision', question: 'Which option should the phase use?', blocksCompletion: true }],
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


  test('deduplicates managed workflow questions by stable content fingerprint across retries and answered state', () => {
    const base = rebuildWorkflowCompletionContract(legacyState(), template(), NOW, 'Re-evaluated current phase state.')
    let state = {
      ...base,
      template: { ...base.template, id: 'feature-extension-workflow-v8' },
      templateIdentity: { ...base.templateIdentity, id: 'feature-extension-workflow-v8' },
    }
    const question = {
      id: 'decision-option',
      header: 'Decision',
      question: 'Which option should the phase use?',
      options: [{ label: 'Option B', description: 'Use option B.' }],
      blocksCompletion: true,
    }

    state = recordAskUserQuestionIssue(state, {
      requestId: 'question-first',
      toolUseId: 'tool-first',
      questions: [question],
      now: NOW,
    })
    const firstIssue = state.runtimeContract!.phaseStates[PHASE_ID]!.issues[0]!
    state = recordAskUserQuestionIssue(state, {
      requestId: 'question-retry',
      toolUseId: 'tool-retry',
      questions: [{ ...question, question: '  Which option should the phase use?  ' }],
      now: '2026-09-17T00:01:00.000Z',
    })

    expect(state.runtimeContract!.phaseStates[PHASE_ID]!.issues).toHaveLength(1)
    expect(state.runtimeContract!.phaseStates[PHASE_ID]!.issues[0]).toMatchObject({
      id: firstIssue.id,
      questionRequestId: 'question-first',
      questionFingerprint: expect.any(String),
      status: 'open',
    })

    state = recordAskUserQuestionAnswer(state, {
      requestId: 'question-first',
      answers: { 'decision-option': 'Option B' },
      now: '2026-09-17T00:02:00.000Z',
    })
    state = recordAskUserQuestionIssue(state, {
      requestId: 'question-after-answer',
      toolUseId: 'tool-after-answer',
      questions: [question],
      now: '2026-09-17T00:03:00.000Z',
    })

    expect(state.runtimeContract!.phaseStates[PHASE_ID]!.issues).toHaveLength(1)
    expect(state.runtimeContract!.phaseStates[PHASE_ID]!.issues[0]?.status).toBe('answered-pending-processing')
  })

  test('records an AskUserQuestion without blocksCompletion as non-blocking', () => {
    let state = rebuildWorkflowCompletionContract(legacyState(), template(), NOW, 'Re-evaluated current phase state.')
    state = recordAskUserQuestionIssue(state, {
      requestId: 'optional-question',
      toolUseId: 'optional-tool-use',
      questions: [{ id: 'format', question: 'Which distribution format should the preview use?' }],
      now: NOW,
    })

    expect(state.runtimeContract!.phaseStates[PHASE_ID]!.issues[0]).toMatchObject({
      status: 'open',
      blocksCompletion: false,
    })
  })

  test('persists full AskUserQuestion card input so an open workflow question can be rendered again after restart', () => {
    let state = rebuildWorkflowCompletionContract(legacyState(), template(), NOW, 'Re-evaluated current phase state.')
    const questions = [{
      id: 'authorize-b01',
      header: 'B01 authorization',
      question: 'Allow the workflow to create the project skeleton?',
      blocksCompletion: true,
      choices: [
        { id: 'allow', label: 'Allow (Recommended)', description: 'Create the approved local skeleton.' },
        { id: 'pause', label: 'Pause', description: 'Keep the workflow waiting.' },
      ],
    }]

    state = recordAskUserQuestionIssue(state, {
      requestId: 'persisted-question',
      toolUseId: 'persisted-tool-use',
      questions,
      now: NOW,
    })

    const issue = state.runtimeContract!.phaseStates[PHASE_ID]!.issues[0] as WorkflowPhaseIssue & {
      questionInput?: unknown
    }
    expect(issue.questionInput).toEqual({ questions })
  })

  test('marks a failed AskUserQuestion delivery stale so it cannot block completion', () => {
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
    state = recordAskUserQuestionIssue(state, {
      requestId: 'aborted-question',
      toolUseId: 'aborted-tool-use',
      questions: [{ id: 'decision-option', question: 'Which option should the phase use?' }],
      now: NOW,
    })

    const stale = markAskUserQuestionIssuesStale(state, {
      toolUseId: 'aborted-tool-use',
      now: NOW,
      rationale: 'The question tool request failed before an answer was delivered.',
    })

    expect(stale.runtimeContract?.phaseStates[PHASE_ID]?.issues[0]).toMatchObject({
      status: 'stale',
      blocksCompletion: false,
      processing: {
        status: 'stale',
        rationale: 'The question tool request failed before an answer was delivered.',
      },
    })
    expect(getWorkflowCompletionEligibility(stale)).toMatchObject({ status: 'eligible', reasons: [] })
  })

  test('repairs only legacy Debug intake evidence bindings without advancing the workflow', () => {
    const debugTemplate: WorkflowTemplate = {
      ...template(),
      id: 'debug-repair-workflow-v8',
      version: '8',
      phases: [{
        id: 'debug-memory-intake',
        label: 'Debug intake',
        instructions: 'Capture the debugging context.',
        skillDeclarations: [],
        requiredArtifacts: [{ id: 'debug-context', kind: 'markdown', description: 'Debug context', required: true }],
        completionCriteria: ['Debug context is reviewed.'],
        transitionAuthority: 'user-confirmation',
      }],
    }
    const base = legacyState()
    const debugState = rebuildWorkflowCompletionContract({
      ...base,
      template: { id: debugTemplate.id, source: debugTemplate.source, version: debugTemplate.version, snapshotId: 'debug-fixture', sourceState: 'current' },
      templateSnapshot: debugTemplate,
      templateIdentity: { id: debugTemplate.id, source: debugTemplate.source, version: debugTemplate.version, registryKey: 'debug-fixture', contentHash: 'debug-fixture' },
      activePhaseId: 'debug-memory-intake',
      phases: [{ id: 'debug-memory-intake', index: 0, status: 'running', artifactPointers: [] }],
      workflowRuns: [{
        id: 'debug-run',
        templateId: debugTemplate.id,
        status: 'active',
        currentPhaseId: 'debug-memory-intake',
        artifacts: [{ id: 'debug-context', filename: 'debug-context.md', kind: 'markdown', required: true, phaseId: 'route-context', createdAt: NOW, updatedAt: NOW }],
        history: [],
        createdAt: NOW,
        updatedAt: NOW,
      }],
      artifactIndex: [{ kind: 'phase-artifact', sessionId: SESSION_ID, artifactId: 'debug-context', schemaVersion: 1, createdAt: NOW, phaseId: 'route-context' }],
      pendingConfirmation: null,
    }, debugTemplate, NOW, 'Loaded current Debug completion contract.')
    const blockedQuestion = {
      id: 'ask:phase-blocked',
      phaseId: 'debug-memory-intake',
      sessionId: SESSION_ID,
      createdAt: NOW,
      updatedAt: NOW,
      source: 'ask-user-question' as const,
      status: 'open' as const,
      blocksCompletion: true,
      blockingReason: 'A workflow question requires an answer and explicit processing.',
      questionId: 'phase_blocked',
      createdStateVersion: debugState.stateVersion,
    }
    const answeredQuestion = {
      ...blockedQuestion,
      id: 'ask:real-answer',
      questionId: 'confirm_debug',
      status: 'answered-pending-processing' as const,
    }
    debugState.runtimeContract!.phaseStates['debug-memory-intake']!.issues = [blockedQuestion, answeredQuestion]

    const migrated = migrateWorkflowRuntimeContract(debugState, debugTemplate, NOW)
    const pointer = Array.isArray(migrated.artifactIndex) ? migrated.artifactIndex[0] : migrated.artifactIndex['debug-context']

    expect(migrated).not.toBe(debugState)
    expect(migrated.activePhaseId).toBe('debug-memory-intake')
    expect(migrated.status).toBe('running')
    expect(migrated.workflowStatus).toBe('running')
    expect(migrated.pendingConfirmation).toBeNull()
    expect(migrated.workflowRuns?.[0]?.artifacts[0]?.phaseId).toBe('debug-memory-intake')
    expect((pointer as { phaseId?: string }).phaseId).toBe('debug-memory-intake')
    expect(migrated.phases[0]?.artifactPointers).toEqual([expect.objectContaining({ artifactId: 'debug-context', phaseId: 'debug-memory-intake' })])
    expect(migrated.runtimeContract?.phaseStates['debug-memory-intake']?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionId: 'phase_blocked', status: 'stale', blocksCompletion: false }),
      expect.objectContaining({ questionId: 'confirm_debug', status: 'answered-pending-processing', blocksCompletion: true }),
    ]))
    expect(migrated.runtimeContract?.phaseStates['debug-memory-intake']?.artifactRequirements[0]?.status).toBe('pending')

    const developmentState = {
      ...debugState,
      template: { ...debugState.template, id: 'efficient-constrained-dev-debug-workflow-v5' },
      templateIdentity: { ...debugState.templateIdentity, id: 'efficient-constrained-dev-debug-workflow-v5' },
    }
    expect(migrateWorkflowRuntimeContract(developmentState, undefined, NOW)).toBe(developmentState)
  })

  test('fails closed when a progress update references an artifact that is not persisted for this session', () => {
    const state = rebuildWorkflowCompletionContract(legacyState(), template(), NOW, 'Re-evaluated current phase state.')
    expect(() => applyWorkflowPhaseProgress(state, PHASE_ID, {
      type: 'artifact-satisfied', actor: 'user', artifactRequirementId: 'decision-record', artifactIds: ['not-persisted'], rationale: 'Claimed evidence.',
    }, NOW)).toThrow('unknown workflow artifact')
  })
  test('blocks managed workflow phase completion until every persisted Agent task succeeds', () => {
    const base = legacyState()
    const managed = {
      ...base,
      template: { ...base.template, id: 'feature-extension-workflow-v8' },
      templateIdentity: { ...base.templateIdentity, id: 'feature-extension-workflow-v8' },
      runtimeContract: {
        schemaVersion: 1 as const,
        migrationStatus: 'current' as const,
        phaseStates: {
          [PHASE_ID]: {
            phaseId: PHASE_ID,
            workStatus: 'ready-for-review' as const,
            eligibility: 'eligible' as const,
            blockerReasons: [],
            issues: [],
            artifactRequirements: [],
            checks: [],
            taskSnapshots: [{
              taskId: 'B1::reviewer',
              sessionId: SESSION_ID,
              phaseId: PHASE_ID,
              stateVersion: 7,
              status: 'needs_fix' as const,
              updatedAt: NOW,
              batchId: 'B1',
              workflowRole: 'reviewer' as const,
              reviewStatus: 'needs-fix' as const,
              requiredFixes: ['wire the start action'],
            }],
            evaluatedAt: NOW,
          },
        },
        audit: [],
      },
    } as WorkflowSessionState

    const evaluated = recalculateWorkflowCompletionEligibility(managed, undefined, NOW)
    expect(getWorkflowCompletionEligibility(evaluated)).toMatchObject({
      status: 'ineligible',
      reasons: ['Workflow task is not safely settled: B1::reviewer'],
    })
  })

})
