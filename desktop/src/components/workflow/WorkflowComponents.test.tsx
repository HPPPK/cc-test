import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'

import {
  WorkflowReportLink,
  WorkflowStatusPanel,
  WorkflowTemplatePicker,
  WorkflowTransitionControls,
} from './WorkflowComponents'
import { WorkflowStartDialog } from './WorkflowStartDialog'
import { WorkflowTemplateEditor } from './WorkflowTemplateEditor'
import { WorkflowTemplateManager } from './WorkflowTemplateManager'
import { sessionsApi } from '../../api/sessions'
import { useSettingsStore } from '../../stores/settingsStore'
import { useSkillStore } from '../../stores/skillStore'
import { useSessionStore } from '../../stores/sessionStore'
import type { WorkflowTemplateDetail, WorkflowTemplateDraft } from '../../types/session'

vi.mock('../../api/sessions', () => ({
  sessionsApi: {
    listWorkflowTemplates: vi.fn(),
    getWorkflowTemplate: vi.fn(),
    validateWorkflowTemplate: vi.fn(),
    createWorkflowTemplate: vi.fn(),
    updateWorkflowTemplate: vi.fn(),
    deleteWorkflowTemplate: vi.fn(),
    duplicateWorkflowTemplate: vi.fn(),
    previewWorkflowTemplateImport: vi.fn(),
    commitWorkflowTemplateImport: vi.fn(),
    exportWorkflowTemplates: vi.fn(),
  },
}))

useSettingsStore.setState({ locale: 'en' })

type WorkflowArtifactPointer = {
  id: string
  kind: 'state' | 'report' | 'artifact'
  label: string
  uri: string
}

type WorkflowTemplateListItem = {
  id: string
  source: 'builtin' | 'user'
  version: string
  name: string
  description?: string
  phaseCount: number
  firstPhaseId: string
  phaseNames?: string[]
  startable?: boolean
  editable?: boolean
  copyable?: boolean
}

type WorkflowModelResolution = {
  requested: string
  actual: string
  providerId?: string
  source?: 'phase-request' | 'main-session-default' | 'none'
  fallbackApplied?: boolean
  fallbackReason?: string
  resolvedAt?: string
}

type WorkflowPhaseArtifact = {
  artifactId: string
  phaseId: string
  status: 'pending' | 'accepted' | 'rejected' | 'superseded'
  label: string
  handoffSummary: string
  evidenceSummary: string
  createdAt: string
  updatedAt?: string
  transitionId?: string
  completionId?: string
  provenance: 'agent-ready' | 'user-confirmation' | 'manual-complete'
}

type WorkflowSessionSummary = {
  mode: 'workflow'
  templateId: string
  templateVersion: string
  templateSource: 'builtin' | 'user'
  templateSnapshotId: string
  status:
    | 'created'
    | 'running'
    | 'pending-confirmation'
    | 'failed'
    | 'cancelled'
    | 'completed'
    | 'resumed'
    | 'stale-template'
    | 'missing-template'
  activePhaseId: string | null
  activePhaseIndex: number
  phaseCount: number
  pendingConfirmation: boolean
  blockedReason?: string
  model?: WorkflowModelResolution
  statePointer: WorkflowArtifactPointer
  reportPointer?: WorkflowArtifactPointer
  phaseNames?: string[]
  transitionAuthority?: 'auto' | 'user-confirmation'
}

const BUILTIN_TEMPLATE: WorkflowTemplateListItem = {
  id: 'agent-development',
  source: 'builtin',
  version: '1',
  name: 'Agent Development',
  description: 'Discussion to implementation workflow.',
  phaseCount: 5,
  firstPhaseId: 'discussion',
  phaseNames: [
    'Discussion',
    'Specify',
    'Plan',
    'Tasks',
    'Implement',
  ],
}

const LONG_TEMPLATE: WorkflowTemplateListItem = {
  id: 'long-linear-workflow',
  source: 'user',
  version: '2026.05.21',
  name: 'Long Linear Workflow',
  description: 'A valid linear template with more than five phases.',
  phaseCount: 7,
  firstPhaseId: 'discover',
  phaseNames: [
    'Discover',
    'Shape',
    'Specify',
    'Plan',
    'Build',
    'Validate',
    'Release',
  ],
}

const EDITABLE_TEMPLATE_DETAIL: WorkflowTemplateDetail = {
  schemaVersion: 1,
  id: 'release-workflow',
  source: 'user',
  version: '1',
  name: 'Release Workflow',
  description: 'Coordinate release readiness.',
  editable: true,
  copyable: true,
  phases: [
    {
      id: 'plan',
      name: 'Plan',
      role: 'release coordinator',
      instructions: 'Prepare the release plan.',
      objective: 'Confirm release scope.',
      requiredIntake: ['Release issue'],
      handoffRules: ['Summarize release risks for validation.'],
      executionRules: ['Do not publish without approval.'],
      outputArtifact: {
        id: 'release-plan',
        name: 'Release plan',
        kind: 'markdown',
        description: 'Plan, risks, and rollout notes.',
        required: true,
      },
      completionCriteria: {
        type: 'artifact-required',
        description: 'Release plan artifact is ready.',
      },
      transition: {
        authority: 'user-confirmation',
      },
      requestedModel: 'anthropic:claude-sonnet-4',
      skills: [
        {
          name: 'release-checklist',
          reason: 'Verify release readiness.',
        },
      ],
    },
  ],
}

const WORKFLOW_SUMMARY: WorkflowSessionSummary = {
  mode: 'workflow',
  templateId: BUILTIN_TEMPLATE.id,
  templateVersion: BUILTIN_TEMPLATE.version,
  templateSource: 'builtin',
  templateSnapshotId: 'snapshot-001',
  status: 'running',
  activePhaseId: 'specify',
  activePhaseIndex: 1,
  phaseCount: 5,
  pendingConfirmation: false,
  model: {
    requested: 'anthropic:claude-opus-4',
    actual: 'anthropic:claude-sonnet-4',
    providerId: 'anthropic',
    source: 'phase-request',
    fallbackApplied: true,
    fallbackReason: 'Requested phase model is unavailable; using the current session default.',
    resolvedAt: '2026-05-20T00:05:00.000Z',
  },
  statePointer: {
    id: 'state-001',
    kind: 'state',
    label: 'Workflow state',
    uri: 'workflow-sessions/session-001/state.json',
  },
  phaseNames: BUILTIN_TEMPLATE.phaseNames,
  transitionAuthority: 'auto',
}

const EDITABLE_TEMPLATE_PHASE = EDITABLE_TEMPLATE_DETAIL.phases[0]!

const PENDING_ARTIFACT: WorkflowPhaseArtifact = {
  artifactId: 'artifact-plan-pending',
  phaseId: 'plan',
  status: 'pending',
  label: 'Plan handoff',
  handoffSummary: 'Plan is ready for user confirmation.',
  evidenceSummary: 'Validated requirements, risk notes, and next phase checklist.',
  createdAt: '2026-05-20T00:06:00.000Z',
  transitionId: 'transition-pending-001',
  completionId: 'completion-plan-001',
  provenance: 'agent-ready',
}

const ARTIFACT_HISTORY: WorkflowPhaseArtifact[] = [
  PENDING_ARTIFACT,
  {
    artifactId: 'artifact-specify-accepted',
    phaseId: 'specify',
    status: 'accepted',
    label: 'Specify handoff',
    handoffSummary: 'Specification accepted for planning.',
    evidenceSummary: 'Checklist passed with no unresolved critical gaps.',
    createdAt: '2026-05-20T00:01:00.000Z',
    updatedAt: '2026-05-20T00:02:00.000Z',
    transitionId: 'transition-accepted-001',
    completionId: 'completion-specify-001',
    provenance: 'user-confirmation',
  },
  {
    artifactId: 'artifact-plan-rejected',
    phaseId: 'plan',
    status: 'rejected',
    label: 'Rejected plan handoff',
    handoffSummary: 'Earlier plan omitted rollback evidence.',
    evidenceSummary: 'User rejected the handoff before retry.',
    createdAt: '2026-05-20T00:03:00.000Z',
    updatedAt: '2026-05-20T00:04:00.000Z',
    transitionId: 'transition-rejected-001',
    completionId: 'completion-plan-previous',
    provenance: 'user-confirmation',
  },
  {
    artifactId: 'artifact-plan-superseded',
    phaseId: 'plan',
    status: 'superseded',
    label: 'Superseded plan handoff',
    handoffSummary: 'Retry replaced this older plan artifact.',
    evidenceSummary: 'Kept for audit after a newer submission arrived.',
    createdAt: '2026-05-20T00:04:00.000Z',
    updatedAt: '2026-05-20T00:05:00.000Z',
    transitionId: 'transition-superseded-001',
    completionId: 'completion-plan-superseded',
    provenance: 'agent-ready',
  },
]

const BLOCKED_ARTIFACT = {
  artifactId: 'artifact-plan-blocked',
  phaseId: 'plan',
  status: 'blocked',
  label: 'Plan blocked',
  handoffSummary: 'Plan phase is blocked until the user selects an OAuth account.',
  evidenceSummary: 'OAuth account selection is missing; no provider-owned artifact can be produced.',
  createdAt: '2026-05-20T00:07:00.000Z',
  transitionId: 'transition-blocked-001',
  completionId: 'completion-plan-blocked',
  provenance: 'agent-blocked',
} as const

const UNABLE_ARTIFACT = {
  artifactId: 'artifact-plan-unable',
  phaseId: 'plan',
  status: 'unable',
  label: 'Plan unable',
  handoffSummary: 'Plan phase cannot continue because implementation notes are unavailable.',
  evidenceSummary: 'Implementation notes could not be read from the referenced workflow artifact.',
  createdAt: '2026-05-20T00:08:00.000Z',
  transitionId: 'transition-unable-001',
  completionId: 'completion-plan-unable',
  provenance: 'agent-unable',
} as const

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useSettingsStore.setState({ locale: 'en' })
  useSessionStore.setState({
    sessions: [],
    activeSessionId: null,
  })
  useSkillStore.setState({
    skills: [],
    selectedSkill: null,
    selectedSkillReturnTab: 'skills',
    isLoading: false,
    isDetailLoading: false,
    error: null,
  })
})

describe('WorkflowTemplateManager', () => {
  it('loads server templates and renders builtin templates as read-only and copyable', async () => {
    const onCopyTemplate = vi.fn()
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({
      templates: [
        {
          ...BUILTIN_TEMPLATE,
          startable: true,
          editable: false,
          copyable: true,
        },
      ],
      invalidTemplates: [],
    })

    render(<WorkflowTemplateManager onCopyTemplate={onCopyTemplate} />)

    const manager = await screen.findByTestId('workflow-template-manager')
    const row = within(manager).getByTestId('workflow-template-row-builtin-agent-development')
    expect(sessionsApi.listWorkflowTemplates).toHaveBeenCalledTimes(1)
    expect(within(row).getByText('Agent Development')).toBeInTheDocument()
    expect(within(row).getByText('Builtin')).toBeInTheDocument()
    expect(within(row).getByText('agent-development')).toBeInTheDocument()
    expect(row).toHaveTextContent(/Version\s*1/i)
    expect(within(row).getByText(/5 phases/i)).toBeInTheDocument()
    expect(within(row).getByText(/startable/i)).toBeInTheDocument()
    expect(within(row).getByText(/read-only/i)).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()

    vi.mocked(sessionsApi.duplicateWorkflowTemplate).mockResolvedValue({
      template: {
        ...EDITABLE_TEMPLATE_DETAIL,
        id: 'agent-development-copy',
        name: 'Agent Development Copy',
      },
      templates: [
        {
          ...BUILTIN_TEMPLATE,
          startable: true,
          editable: false,
          copyable: true,
        },
        {
          id: 'agent-development-copy',
          source: 'user',
          version: '1',
          name: 'Agent Development Copy',
          phaseCount: 1,
          firstPhaseId: 'plan',
          editable: true,
          copyable: true,
        },
      ],
      invalidTemplates: [],
    })

    fireEvent.click(within(row).getByRole('button', { name: /copy agent development/i }))

    await waitFor(() => {
      expect(sessionsApi.duplicateWorkflowTemplate).toHaveBeenCalledWith({
        source: 'builtin',
        id: 'agent-development',
        targetId: 'agent-development-copy',
        targetName: 'Agent Development Copy',
      })
    })
    expect(await screen.findByText('Agent Development Copy')).toBeInTheDocument()
    expect(onCopyTemplate).toHaveBeenCalledWith(expect.objectContaining({
      id: 'agent-development',
      source: 'builtin',
    }))
  })

  it('localizes builtin template display and editor labels in Chinese locale', async () => {
    useSettingsStore.setState({ locale: 'zh' })
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({
      templates: [
        {
          ...BUILTIN_TEMPLATE,
          startable: true,
          editable: false,
          copyable: true,
        },
      ],
      invalidTemplates: [],
    })

    render(<WorkflowTemplateManager />)

    const row = await screen.findByTestId('workflow-template-row-builtin-agent-development')
    expect(within(row).getByText('智能体开发')).toBeInTheDocument()
    expect(within(row).getByText('内置')).toBeInTheDocument()
    expect(within(row).getByText('从讨论到实现的工作流。')).toBeInTheDocument()
    expect(within(row).queryByText('Agent Development')).not.toBeInTheDocument()
    expect(within(row).queryByText('builtin')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /新建/ }))

    const editor = await screen.findByTestId('workflow-template-editor')
    expect(within(editor).getByLabelText(/^模板 ID$/)).toBeInTheDocument()
    expect(within(editor).getByLabelText(/^模板名称$/)).toBeInTheDocument()
    expect(within(editor).getByLabelText(/^阶段 ID$/)).toBeInTheDocument()
    expect(within(editor).getByLabelText(/^阶段名称$/)).toBeInTheDocument()
    expect(within(editor).getByLabelText(/^指令$/)).toBeInTheDocument()
    expect(within(editor).getByRole('button', { name: /高级字段/ })).toBeInTheDocument()
  })

  it('keeps invalid templates visible with actionable diagnostics', async () => {
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({
      templates: [
        {
          ...BUILTIN_TEMPLATE,
          startable: true,
          editable: false,
          copyable: true,
        },
      ],
      invalidTemplates: [
        {
          source: 'user-config',
          templateId: 'broken-template',
          path: '$.templates[0].phases',
          code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
          message: 'Template phases must be a non-empty ordered array.',
          severity: 'error',
        },
      ],
    })

    render(<WorkflowTemplateManager />)

    const diagnostics = await screen.findByTestId('workflow-template-diagnostics')
    expect(within(diagnostics).getByText(/invalid workflow templates/i)).toBeInTheDocument()
    expect(within(diagnostics).getByText(/broken-template/i)).toBeInTheDocument()
    expect(within(diagnostics).getByText(/workflow_template_invalid_phases/i)).toBeInTheDocument()
    expect(within(diagnostics).getByText(/\$\.templates\[0\]\.phases/i)).toBeInTheDocument()
    expect(within(diagnostics).getByText(/template phases must be a non-empty ordered array/i)).toBeInTheDocument()
    expect(within(diagnostics).getByText(/fix the template JSON, then refresh this list/i)).toBeInTheDocument()
    expect(screen.getByTestId('workflow-template-row-builtin-agent-development')).toBeInTheDocument()
  })

  it('renders user template edit delete export affordances without mutating storage directly', async () => {
    const onDeleteTemplate = vi.fn()
    const onExportTemplate = vi.fn()
    const onCopyTemplate = vi.fn()
    vi.mocked(sessionsApi.deleteWorkflowTemplate).mockResolvedValue({
      ok: true,
      templates: [],
      invalidTemplates: [],
    })
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({
      templates: [
        {
          ...LONG_TEMPLATE,
          startable: false,
          editable: true,
          copyable: true,
        },
      ],
      invalidTemplates: [],
    })

    render(
      <WorkflowTemplateManager
        onCopyTemplate={onCopyTemplate}
        onDeleteTemplate={onDeleteTemplate}
        onExportTemplate={onExportTemplate}
      />,
    )

    const row = await screen.findByTestId('workflow-template-row-user-long-linear-workflow')
    expect(within(row).getByText('User')).toBeInTheDocument()
    expect(within(row).getByText(/not startable/i)).toBeInTheDocument()

    fireEvent.click(within(row).getByRole('button', { name: /delete long linear workflow/i }))

    await waitFor(() => {
      expect(sessionsApi.deleteWorkflowTemplate).toHaveBeenCalledWith('long-linear-workflow')
    })
    expect(onDeleteTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 'long-linear-workflow', source: 'user' }))
    expect(screen.queryByTestId('workflow-template-row-user-long-linear-workflow')).not.toBeInTheDocument()

    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({
      templates: [
        {
          ...LONG_TEMPLATE,
          startable: false,
          editable: true,
          copyable: true,
        },
      ],
      invalidTemplates: [],
    })
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    const refreshedRow = await screen.findByTestId('workflow-template-row-user-long-linear-workflow')
    fireEvent.click(within(refreshedRow).getByRole('button', { name: /export long linear workflow/i }))

    expect(onExportTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 'long-linear-workflow', source: 'user' }))
    expect(onCopyTemplate).not.toHaveBeenCalled()
    expect(sessionsApi.listWorkflowTemplates).toHaveBeenCalledTimes(2)
  })

  it('loads user template detail for editing and refreshes after a server-backed update', async () => {
    vi.mocked(sessionsApi.listWorkflowTemplates)
      .mockResolvedValueOnce({
        templates: [
          {
            id: EDITABLE_TEMPLATE_DETAIL.id,
            source: 'user',
            version: '1',
            name: EDITABLE_TEMPLATE_DETAIL.name,
            description: EDITABLE_TEMPLATE_DETAIL.description,
            phaseCount: 1,
            firstPhaseId: 'plan',
            editable: true,
            copyable: true,
          },
        ],
        invalidTemplates: [],
      })
      .mockResolvedValueOnce({
        templates: [
          {
            id: EDITABLE_TEMPLATE_DETAIL.id,
            source: 'user',
            version: '2',
            name: 'Release Workflow Updated',
            description: EDITABLE_TEMPLATE_DETAIL.description,
            phaseCount: 1,
            firstPhaseId: 'plan',
            editable: true,
            copyable: true,
          },
        ],
        invalidTemplates: [],
      })
    vi.mocked(sessionsApi.getWorkflowTemplate).mockResolvedValue({
      template: EDITABLE_TEMPLATE_DETAIL,
    })
    vi.mocked(sessionsApi.validateWorkflowTemplate).mockResolvedValue({
      valid: true,
      template: {
        ...EDITABLE_TEMPLATE_DETAIL,
        name: 'Release Workflow Updated',
      },
      issues: [],
    })
    vi.mocked(sessionsApi.updateWorkflowTemplate).mockResolvedValue({
      template: {
        ...EDITABLE_TEMPLATE_DETAIL,
        version: '2',
        name: 'Release Workflow Updated',
      },
      templates: [],
      invalidTemplates: [],
    })

    render(<WorkflowTemplateManager />)

    const row = await screen.findByTestId('workflow-template-row-user-release-workflow')
    fireEvent.click(within(row).getByRole('button', { name: /edit release workflow/i }))

    expect(await screen.findByTestId('workflow-template-editor')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^Template name$/i), {
      target: { value: 'Release Workflow Updated' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(sessionsApi.validateWorkflowTemplate).toHaveBeenCalledWith({
        template: expect.objectContaining({
          id: EDITABLE_TEMPLATE_DETAIL.id,
          name: 'Release Workflow Updated',
        }),
      })
      expect(sessionsApi.updateWorkflowTemplate).toHaveBeenCalledWith(
        EDITABLE_TEMPLATE_DETAIL.id,
        {
          template: expect.objectContaining({
            name: 'Release Workflow Updated',
          }),
        },
      )
    })
    expect(await screen.findByText('Release Workflow Updated')).toBeInTheDocument()
    expect(sessionsApi.listWorkflowTemplates).toHaveBeenCalledTimes(2)
  })

  it('previews imports without writing and commits selected rename resolutions', async () => {
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({
      templates: [
        {
          ...BUILTIN_TEMPLATE,
          startable: true,
          editable: false,
          copyable: true,
        },
        {
          ...LONG_TEMPLATE,
          startable: true,
          editable: true,
          copyable: true,
        },
      ],
      invalidTemplates: [],
    })
    vi.mocked(sessionsApi.previewWorkflowTemplateImport).mockResolvedValue({
      schemaVersion: 1,
      canCommit: true,
      candidates: [
        {
          importId: 'candidate-built-in',
          originalId: 'agent-development',
          proposedId: 'agent-development-imported',
          name: 'Agent Development',
          version: '1',
          phaseCount: 5,
          conflict: 'builtin-template',
          defaultResolution: 'rename',
          selectable: true,
          issues: [],
        },
        {
          importId: 'candidate-user',
          originalId: 'long-linear-workflow',
          proposedId: 'long-linear-workflow-imported',
          name: 'Long Linear Workflow',
          version: '2026.05.21',
          phaseCount: 7,
          conflict: 'user-template',
          defaultResolution: 'rename',
          selectable: true,
          issues: [
            {
              source: 'import',
              templateId: 'long-linear-workflow',
              path: '$.templates[1].id',
              code: 'WORKFLOW_TEMPLATE_CONFLICT',
              message: 'A user template already uses this id.',
              severity: 'warning',
            },
          ],
        },
        {
          importId: 'candidate-invalid',
          originalId: 'broken-template',
          proposedId: 'broken-template',
          name: 'Broken Template',
          version: '1',
          phaseCount: 0,
          conflict: 'none',
          defaultResolution: 'add',
          selectable: false,
          issues: [
            {
              source: 'import',
              templateId: 'broken-template',
              path: '$.templates[2].phases',
              code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
              message: 'Template phases must be a non-empty ordered array.',
              severity: 'error',
            },
          ],
        },
      ],
      invalidTemplates: [
        {
          source: 'import',
          templateId: 'malformed-template',
          path: '$.templates[3]',
          code: 'WORKFLOW_TEMPLATE_INVALID',
          message: 'Template is malformed.',
          severity: 'error',
        },
      ],
    })
    vi.mocked(sessionsApi.commitWorkflowTemplateImport).mockResolvedValue({
      imported: [
        {
          importId: 'candidate-built-in',
          id: 'agent-development-imported',
          resolution: 'rename',
        },
      ],
      templates: [
        {
          id: 'agent-development-imported',
          source: 'user',
          version: '1',
          name: 'Agent Development',
          phaseCount: 5,
          firstPhaseId: 'discussion',
          editable: true,
          copyable: true,
        },
      ],
      invalidTemplates: [],
    })
    const payload = {
      schemaVersion: 1,
      templates: [
        {
          schemaVersion: 1,
          id: 'agent-development',
          version: '1',
          name: 'Agent Development',
          phases: [],
        },
      ],
    } as const

    render(<WorkflowTemplateManager />)

    await screen.findByTestId('workflow-template-manager')
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))
    const dialog = screen.getByRole('dialog', { name: /import workflow templates/i })
    fireEvent.change(within(dialog).getByLabelText(/import json/i), {
      target: { value: JSON.stringify(payload) },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /preview import/i }))

    const preview = await screen.findByTestId('workflow-import-preview')
    expect(sessionsApi.previewWorkflowTemplateImport).toHaveBeenCalledWith({ payload })
    expect(sessionsApi.commitWorkflowTemplateImport).not.toHaveBeenCalled()
    expect(within(preview).getByText(/3 candidates/i)).toBeInTheDocument()
    expect(within(preview).getByText(/1 invalid/i)).toBeInTheDocument()
    expect(within(preview).getByText(/malformed-template/i)).toBeInTheDocument()

    const builtinCandidate = within(preview).getByTestId('workflow-import-candidate-candidate-built-in')
    const builtinResolution = builtinCandidate.querySelector('select')
    expect(builtinResolution).not.toBeNull()
    expect(builtinResolution).toHaveValue('rename')
    expect(within(builtinResolution as HTMLSelectElement).queryByRole('option', { name: 'overwrite' })).not.toBeInTheDocument()
    expect(within(builtinCandidate).getByLabelText(/target id/i)).toHaveValue('agent-development-imported')

    const userCandidate = within(preview).getByTestId('workflow-import-candidate-candidate-user')
    expect(userCandidate.querySelector('select')).toHaveValue('rename')
    expect(within(userCandidate).getByText(/workflow_template_conflict/i)).toBeInTheDocument()

    const invalidCandidate = within(preview).getByTestId('workflow-import-candidate-candidate-invalid')
    expect(within(invalidCandidate).getByRole('checkbox')).toBeDisabled()
    expect(within(invalidCandidate).getByText(/not selectable/i)).toBeInTheDocument()

    fireEvent.click(within(userCandidate).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: /import selected/i }))

    await waitFor(() => {
      expect(sessionsApi.commitWorkflowTemplateImport).toHaveBeenCalledWith({
        payload,
        selections: [
          {
            importId: 'candidate-built-in',
            resolution: 'rename',
            targetId: 'agent-development-imported',
          },
        ],
      })
    })
    expect(await screen.findByText(/imported 1 workflow templates/i)).toBeInTheDocument()
    expect(await screen.findByTestId('workflow-template-row-user-agent-development-imported')).toBeInTheDocument()
  })

  it('renders missing recommended skill diagnostics as import warnings without blocking selection', async () => {
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({
      templates: [],
      invalidTemplates: [],
    })
    vi.mocked(sessionsApi.previewWorkflowTemplateImport).mockResolvedValue({
      schemaVersion: 1,
      canCommit: true,
      candidates: [
        {
          importId: 'candidate-missing-recommended-skill',
          originalId: 'dependency-aware-workflow',
          proposedId: 'dependency-aware-workflow',
          name: 'Dependency Aware Workflow',
          version: '1',
          phaseCount: 1,
          conflict: 'none',
          defaultResolution: 'add',
          selectable: true,
          issues: [],
          dependencyDiagnostics: [
            {
              templateId: 'dependency-aware-workflow',
              phaseId: 'plan',
              reference: {
                name: 'release-checklist',
                mode: 'recommended',
                source: 'user',
              },
              status: 'missing',
              severity: 'warning',
              message: 'Recommended skill release-checklist is missing in this workspace.',
              canImport: true,
            },
          ],
        },
      ],
      invalidTemplates: [],
    })
    const payload = {
      schemaVersion: 2,
      exportedAt: '2026-05-26T00:00:00.000Z',
      templates: [
        {
          schemaVersion: 1,
          id: 'dependency-aware-workflow',
          version: '1',
          name: 'Dependency Aware Workflow',
          phases: [],
        },
      ],
      dependencyManifest: {
        schemaVersion: 1,
        generatedAt: '2026-05-26T00:00:00.000Z',
        dependencies: [
          {
            templateId: 'dependency-aware-workflow',
            phaseId: 'plan',
            reference: {
              name: 'release-checklist',
              mode: 'recommended',
              source: 'user',
            },
            exportStatus: 'missing',
            diagnostic: 'Recommended skill release-checklist is missing in this workspace.',
          },
        ],
      },
    } as const

    render(<WorkflowTemplateManager />)

    await screen.findByTestId('workflow-template-manager')
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))
    const dialog = screen.getByRole('dialog', { name: /import workflow templates/i })
    fireEvent.change(within(dialog).getByLabelText(/import json/i), {
      target: { value: JSON.stringify(payload) },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /preview import/i }))

    const candidate = await screen.findByTestId('workflow-import-candidate-candidate-missing-recommended-skill')
    expect(within(candidate).getByText(/dependency diagnostics/i)).toBeInTheDocument()
    expect(within(candidate).getByText(/warning/i)).toBeInTheDocument()
    expect(within(candidate).getByText(/release-checklist/i)).toBeInTheDocument()
    expect(within(candidate).getByRole('checkbox')).toBeEnabled()
    expect(within(candidate).getByRole('checkbox')).toBeChecked()
    expect(within(dialog).getByRole('button', { name: /import selected/i })).toBeEnabled()
    expect(within(candidate).queryByText(/bundled skill contents/i)).not.toBeInTheDocument()
    expect(within(candidate).queryByText(/auto-exec/i)).not.toBeInTheDocument()
  })

  it('renders invalid dependency diagnostics as import errors and keeps the candidate unselectable', async () => {
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({
      templates: [],
      invalidTemplates: [],
    })
    vi.mocked(sessionsApi.previewWorkflowTemplateImport).mockResolvedValue({
      schemaVersion: 1,
      canCommit: false,
      candidates: [
        {
          importId: 'candidate-invalid-dependency',
          originalId: 'invalid-dependency-workflow',
          proposedId: 'invalid-dependency-workflow',
          name: 'Invalid Dependency Workflow',
          version: '1',
          phaseCount: 1,
          conflict: 'none',
          defaultResolution: 'add',
          selectable: false,
          issues: [],
          dependencyDiagnostics: [
            {
              templateId: 'invalid-dependency-workflow',
              phaseId: 'plan',
              reference: {
                name: '',
                mode: 'recommended',
                source: 'unknown',
              },
              status: 'invalid-reference',
              severity: 'error',
              message: 'Skill references require a non-empty name.',
              canImport: false,
            },
          ],
        },
      ],
      invalidTemplates: [],
    })
    const payload = {
      schemaVersion: 2,
      exportedAt: '2026-05-26T00:00:00.000Z',
      templates: [
        {
          schemaVersion: 1,
          id: 'invalid-dependency-workflow',
          version: '1',
          name: 'Invalid Dependency Workflow',
          phases: [],
        },
      ],
      dependencyManifest: {
        schemaVersion: 1,
        generatedAt: '2026-05-26T00:00:00.000Z',
        dependencies: [
          {
            templateId: 'invalid-dependency-workflow',
            phaseId: 'plan',
            reference: { name: '', mode: 'recommended', source: 'unknown' },
            exportStatus: 'invalid-reference',
            diagnostic: 'Skill references require a non-empty name.',
          },
        ],
      },
    } as const

    render(<WorkflowTemplateManager />)

    await screen.findByTestId('workflow-template-manager')
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))
    const dialog = screen.getByRole('dialog', { name: /import workflow templates/i })
    fireEvent.change(within(dialog).getByLabelText(/import json/i), {
      target: { value: JSON.stringify(payload) },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /preview import/i }))

    const candidate = await screen.findByTestId('workflow-import-candidate-candidate-invalid-dependency')
    expect(within(candidate).getByText(/dependency diagnostics/i)).toBeInTheDocument()
    expect(within(candidate).getByText(/error/i)).toBeInTheDocument()
    expect(within(candidate).getByText(/skill references require a non-empty name/i)).toBeInTheDocument()
    expect(within(candidate).getByRole('checkbox')).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: /import selected/i })).toBeDisabled()
  })

  it('exports only selected templates through the desktop API and renders reusable JSON', async () => {
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({
      templates: [
        {
          ...BUILTIN_TEMPLATE,
          startable: true,
          editable: false,
          copyable: true,
        },
        {
          ...LONG_TEMPLATE,
          startable: true,
          editable: true,
          copyable: true,
        },
      ],
      invalidTemplates: [],
    })
    vi.mocked(sessionsApi.exportWorkflowTemplates).mockResolvedValue({
      schemaVersion: 1,
      exportedAt: '2026-05-26T00:00:00.000Z',
      templates: [EDITABLE_TEMPLATE_DETAIL],
    })

    render(<WorkflowTemplateManager />)

    const row = await screen.findByTestId('workflow-template-row-user-long-linear-workflow')
    fireEvent.click(within(row).getByRole('button', { name: /export long linear workflow/i }))

    const dialog = screen.getByRole('dialog', { name: /export workflow templates/i })
    expect(within(dialog).getByText(/excludes chat transcripts/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Agent Development/i)).not.toBeChecked()
    expect(within(dialog).getByLabelText(/Long Linear Workflow/i)).toBeChecked()

    fireEvent.click(within(dialog).getByRole('button', { name: /generate export json/i }))

    await waitFor(() => {
      expect(sessionsApi.exportWorkflowTemplates).toHaveBeenCalledWith({
        mode: 'selected',
        templates: [
          {
            source: 'user',
            id: 'long-linear-workflow',
          },
        ],
      })
    })
    expect(await screen.findByText(/exported 1 workflow templates/i)).toBeInTheDocument()
    const exportJson = within(dialog).getByLabelText(/export json/i) as HTMLTextAreaElement
    expect(exportJson.value).toContain('"templates"')
    expect(exportJson.value).not.toContain('oauth')
  })

  it('renders export dependency manifest diagnostics before users reuse the exported JSON', async () => {
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({
      templates: [
        {
          ...LONG_TEMPLATE,
          startable: true,
          editable: true,
          copyable: true,
        },
      ],
      invalidTemplates: [],
    })
    vi.mocked(sessionsApi.exportWorkflowTemplates).mockResolvedValue({
      schemaVersion: 2,
      exportedAt: '2026-05-26T00:00:00.000Z',
      templates: [EDITABLE_TEMPLATE_DETAIL],
      dependencyManifest: {
        schemaVersion: 1,
        generatedAt: '2026-05-26T00:00:00.000Z',
        resolverVersion: 'workflow-phase-skills-v1',
        dependencies: [
          {
            templateId: EDITABLE_TEMPLATE_DETAIL.id,
            phaseId: 'plan',
            reference: {
              name: 'release-checklist',
              mode: 'recommended',
              source: 'user',
            },
            exportStatus: 'missing',
            diagnostic: 'Recommended skill release-checklist is missing in this workspace.',
          },
          {
            templateId: EDITABLE_TEMPLATE_DETAIL.id,
            phaseId: 'plan',
            reference: {
              name: 'plugin-release-gate',
              mode: 'recommended',
              source: 'plugin',
              pluginName: 'release-tools',
            },
            exportStatus: 'plugin-disabled',
            resolvedSource: 'plugin',
            pluginName: 'release-tools',
            diagnostic: 'Plugin release-tools is disabled; this remains a recommended skill reference only.',
          },
        ],
      },
    })

    render(<WorkflowTemplateManager />)

    const row = await screen.findByTestId('workflow-template-row-user-long-linear-workflow')
    fireEvent.click(within(row).getByRole('button', { name: /export long linear workflow/i }))
    const dialog = screen.getByRole('dialog', { name: /export workflow templates/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /generate export json/i }))

    expect(await within(dialog).findByText(/export dependency diagnostics/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/release-checklist/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/plugin-disabled/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/recommended skill reference only/i)).toBeInTheDocument()
    expect(within(dialog).queryByText(/bundled skill contents/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/auto-exec/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/default gates/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/plugin-primary/i)).not.toBeInTheDocument()
    const exportJson = within(dialog).getByLabelText(/export json/i) as HTMLTextAreaElement
    expect(exportJson.value).not.toContain('skillContents')
  })
})

describe('WorkflowTemplateEditor', () => {
  const EDITABLE_TEMPLATE: WorkflowTemplateDraft = EDITABLE_TEMPLATE_DETAIL

  it('lets authors select recommended skills per phase from the shared skill catalog', () => {
    const onSave = vi.fn()
    const fetchCatalog = vi.fn()
    const fetchSkillDetail = vi.fn()
    const clearSelection = vi.fn()
    useSessionStore.setState({
      sessions: [{
        id: 'session-1',
        title: 'Project session',
        createdAt: '2026-05-30T00:00:00.000Z',
        modifiedAt: '2026-05-30T00:00:00.000Z',
        messageCount: 0,
        projectPath: 'F:/github/cc-jiangxia',
        workDir: 'F:/github/cc-jiangxia',
        projectRoot: 'F:/github/cc-jiangxia',
        workDirExists: true,
      }],
      activeSessionId: 'session-1',
    })
    useSkillStore.setState({
      catalog: [
        {
          name: 'release-checklist',
          displayName: 'Release Checklist',
          description: 'Verify release readiness before rollout.',
          source: 'user',
          userInvocable: true,
          version: '1.0.0',
          hasDirectory: true,
        },
        {
          name: 'risk-register',
          displayName: 'Risk Register',
          description: 'Track phase-specific release risks.',
          source: 'project',
          userInvocable: true,
          hasDirectory: true,
        },
      ],
      fetchCatalog,
      fetchSkillDetail,
      clearSelection,
    })

    render(
      <WorkflowTemplateEditor
        template={{
          ...EDITABLE_TEMPLATE,
          phases: [
            EDITABLE_TEMPLATE_PHASE,
            {
              ...EDITABLE_TEMPLATE_PHASE,
              id: 'validate',
              name: 'Validate',
              instructions: 'Validate release evidence.',
              skills: [],
            },
          ],
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    const editor = screen.getByTestId('workflow-template-editor')
    const planRecommendations = within(editor).getByRole('group', {
      name: /recommended skills for plan phase/i,
    })
    expect(within(planRecommendations).getByText('Release Checklist')).toBeInTheDocument()
    expect(within(planRecommendations).queryByText('Risk Register')).not.toBeInTheDocument()
    expect(within(planRecommendations).queryByText(/auto-execute|required|gate|plugin binding|bundled contents/i)).not.toBeInTheDocument()

    fireEvent.click(within(planRecommendations).getByRole('button', {
      name: /choose recommended skills for plan phase/i,
    }))
    let dialog = screen.getByRole('dialog', { name: /choose recommended skills for plan phase/i })
    const planSelectedSkills = within(dialog).getByRole('group', { name: /selected skills/i })
    expect(within(planSelectedSkills).getByText('Release Checklist')).toBeInTheDocument()
    expect(within(planSelectedSkills).queryByText('Risk Register')).not.toBeInTheDocument()
    expect(within(planSelectedSkills).getByText('1 selected')).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /select release checklist/i })).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /select risk register/i })).toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('searchbox', { name: /search skills/i }), {
      target: { value: 'checklist' },
    })
    expect(within(planSelectedSkills).getByText('Release Checklist')).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /select release checklist/i })).toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: /select risk register/i })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /select release checklist/i })).toBeChecked()
    fireEvent.click(within(dialog).getByRole('button', { name: /apply selected skills/i }))
    expect(within(planRecommendations).getByText('Release Checklist')).toBeInTheDocument()

    fireEvent.click(within(editor).getByRole('button', { name: /validate/i }))
    const validateRecommendations = within(editor).getByRole('group', {
      name: /recommended skills for validate phase/i,
    })
    fireEvent.click(within(validateRecommendations).getByRole('button', {
      name: /choose recommended skills for validate phase/i,
    }))
    dialog = screen.getByRole('dialog', { name: /choose recommended skills for validate phase/i })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /select release checklist/i }))
    const validateSelectedSkills = within(dialog).getByRole('group', { name: /selected skills/i })
    expect(within(validateSelectedSkills).getByText('Release Checklist')).toBeInTheDocument()
    expect(within(validateSelectedSkills).queryByText('Risk Register')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /select risk register/i }))
    expect(within(validateSelectedSkills).getByText('Release Checklist')).toBeInTheDocument()
    expect(within(validateSelectedSkills).getByText('Risk Register')).toBeInTheDocument()
    expect(within(validateSelectedSkills).getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(within(validateSelectedSkills).getByRole('button', { name: /remove release checklist/i }))
    expect(within(validateSelectedSkills).queryByText('Release Checklist')).not.toBeInTheDocument()
    expect(within(validateSelectedSkills).getByText('Risk Register')).toBeInTheDocument()
    expect(within(dialog).getByRole('checkbox', { name: /select release checklist/i })).not.toBeChecked()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /select release checklist/i }))
    expect(within(validateSelectedSkills).getByText('Release Checklist')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /apply selected skills/i }))
    expect(within(validateRecommendations).getByText('Release Checklist')).toBeInTheDocument()
    expect(within(validateRecommendations).getByText('Risk Register')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      phases: [
        expect.objectContaining({
          id: 'plan',
          skills: [
            expect.objectContaining({
              name: 'release-checklist',
              mode: 'recommended',
              source: 'user',
            }),
          ],
        }),
        expect.objectContaining({
          id: 'validate',
          skills: [
            expect.objectContaining({
              name: 'release-checklist',
              mode: 'recommended',
              source: 'user',
            }),
            expect.objectContaining({
              name: 'risk-register',
              mode: 'recommended',
              source: 'project',
            }),
          ],
        }),
      ],
    }))
    expect(fetchCatalog).toHaveBeenCalledWith('F:/github/cc-jiangxia')
    expect(fetchSkillDetail).not.toHaveBeenCalled()
  })

  it('keeps same-name recommended skills distinct by source and provenance', () => {
    const onSave = vi.fn()
    useSkillStore.setState({
      catalog: [
        {
          name: 'release-checklist',
          displayName: 'Release Checklist',
          description: 'User checklist.',
          source: 'user',
          userInvocable: true,
          hasDirectory: true,
        },
        {
          name: 'release-checklist',
          displayName: 'Release Checklist',
          description: 'Plugin checklist.',
          source: 'plugin',
          pluginName: 'release-tools',
          namespace: 'release',
          referenceId: 'plugin-release-checklist',
          userInvocable: true,
          hasDirectory: true,
        },
      ],
      fetchCatalog: vi.fn(),
      fetchSkillDetail: vi.fn(),
      clearSelection: vi.fn(),
    })

    render(
      <WorkflowTemplateEditor
        template={{
          ...EDITABLE_TEMPLATE,
          phases: [
            {
              ...EDITABLE_TEMPLATE_PHASE,
              skills: [],
            },
          ],
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    const recommendations = within(screen.getByTestId('workflow-template-editor')).getByRole('group', {
      name: /recommended skills for plan phase/i,
    })
    fireEvent.click(within(recommendations).getByRole('button', {
      name: /choose recommended skills for plan phase/i,
    }))

    const dialog = screen.getByRole('dialog', { name: /choose recommended skills for plan phase/i })
    const sameNameOptions = within(dialog).getAllByRole('checkbox', { name: /select release checklist/i })
    expect(sameNameOptions).toHaveLength(2)
    sameNameOptions.forEach((option) => fireEvent.click(option))
    expect(within(dialog).getByText('2 selected')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: /apply selected skills/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      phases: [
        expect.objectContaining({
          id: 'plan',
          skills: [
            expect.objectContaining({
              name: 'release-checklist',
              source: 'user',
            }),
            expect.objectContaining({
              name: 'release-checklist',
              source: 'plugin',
              pluginName: 'release-tools',
              namespace: 'release',
              referenceId: 'plugin-release-checklist',
            }),
          ],
        }),
      ],
    }))
  })

  it('renders schema-aware common fields first and keeps advanced fields behind disclosure', () => {
    render(
      <WorkflowTemplateEditor
        template={EDITABLE_TEMPLATE}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const editor = screen.getByTestId('workflow-template-editor')
    expect(within(editor).getByLabelText(/^Template ID$/i)).toHaveValue('release-workflow')
    expect(within(editor).getByLabelText(/^Template name$/i)).toHaveValue('Release Workflow')
    expect(within(editor).getByLabelText(/^Phase ID$/i)).toHaveValue('plan')
    expect(within(editor).getByLabelText(/^Phase name$/i)).toHaveValue('Plan')
    expect(within(editor).getByLabelText(/^Role$/i)).toHaveValue('release coordinator')
    expect(within(editor).getByLabelText(/^Instructions$/i)).toHaveValue('Prepare the release plan.')
    expect(within(editor).getByLabelText(/^Objective$/i)).toHaveValue('Confirm release scope.')
    expect(within(editor).getByLabelText(/^Intake$/i)).toHaveValue('Release issue')
    expect(within(editor).getByLabelText(/^Output artifact name$/i)).toHaveValue('Release plan')
    expect(within(editor).getByLabelText(/^Handoff$/i)).toHaveValue('Summarize release risks for validation.')
    expect(within(editor).getByLabelText(/^Execution rules$/i)).toHaveValue('Do not publish without approval.')
    expect(within(editor).getByLabelText(/^Completion criteria$/i)).toHaveValue('Release plan artifact is ready.')
    expect(within(editor).getByLabelText(/^Transition authority$/i)).toHaveValue('user-confirmation')
    expect(within(editor).queryByLabelText(/^Requested model$/i)).not.toBeInTheDocument()

    fireEvent.click(within(editor).getByRole('button', { name: /advanced fields/i }))

    expect(within(editor).getByLabelText(/^Template description$/i)).toHaveValue('Coordinate release readiness.')
    expect(within(editor).getByLabelText(/^Requested model$/i)).toHaveValue('anthropic:claude-sonnet-4')
    expect(within(editor).queryByLabelText(/^Skills$/i)).not.toBeInTheDocument()
  })

  it('blocks saving prompt-only phases without output artifact and handoff semantics', () => {
    const onSave = vi.fn()
    render(
      <WorkflowTemplateEditor
        template={{
          schemaVersion: 1,
          id: 'prompt-only',
          version: '1',
          name: 'Prompt Only',
          phases: [
            {
              id: 'draft',
              name: 'Draft',
              instructions: 'Just write something.',
            },
          ],
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText(/output artifact is required/i)).toBeInTheDocument()
    expect(screen.getByText(/handoff semantics are required/i)).toBeInTheDocument()
  })

  it('normalizes common editor fields into the workflow phase contract on save', () => {
    const onSave = vi.fn()
    render(
      <WorkflowTemplateEditor
        template={EDITABLE_TEMPLATE}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText(/^Output artifact kind$/i), {
      target: { value: 'json' },
    })
    fireEvent.change(screen.getByLabelText(/^Handoff$/i), {
      target: { value: 'Summarize validation status.\nList next owners.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: 'release-workflow',
      phases: [
        expect.objectContaining({
          id: 'plan',
          role: 'release coordinator',
          outputArtifact: expect.objectContaining({
            id: 'release-plan',
            kind: 'json',
            required: true,
          }),
          requiredArtifacts: [
            expect.objectContaining({
              id: 'release-plan',
              required: true,
            }),
          ],
          handoffRules: [
            'Summarize validation status.',
            'List next owners.',
          ],
          completionCriteria: expect.objectContaining({
            type: 'artifact-required',
          }),
          transition: expect.objectContaining({
            authority: 'user-confirmation',
          }),
        }),
      ],
    }))
  })

  it('round-trips legacy reason and unknown skill reference fields when saving recommended skills', () => {
    const onSave = vi.fn()
    render(
      <WorkflowTemplateEditor
        template={{
          ...EDITABLE_TEMPLATE,
          phases: [
            {
              ...EDITABLE_TEMPLATE_PHASE,
              skills: [
                {
                  name: 'release-checklist',
                  mode: 'recommended',
                  source: 'user',
                  reason: 'Verify release readiness.',
                  referenceId: 'skill-ref-release-checklist',
                  contentHash: 'sha256:release-checklist',
                  legacyUnknown: {
                    carriedFrom: 'old-export',
                  },
                },
                {
                  name: 'telegram:access',
                  mode: 'recommended',
                  source: 'plugin',
                  pluginName: 'telegram',
                  reason: 'Coordinate release notifications.',
                  pluginUnknown: 'preserve-me',
                },
              ],
            },
          ],
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      phases: [
        expect.objectContaining({
          id: 'plan',
          skills: [
            expect.objectContaining({
              name: 'release-checklist',
              mode: 'recommended',
              source: 'user',
              reason: 'Verify release readiness.',
              referenceId: 'skill-ref-release-checklist',
              contentHash: 'sha256:release-checklist',
              legacyUnknown: {
                carriedFrom: 'old-export',
              },
            }),
            expect.objectContaining({
              name: 'telegram:access',
              mode: 'recommended',
              source: 'plugin',
              pluginName: 'telegram',
              reason: 'Coordinate release notifications.',
              pluginUnknown: 'preserve-me',
            }),
          ],
        }),
      ],
    }))
  })

  it('keeps server validation issues visible and blocks create until validation passes', async () => {
    vi.mocked(sessionsApi.validateWorkflowTemplate).mockResolvedValue({
      valid: false,
      template: null,
      issues: [
        {
          source: 'request',
          templateId: 'release-workflow',
          path: '$.template.phases[0].handoffRules',
          code: 'WORKFLOW_TEMPLATE_INVALID_HANDOFF',
          message: 'Handoff rules must describe the next phase handoff.',
          severity: 'error',
        },
      ],
    })
    render(
      <WorkflowTemplateEditor
        template={EDITABLE_TEMPLATE}
        mode="create"
        source="user"
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText(/handoff rules must describe the next phase handoff/i)).toBeInTheDocument()
    expect(screen.getByText(/workflow_template_invalid_handoff/i)).toBeInTheDocument()
    expect(sessionsApi.createWorkflowTemplate).not.toHaveBeenCalled()
  })
})

describe('WorkflowTemplatePicker', () => {
  it('lists startable templates and exposes the Agent Development preset phases', () => {
    const onSelect = vi.fn()

    render(
      <WorkflowTemplatePicker
        templates={[BUILTIN_TEMPLATE]}
        invalidTemplates={[
          {
            id: 'bad-template',
            source: 'user',
            message: 'Phase ids must be unique.',
          },
        ]}
        selectedTemplateId={BUILTIN_TEMPLATE.id}
        onSelect={onSelect}
      />,
    )

    const picker = screen.getByTestId('workflow-template-picker')
    expect(within(picker).getByRole('button', { name: /agent development/i })).toBeInTheDocument()
    expect(within(picker).getByText(/5 phases/i)).toBeInTheDocument()
    expect(within(picker).getByText(/^Discussion$/i)).toBeInTheDocument()
    expect(within(picker).getByText(/^Specify$/i)).toBeInTheDocument()
    expect(within(picker).getByText(/^plan$/i)).toBeInTheDocument()
    expect(within(picker).getByText(/^tasks$/i)).toBeInTheDocument()
    expect(within(picker).getByText(/^Implement$/i)).toBeInTheDocument()
    expect(within(picker).queryByRole('button', { name: /bad-template/i })).not.toBeInTheDocument()
    expect(within(picker).getByText(/phase ids must be unique/i)).toBeInTheDocument()
  })

  it('previews more than five linear phases without forcing horizontal overflow', () => {
    render(
      <WorkflowTemplatePicker
        templates={[LONG_TEMPLATE]}
        selectedTemplateId={LONG_TEMPLATE.id}
        onSelect={vi.fn()}
      />,
    )

    const picker = screen.getByTestId('workflow-template-picker')
    const templateButton = within(picker).getByRole('button', { name: /long linear workflow/i })
    expect(within(templateButton).getByText(/7 phases/i)).toBeInTheDocument()

    for (const phaseName of LONG_TEMPLATE.phaseNames ?? []) {
      expect(within(templateButton).getByText(phaseName)).toBeInTheDocument()
    }

    const phaseList = within(templateButton).getByText('Release').closest('ol')
    expect(phaseList).toHaveClass('flex-wrap')
    expect(phaseList).not.toHaveClass('overflow-hidden')
    expect(within(templateButton).getByText('Release')).toHaveClass('max-w-full', 'truncate')
  })

  it('does not select workflow mode until the user explicitly picks a template', () => {
    const onSelect = vi.fn()

    render(
      <WorkflowTemplatePicker
        templates={[BUILTIN_TEMPLATE]}
        selectedTemplateId={null}
        onSelect={onSelect}
      />,
    )

    expect(screen.getByTestId('workflow-template-picker')).toHaveAttribute('data-workflow-selected', 'false')

    fireEvent.click(screen.getByRole('button', { name: /agent development/i }))

    expect(onSelect).toHaveBeenCalledWith({
      templateId: BUILTIN_TEMPLATE.id,
      templateSource: 'builtin',
    })
  })
})

describe('WorkflowStartDialog', () => {
  it('shows template metadata, phase list, invalid diagnostics, and starts only the selected template', () => {
    const onSelect = vi.fn()
    const onStart = vi.fn()
    const onClose = vi.fn()

    render(
      <WorkflowStartDialog
        open
        templates={[BUILTIN_TEMPLATE, LONG_TEMPLATE]}
        invalidTemplates={[
          {
            source: 'user-config',
            templateId: 'broken-template',
            path: '$.templates[0].phases',
            code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
            message: 'Template phases must be a non-empty ordered array.',
            severity: 'error',
          },
        ]}
        selectedTemplateId={BUILTIN_TEMPLATE.id}
        onSelect={onSelect}
        onStart={onStart}
        onClose={onClose}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: /start workflow/i })
    const selectedButton = within(dialog).getByRole('button', { name: /agent development/i })
    expect(selectedButton).toBeInTheDocument()
    expect(within(screen.getByTestId('workflow-start-dialog-details')).getByText('Agent Development')).toBeInTheDocument()
    expect(within(dialog).getAllByText(/builtin/i).length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText(/5 phases/i).length).toBeGreaterThan(0)
    expect(within(selectedButton).getByText(/^Discussion$/i)).toBeInTheDocument()
    expect(within(selectedButton).getByText(/^Implement$/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/invalid workflow templates/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/broken-template/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/template phases must be a non-empty ordered array/i)).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: /^start$/i }))

    expect(onStart).toHaveBeenCalledWith({
      templateId: BUILTIN_TEMPLATE.id,
      templateSource: 'builtin',
      initialPhaseId: BUILTIN_TEMPLATE.firstPhaseId,
    })
  })

  it('disables start and never calls start for invalid or non-startable templates', () => {
    const onStart = vi.fn()
    const invalidTemplate = {
      ...LONG_TEMPLATE,
      firstPhaseId: '',
      phaseCount: 0,
      startable: false,
    }

    render(
      <WorkflowStartDialog
        open
        templates={[invalidTemplate]}
        invalidTemplates={[
          {
            source: 'user-config',
            templateId: invalidTemplate.id,
            path: '$.templates[0].phases',
            code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
            message: 'Template phases must be a non-empty ordered array.',
            severity: 'error',
          },
        ]}
        selectedTemplateId={invalidTemplate.id}
        onSelect={vi.fn()}
        onStart={onStart}
        onClose={vi.fn()}
      />,
    )

    const startButton = screen.getByRole('button', { name: /^start$/i })
    expect(startButton).toBeDisabled()

    fireEvent.click(startButton)

    expect(onStart).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /long linear workflow/i })).toBeDisabled()
  })

  it('is keyboard accessible and localized', () => {
    const onClose = vi.fn()
    useSettingsStore.setState({ locale: 'zh' })

    render(
      <WorkflowStartDialog
        open
        templates={[BUILTIN_TEMPLATE]}
        selectedTemplateId={null}
        onSelect={vi.fn()}
        onStart={vi.fn()}
        onClose={onClose}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: /启动工作流/i })
    expect(dialog).toHaveFocus()
    expect(within(dialog).getByText(/选择一个模板/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /启动$/i })).toBeDisabled()

    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('WorkflowStatusPanel', () => {
  it('renders nothing for dialogue sessions without explicit workflow metadata', () => {
    const { container } = render(<WorkflowStatusPanel workflow={null} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('shows progress, lifecycle, transition authority, fallback, and server state pointer', () => {
    render(<WorkflowStatusPanel workflow={WORKFLOW_SUMMARY} />)

    const panel = screen.getByTestId('workflow-status-panel')
    expect(within(panel).getByText(/agent development/i)).toBeInTheDocument()
    expect(within(panel).getByText(/specify/i)).toBeInTheDocument()
    expect(within(panel).getByText(/phase 2 of 5/i)).toBeInTheDocument()
    expect(within(panel).getByText(/running/i)).toBeInTheDocument()
    expect(within(panel).getByText(/auto/i)).toBeInTheDocument()
    expect(within(panel).getByText(/claude-opus-4/i)).toBeInTheDocument()
    expect(within(panel).getByText(/claude-sonnet-4/i)).toBeInTheDocument()
    expect(panel).toHaveTextContent(/provider/i)
    expect(within(panel).getByText(/phase-request/i)).toBeInTheDocument()
    expect(within(panel).getByText(/fallback applied/i)).toBeInTheDocument()
    expect(within(panel).getByText(/requested phase model is unavailable/i)).toBeInTheDocument()
    expect(within(panel).getByText(/workflow-sessions\/session-001\/state\.json/i)).toBeInTheDocument()
  })

  it('renders concise recommended skill status without implying automatic execution', () => {
    render(
      <WorkflowStatusPanel
        workflow={({
          ...WORKFLOW_SUMMARY,
          recommendedSkillStatus: {
            total: 4,
            available: 1,
            unavailable: 1,
            degraded: 1,
            evidenceCount: 2,
            activePhaseItems: [
              { name: 'sp-specify', status: 'available', source: 'project' },
              { name: 'security-review', status: 'missing', source: 'user' },
              { name: 'plugin-helper', status: 'plugin-disabled', source: 'plugin', pluginName: 'disabled-plugin' },
              { name: 'unused-style-pass', status: 'available', source: 'bundled' },
            ],
          },
        } as typeof WORKFLOW_SUMMARY & {
          recommendedSkillStatus: {
            total: number
            available: number
            unavailable: number
            degraded: number
            evidenceCount: number
            activePhaseItems: Array<{
              name: string
              status: string
              source?: string
              pluginName?: string
            }>
          }
        })}
      />,
    )

    const panel = screen.getByTestId('workflow-status-panel')
    const skillStatus = within(panel).getByTestId('workflow-recommended-skill-status')
    expect(skillStatus).toHaveTextContent(/recommended skills/i)
    expect(skillStatus).toHaveTextContent(/1 available/i)
    expect(skillStatus).toHaveTextContent(/1 unavailable/i)
    expect(skillStatus).toHaveTextContent(/1 degraded/i)
    expect(skillStatus).toHaveTextContent(/2 evidence/i)
    expect(skillStatus).toHaveTextContent(/sp-specify/i)
    expect(skillStatus).toHaveTextContent(/security-review/i)
    expect(skillStatus).not.toHaveTextContent(/unused-style-pass/i)
    expect(skillStatus).not.toHaveTextContent(/auto.?exec|auto.?run|default gate|plugin-primary|default bundle|permission bypass/i)
    expect(within(panel).queryByRole('button', { name: /run|execute|install|enable/i })).not.toBeInTheDocument()
  })

  it('keeps pending confirmation status higher priority when recommended skill status is present', () => {
    render(
      <WorkflowStatusPanel
        workflow={({
          ...WORKFLOW_SUMMARY,
          status: 'running',
          pendingConfirmation: true,
          activePhaseId: 'plan',
          activePhaseIndex: 2,
          recommendedSkillStatus: {
            total: 2,
            available: 1,
            unavailable: 1,
            degraded: 0,
            evidenceCount: 1,
            activePhaseItems: [
              { name: 'sp-plan', status: 'available', source: 'project' },
              { name: 'missing-audit', status: 'missing', source: 'user' },
            ],
          },
        } as typeof WORKFLOW_SUMMARY & {
          recommendedSkillStatus: {
            total: number
            available: number
            unavailable: number
            degraded: number
            evidenceCount: number
            activePhaseItems: Array<{
              name: string
              status: string
              source?: string
            }>
          }
        })}
      />,
    )

    const panel = screen.getByTestId('workflow-status-panel')
    expect(within(panel).getByText(/waiting for confirmation/i)).toBeInTheDocument()
    expect(within(panel).queryByText(/^running$/i)).not.toBeInTheDocument()
    expect(within(panel).getByTestId('workflow-recommended-skill-status')).toHaveTextContent(/recommended skills/i)
  })

  it('shows pending artifact evidence without exposing artifact editing controls', () => {
    render(
      <WorkflowStatusPanel
        workflow={{
          ...WORKFLOW_SUMMARY,
          status: 'pending-confirmation',
          activePhaseId: 'plan',
          activePhaseIndex: 2,
          pendingConfirmation: true,
          transitionAuthority: 'user-confirmation',
          pendingArtifact: PENDING_ARTIFACT,
          artifactHistory: [PENDING_ARTIFACT],
        } as typeof WORKFLOW_SUMMARY & {
          pendingArtifact: WorkflowPhaseArtifact
          artifactHistory: WorkflowPhaseArtifact[]
        }}
      />,
    )

    const panel = screen.getByTestId('workflow-status-panel')
    const pendingArtifact = within(panel).getByTestId('workflow-pending-artifact')
    expect(within(pendingArtifact).getByText(/plan handoff/i)).toBeInTheDocument()
    expect(within(pendingArtifact).getByText(/pending/i)).toBeInTheDocument()
    expect(within(pendingArtifact).getByText(/plan is ready for user confirmation/i)).toBeInTheDocument()
    expect(within(pendingArtifact).getByText(/validated requirements/i)).toBeInTheDocument()
    expect(within(pendingArtifact).getByText(/agent-ready/i)).toBeInTheDocument()
    expect(within(pendingArtifact).getByText(/transition-pending-001/i)).toBeInTheDocument()
    expect(within(pendingArtifact).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(pendingArtifact).queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(within(pendingArtifact).queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
  })

  it('renders read-only artifact history for pending, accepted, rejected, and superseded artifacts', () => {
    render(
      <WorkflowStatusPanel
        workflow={{
          ...WORKFLOW_SUMMARY,
          status: 'pending-confirmation',
          activePhaseId: 'plan',
          activePhaseIndex: 2,
          pendingConfirmation: true,
          pendingArtifact: PENDING_ARTIFACT,
          artifactHistory: ARTIFACT_HISTORY,
        } as typeof WORKFLOW_SUMMARY & {
          pendingArtifact: WorkflowPhaseArtifact
          artifactHistory: WorkflowPhaseArtifact[]
        }}
      />,
    )

    const history = screen.getByTestId('workflow-artifact-history')
    for (const artifact of ARTIFACT_HISTORY) {
      const item = within(history).getByTestId(`workflow-artifact-${artifact.artifactId}`)
      expect(within(item).getByText(new RegExp(artifact.status, 'i'))).toBeInTheDocument()
      expect(within(item).getByText(new RegExp(artifact.phaseId, 'i'))).toBeInTheDocument()
      expect(within(item).getByText(artifact.handoffSummary)).toBeInTheDocument()
      expect(within(item).getByText(artifact.evidenceSummary)).toBeInTheDocument()
      expect(within(item).queryByRole('textbox')).not.toBeInTheDocument()
      expect(within(item).queryByRole('button', { name: /edit|save|delete/i })).not.toBeInTheDocument()
    }
  })

  it.each([
    ['pending-confirmation', 'Waiting for confirmation'],
    ['failed', 'Completion check failed'],
    ['stale-template', 'Template source is stale'],
    ['missing-template', 'Template source is missing'],
  ] as const)('surfaces %s workflow state', (status, expectedLabel) => {
    render(
      <WorkflowStatusPanel
        workflow={{
          ...WORKFLOW_SUMMARY,
          status,
          pendingConfirmation: status === 'pending-confirmation',
          blockedReason: status === 'failed' ? 'Required artifact was not produced.' : undefined,
        }}
      />,
    )

    const panel = screen.getByTestId('workflow-status-panel')
    expect(within(panel).getByText(new RegExp(expectedLabel, 'i'))).toBeInTheDocument()
    if (status === 'failed') {
      expect(within(panel).getByText(/required artifact was not produced/i)).toBeInTheDocument()
    }
  })

  it.each([
    [
      'blocked',
      BLOCKED_ARTIFACT,
      'Waiting for the user to select an OAuth account.',
      /oauth account selection is missing/i,
    ],
    [
      'unable',
      UNABLE_ARTIFACT,
      'The phase cannot continue because implementation notes are unavailable.',
      /implementation notes could not be read/i,
    ],
  ] as const)('shows %s reason and evidence without pending confirmation affordances', (
    blockedStatus,
    artifact,
    blockedReason,
    evidencePattern,
  ) => {
    render(
      <WorkflowStatusPanel
        workflow={{
          ...WORKFLOW_SUMMARY,
          status: 'running',
          activePhaseId: 'plan',
          activePhaseIndex: 2,
          pendingConfirmation: false,
          blockedReason,
          blockedStatus,
          blockedArtifact: artifact,
          artifactHistory: [artifact],
        } as typeof WORKFLOW_SUMMARY & {
          blockedStatus: 'blocked' | 'unable'
          blockedArtifact: typeof BLOCKED_ARTIFACT | typeof UNABLE_ARTIFACT
          artifactHistory: Array<typeof BLOCKED_ARTIFACT | typeof UNABLE_ARTIFACT>
        }}
      />,
    )

    const panel = screen.getByTestId('workflow-status-panel')
    expect(panel).toHaveTextContent(blockedReason)
    expect(panel).toHaveTextContent(new RegExp(blockedStatus, 'i'))
    expect(panel).toHaveTextContent(evidencePattern)
    expect(within(panel).queryByRole('button', { name: /confirm|complete phase/i })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('WorkflowTransitionControls', () => {
  it('renders no workflow controls unless workflow props are explicit', () => {
    const { container } = render(
      <WorkflowTransitionControls
        workflow={undefined}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('shows pending confirmation controls and sends idempotent transition context', () => {
    const onConfirm = vi.fn()
    const onReject = vi.fn()
    const onRetry = vi.fn()

    render(
      <WorkflowTransitionControls
        workflow={{
          ...WORKFLOW_SUMMARY,
          status: 'pending-confirmation',
          activePhaseId: 'specify',
          pendingConfirmation: true,
          transitionAuthority: 'user-confirmation',
        }}
        stateVersion={7}
        transitionId="transition-007"
        onConfirm={onConfirm}
        onReject={onReject}
        onRetry={onRetry}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /reject/i }))
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(onConfirm).toHaveBeenCalledWith({
      phaseId: 'specify',
      action: 'confirm',
      transitionId: 'transition-007',
      stateVersion: 7,
    })
    expect(onReject).toHaveBeenCalledWith({
      phaseId: 'specify',
      action: 'reject',
      transitionId: 'transition-007',
      stateVersion: 7,
    })
    expect(onRetry).toHaveBeenCalledWith({
      phaseId: 'specify',
      action: 'retry',
      transitionId: 'transition-007',
      stateVersion: 7,
    })
  })

  it('prioritizes pending confirmation controls when lifecycle status is stale', () => {
    render(
      <WorkflowTransitionControls
        workflow={{
          ...WORKFLOW_SUMMARY,
          status: 'running',
          activePhaseId: 'plan',
          pendingConfirmation: true,
          transitionAuthority: 'user-confirmation',
        }}
        stateVersion={8}
        transitionId="transition-008"
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText(/waiting for confirmation/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^confirm$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /complete phase/i })).not.toBeInTheDocument()
  })

  it('requires confirmation and sends optional summary and evidence for manual completion', () => {
    const onRetry = vi.fn()

    render(
      <WorkflowTransitionControls
        workflow={{
          ...WORKFLOW_SUMMARY,
          status: 'running',
          activePhaseId: 'discussion',
          activePhaseIndex: 0,
          pendingConfirmation: false,
          transitionAuthority: 'user-confirmation',
        }}
        stateVersion={3}
        transitionId="complete-003"
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={onRetry}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /complete phase/i }))

    expect(onRetry).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: /complete discussion phase/i })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/summary/i), {
      target: { value: 'Discussion scope and acceptance criteria were reviewed.' },
    })
    fireEvent.change(screen.getByLabelText(/evidence/i), {
      target: { value: '.specify/features/004-workflow-session-mode/spec.md' },
    })
    fireEvent.click(screen.getByRole('button', { name: /confirm completion/i }))

    expect(onRetry).toHaveBeenCalledWith({
      phaseId: 'discussion',
      action: 'manual_complete',
      transitionId: 'complete-003',
      stateVersion: 3,
      handoff: {
        summary: 'Discussion scope and acceptance criteria were reviewed.',
        artifacts: [],
      },
      rationale: 'User manually confirmed this phase is complete.',
      evidence: [
        {
          kind: 'manual',
          label: 'Manual completion evidence',
          ref: '.specify/features/004-workflow-session-mode/spec.md',
        },
      ],
    })
  })

  it('shows blocked retry controls without advancing the phase', () => {
    const onRetry = vi.fn()

    render(
      <WorkflowTransitionControls
        workflow={{
          ...WORKFLOW_SUMMARY,
          status: 'failed',
          activePhaseId: 'plan',
          blockedReason: 'Completion checklist is still missing the implementation plan.',
        }}
        stateVersion={9}
        transitionId="retry-009"
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText(/completion checklist is still missing/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(onRetry).toHaveBeenCalledWith({
      phaseId: 'plan',
      action: 'retry',
      transitionId: 'retry-009',
      stateVersion: 9,
    })
  })

  it.each([
    ['blocked', 'Waiting for the user to select an OAuth account.'],
    ['unable', 'The phase cannot continue because implementation notes are unavailable.'],
  ] as const)('does not expose unsafe advancement actions for %s workflow status', (blockedStatus, blockedReason) => {
    render(
      <WorkflowTransitionControls
        workflow={{
          ...WORKFLOW_SUMMARY,
          status: 'running',
          activePhaseId: 'plan',
          pendingConfirmation: false,
          blockedReason,
          blockedStatus,
        } as typeof WORKFLOW_SUMMARY & { blockedStatus: 'blocked' | 'unable' }}
        stateVersion={10}
        transitionId={`${blockedStatus}-010`}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /complete phase/i })).not.toBeInTheDocument()
  })
})

describe('WorkflowReportLink', () => {
  it('hides report affordances until a workflow report pointer exists', () => {
    const { container } = render(<WorkflowReportLink workflow={WORKFLOW_SUMMARY} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('shows the durable final report pointer for completed workflow sessions', () => {
    render(
      <WorkflowReportLink
        workflow={{
          ...WORKFLOW_SUMMARY,
          status: 'completed',
          activePhaseId: null,
          activePhaseIndex: 4,
          reportPointer: {
            id: 'report-001',
            kind: 'report',
            label: 'Final workflow report',
            uri: 'workflow-sessions/session-001/report.json',
          },
        }}
      />,
    )

    const link = screen.getByRole('link', { name: /final workflow report/i })
    expect(link).toHaveAttribute('href', 'workflow-sessions/session-001/report.json')
    expect(screen.getByText(/workflow-sessions\/session-001\/report\.json/i)).toBeInTheDocument()
  })
})
