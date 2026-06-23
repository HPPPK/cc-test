import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  LinkedWorkflowSessionCreateRequest,
  LinkedWorkflowSessionStartErrorBody,
  LinkedWorkflowSessionStartErrorCode,
  WorkflowTemplateCreateRequest,
  WorkflowTemplateDuplicateRequest,
  WorkflowTemplateExportRequest,
  WorkflowTemplateExportResponse,
  WorkflowTemplateImportCommitRequest,
  WorkflowTemplateImportPreviewRequest,
  WorkflowTemplateImportPreviewResponse,
  WorkflowTemplateUpdateRequest,
  WorkflowTemplateValidateRequest,
  WorkflowTransitionRequest,
} from './sessions'

const { deleteMock, getMock, postMock, putMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
}))

vi.mock('./client', () => ({
  api: {
    delete: deleteMock,
    get: getMock,
    post: postMock,
    put: putMock,
  },
}))

import { sessionsApi } from './sessions'

type AssertTrue<T extends true> = T
type AssertFalse<T extends false> = T
type IsOptionalNumberField<T, K extends keyof T> = {} extends Pick<T, K>
  ? [Exclude<T[K], undefined>] extends [number]
    ? [number] extends [Exclude<T[K], undefined>]
      ? true
      : false
    : false
  : false
type StateVersionContract = 'stateVersion' extends keyof WorkflowTransitionRequest
  ? IsOptionalNumberField<WorkflowTransitionRequest, 'stateVersion'>
  : false
type ExpectedStateVersionContract = 'expectedStateVersion' extends keyof WorkflowTransitionRequest
  ? true
  : false
type WorkflowTransitionRequestContract = {
  stateVersion: AssertTrue<StateVersionContract>
  expectedStateVersion: AssertFalse<ExpectedStateVersionContract>
}
const workflowTransitionRequestContract: WorkflowTransitionRequestContract = {
  stateVersion: true,
  expectedStateVersion: false,
}

const linkedWorkflowStartErrorCodes: LinkedWorkflowSessionStartErrorCode[] = [
  'SESSION_NOT_FOUND',
  'WORKFLOW_TEMPLATE_INVALID',
  'WORKFLOW_TEMPLATE_NOT_FOUND',
  'WORKFLOW_SOURCE_INVALID',
  'WORKFLOW_SOURCE_ACTIVE',
  'WORKFLOW_LINK_DUPLICATE',
  'WORKFLOW_CONTEXT_TOO_LARGE',
  'WORKFLOW_CONTEXT_SUMMARY_UNAVAILABLE',
]

const workflowSummary = {
  mode: 'workflow',
  templateId: 'requirements-to-implementation',
  templateVersion: '1',
  templateSource: 'builtin',
  templateSnapshotId: 'snapshot-1',
  status: 'created',
  activePhaseId: 'requirements-clarification',
  activePhaseIndex: 0,
  phaseCount: 5,
  pendingConfirmation: false,
  statePointer: {
    kind: 'workflow-state',
    sessionId: 'session-workflow-1',
    artifactId: 'state',
    schemaVersion: 1,
    createdAt: '2026-05-20T00:00:00.000Z',
  },
}

const EDITABLE_TEMPLATE_FOR_EXPORT: WorkflowTemplateExportResponse['templates'][number] = {
  schemaVersion: 1,
  id: 'release-readiness',
  source: 'user',
  version: '1',
  name: 'Release Readiness',
  description: 'Coordinate release readiness.',
  editable: true,
  copyable: true,
  phases: [{
    id: 'plan',
    name: 'Plan',
    instructions: 'Prepare the release plan.',
    skills: [{
      name: 'release-checklist',
      mode: 'recommended',
      source: 'user',
    }],
  }],
}

describe('sessionsApi workflow contract', () => {
  beforeEach(() => {
    deleteMock.mockReset()
    getMock.mockReset()
    postMock.mockReset()
    putMock.mockReset()
  })

  it('lists workflow templates from the workflow template endpoint', async () => {
    const response = {
      templates: [{
        id: 'requirements-to-implementation',
        source: 'builtin',
        version: '1',
        name: 'Requirements to Implementation',
        description: 'Guide a request from requirements to verification.',
        phaseCount: 5,
        firstPhaseId: 'requirements-clarification',
      }],
      invalidTemplates: [{
        source: 'user-config',
        templateId: 'broken-template',
        path: '$.templates[0].phases',
        code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
        message: 'Template phases must be a non-empty ordered array.',
        severity: 'error',
      }],
    }
    getMock.mockResolvedValue(response)

    const result = await (sessionsApi as any).listWorkflowTemplates()

    expect(getMock).toHaveBeenCalledWith('/api/workflows/templates')
    expect(result).toBe(response)
  })

  it('retrieves chat status for source-session workflow start reconciliation', async () => {
    const response = { state: 'idle' as const }
    getMock.mockResolvedValue(response)

    const result = await sessionsApi.getChatStatus('source-session-id')

    expect(getMock).toHaveBeenCalledWith('/api/sessions/source-session-id/chat/status')
    expect(result).toBe(response)
  })

  it('retrieves workflow template detail by source and id', async () => {
    const response = {
      template: {
        schemaVersion: 1,
        id: 'requirements-to-implementation',
        source: 'builtin',
        version: '1',
        name: 'Requirements to Implementation',
        editable: false,
        copyable: true,
        phases: [{
          id: 'requirements-clarification',
          name: 'Requirements Clarification',
          instructions: 'Clarify requirements.',
          outputArtifact: {
            id: 'requirements-summary',
            name: 'Requirements Summary',
            kind: 'markdown',
            description: 'Validated requirements.',
            required: true,
          },
          completionCriteria: {
            type: 'artifact-required',
            description: 'Artifact is ready.',
          },
          transition: { authority: 'user-confirmation' },
        }],
      },
      issues: [{
        source: 'builtin',
        templateId: 'requirements-to-implementation',
        path: '$.phases[0].handoffRules',
        code: 'WORKFLOW_TEMPLATE_HANDOFF_WARNING',
        message: 'Handoff rules are recommended.',
        severity: 'warning',
      }],
    }
    getMock.mockResolvedValue(response)

    const result = await sessionsApi.getWorkflowTemplate('builtin', 'requirements-to-implementation')

    expect(getMock).toHaveBeenCalledWith('/api/workflows/templates/builtin/requirements-to-implementation')
    expect(result).toBe(response)
  })

  it('validates workflow template drafts without writing files from the desktop client', async () => {
    const request: WorkflowTemplateValidateRequest = {
      template: {
        schemaVersion: 1,
        id: 'prompt-only-template',
        version: '1',
        name: 'Prompt Only Template',
        phases: [{
          id: 'discussion',
          name: 'Discussion',
          instructions: 'Discuss the request.',
        }],
      },
    }
    const response = {
      valid: false,
      template: null,
      issues: [{
        source: 'request',
        templateId: 'prompt-only-template',
        path: '$.template.phases[0].outputArtifact',
        code: 'WORKFLOW_TEMPLATE_MISSING_OUTPUT_ARTIFACT',
        message: 'Each phase requires an output artifact contract.',
        severity: 'error',
      }],
    }
    postMock.mockResolvedValue(response)

    const result = await sessionsApi.validateWorkflowTemplate(request)

    expect(postMock).toHaveBeenCalledWith('/api/workflows/templates/validate', request)
    expect(deleteMock).not.toHaveBeenCalled()
    expect(putMock).not.toHaveBeenCalled()
    expect(result).toBe(response)
  })

  it('creates user workflow templates through the server-owned workflow template endpoint', async () => {
    const request: WorkflowTemplateCreateRequest = {
      template: {
        schemaVersion: 1,
        id: 'release-readiness',
        version: '1',
        name: 'Release Readiness',
        phases: [{
          id: 'evidence',
          name: 'Evidence',
          instructions: 'Collect release evidence.',
          outputArtifact: {
            id: 'release-evidence',
            name: 'Release Evidence',
            kind: 'markdown',
            description: 'Evidence summary.',
            required: true,
          },
          completionCriteria: {
            type: 'artifact-required',
            description: 'Release evidence is complete.',
          },
          transition: { authority: 'user-confirmation' },
        }],
      },
    }
    const response = {
      template: { id: 'release-readiness', source: 'user', version: '1', name: 'Release Readiness' },
      templates: [],
      invalidTemplates: [{
        source: 'user-config',
        templateId: 'broken-template',
        path: '$.templates[1].phases',
        code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
        message: 'Template phases must be a non-empty ordered array.',
        severity: 'error',
      }],
    }
    postMock.mockResolvedValue(response)

    const result = await sessionsApi.createWorkflowTemplate(request)

    expect(postMock).toHaveBeenCalledWith('/api/workflows/templates', request)
    expect(result).toBe(response)
  })

  it('updates user workflow templates with a route id that matches the draft id', async () => {
    const request: WorkflowTemplateUpdateRequest = {
      template: {
        schemaVersion: 1,
        id: 'release-readiness',
        version: '2',
        name: 'Release Readiness',
        phases: [],
        unknownTemplateField: 'preserve-me',
      },
    }
    const response = {
      template: { id: 'release-readiness', source: 'user', version: '2', name: 'Release Readiness' },
      templates: [],
      invalidTemplates: [],
    }
    putMock.mockResolvedValue(response)

    const result = await sessionsApi.updateWorkflowTemplate('release-readiness', request)

    expect(putMock).toHaveBeenCalledWith('/api/workflows/templates/user/release-readiness', request)
    expect(result).toBe(response)
  })

  it('deletes user workflow templates through the user-scoped delete route', async () => {
    const response = {
      ok: true,
      templates: [],
      invalidTemplates: [{
        source: 'user-config',
        templateId: 'malformed-template',
        path: '$.templates[0]',
        code: 'WORKFLOW_TEMPLATE_INVALID',
        message: 'Template is malformed.',
        severity: 'error',
      }],
    }
    deleteMock.mockResolvedValue(response)

    const result = await sessionsApi.deleteWorkflowTemplate('release-readiness')

    expect(deleteMock).toHaveBeenCalledWith('/api/workflows/templates/user/release-readiness')
    expect(result).toBe(response)
  })

  it('duplicates built-in templates into user templates instead of editing the source', async () => {
    const request: WorkflowTemplateDuplicateRequest = {
      source: 'builtin',
      id: 'agent-development',
      targetId: 'agent-development-copy',
      targetName: 'Agent Development Copy',
    }
    const response = {
      template: { id: 'agent-development-copy', source: 'user', version: '1', name: 'Agent Development Copy' },
      templates: [],
      invalidTemplates: [],
    }
    postMock.mockResolvedValue(response)

    const result = await sessionsApi.duplicateWorkflowTemplate(request)

    expect(postMock).toHaveBeenCalledWith('/api/workflows/templates/duplicate', request)
    expect(result).toBe(response)
  })

  it('previews workflow template imports without committing selections or writing files', async () => {
    const request: WorkflowTemplateImportPreviewRequest = {
      payload: {
        schemaVersion: 1,
        templates: [{
          schemaVersion: 1,
          id: 'agent-development',
          version: '1',
          name: 'Agent Development',
          phases: [],
        }],
        unknownTopLevelField: 'preserve-on-commit',
      },
    }
    const response = {
      schemaVersion: 1,
      candidates: [{
        importId: 'candidate-1',
        originalId: 'agent-development',
        proposedId: 'agent-development-imported',
        name: 'Agent Development',
        version: '1',
        phaseCount: 5,
        conflict: 'builtin-template',
        defaultResolution: 'rename',
        selectable: true,
        issues: [],
      }],
      invalidTemplates: [{
        source: 'import',
        templateId: 'broken-import',
        path: '$.templates[1].phases',
        code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
        message: 'Template phases must be a non-empty ordered array.',
        severity: 'error',
      }],
      canCommit: true,
    }
    postMock.mockResolvedValue(response)

    const result = await sessionsApi.previewWorkflowTemplateImport(request)

    expect(postMock).toHaveBeenCalledWith('/api/workflows/templates/import/preview', request)
    expect(putMock).not.toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()
    expect(result).toBe(response)
  })

  it('exposes import preview dependency diagnostics from the desktop client response type', async () => {
    const request: WorkflowTemplateImportPreviewRequest = {
      payload: {
        schemaVersion: 2,
        templates: [{
          schemaVersion: 1,
          id: 'dependency-aware-import',
          version: '1',
          name: 'Dependency Aware Import',
          phases: [],
        }],
        dependencyManifest: {
          schemaVersion: 1,
          generatedAt: '2026-05-26T00:00:00.000Z',
          dependencies: [],
        },
      },
    }
    const response: WorkflowTemplateImportPreviewResponse = {
      schemaVersion: 1,
      candidates: [{
        importId: 'candidate-dependency-aware-import',
        originalId: 'dependency-aware-import',
        proposedId: 'dependency-aware-import',
        name: 'Dependency Aware Import',
        version: '1',
        phaseCount: 1,
        conflict: 'none',
        defaultResolution: 'add',
        selectable: true,
        issues: [],
        dependencyDiagnostics: [{
          templateId: 'dependency-aware-import',
          phaseId: 'plan',
          reference: {
            name: 'release-checklist',
            mode: 'recommended',
            source: 'user',
          },
          status: 'missing',
          severity: 'warning',
          message: 'Recommended skill release-checklist is unavailable and will remain a reference.',
          canImport: true,
        }],
      }],
      invalidTemplates: [],
      canCommit: true,
    }
    postMock.mockResolvedValue(response)

    const result = await sessionsApi.previewWorkflowTemplateImport(request)

    expect(postMock).toHaveBeenCalledWith('/api/workflows/templates/import/preview', request)
    expect(result.candidates[0]?.dependencyDiagnostics?.[0]).toMatchObject({
      phaseId: 'plan',
      status: 'missing',
      severity: 'warning',
      canImport: true,
    })
  })

  it('commits selected workflow template imports with explicit rename resolutions', async () => {
    const request: WorkflowTemplateImportCommitRequest = {
      payload: {
        schemaVersion: 1,
        templates: [{
          schemaVersion: 1,
          id: 'agent-development',
          version: '1',
          name: 'Agent Development',
          phases: [],
        }],
      },
      selections: [{
        importId: 'candidate-1',
        resolution: 'rename',
        targetId: 'agent-development-imported',
      }],
    }
    const response = {
      templates: [{ id: 'agent-development-imported', source: 'user', version: '1', name: 'Agent Development' }],
      invalidTemplates: [],
      imported: [{ importId: 'candidate-1', id: 'agent-development-imported', resolution: 'rename' }],
    }
    postMock.mockResolvedValue(response)

    const result = await sessionsApi.commitWorkflowTemplateImport(request)

    expect(postMock).toHaveBeenCalledWith('/api/workflows/templates/import', request)
    expect(result).toBe(response)
  })

  it('exports selected workflow templates through a read-only export request', async () => {
    const request: WorkflowTemplateExportRequest = {
      templates: [
        { source: 'user', id: 'release-readiness' },
        { source: 'builtin', id: 'agent-development' },
      ],
      mode: 'selected',
    }
    const response = {
      schemaVersion: 1,
      exportedAt: '2026-05-26T00:00:00.000Z',
      templates: [{
        schemaVersion: 1,
        id: 'release-readiness',
        version: '1',
        name: 'Release Readiness',
        phases: [],
      }],
    }
    postMock.mockResolvedValue(response)

    const result = await sessionsApi.exportWorkflowTemplates(request)

    expect(postMock).toHaveBeenCalledWith('/api/workflows/templates/export', request)
    expect(result).toBe(response)
  })

  it('exposes export dependency manifests from the desktop client response type without skill contents', async () => {
    const request: WorkflowTemplateExportRequest = {
      templates: [{ source: 'user', id: 'release-readiness' }],
      mode: 'selected',
    }
    const response: WorkflowTemplateExportResponse = {
      schemaVersion: 2,
      exportedAt: '2026-05-26T00:00:00.000Z',
      templates: [EDITABLE_TEMPLATE_FOR_EXPORT],
      dependencyManifest: {
        schemaVersion: 1,
        generatedAt: '2026-05-26T00:00:00.000Z',
        resolverVersion: 'workflow-phase-skills-v1',
        dependencies: [{
          templateId: 'release-readiness',
          phaseId: 'plan',
          reference: {
            name: 'release-checklist',
            mode: 'recommended',
            source: 'user',
          },
          exportStatus: 'missing',
          diagnostic: 'Recommended skill release-checklist is unavailable in this workspace.',
        }],
      },
    }
    postMock.mockResolvedValue(response)

    const result = await sessionsApi.exportWorkflowTemplates(request)

    expect(postMock).toHaveBeenCalledWith('/api/workflows/templates/export', request)
    expect(result.schemaVersion).toBe(2)
    expect(result.dependencyManifest?.dependencies[0]).toMatchObject({
      templateId: 'release-readiness',
      phaseId: 'plan',
      exportStatus: 'missing',
      diagnostic: expect.stringContaining('release-checklist'),
    })
    expect(JSON.stringify(result)).not.toContain('skillContents')
  })

  it('retrieves durable workflow state for a workflow session', async () => {
    const response = {
      workflow: workflowSummary,
      state: {
        schemaVersion: 1,
        sessionId: 'session-workflow-1',
        workflowStatus: 'created',
        activePhaseId: 'requirements-clarification',
        phases: [],
        phaseRuns: [],
      },
    }
    getMock.mockResolvedValue(response)

    const result = await (sessionsApi as any).getWorkflowState('session-workflow-1')

    expect(getMock).toHaveBeenCalledWith('/api/sessions/session-workflow-1/workflow')
    expect(result).toBe(response)
  })

  it('posts idempotent workflow transition requests', async () => {
    const transition = {
      phaseId: 'requirements-clarification',
      action: 'confirm',
      transitionId: 'transition-1',
      stateVersion: 3,
    }
    const response = {
      ok: true,
      workflow: {
        ...workflowSummary,
        status: 'running',
        activePhaseId: 'technical-design',
        activePhaseIndex: 1,
      },
    }
    postMock.mockResolvedValue(response)

    const result = await (sessionsApi as any).transitionWorkflow('session-workflow-1', transition)

    expect(postMock).toHaveBeenCalledWith(
      '/api/sessions/session-workflow-1/workflow/transition',
      transition,
    )
    expect(result).toBe(response)
  })

  it('starts linked workflow sessions with explicit source-preserving context strategy', async () => {
    const request: LinkedWorkflowSessionCreateRequest = {
      workflow: {
        templateId: 'agent-development',
        templateSource: 'builtin',
        initialPhaseId: 'discussion',
      },
      contextStrategy: 'summarize',
      summaryInstructions: 'Preserve decisions and unresolved implementation constraints.',
      clientRequestId: 'ui-20260526-0001',
    }
    const response = {
      sessionId: 'new-workflow-session-id',
      workDir: 'F:\\github\\cc-jiangxia',
      workflow: {
        ...workflowSummary,
        templateId: 'agent-development',
        templateSnapshotId: 'agent-development-v1',
        activePhaseId: 'discussion',
        phaseCount: 5,
      },
      link: {
        sourceSessionId: 'source-session-id',
        targetSessionId: 'new-workflow-session-id',
        contextStrategy: 'summarize',
        summaryArtifactId: 'context-carryover',
        sourceMessageCount: 12,
        createdAt: '2026-05-26T00:00:00.000Z',
        clientRequestId: 'ui-20260526-0001',
      },
    }
    postMock.mockResolvedValue(response)

    const result = await sessionsApi.startLinkedWorkflowSession('source-session-id', request)

    expect(postMock).toHaveBeenCalledWith('/api/sessions/source-session-id/workflow/start', {
      workflow: {
        templateId: 'agent-development',
        templateSource: 'builtin',
        initialPhaseId: 'discussion',
      },
      contextStrategy: 'summarize',
      summaryInstructions: 'Preserve decisions and unresolved implementation constraints.',
      clientRequestId: 'ui-20260526-0001',
    })
    expect(result).toBe(response)
  })

  it('preserves linked workflow start contract error codes without retrying duplicate starts', async () => {
    const request: LinkedWorkflowSessionCreateRequest = {
      workflow: {
        templateId: 'agent-development',
        templateSource: 'builtin',
      },
      contextStrategy: 'inherit',
      clientRequestId: 'ui-duplicate-request',
    }
    const errorBody: LinkedWorkflowSessionStartErrorBody = {
      error: 'WORKFLOW_LINK_DUPLICATE',
      code: 'WORKFLOW_LINK_DUPLICATE',
      message: 'This workflow start request already created a target session.',
    }
    const error = Object.assign(new Error(errorBody.message), {
      name: 'ApiError',
      status: 409,
      body: errorBody,
    })
    postMock.mockRejectedValue(error)

    await expect(sessionsApi.startLinkedWorkflowSession('source-session-id', request)).rejects.toBe(error)

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith('/api/sessions/source-session-id/workflow/start', request)
    expect((error.body as LinkedWorkflowSessionStartErrorBody).code).toBe('WORKFLOW_LINK_DUPLICATE')
    expect(linkedWorkflowStartErrorCodes).toContain('WORKFLOW_CONTEXT_SUMMARY_UNAVAILABLE')
  })

  it('declares stateVersion as the canonical workflow transition request version field', () => {
    expect(workflowTransitionRequestContract).toEqual({
      stateVersion: true,
      expectedStateVersion: false,
    })
  })

  it('retrieves the final workflow report when available', async () => {
    const response = {
      report: {
        schemaVersion: 1,
        sessionId: 'session-workflow-1',
        templateId: 'requirements-to-implementation',
        summary: 'Completed workflow.',
      },
      pointer: {
        kind: 'final-report',
        sessionId: 'session-workflow-1',
        artifactId: 'final-report',
        schemaVersion: 1,
        createdAt: '2026-05-20T00:00:00.000Z',
      },
    }
    getMock.mockResolvedValue(response)

    const result = await (sessionsApi as any).getWorkflowReport('session-workflow-1')

    expect(getMock).toHaveBeenCalledWith('/api/sessions/session-workflow-1/workflow/report')
    expect(result).toBe(response)
  })

  it('serializes workflow create options when supplied', async () => {
    postMock.mockResolvedValue({ sessionId: 'session-workflow-1', workflow: workflowSummary })

    await (sessionsApi as any).create({
      workDir: '/workspace/repo',
      workflow: {
        templateId: 'requirements-to-implementation',
        templateSource: 'builtin',
        initialPhaseId: 'requirements-clarification',
      },
    })

    expect(postMock).toHaveBeenCalledWith('/api/sessions', {
      workDir: '/workspace/repo',
      workflow: {
        templateId: 'requirements-to-implementation',
        templateSource: 'builtin',
        initialPhaseId: 'requirements-clarification',
      },
    })
  })

  it('keeps dialogue create serialization unchanged when workflow is omitted', async () => {
    postMock.mockResolvedValue({ sessionId: 'session-dialogue-1', workDir: '/workspace/repo' })

    await sessionsApi.create({
      workDir: '/workspace/repo',
      repository: { branch: 'feature/rail', worktree: false },
    })

    expect(postMock).toHaveBeenCalledWith('/api/sessions', {
      workDir: '/workspace/repo',
      repository: { branch: 'feature/rail', worktree: false },
    })
  })
})
