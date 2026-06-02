import { describe, expect, test } from 'bun:test'
import { buildWorkflowFinalReport } from './workflowFinalReport.js'
import type { WorkflowSessionState } from './workflowTypes.js'

function completedState(): WorkflowSessionState {
  const now = '2026-05-20T00:02:00.000Z'
  const acceptedArtifact = {
    kind: 'phase-artifact' as const,
    sessionId: 'workflow-final-report-build-test',
    artifactId: 'discussion-ready-1',
    schemaVersion: 1,
    createdAt: '2026-05-20T00:01:00.000Z',
    updatedAt: '2026-05-20T00:02:00.000Z',
    label: 'Discussion completion',
    lifecycleStatus: 'accepted',
  }

  return {
    schemaVersion: 1,
    sessionId: 'workflow-final-report-build-test',
    mode: 'workflow',
    template: {
      id: 'agent-development',
      version: '1',
      source: 'builtin',
      snapshotId: 'agent-development-v1',
      sourceState: 'current',
    },
    templateSnapshot: {
      schemaVersion: 1,
      id: 'agent-development',
      source: 'builtin',
      version: '1',
      displayName: 'Agent Development',
      description: 'Final report builder fixture.',
      phases: [
        {
          id: 'discussion',
          label: 'Discussion',
          instructions: 'Discuss the request.',
          requestedModel: null,
          skillDeclarations: [],
          requiredArtifacts: [],
          completionCriteria: { type: 'agent-reported' },
          transitionAuthority: 'user-confirmation',
        },
      ],
    },
    templateIdentity: {
      id: 'agent-development',
      source: 'builtin',
      version: '1',
      registryKey: 'builtin:agent-development',
    },
    sourceTemplateStatus: 'current',
    status: 'completed',
    workflowStatus: 'completed',
    activePhaseId: null,
    phases: [
      {
        id: 'discussion',
        index: 0,
        status: 'completed',
        completedAt: now,
        requestedModel: 'phase-opus',
        actualModel: 'session-sonnet',
        fallbackReason: 'Requested model unavailable.',
        artifactPointers: [acceptedArtifact],
      },
    ],
    phaseRuns: [],
    transitionHistory: [],
    artifactIndex: [acceptedArtifact],
    finalReportRef: {
      kind: 'final-report',
      sessionId: 'workflow-final-report-build-test',
      artifactId: 'final',
      schemaVersion: 1,
      createdAt: now,
      label: 'Final workflow report',
    },
    finalReportPointer: {
      kind: 'final-report',
      sessionId: 'workflow-final-report-build-test',
      artifactId: 'final',
      schemaVersion: 1,
      createdAt: now,
      label: 'Final workflow report',
    },
    stateVersion: 4,
    revision: 4,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: now,
    pendingConfirmation: null,
  }
}

describe('buildWorkflowFinalReport', () => {
  test('builds the persisted final report body from completed workflow state', () => {
    const report = buildWorkflowFinalReport(completedState())

    expect(report).toMatchObject({
      schemaVersion: 1,
      reportId: 'final',
      sessionId: 'workflow-final-report-build-test',
      templateId: 'agent-development',
      templateVersion: '1',
      status: 'completed',
      conversationSummary: 'Workflow completed.',
      verificationResult: {
        passed: true,
        notes: 'Workflow completed.',
      },
    })
    expect(report.phaseSummaries).toContainEqual(expect.objectContaining({
      phaseId: 'discussion',
      label: 'Discussion',
      status: 'completed',
      completion: expect.objectContaining({
        phaseId: 'discussion',
        passed: true,
        artifactPointers: [expect.objectContaining({ artifactId: 'discussion-ready-1' })],
      }),
      model: expect.objectContaining({
        requestedModel: 'phase-opus',
        actualModel: 'session-sonnet',
        fallbackApplied: true,
      }),
    }))
    expect(report.artifactRefs).toContainEqual(expect.objectContaining({
      artifactId: 'discussion-ready-1',
    }))
  })

  test('preserves bounded recommended skill snapshots and evidence without checklist noise', () => {
    const state = completedState()
    const report = buildWorkflowFinalReport({
      ...state,
      phaseSkillSnapshots: [
        {
          phaseId: 'discussion',
          references: [
            { name: 'requirements-review', mode: 'recommended', source: 'project' },
            { name: 'missing-audit', mode: 'recommended', source: 'user' },
            { name: 'irrelevant-style', mode: 'recommended', source: 'plugin' },
          ],
          resolutions: [
            {
              reference: { name: 'requirements-review', mode: 'recommended', source: 'project' },
              status: 'available',
              checkedAt: '2026-05-20T00:00:30.000Z',
              resolvedSkill: {
                name: 'requirements-review',
                source: 'project',
              },
            },
            {
              reference: { name: 'missing-audit', mode: 'recommended', source: 'user' },
              status: 'missing',
              checkedAt: '2026-05-20T00:00:30.000Z',
              diagnostic: {
                code: 'skill-not-found',
                severity: 'warning',
                message: 'missing-audit is not installed.',
              },
            },
          ],
          snapshottedAt: '2026-05-20T00:00:30.000Z',
          templateContentHash: 'template-hash',
          resolverVersion: 'test-resolver-v1',
        },
      ],
      phaseSkillEvidence: [
        {
          phaseId: 'discussion',
          name: 'requirements-review',
          outcome: 'used',
          rationale: 'Applied ambiguity checklist to the requirements brief.',
          recordedAt: '2026-05-20T00:01:30.000Z',
          source: 'project',
          resolutionStatus: 'available',
          toolUseId: 'toolu_requirements_review',
        },
        {
          phaseId: 'discussion',
          name: 'missing-audit',
          outcome: 'relevant-unavailable',
          rationale: 'Audit was relevant but the skill was unavailable.',
          recordedAt: '2026-05-20T00:01:45.000Z',
          source: 'user',
          resolutionStatus: 'missing',
        },
      ],
    } as WorkflowSessionState)

    expect(report.recommendedSkills).toMatchObject({
      snapshots: [
        expect.objectContaining({
          phaseId: 'discussion',
          references: expect.arrayContaining([
            expect.objectContaining({ name: 'requirements-review' }),
            expect.objectContaining({ name: 'missing-audit' }),
          ]),
        }),
      ],
      evidence: [
        expect.objectContaining({
          name: 'requirements-review',
          outcome: 'used',
        }),
        expect.objectContaining({
          name: 'missing-audit',
          outcome: 'relevant-unavailable',
        }),
      ],
    })
    expect(JSON.stringify(report.recommendedSkills)).not.toContain('irrelevant-style')
    expect(JSON.stringify(report.recommendedSkills)).not.toContain('unused')
    expect(JSON.stringify(report.recommendedSkills)).not.toContain('SKILL.md')
  })
})
