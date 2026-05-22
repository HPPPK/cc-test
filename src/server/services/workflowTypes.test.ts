import { describe, expect, test } from 'bun:test'
import {
  WORKFLOW_ARTIFACT_LIFECYCLE_STATUSES,
  WORKFLOW_ARTIFACT_POINTER_KINDS,
  WORKFLOW_COMPLETION_SUBMISSION_STATUSES,
  WORKFLOW_LIFECYCLE_STATUSES,
  WORKFLOW_PHASE_STATUSES,
  WORKFLOW_TEMPLATE_SOURCE_STATUSES,
} from './workflowTypes'
import type {
  CompletionSubmission,
  DialogueSessionWorkflowProjection,
  WorkflowArtifactPointer,
  WorkflowCompletionCheckResult,
  WorkflowCompletionResult,
  WorkflowFinalReport,
  WorkflowModelResolution,
  WorkflowPhaseRun,
  WorkflowPhaseState,
  WorkflowSessionMetadata,
  WorkflowSessionState,
  WorkflowSessionSummary,
  WorkflowTemplate,
  WorkflowTemplateRegistryDocument,
  WorkflowTransitionRecord,
  WorkflowPendingConfirmation,
} from './workflowTypes'

describe('workflow domain types', () => {
  test('exports canonical workflow state vocabularies', () => {
    expect(WORKFLOW_LIFECYCLE_STATUSES).toEqual([
      'created',
      'running',
      'pending-confirmation',
      'failed',
      'cancelled',
      'completed',
      'resumed',
      'stale-template',
      'missing-template',
    ])
    expect(WORKFLOW_PHASE_STATUSES).toEqual([
      'created',
      'running',
      'pending-confirmation',
      'failed',
      'cancelled',
      'completed',
      'resumed',
    ])
    expect(WORKFLOW_TEMPLATE_SOURCE_STATUSES).toEqual(['current', 'stale-template', 'missing-template'])
    expect(WORKFLOW_ARTIFACT_POINTER_KINDS).toEqual(['workflow-state', 'phase-artifact', 'final-report'])
    expect(WORKFLOW_COMPLETION_SUBMISSION_STATUSES).toEqual(['ready', 'blocked', 'unable'])
    expect(WORKFLOW_ARTIFACT_LIFECYCLE_STATUSES).toEqual(['pending', 'accepted', 'rejected', 'superseded'])
  })

  test('completion submissions and pending confirmations model the refreshed runtime contract', () => {
    const submission: CompletionSubmission = {
      phaseId: 'specify',
      stateVersion: 12,
      status: 'ready',
      handoff: {
        summary: 'Specification is ready for confirmation.',
        artifacts: [],
        next: 'Accept or reject the pending completion.',
      },
      rationale: 'All required artifacts were produced.',
      evidence: [
        {
          kind: 'artifact',
          label: 'Spec',
          ref: '.specify/features/004-workflow-session-mode/spec.md',
        },
      ],
    }

    const pending: WorkflowPendingConfirmation = {
      confirmationId: 'confirm-specify-1',
      phaseId: 'specify',
      fromPhaseId: 'specify',
      toPhaseId: 'plan',
      completionCheckId: 'check-specify-1',
      artifactRefs: [
        {
          kind: 'phase-artifact',
          sessionId: 'session-1',
          artifactId: 'phase-specify-ready-1',
          schemaVersion: 1,
          createdAt: '2026-05-21T00:01:00.000Z',
          updatedAt: '2026-05-21T00:01:00.000Z',
          label: 'Specify phase completion',
        },
      ],
      createdAt: '2026-05-21T00:01:00.000Z',
      status: 'pending',
      submission,
    }

    expect(submission.status).toBe('ready')
    expect(submission.stateVersion).toBe(12)
    expect(pending.submission.status).toBe('ready')
    expect(pending.status).toBe('pending')
  })

  test('dialogue sessions remain valid without workflow metadata', () => {
    const dialogue: DialogueSessionWorkflowProjection = {}

    expect('workflow' in dialogue).toBe(false)
  })

  test('workflow summaries use safe artifact pointers and visible model fallback fields', () => {
    const statePointer: WorkflowArtifactPointer = {
      kind: 'workflow-state',
      sessionId: 'session-1',
      artifactId: 'state',
      schemaVersion: 1,
      createdAt: '2026-05-20T00:00:00.000Z',
      label: 'Workflow state',
    }

    const model: WorkflowModelResolution = {
      requestedModel: 'provider-a/model-a',
      actualModel: 'provider-b/model-b',
      providerId: 'provider-b',
      source: 'main-session-default',
      fallbackApplied: true,
      fallbackReason: 'requested model unavailable',
      resolvedAt: '2026-05-20T00:01:00.000Z',
    }

    const summary: WorkflowSessionSummary = {
      mode: 'workflow',
      templateId: 'requirements-to-implementation',
      templateVersion: '1',
      templateSource: 'builtin',
      templateSnapshotId: 'snapshot-1',
      status: 'pending-confirmation',
      activePhaseId: 'technical-design',
      activePhaseIndex: 1,
      phaseCount: 5,
      pendingConfirmation: true,
      blockedReason: 'awaiting approval',
      model,
      statePointer,
    }

    expect(summary.statePointer).not.toHaveProperty('path')
    expect(summary.model?.fallbackApplied).toBe(true)
  })

  test('template, phase, transition, check, and final report states are representable', () => {
    const artifactPointer: WorkflowArtifactPointer = {
      kind: 'phase-artifact',
      sessionId: 'session-1',
      artifactId: 'requirements-output-v1',
      schemaVersion: 1,
      createdAt: '2026-05-20T00:02:00.000Z',
    }

    const pendingArtifact = {
      schemaVersion: 1,
      sessionId: 'session-1',
      phaseId: 'requirements-clarification',
      artifactId: 'requirements-output-v1',
      lifecycleStatus: 'pending',
      createdAt: '2026-05-20T00:02:00.000Z',
      updatedAt: '2026-05-20T00:02:00.000Z',
      title: 'Requirements phase completion',
      handoff: {},
      rationale: 'Ready for confirmation.',
      evidence: [],
      provenance: {
        source: 'agent',
        model: {},
        skillGuidance: [],
      },
    }

    const template: WorkflowTemplate = {
      schemaVersion: 1,
      id: 'requirements-to-implementation',
      source: 'builtin',
      version: '1',
      displayName: 'Requirements to implementation',
      description: 'Linear five-phase workflow',
      phases: [
        {
          id: 'requirements-clarification',
          label: 'Requirements clarification',
          instructions: 'Clarify requirements',
          requestedModel: null,
          skillDeclarations: [
            {
              id: 'requirements',
              source: 'template',
              guidance: 'Use requirements guidance',
              optional: false,
            },
          ],
          requiredArtifacts: [
            {
              id: 'requirements-summary',
              kind: 'markdown',
              description: 'Accepted requirements summary',
              required: true,
            },
          ],
          completionCriteria: ['requirements accepted'],
          transitionAuthority: 'user-confirmation',
          phasePrompt: {
            objective: 'Clarify and freeze requirements before design.',
            handoffInput: ['Use the user request as input.'],
            executionRules: ['Do not write implementation code.'],
            outputArtifact: {
              name: 'Requirements Brief',
              sections: ['User Goal', 'Acceptance Criteria'],
            },
            completionRules: ['Output the handoff and stop.'],
          },
        },
      ],
      registryKey: 'builtin:requirements-to-implementation',
      contentHash: 'hash-1',
    }

    const registry: WorkflowTemplateRegistryDocument = {
      schemaVersion: 1,
      templates: [template],
      extra: 'preserved',
    }

    const check: WorkflowCompletionCheckResult = {
      checkId: 'check-1',
      phaseId: 'requirements-clarification',
      status: 'passed',
      criteriaRef: 'requirements accepted',
      summary: 'Requirements accepted',
      blockedReason: null,
      artifactRefs: [artifactPointer],
      evaluatedAt: '2026-05-20T00:03:00.000Z',
      evaluator: 'user',
    }

    const phaseRun: WorkflowPhaseRun = {
      phaseId: 'requirements-clarification',
      index: 0,
      status: 'completed',
      startedAt: '2026-05-20T00:01:00.000Z',
      completedAt: '2026-05-20T00:04:00.000Z',
      instructionsProvenance: {
        templateId: template.id,
        templateVersion: template.version,
        phaseId: 'requirements-clarification',
      },
      inputArtifactRefs: [],
      outputArtifactRefs: [artifactPointer],
      completionChecks: [check],
      modelResolution: null,
      skillProvenance: template.phases[0].skillDeclarations,
      blockedReason: null,
    }

    const transition: WorkflowTransitionRecord = {
      transitionId: 'transition-1',
      fromStatus: 'running',
      toStatus: 'pending-confirmation',
      fromPhaseId: 'requirements-clarification',
      toPhaseId: 'technical-design',
      authority: 'user-confirmation',
      decision: 'approved',
      action: 'confirmed',
      result: 'accepted',
      completionCheckId: 'check-1',
      artifactRefs: [artifactPointer],
      createdAt: '2026-05-20T00:05:00.000Z',
      stateVersion: 2,
    }

    const state: WorkflowSessionState = {
      schemaVersion: 1,
      sessionId: 'session-1',
      mode: 'workflow',
      template,
      templateSnapshot: template,
      templateIdentity: {
        id: template.id,
        source: template.source,
        version: template.version,
        registryKey: template.registryKey,
        contentHash: template.contentHash,
      },
      sourceTemplateStatus: 'current',
      status: 'running',
      workflowStatus: 'running',
      activePhaseId: 'technical-design',
      phases: [
        {
          id: 'requirements-clarification',
          index: 0,
          status: 'completed',
          artifactPointers: [artifactPointer],
          completion: {
            phaseId: 'requirements-clarification',
            passed: true,
            checkedAt: '2026-05-20T00:03:00.000Z',
            criteriaType: 'manual-checklist',
            artifactPointers: [artifactPointer],
          },
        } satisfies WorkflowPhaseState,
      ],
      phaseRuns: [phaseRun],
      transitionHistory: [transition],
      artifactIndex: {
        'requirements-output-v1': pendingArtifact,
      },
      finalReportRef: null,
      stateVersion: 2,
      revision: 2,
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:05:00.000Z',
    }

    const finalCompletion: WorkflowCompletionResult = {
      phaseId: 'verification',
      passed: true,
      checkedAt: '2026-05-20T00:10:00.000Z',
      criteriaType: 'agent-reported',
      artifactPointers: [artifactPointer],
    }

    const report: WorkflowFinalReport = {
      schemaVersion: 1,
      reportId: 'final',
      sessionId: 'session-1',
      templateId: template.id,
      templateVersion: template.version,
      createdAt: '2026-05-20T00:11:00.000Z',
      phaseSummaries: [
        {
          phaseId: 'requirements-clarification',
          label: 'Requirements clarification',
          status: 'completed',
          artifactRefs: [artifactPointer],
          completion: finalCompletion,
        },
      ],
      verificationResult: {
        passed: true,
        notes: 'Verification passed',
        evidencePointers: [artifactPointer],
      },
      conversationSummary: 'Workflow completed.',
      artifactRefs: [artifactPointer],
      template: {
        id: template.id,
        version: template.version,
        source: template.source,
        snapshotId: 'snapshot-1',
      },
      status: 'completed',
      summary: 'Workflow completed.',
      phases: [
        {
          id: 'requirements-clarification',
          name: 'Requirements clarification',
          status: 'completed',
          artifactPointers: [artifactPointer],
          completion: finalCompletion,
        },
      ],
      verification: {
        passed: true,
        notes: 'Verification passed',
        evidencePointers: [artifactPointer],
      },
    }

    const metadata: WorkflowSessionMetadata = {
      mode: 'workflow',
      schemaVersion: 1,
      templateId: template.id,
      templateSource: template.source,
      templateVersion: template.version,
      templateSnapshotRef: artifactPointer,
      templateSnapshotId: 'snapshot-1',
      workflowStatus: 'completed',
      activePhaseId: null,
      stateRef: artifactPointer,
      statePointer: artifactPointer,
      reportRef: artifactPointer,
      reportPointer: artifactPointer,
      updatedAt: '2026-05-20T00:12:00.000Z',
    }

    expect(registry.templates).toHaveLength(1)
    expect(state.artifactIndex['requirements-output-v1'].lifecycleStatus).toBe('pending')
    expect(state.transitionHistory[0].result).toBe('accepted')
    expect(report.status).toBe('completed')
    expect(metadata.activePhaseId).toBeNull()
  })
})
