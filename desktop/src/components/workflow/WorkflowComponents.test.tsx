// @vitest-environment jsdom

// @ts-expect-error jsdom is installed in this workspace without local type declarations
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import globalsCssRaw from '../../theme/globals.css?raw'
import {
  WorkflowReportLink,
  WorkflowGitCheckpointControls,
  WorkflowStatusPanel,
  WorkflowTemplatePicker,
  WorkflowTransitionControls,
} from './WorkflowComponents'
import { WorkflowStartDialog } from './WorkflowStartDialog'
import { WorkflowTemplateEditor } from './WorkflowTemplateEditor'
import workflowTemplateEditorSource from './WorkflowTemplateEditor.tsx?raw'
import { WorkflowTemplateManager } from './WorkflowTemplateManager'
import workflowTemplateManagerSource from './WorkflowTemplateManager.tsx?raw'
import { sessionsApi } from '../../api/sessions'
import { ToastContainer } from '../shared/Toast'
import { useUIStore } from '../../stores/uiStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useSkillStore } from '../../stores/skillStore'
import { useSessionStore } from '../../stores/sessionStore'
import type { WorkflowLabel, WorkflowTemplateDetail, WorkflowTemplateDraft } from '../../types/session'

if (typeof document === 'undefined') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  })
  const { window } = dom

  Object.assign(globalThis, {
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    HTMLSelectElement: window.HTMLSelectElement,
    MutationObserver: window.MutationObserver,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })
}

if (!('mocked' in vi)) {
  Object.assign(vi, {
    mocked: <T,>(item: T) => item,
  })
}

const { cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react')
await import('@testing-library/jest-dom/vitest')

vi.mock('../../api/sessions', () => ({
  sessionsApi: {
    listWorkflowTemplates: vi.fn(),
    getWorkflowTemplate: vi.fn(),
    getWorkflowReport: vi.fn(),
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
  id?: string
  kind: 'state' | 'report' | 'artifact'
  sessionId?: string
  artifactId?: string
  schemaVersion?: number
  createdAt?: string
  label?: string
  uri?: string
}

type WorkflowTemplateListItem = {
  id: string
  source: 'user'
  version: string
  name: string
  description?: string
  labels?: WorkflowLabel[]
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
  source: 'user',
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
  labels: ['new-product'],
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
  templateSource: 'user',
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

void ARTIFACT_HISTORY
void BLOCKED_ARTIFACT
void UNABLE_ARTIFACT

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useSettingsStore.setState({ locale: 'en' })
  useUIStore.setState({ toasts: [] })
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


describe('ToastContainer', () => {
  it('renders positioned toast list when messages are present', () => {
    useUIStore.setState({
      toasts: [{ id: 'toast-visible', type: 'info', message: 'Model capability warning' }],
    })

    render(<ToastContainer />)

    expect(screen.getByText('Model capability warning')).toBeInTheDocument()
    const toastLayer = screen.getByText('Model capability warning').closest('.fixed')
    expect(toastLayer).toHaveClass('inset-x-0')
    expect(toastLayer).toHaveClass('bottom-4')
    expect(toastLayer).toHaveClass('pointer-events-none')
    expect(toastLayer).toHaveClass('items-end')
  })
})

describe('workflow button theme tokens', () => {
  it('defines every hover background token used by workflow action buttons', () => {
    const workflowSources = [workflowTemplateManagerSource, workflowTemplateEditorSource]

    const hoverTokens = Array.from(
      new Set(
        workflowSources.flatMap((source) =>
          Array.from(source.matchAll(/hover:bg-\[var\((--[\w-]+)\)\]/g), ([, token]) => token),
        ),
      ),
    )

    expect(hoverTokens).toContain('--color-brand-hover')

    for (const token of hoverTokens) {
      expect(globalsCssRaw).toContain(`${token}:`)
    }
  })
})

describe('WorkflowTemplateManager', () => {
  it('loads user templates and copies them through the desktop API', async () => {
    const onCopyTemplate = vi.fn()
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

    render(<WorkflowTemplateManager onCopyTemplate={onCopyTemplate} />)

    const manager = await screen.findByTestId('workflow-template-manager')
    const row = within(manager).getByTestId('workflow-template-row-user-long-linear-workflow')
    expect(sessionsApi.listWorkflowTemplates).toHaveBeenCalledTimes(1)
    expect(within(row).getByText('Long Linear Workflow')).toBeInTheDocument()
    expect(within(row).getByText('User')).toBeInTheDocument()
    expect(within(row).getByText('long-linear-workflow')).toBeInTheDocument()
    expect(row).toHaveTextContent(/Version\s*2026\.05\.21/i)
    expect(within(row).getByText(/7 phases/i)).toBeInTheDocument()
    expect(within(row).getByText(/development/i)).toBeInTheDocument()
    expect(within(row).getByText(/startable/i)).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /edit long linear workflow/i })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /delete long linear workflow/i })).toBeInTheDocument()

    vi.mocked(sessionsApi.duplicateWorkflowTemplate).mockResolvedValue({
      template: {
        ...EDITABLE_TEMPLATE_DETAIL,
        id: 'long-linear-workflow-copy',
        name: 'Long Linear Workflow Copy',
      },
      templates: [
        {
          ...LONG_TEMPLATE,
          startable: true,
          editable: true,
          copyable: true,
        },
        {
          id: 'long-linear-workflow-copy',
          source: 'user',
          version: '1',
          name: 'Long Linear Workflow Copy',
          phaseCount: 1,
          firstPhaseId: 'plan',
          editable: true,
          copyable: true,
        },
      ],
      invalidTemplates: [],
    })

    fireEvent.click(within(row).getByRole('button', { name: /copy long linear workflow/i }))

    await waitFor(() => {
      expect(sessionsApi.duplicateWorkflowTemplate).toHaveBeenCalledWith({
        source: 'user',
        id: 'long-linear-workflow',
        targetId: 'long-linear-workflow-copy',
        targetName: 'Long Linear Workflow Copy',
      })
    })
    expect(await screen.findByText('Long Linear Workflow Copy')).toBeInTheDocument()
    expect(onCopyTemplate).toHaveBeenCalledWith(expect.objectContaining({
      id: 'long-linear-workflow',
      source: 'user',
    }))
  })

  it('shows coding task labels for workflow templates', async () => {
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({
      templates: [
        {
          ...LONG_TEMPLATE,
          id: 'efficient-constrained-dev-debug-workflow-v5',
          name: 'Guided Development Workflow',
          labels: ['new-product'],
          source: 'user',
          startable: true,
          editable: true,
          copyable: true,
        },
        {
          ...LONG_TEMPLATE,
          id: 'feature-extension-workflow-v8',
          name: 'Feature Extension Workflow',
          labels: ['enhancement'],
          source: 'user',
          startable: true,
          editable: true,
          copyable: true,
        },
        {
          ...LONG_TEMPLATE,
          id: 'debug-repair-workflow-v8',
      name: 'Debug Repair Workflow',
          labels: ['bug'],
          source: 'user',
          startable: true,
          editable: true,
          copyable: true,
        },
      ],
      invalidTemplates: [],
    })

    render(<WorkflowTemplateManager />)

    const developmentRow = await screen.findByTestId('workflow-template-row-user-efficient-constrained-dev-debug-workflow-v5')
    const featureRow = await screen.findByTestId('workflow-template-row-user-feature-extension-workflow-v8')
    const debugRow = await screen.findByTestId('workflow-template-row-user-debug-repair-workflow-v8')
    expect(within(developmentRow).getByText(/^Development$/i)).toBeInTheDocument()
    expect(within(featureRow).getByText(/^Feature Extension$/i)).toBeInTheDocument()
    expect(within(debugRow).getByText(/^Debug$/i)).toBeInTheDocument()
  })

  it('localizes user template source and editor labels in Chinese locale', async () => {
    useSettingsStore.setState({ locale: 'zh' })
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

    render(<WorkflowTemplateManager />)

    const row = await screen.findByTestId('workflow-template-row-user-long-linear-workflow')
    expect(within(row).getByText('Long Linear Workflow')).toBeInTheDocument()
    expect(within(row).getByText('\u7528\u6237')).toBeInTheDocument()
    expect(within(row).queryByText('user')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /\u65b0\u5efa/ }))

    const editor = await screen.findByTestId('workflow-template-editor')
    expect(within(editor).getByLabelText(/^\u6a21\u677f ID$/)).toBeInTheDocument()
    expect(within(editor).getByLabelText(/^\u6a21\u677f\u540d\u79f0$/)).toBeInTheDocument()
    expect(within(editor).getByLabelText(/^\u9636\u6bb5 ID$/)).toBeInTheDocument()
    expect(within(editor).getByLabelText(/^\u9636\u6bb5\u540d\u79f0$/)).toBeInTheDocument()
    expect(within(editor).getByLabelText(/^\u6307\u4ee4$/)).toBeInTheDocument()
    expect(within(editor).getByRole('button', { name: /\u9ad8\u7ea7\u5b57\u6bb5/ })).toBeInTheDocument()
  })

  it('keeps invalid templates visible with actionable diagnostics', async () => {
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({
      templates: [],
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
    expect(screen.getByText(/no workflow templates are available/i)).toBeInTheDocument()
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

    const cancelDialog = await screen.findByRole('dialog', { name: /delete workflow/i })
    expect(cancelDialog).toHaveTextContent(/delete workflow "long linear workflow"/i)
    expect(sessionsApi.deleteWorkflowTemplate).not.toHaveBeenCalled()

    fireEvent.click(within(cancelDialog).getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /delete workflow/i })).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('workflow-template-row-user-long-linear-workflow')).toBeInTheDocument()
    expect(sessionsApi.deleteWorkflowTemplate).not.toHaveBeenCalled()

    fireEvent.click(within(row).getByRole('button', { name: /delete long linear workflow/i }))

    const confirmDialog = await screen.findByRole('dialog', { name: /delete workflow/i })
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^delete$/i }))

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

  it('uses concise Chinese copy for the workflow delete confirmation dialog', async () => {
    useSettingsStore.setState({ locale: 'zh' })
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

    render(<WorkflowTemplateManager />)

    const row = await screen.findByTestId('workflow-template-row-user-long-linear-workflow')
    fireEvent.click(within(row).getByRole('button', { name: /\u5220\u9664 long linear workflow/i }))

    const dialog = await screen.findByRole('dialog', { name: /\u662f\u5426\u5220\u9664\u5de5\u4f5c\u6d41/i })
    expect(dialog).toHaveTextContent(/\u5c06\u5220\u9664\u5de5\u4f5c\u6d41\u201cLong Linear Workflow\u201d\u3002\u6b64\u64cd\u4f5c\u65e0\u6cd5\u64a4\u9500\u3002/)
    expect(sessionsApi.deleteWorkflowTemplate).not.toHaveBeenCalled()
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
        description: 'Updated workflow description',
      },
      issues: [],
    })
    vi.mocked(sessionsApi.updateWorkflowTemplate).mockResolvedValue({
      template: {
        ...EDITABLE_TEMPLATE_DETAIL,
        version: '2',
        name: 'Release Workflow Updated',
        description: 'Updated workflow description',
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
    fireEvent.click(screen.getByRole('button', { name: /^Advanced fields$/i }))
    fireEvent.change(screen.getByLabelText(/^Template description$/i), {
      target: { value: 'Updated workflow description' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(sessionsApi.validateWorkflowTemplate).toHaveBeenCalledWith({
        allowExistingId: EDITABLE_TEMPLATE_DETAIL.id,
        template: expect.objectContaining({
          id: EDITABLE_TEMPLATE_DETAIL.id,
          name: 'Release Workflow Updated',
          description: 'Updated workflow description',
        }),
      })
      expect(sessionsApi.updateWorkflowTemplate).toHaveBeenCalledWith(
        EDITABLE_TEMPLATE_DETAIL.id,
        {
          template: expect.objectContaining({
            name: 'Release Workflow Updated',
            description: 'Updated workflow description',
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
          importId: 'candidate-former-builtin-id',
          originalId: 'agent-development',
          proposedId: 'agent-development',
          name: 'Agent Development',
          version: '1',
          phaseCount: 5,
          conflict: 'none',
          defaultResolution: 'add',
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
          importId: 'candidate-former-builtin-id',
          id: 'agent-development',
          resolution: 'add',
        },
      ],
      templates: [
        {
          id: 'agent-development',
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
      schemaVersion: 2,
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
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: JSON.stringify(payload) },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /preview import/i }))

    const preview = await screen.findByTestId('workflow-import-preview')
    expect(sessionsApi.previewWorkflowTemplateImport).toHaveBeenCalledWith({ payload })
    expect(sessionsApi.commitWorkflowTemplateImport).not.toHaveBeenCalled()
    expect(within(preview).getByText(/3 candidates/i)).toBeInTheDocument()
    expect(within(preview).getByText(/1 invalid/i)).toBeInTheDocument()
    expect(within(preview).getByText(/malformed-template/i)).toBeInTheDocument()

    const formerBuiltinIdCandidate = within(preview).getByTestId('workflow-import-candidate-candidate-former-builtin-id')
    const formerBuiltinIdResolution = formerBuiltinIdCandidate.querySelector('select')
    expect(formerBuiltinIdResolution).not.toBeNull()
    expect(formerBuiltinIdResolution).toHaveValue('add')
    expect(within(formerBuiltinIdResolution as HTMLSelectElement).queryByRole('option', { name: 'overwrite' })).not.toBeInTheDocument()
    expect(within(formerBuiltinIdCandidate).getByLabelText(/target id/i)).toHaveValue('agent-development')

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
            importId: 'candidate-former-builtin-id',
            resolution: 'add',
            targetId: 'agent-development',
          },
        ],
      })
    })
    expect(await screen.findByText(/imported 1 workflow templates/i)).toBeInTheDocument()
    expect(await screen.findByTestId('workflow-template-row-user-agent-development')).toBeInTheDocument()
  })

  it('allows direct import without manually previewing and uses selectable default resolutions', async () => {
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({
      templates: [],
      invalidTemplates: [],
    })
    const payload = {
      schemaVersion: 2,
      templates: [
        {
          schemaVersion: 1,
          id: 'direct-import-workflow',
          version: '1',
          name: 'Direct Import Workflow',
          phases: [],
        },
      ],
    } as const
    vi.mocked(sessionsApi.previewWorkflowTemplateImport).mockResolvedValue({
      schemaVersion: 1,
      canCommit: true,
      candidates: [
        {
          importId: 'candidate-direct-import',
          originalId: 'direct-import-workflow',
          proposedId: 'direct-import-workflow',
          name: 'Direct Import Workflow',
          version: '1',
          phaseCount: 1,
          conflict: 'none',
          defaultResolution: 'add',
          selectable: true,
          issues: [],
        },
      ],
      invalidTemplates: [],
    })
    vi.mocked(sessionsApi.commitWorkflowTemplateImport).mockResolvedValue({
      imported: [
        {
          importId: 'candidate-direct-import',
          id: 'direct-import-workflow',
          resolution: 'add',
        },
      ],
      templates: [
        {
          id: 'direct-import-workflow',
          source: 'user',
          version: '1',
          name: 'Direct Import Workflow',
          phaseCount: 1,
          firstPhaseId: 'start',
          editable: true,
          copyable: true,
        },
      ],
      invalidTemplates: [],
    })

    render(<WorkflowTemplateManager />)

    await screen.findByTestId('workflow-template-manager')
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))
    const dialog = screen.getByRole('dialog', { name: /import workflow templates/i })
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: JSON.stringify(payload) },
    })

    const importButton = within(dialog).getByRole('button', { name: /import selected/i })
    expect(importButton).not.toBeDisabled()
    fireEvent.click(importButton)

    await waitFor(() => {
      expect(sessionsApi.previewWorkflowTemplateImport).toHaveBeenCalledWith({ payload })
      expect(sessionsApi.commitWorkflowTemplateImport).toHaveBeenCalledWith({
        payload,
        selections: [
          {
            importId: 'candidate-direct-import',
            resolution: 'add',
            targetId: 'direct-import-workflow',
          },
        ],
      })
    })
  })

  it('renders ZIP workflow pack metadata and skill install conflicts in import preview', async () => {
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({
      templates: [],
      invalidTemplates: [],
    })
    vi.mocked(sessionsApi.previewWorkflowTemplateImport).mockResolvedValue({
      schemaVersion: 1,
      format: 'zip-pack',
      commitMode: 'pack',
      pack: {
        packId: 'guided-development-pack',
        name: 'Guided Development Pack',
        version: '2.0.0',
      },
      packagedSkills: [
        {
          id: 'my-skill',
          identity: 'user:my-skill',
          safeName: 'my-skill',
          entrypoint: 'skills/my-skill/SKILL.md',
          root: 'skills/my-skill',
          contentHash: 'sha256-abc',
          source: 'user',
          references: ['my-skill'],
          fileCount: 2,
          totalBytes: 123,
        },
      ],
      requiredHostTools: [
        { name: 'Read', supported: true },
        { name: 'ExternalTool', supported: false },
      ],
      skillInstallPlan: [
        {
          identity: 'user:my-skill',
          safeName: 'my-skill',
          entrypoint: 'skills/my-skill/SKILL.md',
          contentHash: 'sha256-abc',
          status: 'conflict',
          message: 'Skill identity already exists with different content.',
        },
      ],
      candidates: [
        {
          importId: 'pack-1',
          originalId: 'zip-pack-workflow',
          proposedId: 'zip-pack-workflow',
          name: 'ZIP Pack Workflow',
          version: '1',
          phaseCount: 1,
          conflict: 'none',
          defaultResolution: 'add',
          selectable: true,
          issues: [],
          dependencyDiagnostics: [],
        },
      ],
      invalidTemplates: [],
      canCommit: false,
    })

    render(<WorkflowTemplateManager />)

    await screen.findByTestId('workflow-template-manager')
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))
    const dialog = screen.getByRole('dialog', { name: /import workflow templates/i })
    const zipInput = dialog.querySelector('input[type="file"]') as HTMLInputElement
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    const zipFile = new File([zipBytes], 'guided-development-pack.zip', {
      type: 'application/zip',
    })
    Object.defineProperty(zipFile, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(zipBytes.buffer),
    })
    fireEvent.change(zipInput, { target: { files: [zipFile] } })
    expect(zipInput.files?.[0]?.name).toBe('guided-development-pack.zip')
    const previewButton = within(dialog).getByRole('button', { name: /preview import/i })
    await waitFor(() => expect(previewButton).not.toBeDisabled())
    fireEvent.click(previewButton)

    await waitFor(() => {
      expect(sessionsApi.previewWorkflowTemplateImport).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          format: 'zip-pack',
          fileName: 'guided-development-pack.zip',
          dataBase64: 'UEsDBA==',
        }),
      })
    })
    expect(await within(dialog).findByText('Guided Development Pack')).toBeInTheDocument()
    expect(within(dialog).getByText('guided-development-pack')).toBeInTheDocument()
    expect(within(dialog).getByText('v2.0.0')).toBeInTheDocument()
    expect(within(dialog).getAllByText(/Packaged skills/i).length).toBeGreaterThan(0)
    expect(within(dialog).getByText(/user:my-skill: conflict/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/Unsupported host tools: ExternalTool/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/1 skill conflicts/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/Pack import keeps workflow IDs unchanged/i)).toBeInTheDocument()

    const candidate = screen.getByTestId('workflow-import-candidate-pack-1')
    expect(within(candidate).queryByText(/^Resolution$/i)).not.toBeInTheDocument()
    expect(within(candidate).queryByText(/^Target ID$/i)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /import selected/i })).toBeDisabled()
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
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: JSON.stringify(payload) },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /preview import/i }))

    const candidate = await screen.findByTestId('workflow-import-candidate-candidate-missing-recommended-skill')
    expect(within(candidate).getByText(/dependency diagnostics/i)).toBeInTheDocument()
    expect(within(candidate).getByText(/warning/i)).toBeInTheDocument()
    expect(within(candidate).getByText(/^missing$/i)).toBeInTheDocument()
    expect(within(candidate).getByText(/can import/i)).toBeInTheDocument()
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
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: JSON.stringify(payload) },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /preview import/i }))

    const candidate = await screen.findByTestId('workflow-import-candidate-candidate-invalid-dependency')
    expect(within(candidate).getByText(/dependency diagnostics/i)).toBeInTheDocument()
    expect(within(candidate).getByText(/error/i)).toBeInTheDocument()
    expect(within(candidate).getByText(/invalid-reference/i)).toBeInTheDocument()
    expect(within(candidate).getByText(/cannot import/i)).toBeInTheDocument()
    expect(within(candidate).getByText(/skill references require a non-empty name/i)).toBeInTheDocument()
    expect(within(candidate).getByRole('checkbox')).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: /import selected/i })).toBeDisabled()
    expect(sessionsApi.commitWorkflowTemplateImport).not.toHaveBeenCalled()
  })

  it('exports only selected templates through the desktop API and renders reusable ZIP pack metadata', async () => {
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
      schemaVersion: 1,
      format: 'zip-pack',
      exportedAt: '2026-05-26T00:00:00.000Z',
      fileName: 'workflow-export-long-linear-workflow.zip',
      contentType: 'application/zip',
      dataBase64: 'UEsDBA==',
      templates: [EDITABLE_TEMPLATE_DETAIL],
    })

    render(<WorkflowTemplateManager />)

    const row = await screen.findByTestId('workflow-template-row-user-long-linear-workflow')
    fireEvent.click(within(row).getByRole('button', { name: /export long linear workflow/i }))

    const dialog = screen.getByRole('dialog', { name: /export workflow templates/i })
    expect(dialog).toHaveClass('workflow-content-modal-overlay')
    expect(within(dialog).getByText(/excludes chat transcripts/i)).toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/Agent Development/i)).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Long Linear Workflow/i)).toBeChecked()

    fireEvent.click(within(dialog).getByRole('button', { name: /generate zip pack/i }))

    await waitFor(() => {
      expect(sessionsApi.exportWorkflowTemplates).toHaveBeenCalledWith({
        mode: 'selected',
        format: 'zip-pack',
        templates: [
          {
            source: 'user',
            id: 'long-linear-workflow',
          },
        ],
      })
    })
    expect(await screen.findByText(/exported 1 workflow templates/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/zip pack ready: workflow-export-long-linear-workflow\.zip/i)).toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/export json/i)).not.toBeInTheDocument()
  })

  it('saves generated workflow export ZIP through the file picker', async () => {
    const write = vi.fn()
    const close = vi.fn()
    const createWritable = vi.fn().mockResolvedValue({ write, close })
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable })
    Object.assign(window, { showSaveFilePicker })
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
      schemaVersion: 1,
      format: 'zip-pack',
      exportedAt: '2026-05-26T00:00:00.000Z',
      fileName: 'workflow-export-long-linear-workflow.zip',
      contentType: 'application/zip',
      dataBase64: 'UEsDBA==',
      templates: [EDITABLE_TEMPLATE_DETAIL],
    })

    render(<WorkflowTemplateManager />)

    const row = await screen.findByTestId('workflow-template-row-user-long-linear-workflow')
    fireEvent.click(within(row).getByRole('button', { name: /export long linear workflow/i }))
    const dialog = screen.getByRole('dialog', { name: /export workflow templates/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /generate zip pack/i }))
    fireEvent.click(await within(dialog).findByRole('button', { name: /save file/i }))

    await waitFor(() => {
      expect(showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({
        suggestedName: 'workflow-export-long-linear-workflow.zip',
        types: [expect.objectContaining({
          accept: { 'application/zip': ['.zip'] },
        })],
      }))
    })
    expect(write).toHaveBeenCalledWith(expect.any(Blob))
    expect((write.mock.calls[0]?.[0] as Blob).type).toBe('application/zip')
    expect(close).toHaveBeenCalled()
    expect(await within(dialog).findByText(/export file saved/i)).toBeInTheDocument()

    Reflect.deleteProperty(window, 'showSaveFilePicker')
  })

  it('saves legacy JSON workflow exports through the file picker', async () => {
    const write = vi.fn()
    const close = vi.fn()
    const createWritable = vi.fn().mockResolvedValue({ write, close })
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable })
    Object.assign(window, { showSaveFilePicker })

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
        dependencies: [],
      },
    })

    render(<WorkflowTemplateManager />)

    const row = await screen.findByTestId('workflow-template-row-user-long-linear-workflow')
    fireEvent.click(within(row).getByRole('button', { name: /export long linear workflow/i }))

    const dialog = screen.getByRole('dialog', { name: /export workflow templates/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /generate zip pack/i }))
    fireEvent.click(await within(dialog).findByRole('button', { name: /save file/i }))

    await waitFor(() => {
      expect(showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({
        suggestedName: 'workflow-export-long-linear-workflow.json',
        types: [expect.objectContaining({
          accept: { 'application/json': ['.json'] },
        })],
      }))
    })

    expect(write).toHaveBeenCalledWith(expect.stringContaining('"templates"'))
    expect(close).toHaveBeenCalled()
    expect(await within(dialog).findByText(/export file saved/i)).toBeInTheDocument()

    Reflect.deleteProperty(window, 'showSaveFilePicker')
  })
  it('downloads generated workflow export ZIP when the file picker is unavailable', async () => {
    Reflect.deleteProperty(window, 'showSaveFilePicker')
    const createObjectURL = vi.fn().mockReturnValue('blob:workflow-pack')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
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
      schemaVersion: 1,
      format: 'zip-pack',
      exportedAt: '2026-05-26T00:00:00.000Z',
      fileName: 'workflow-export-long-linear-workflow.zip',
      contentType: 'application/zip',
      dataBase64: 'UEsDBA==',
      templates: [EDITABLE_TEMPLATE_DETAIL],
    })

    render(<WorkflowTemplateManager />)

    const row = await screen.findByTestId('workflow-template-row-user-long-linear-workflow')
    fireEvent.click(within(row).getByRole('button', { name: /export long linear workflow/i }))
    const dialog = screen.getByRole('dialog', { name: /export workflow templates/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /generate zip pack/i }))
    fireEvent.click(await within(dialog).findByRole('button', { name: /save file/i }))

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    })
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:workflow-pack')
    expect(await within(dialog).findByText(/export file downloaded/i)).toBeInTheDocument()
    click.mockRestore()
  })

  it('downloads legacy JSON workflow exports when ZIP data is unavailable', async () => {
    Reflect.deleteProperty(window, 'showSaveFilePicker')
    const createObjectURL = vi.fn().mockReturnValue('blob:workflow-json')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
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
        dependencies: [],
      },
    })

    render(<WorkflowTemplateManager />)

    const row = await screen.findByTestId('workflow-template-row-user-long-linear-workflow')
    fireEvent.click(within(row).getByRole('button', { name: /export long linear workflow/i }))
    const dialog = screen.getByRole('dialog', { name: /export workflow templates/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /generate zip pack/i }))
    fireEvent.click(await within(dialog).findByRole('button', { name: /save file/i }))

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    })
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:workflow-json')
    expect(await within(dialog).findByText(/export file downloaded/i)).toBeInTheDocument()
    click.mockRestore()
  })

  it('renders JSON export dependency manifest diagnostics and explains ZIP skill bundling', async () => {
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
    fireEvent.click(within(dialog).getByRole('button', { name: /generate zip pack/i }))

    expect(await within(dialog).findByText(/export dependency diagnostics/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/release-checklist/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/plugin-disabled/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/recommended skill reference only/i)).toBeInTheDocument()
    const exportJson = within(dialog).getByLabelText(/export json/i) as HTMLTextAreaElement
    expect(exportJson.value).toContain('"dependencyManifest"')
    expect(exportJson.value).not.toContain('skillContents')
    expect(within(dialog).getByText(/JSON export lists dependency diagnostics only/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/self-contained ZIP export bundles real resolvable skill contents/i)).toBeInTheDocument()
    expect(within(dialog).queryByText(/auto-exec/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/default gates/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/plugin-primary/i)).not.toBeInTheDocument()
  })
})

describe('WorkflowTemplateEditor', () => {
  const EDITABLE_TEMPLATE: WorkflowTemplateDraft = EDITABLE_TEMPLATE_DETAIL

  it('renders grouped authoring sections for phase intent contract evidence policy and stage skills', () => {
    render(
      <WorkflowTemplateEditor
        template={EDITABLE_TEMPLATE}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const editor = screen.getByTestId('workflow-template-editor')
    expect(within(editor).getByRole('group', { name: /intent/i })).toBeInTheDocument()
    expect(within(editor).getByRole('group', { name: /^contract$/i })).toBeInTheDocument()
    expect(within(editor).getByRole('group', { name: /evidence policy/i })).toBeInTheDocument()
    expect(within(editor).getByRole('group', { name: /stage skills for plan phase/i })).toBeInTheDocument()
  })

  it('shows real phase skillBindings and preserves binding modes when saving', () => {
    const onSave = vi.fn()
    render(
      <WorkflowTemplateEditor
        template={{
          ...EDITABLE_TEMPLATE,
          phases: [
            {
              ...EDITABLE_TEMPLATE_PHASE,
              skills: [],
              skillBindings: [
                'superpowers:writing-plans',
                { id: 'workflow:memory-update', mode: 'fallback-contract' },
              ],
            },
          ],
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    const stageSkills = within(screen.getByTestId('workflow-template-editor')).getByRole('group', {
      name: /stage skills for plan phase/i,
    })
    expect(within(stageSkills).getByText('superpowers:writing-plans')).toBeInTheDocument()
    expect(within(stageSkills).getByText('workflow:memory-update')).toBeInTheDocument()
    expect(within(stageSkills).queryByText(/no stage skills selected/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      phases: [
        expect.objectContaining({
          id: 'plan',
          skillBindings: [
            'superpowers:writing-plans',
            { id: 'workflow:memory-update', mode: 'fallback-contract' },
          ],
          skills: undefined,
        }),
      ],
    }))
  })

  it('saves phase authoring fields into grouped intent contract and evidence policy payloads', () => {
    const onSave = vi.fn()
    render(
      <WorkflowTemplateEditor
        template={EDITABLE_TEMPLATE}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      phases: [
        expect.objectContaining({
          id: 'plan',
          intent: expect.objectContaining({
            objective: 'Confirm release scope.',
            role: 'release coordinator',
            intake: ['Release issue'],
          }),
          contract: expect.objectContaining({
            instructions: 'Prepare the release plan.',
            executionRules: ['Do not publish without approval.'],
            actionPolicy: expect.objectContaining({
              forbiddenActions: ['Do not publish without approval.'],
            }),
            transitionAuthority: 'user-confirmation',
          }),
          evidencePolicy: expect.objectContaining({
            outputArtifact: expect.objectContaining({
              id: 'release-plan',
              name: 'Release plan',
              kind: 'markdown',
              required: true,
            }),
            completionCriteria: expect.objectContaining({
              type: 'artifact-required',
              description: 'Release plan artifact is ready.',
            }),
            handoffRules: ['Summarize release risks for validation.'],
          }),
        }),
      ],
    }))
  })

  it('removes per-phase tool access editing and preserves legacy tool policy data on save', async () => {
    const onSave = vi.fn()
    render(
      <WorkflowTemplateEditor
        template={{
          ...EDITABLE_TEMPLATE,
          phases: [
            {
              ...EDITABLE_TEMPLATE_PHASE,
              toolPolicy: {
                allowedTools: ['Read', 'Bash', 'submit_phase_completion'],
              },
            },
          ],
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    const editor = screen.getByTestId('workflow-template-editor')
    expect(within(editor).queryByRole('group', {
      name: /tool access for plan phase/i,
    })).not.toBeInTheDocument()
    expect(within(editor).queryByText(/^tool access$/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))

    const savedPhase = onSave.mock.calls[0]?.[0]?.phases?.[0]
    expect(savedPhase.toolPolicy).toEqual({
      allowedTools: ['Read', 'Bash', 'submit_phase_completion'],
    })
    expect(savedPhase.contract.toolPolicy).toBeUndefined()
  })

  it('excludes session-owned runtime state from saved template phase data', () => {
    const onSave = vi.fn()
    render(
      <WorkflowTemplateEditor
        template={{
          ...EDITABLE_TEMPLATE,
          phases: [
            {
              ...EDITABLE_TEMPLATE_PHASE,
              runtimeState: {
                status: 'running',
                pendingConfirmation: true,
                activeTransitionId: 'transition-session-owned',
              },
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
        expect.not.objectContaining({
          runtimeState: expect.anything(),
        }),
      ],
    }))
  })

  it('lets authors select stage skill bindings per phase from the shared skill catalog', () => {
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
      name: /stage skills for plan phase/i,
    })
    expect(within(planRecommendations).getByText('Release Checklist')).toBeInTheDocument()
    expect(within(planRecommendations).queryByText('Risk Register')).not.toBeInTheDocument()
    expect(within(planRecommendations).queryByText(/auto-execute|required|gate|plugin binding|bundled contents/i)).not.toBeInTheDocument()

    fireEvent.click(within(planRecommendations).getByRole('button', {
      name: /choose stage skills for plan phase/i,
    }))
    let dialog = screen.getByRole('dialog', { name: /choose stage skills for plan phase/i })
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
      name: /stage skills for validate phase/i,
    })
    fireEvent.click(within(validateRecommendations).getByRole('button', {
      name: /choose stage skills for validate phase/i,
    }))
    dialog = screen.getByRole('dialog', { name: /choose stage skills for validate phase/i })
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
          skillBindings: ['user:release-checklist'],
        }),
        expect.objectContaining({
          id: 'validate',
          skillBindings: ['user:release-checklist', 'project:risk-register'],
        }),
      ],
    }))
    expect(fetchCatalog).toHaveBeenCalledWith('F:/github/cc-jiangxia')
    expect(fetchSkillDetail).not.toHaveBeenCalled()
  })

  it('keeps same-name stage skill bindings distinct by source and provenance', () => {
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
      name: /stage skills for plan phase/i,
    })
    fireEvent.click(within(recommendations).getByRole('button', {
      name: /choose stage skills for plan phase/i,
    }))

    const dialog = screen.getByRole('dialog', { name: /choose stage skills for plan phase/i })
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
          skillBindings: ['user:release-checklist', 'plugin-release-checklist'],
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
    expect(within(editor).getByLabelText(/^Workflow labels$/i)).toBeInTheDocument()
    expect(within(editor).getByLabelText(/^Routing policy JSON$/i)).toBeInTheDocument()
    expect(within(editor).getByLabelText(/^Phase applies to labels$/i)).toBeInTheDocument()
    expect(within(editor).queryByLabelText(/^Skills$/i)).not.toBeInTheDocument()
  })

  it('saves workflow routing policy, labels, phase applicability, and stop conditions', () => {
    const onSave = vi.fn()
    render(
      <WorkflowTemplateEditor
        template={{
          ...EDITABLE_TEMPLATE_DETAIL,
          schemaVersion: 2,
          labels: ['bug'],
          routingPolicy: { router: 'workflow-task-router-v1' },
          stopConditions: ['Confirm duplicate before stop.'],
          phases: [
            {
              ...EDITABLE_TEMPLATE_PHASE,
              appliesTo: ['bug'],
              skipWhen: {
                labels: ['documentation'],
                efforts: ['light'],
              },
              modePolicy: {
                light: 'Light review only.',
                standard: 'Standard checks.',
                heavy: 'Full regression.',
              },
            },
          ],
        }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /advanced fields/i }))
    fireEvent.change(screen.getByLabelText(/^Workflow labels$/i), {
      target: { value: 'bug, documentation' },
    })
    fireEvent.change(screen.getByLabelText(/^Routing policy JSON$/i), {
      target: { value: '{"router":"workflow-task-router-v1","mode":"auto-confirm"}' },
    })
    fireEvent.change(screen.getByLabelText(/^Stop conditions$/i), {
      target: { value: 'Confirm duplicate before stop.\nPreserve artifacts.' },
    })
    fireEvent.change(screen.getByLabelText(/^Phase applies to labels$/i), {
      target: { value: 'bug, enhancement' },
    })
    fireEvent.change(screen.getByLabelText(/^Skip when labels$/i), {
      target: { value: 'documentation' },
    })
    fireEvent.change(screen.getByLabelText(/^Skip when efforts$/i), {
      target: { value: 'light' },
    })
    fireEvent.change(screen.getByLabelText(/^Heavy mode policy$/i), {
      target: { value: 'Run full regression and release checks.' },
    })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 2,
      labels: ['bug', 'documentation'],
      routingPolicy: {
        router: 'workflow-task-router-v1',
        mode: 'auto-confirm',
      },
      stopConditions: ['Confirm duplicate before stop.', 'Preserve artifacts.'],
      phases: [
        expect.objectContaining({
          appliesTo: ['bug', 'enhancement'],
          skipWhen: {
            labels: ['documentation'],
            efforts: ['light'],
          },
          modePolicy: expect.objectContaining({
            heavy: 'Run full regression and release checks.',
          }),
        }),
      ],
    }))
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

  it('converts legacy recommended skill references into stage skill bindings when saving', () => {
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
          skillBindings: ['skill-ref-release-checklist', 'telegram:access'],
          skills: undefined,
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
  it('lists startable user templates and exposes their phases', () => {
    const onSelect = vi.fn()

    render(
      <WorkflowTemplatePicker
        templates={[LONG_TEMPLATE]}
        invalidTemplates={[
          {
            id: 'bad-template',
            source: 'user',
            message: 'Phase ids must be unique.',
          },
        ]}
        selectedTemplateId={LONG_TEMPLATE.id}
        onSelect={onSelect}
      />,
    )

    const picker = screen.getByTestId('workflow-template-picker')
    expect(within(picker).getByRole('button', { name: /long linear workflow/i })).toBeInTheDocument()
    expect(within(picker).getByText(/7 phases/i)).toBeInTheDocument()
    expect(within(picker).getByText(/^Discover$/i)).toBeInTheDocument()
    expect(within(picker).getByText(/^Shape$/i)).toBeInTheDocument()
    expect(within(picker).getByText(/^Specify$/i)).toBeInTheDocument()
    expect(within(picker).getByText(/^Release$/i)).toBeInTheDocument()
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
        templates={[LONG_TEMPLATE]}
        selectedTemplateId={null}
        onSelect={onSelect}
      />,
    )

    expect(screen.getByTestId('workflow-template-picker')).toHaveAttribute('data-workflow-selected', 'false')

    fireEvent.click(screen.getByRole('button', { name: /long linear workflow/i }))

    expect(onSelect).toHaveBeenCalledWith({
      templateId: LONG_TEMPLATE.id,
      templateSource: 'user',
    })
  })
})

describe('WorkflowStartDialog', () => {
  it('shows a Chinese workflow list, compact phase chips, invalid diagnostics, and starts only the selected template', () => {
    const onSelect = vi.fn()
    const onStart = vi.fn()
    const onClose = vi.fn()

    render(
      <WorkflowStartDialog
        open
        templates={[LONG_TEMPLATE]}
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
        selectedTemplateId={LONG_TEMPLATE.id}
        onSelect={onSelect}
        onStart={onStart}
        onClose={onClose}
        workspaceRoot="/tmp/workflow-project"
      />,
    )

    const dialog = screen.getByRole('dialog', { name: /start workflow/i })
    expect(dialog.parentElement).toHaveClass('workflow-content-modal-overlay')
    const selectedButton = within(dialog).getByRole('button', { name: /Long Linear Workflow/i })
    expect(selectedButton).toBeInTheDocument()
    expect(within(dialog).getByText(/^Development workflows$/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Recommended workflows for coding tasks/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/Guided Development Workflow/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/7 phases/i)).not.toBeInTheDocument()
    expect(within(selectedButton).getByText(/^Discover$/i)).toBeInTheDocument()
    expect(within(selectedButton).getByText(/^Shape$/i)).toBeInTheDocument()
    expect(within(selectedButton).getByText(/^Release$/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/invalid workflow templates/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/broken-template/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/template phases must be a non-empty ordered array/i)).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: /^start$/i }))

    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      templateId: LONG_TEMPLATE.id,
      templateSource: 'user',
      initialPhaseId: LONG_TEMPLATE.firstPhaseId,
      workspaceRoot: '/tmp/workflow-project',
      labels: ['new-product'],
      effort: 'standard',
    }))
  })

  it('derives the coding task label from the selected workflow and keeps suggestions limited to coding workflow types', () => {
    const onStart = vi.fn()
    const debugTemplate: WorkflowTemplateListItem = {
      ...LONG_TEMPLATE,
      id: 'debug-repair-workflow-v8',
      name: 'Debug Repair Workflow',
      labels: ['bug'],
      phaseCount: 5,
      firstPhaseId: 'debug-memory-intake',
      phaseNames: ['Inherit Context + Debug Intake', 'Problem Investigation', 'Minimal Fix with Coder Subagent'],
    }

    render(
      <WorkflowStartDialog
        open
        templates={[LONG_TEMPLATE, debugTemplate]}
        selectedTemplateId={debugTemplate.id}
        onSelect={vi.fn()}
        onStart={onStart}
        onClose={vi.fn()}
        requestText="Login button click does not respond, console has 500"
        workspaceRoot="/tmp/debug-project"
      />,
    )

    const dialog = screen.getByRole('dialog', { name: /start workflow/i })
    const routing = within(dialog).getByTestId('workflow-routing-controls')
    expect(within(routing).getByText(/^Task type$/)).toBeInTheDocument()
    expect(within(routing).getByRole('button', { name: /^Debug$/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(routing).getByRole('button', { name: /^Development$/ })).toBeInTheDocument()
    expect(within(routing).getByRole('button', { name: /^Feature Extension$/ })).toBeInTheDocument()
    expect(within(routing).queryByRole('button', { name: /documentation/i })).not.toBeInTheDocument()
    expect(within(routing).queryByRole('button', { name: /wontfix/i })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Debug Repair Workflow/i })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /problem repair workflow/i })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /long linear workflow/i })).not.toBeInTheDocument()
    expect(within(routing).queryByText(/confidence/i)).not.toBeInTheDocument()
    expect(within(routing).queryByText(/selected workflow category/i)).not.toBeInTheDocument()
    expect(within(routing).queryByText(/suggested effort/i)).not.toBeInTheDocument()
    expect(within(routing).queryByRole('button', { name: /^Manual confirm$/ })).not.toBeInTheDocument()
    expect(within(routing).queryByRole('button', { name: /auto recommend/i })).not.toBeInTheDocument()
    expect(within(routing).getByRole('button', { name: /^Standard$/ })).toHaveAttribute('aria-pressed', 'true')
    const brainstorming = within(dialog).getByTestId('workflow-brainstorming-controls')
    expect(within(brainstorming).getByRole('button', { name: /^Auto$/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(routing).queryByTestId('workflow-virtual-phase-preview')).not.toBeInTheDocument()
    expect(within(routing).queryByTestId('workflow-phase-preview')).not.toBeInTheDocument()

    fireEvent.click(within(routing).getByRole('button', { name: /^Light$/ }))
    fireEvent.click(within(brainstorming).getByRole('button', { name: /^Off$/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: /^start$/i }))

    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      labels: ['bug'],
      workspaceRoot: '/tmp/debug-project',
      effort: 'light',
      brainstormingMode: 'off',
      router: expect.objectContaining({
        primaryLabel: 'bug',
        confidence: expect.any(Number),
        rationale: expect.stringMatching(/Debug/),
      }),
    }))
  })

  it('omits the default auto brainstorming field for older workflow servers', () => {
    const onStart = vi.fn()

    render(
      <WorkflowStartDialog
        open
        templates={[LONG_TEMPLATE]}
        selectedTemplateId={LONG_TEMPLATE.id}
        onSelect={vi.fn()}
        onStart={onStart}
        onClose={vi.fn()}
        requestText="Create a SaaS bookkeeping MVP"
        workspaceRoot="/tmp/workflow-project"
      />,
    )

    const routing = screen.getByTestId('workflow-routing-controls')
    expect(within(routing).queryByTestId('workflow-virtual-phase-preview')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^start$/i }))

    expect(onStart).toHaveBeenCalledWith(expect.not.objectContaining({
      brainstormingMode: 'auto',
    }))
  })

  it('filters the workflow list when a task label is selected', () => {
    const onSelect = vi.fn()
    const featureTemplate: WorkflowTemplateListItem = {
      ...LONG_TEMPLATE,
      id: 'feature-extension-workflow-v8',
      name: 'Feature Extension Workflow',
      labels: ['enhancement'],
      source: 'user',
      phaseCount: 4,
      firstPhaseId: 'feature-memory-plan',
      phaseNames: ['Inherit Context + Mini Scope', 'Execute with Coder Subagent'],
    }
    const debugTemplate: WorkflowTemplateListItem = {
      ...LONG_TEMPLATE,
      id: 'debug-repair-workflow-v8',
      name: 'Debug Repair Workflow',
      labels: ['bug'],
      source: 'user',
      phaseCount: 5,
      firstPhaseId: 'debug-memory-intake',
      phaseNames: ['Inherit Context + Debug Intake', 'Problem Investigation'],
    }

    render(
      <WorkflowStartDialog
        open
        templates={[LONG_TEMPLATE, featureTemplate, debugTemplate]}
        selectedTemplateId={LONG_TEMPLATE.id}
        onSelect={onSelect}
        onStart={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: /start workflow/i })
    const routing = within(dialog).getByTestId('workflow-routing-controls')
    expect(within(dialog).getByRole('button', { name: /Long Linear Workflow/i })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Feature Extension Workflow/i })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Debug Repair Workflow/i })).not.toBeInTheDocument()

    fireEvent.click(within(routing).getByRole('button', { name: /^Feature Extension$/ }))

    expect(within(dialog).getByRole('button', { name: /Feature Extension Workflow/i })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Long Linear Workflow/i })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Debug Repair Workflow/i })).not.toBeInTheDocument()
    expect(onSelect).toHaveBeenCalledWith({
      templateId: 'feature-extension-workflow-v8',
      templateSource: 'user',
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
    expect(screen.getByRole('button', { name: /Long Linear Workflow/i })).toBeDisabled()
  })

  it('offers expert materials for explicit workflow inheritance', async () => {
    const onStart = vi.fn()

    render(
      <WorkflowStartDialog
        open
        templates={[LONG_TEMPLATE]}
        selectedTemplateId={LONG_TEMPLATE.id}
        onSelect={vi.fn()}
        onStart={onStart}
        onClose={vi.fn()}
        workspaceRoot="/tmp/workflow-project"
        expertMaterialRefs={[{
          runId: 'expert-run-1',
          expertId: 'repo-health-check',
          expertName: 'Project Health Check',
          packId: 'builtin-experts',
          packVersion: '1.0.0',
          summaryPath: '/tmp/project/.workflow/intake/expert-runs/expert-run-1/repo-health-check/material-summary.md',
          materialJsonPath: '/tmp/project/.workflow/intake/expert-runs/expert-run-1/repo-health-check/material.json',
          evidencePath: '/tmp/project/.workflow/intake/expert-runs/expert-run-1/repo-health-check/evidence.md',
          createdAt: '2026-07-08T00:00:00.000Z',
          title: 'Project Health Check: how to improve',
          shortSummary: 'Expert material summary',
        }]}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: /start workflow/i })
    expect(within(dialog).getByTestId('workflow-expert-material-controls')).toBeInTheDocument()
    expect(within(dialog).getByText('Project Health Check: how to improve')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: /^start$/i }))

    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      expertMaterialRefs: [expect.objectContaining({ runId: 'expert-run-1', expertId: 'repo-health-check' })],
    }))
  })

  it('localizes the canonical guided development workflow at the workflow entry', () => {
    const canonicalTemplate: WorkflowTemplateListItem = {
      ...LONG_TEMPLATE,
      id: 'efficient-constrained-dev-debug-workflow-v5',
      name: '引导式产品开发流程',
      description: '从需求梳理到产品交付，循序渐进构建完整方案。',
      phaseNames: ['应用基础确认', '需求范围', '技术计划', '分批实现与审查', '验证验收', '本地预览', '完成交付'],
      labels: ['new-product'],
      source: 'user',
    }

    render(
      <WorkflowStartDialog
        open
        templates={[canonicalTemplate]}
        selectedTemplateId={canonicalTemplate.id}
        onSelect={vi.fn()}
        onStart={vi.fn()}
        onClose={vi.fn()}
        workspaceRoot="/tmp/workflow-project"
      />,
    )

    const dialog = screen.getByRole('dialog', { name: /start workflow/i })
    const selectedButton = within(dialog).getByRole('button', { name: /Guided Product Development Workflow/i })
    expect(selectedButton).toBeInTheDocument()
    expect(within(selectedButton).getByText(/^App Foundation$/)).toBeInTheDocument()
    expect(within(selectedButton).getByText(/^Delivery Handoff$/)).toBeInTheDocument()
    expect(within(dialog).queryByText('引导式产品开发流程')).not.toBeInTheDocument()
  })

  it('is keyboard accessible and localized', () => {
    const onClose = vi.fn()
    useSettingsStore.setState({ locale: 'zh' })

    render(
      <WorkflowStartDialog
        open
        templates={[LONG_TEMPLATE]}
        selectedTemplateId={null}
        onSelect={vi.fn()}
        onStart={vi.fn()}
        onClose={onClose}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: /\u542f\u52a8\u5de5\u4f5c\u6d41/i })
    expect(dialog).toHaveFocus()
    expect(within(dialog).getByText(/\u9009\u62e9\u4e00\u4e2a\u6a21\u677f\uff0c\u5e76\u5728\u542f\u52a8\u524d\u67e5\u770b\u5b83\u7684\u9636\u6bb5\u3002/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/^开发工作流$/)).toBeInTheDocument()
    expect(within(dialog).getByText(/^推荐用于编码任务的工作流$/)).toBeInTheDocument()
    const routing = within(dialog).getByTestId('workflow-routing-controls')
    expect(within(routing).getByText(/^任务类型$/)).toBeInTheDocument()
    expect(within(routing).getByRole('button', { name: /^开发$/ })).toBeInTheDocument()
    expect(within(routing).getByRole('button', { name: /^功能扩展$/ })).toBeInTheDocument()
    expect(within(routing).getByRole('button', { name: /^调试$/ })).toBeInTheDocument()
    expect(within(routing).getByText(/^头脑风暴$/)).toBeInTheDocument()
    const brainstorming = within(routing).getByTestId('workflow-brainstorming-controls')
    expect(within(brainstorming).getByRole('button', { name: /^自动$/ })).toBeInTheDocument()
    expect(within(brainstorming).getByRole('button', { name: /^开启$/ })).toBeInTheDocument()
    expect(within(brainstorming).getByRole('button', { name: /^关闭$/ })).toBeInTheDocument()
    expect(within(routing).getByRole('button', { name: /^轻量$/ })).toBeInTheDocument()
    expect(within(routing).getByRole('button', { name: /^标准$/ })).toBeInTheDocument()
    expect(within(routing).getByRole('button', { name: /^深度$/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /\u542f\u52a8$/i })).toBeDisabled()

    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('WorkflowStatusPanel', () => {
  it('renders nothing for dialogue sessions without explicit workflow metadata', () => {
    const { container } = render(<WorkflowStatusPanel workflow={null} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders a compact Chinese workflow status bar without internal details', () => {
    render(<WorkflowStatusPanel workflow={WORKFLOW_SUMMARY} />)

    const panel = screen.getByTestId('workflow-status-panel')
    expect(within(panel).getByText(/^\u5f00\u53d1\u6d41\u7a0b/)).toBeInTheDocument()
    expect(within(panel).getByText(/^\u8fdb\u884c\u4e2d/)).toBeInTheDocument()
    expect(within(panel).getByText(/\u7b2c 2 \u6b65\uff1a\u89c4\u683c\u6f84\u6e05/)).toBeInTheDocument()
    expect(within(panel).queryByText(/agent development/i)).not.toBeInTheDocument()
    expect(within(panel).queryByText(/authority|confidence|runtime contract|phase contract/i)).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /show workflow details/i })).not.toBeInTheDocument()
    expect(within(panel).queryByTestId('workflow-status-details')).not.toBeInTheDocument()
  })

  it('uses workflow label and run status to show ordinary-user status text', () => {
    render(
      <WorkflowStatusPanel
        workflow={{
          ...WORKFLOW_SUMMARY,
          runStatus: 'paused',
          labels: ['bug', 'test'],
          effort: 'standard',
          router: {
            primaryLabel: 'bug',
            secondaryLabels: ['test'],
            effort: 'standard',
            confidence: 0.84,
            rationale: 'Routed as bug with test evidence.',
            suggestedPath: ['route', 'reproduce-debug', 'verify-review'],
          },
        }}
      />,
    )

    const panel = screen.getByTestId('workflow-status-panel')
    expect(within(panel).getByText(/^\u8c03\u8bd5\u6d41\u7a0b$/)).toBeInTheDocument()
    expect(within(panel).getByText(/^\u5df2\u6682\u505c/)).toBeInTheDocument()
    expect(within(panel).queryByText(/84% confidence|standard effort|bug/i)).not.toBeInTheDocument()
  })


  it('uses neutral text color for unknown workflow status values', () => {
    render(<WorkflowStatusPanel workflow={{
      ...WORKFLOW_SUMMARY,
      status: 'custom-status' as typeof WORKFLOW_SUMMARY.status,
      runStatus: undefined,
    }} />)

    expect(screen.getByTestId('workflow-status-panel').querySelector('span.shrink-0.font-medium')).toHaveClass('text-[var(--color-text-secondary)]')
  })

  it('keeps checkpoint archive rollback and history controls in the compact bar', () => {
    const onCreate = vi.fn()
    const onRestore = vi.fn()

    render(
      <WorkflowStatusPanel
        workflow={WORKFLOW_SUMMARY}
        checkpointActions={(
          <WorkflowGitCheckpointControls
            enabled
            latestVersion={2}
            checkpoints={[
              {
                id: 'checkpoint-2',
                ref: 'refs/cc-jiangxia/workflow/session-a/v2',
                version: 2,
                label: '\u8ba1\u5212\u786e\u8ba4',
                commit: 'abc123',
                phaseId: 'plan',
                phaseIndex: 1,
                message: 'checkpoint',
                createdAt: '2026-07-01T00:00:00.000Z',
              },
            ]}
            onCreate={onCreate}
            onRestore={onRestore}
          />
        )}
      />,
    )

    const panel = screen.getByTestId('workflow-status-panel')
    expect(within(panel).getByRole('button', { name: /\u5b58\u6863/ })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /\u56de\u9000/ })).toBeInTheDocument()
    expect(within(panel).getByRole('combobox', { name: /\u5386\u53f2\u7248\u672c/ })).toBeInTheDocument()
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

  it('locks all transition actions immediately after one click and shows the Chinese in-progress prompt', () => {
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
        }}
        stateVersion={7}
        onConfirm={onConfirm}
        onReject={onReject}
        onRetry={onRetry}
      />,
    )

    const continueButton = screen.getByRole('button', { name: /Continue with this result/i })
    fireEvent.click(continueButton)
    fireEvent.click(continueButton)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      transitionId: 'workflow-transition:specify:7:confirm',
    }))
    expect(screen.getByText('正在提交阶段操作，请稍候…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /I want to adjust it/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Pause workflow/i })).toBeDisabled()
  })

  it('unlocks controls and shows the transition error after the parent clears a failed action', () => {
    const onConfirm = vi.fn()
    const workflow = {
      ...WORKFLOW_SUMMARY,
      status: 'pending-confirmation' as const,
      activePhaseId: 'specify',
      pendingConfirmation: true,
    }
    const { rerender } = render(
      <WorkflowTransitionControls
        workflow={workflow}
        stateVersion={7}
        onConfirm={onConfirm}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Continue with this result/i }))
    expect(screen.getByRole('button', { name: /Continue with this result/i })).toBeDisabled()

    rerender(
      <WorkflowTransitionControls
        workflow={workflow}
        stateVersion={7}
        transitionError="工作流状态已更新，请根据最新状态重新选择操作。"
        transitionResetKey={1}
        onConfirm={onConfirm}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('工作流状态已更新，请根据最新状态重新选择操作。')
    expect(screen.getByRole('button', { name: /Continue with this result/i })).toBeEnabled()
  })

  it('unlocks a new phase confirmation when an older transition remains pending in the store', () => {
    const workflow = {
      ...WORKFLOW_SUMMARY,
      status: 'pending-confirmation' as const,
      activePhaseId: 'local-preview',
      pendingConfirmation: true,
    }
    const { rerender } = render(
      <WorkflowTransitionControls
        workflow={workflow}
        stateVersion={17}
        pendingTransition={{
          phaseId: 'local-preview',
          action: 'confirm',
          transitionId: 'workflow-transition:local-preview:17:confirm',
          stateVersion: 17,
        }}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Continue with this result/i })).toBeDisabled()

    rerender(
      <WorkflowTransitionControls
        workflow={{
          ...workflow,
          activePhaseId: 'delegate-implement',
          activePhaseIndex: 3,
        }}
        stateVersion={25}
        pendingTransition={{
          phaseId: 'local-preview',
          action: 'confirm',
          transitionId: 'workflow-transition:local-preview:17:confirm',
          stateVersion: 17,
        }}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Continue with this result/i })).toBeEnabled()
    expect(screen.queryByText(/正在提交阶段操作/)).not.toBeInTheDocument()
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
        onConfirm={onConfirm}
        onReject={onReject}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText(/Confirm this step/)).toBeInTheDocument()
    expect(screen.getByText(/Step summary/)).toBeInTheDocument()
    expect(screen.queryByText(/authority|confidence|runtime contract|phase contract/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /View this phase report/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /complete phase/i })).not.toBeInTheDocument()

    const continueButton = screen.getByRole('button', { name: /Continue with this result/i })
    const adjustButton = screen.getByRole('button', { name: /I want to adjust it/i })
    const pauseButton = screen.getByRole('button', { name: /Pause workflow/i })
    expect(continueButton.className).toBe(adjustButton.className)
    expect(continueButton.className).toBe(pauseButton.className)

    fireEvent.click(continueButton)

    expect(onConfirm).toHaveBeenCalledWith({
      phaseId: 'specify',
      action: 'confirm',
      transitionId: 'workflow-transition:specify:7:confirm',
      stateVersion: 7,
    })
    expect(onReject).not.toHaveBeenCalled()
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('localizes pending confirmation card copy in Chinese locale', () => {
    useSettingsStore.setState({ locale: 'zh' })

    render(
      <WorkflowTransitionControls
        workflow={{
          ...WORKFLOW_SUMMARY,
          status: 'pending-confirmation',
          activePhaseId: 'specify',
          activePhaseIndex: 0,
          phaseCount: 2,
          phaseNames: ['需求范围', '技术计划'],
          pendingConfirmation: true,
          transitionAuthority: 'user-confirmation',
        }}
        stateVersion={7}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('确认当前阶段')).toBeInTheDocument()
    expect(screen.getByText('当前阶段结果已准备好，请确认是否进入下一阶段。')).toBeInTheDocument()
    expect(screen.getByText('阶段摘要')).toBeInTheDocument()
    expect(screen.getByText(/^当前阶段：第 1 步：需求范围$/)).toBeInTheDocument()
    expect(screen.getByText('关键结果：当前阶段已完成，正在等待你的确认。')).toBeInTheDocument()
    expect(screen.queryByText('下一步：第 2 步：技术计划')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /继续使用这个结果（推荐）/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /我要调整当前结果/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /暂停工作流/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /查看本阶段报告/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Confirm this step/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Continue with this result/)).not.toBeInTheDocument()
  })

  it('localizes blocked workflow retry card in Chinese locale', () => {
    useSettingsStore.setState({ locale: 'zh' })

    render(
      <WorkflowTransitionControls
        workflow={{
          ...WORKFLOW_SUMMARY,
          status: 'failed',
          activePhaseId: 'verify',
          activePhaseIndex: 1,
          phaseCount: 2,
          pendingConfirmation: false,
          blockedReason: '测试命令失败',
        }}
        stateVersion={9}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('这个阶段需要处理')).toBeInTheDocument()
    expect(screen.getByText('测试命令失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重试当前阶段/ })).toBeInTheDocument()
    expect(screen.getByText('修复当前问题后重试，不进入下一阶段。')).toBeInTheDocument()
    expect(screen.queryByText(/This step needs attention/)).not.toBeInTheDocument()
  })

  it('sends clear next phase context only when the pending confirmation checkbox is checked', () => {
    const onConfirm = vi.fn()

    render(
      <WorkflowTransitionControls
        workflow={{
          ...WORKFLOW_SUMMARY,
          status: 'pending-confirmation',
          activePhaseId: 'specify',
          activePhaseIndex: 0,
          phaseCount: 2,
          pendingConfirmation: true,
          transitionAuthority: 'user-confirmation',
        }}
        stateVersion={7}
        onConfirm={onConfirm}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByRole('checkbox', {
      name: /use only handoff materials for next phase/i,
    })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Continue with this result/i }))
    expect(onConfirm).toHaveBeenLastCalledWith({
      phaseId: 'specify',
      action: 'confirm',
      transitionId: 'workflow-transition:specify:7:confirm',
      stateVersion: 7,
    })
  })

  it('does not show the clear-context checkbox for final phase confirmation', () => {
    render(
      <WorkflowTransitionControls
        workflow={{
          ...WORKFLOW_SUMMARY,
          status: 'pending-confirmation',
          activePhaseId: 'verify',
          activePhaseIndex: 1,
          phaseCount: 2,
          pendingConfirmation: true,
          transitionAuthority: 'user-confirmation',
        }}
        stateVersion={8}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByRole('checkbox', {
      name: /use only handoff materials for next phase/i,
    })).not.toBeInTheDocument()
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
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText(/Confirm this step/)).toBeInTheDocument()
    expect(screen.queryByText(/authority/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue with this result/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /I want to adjust it/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pause workflow/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /complete phase/i })).not.toBeInTheDocument()
  })


  it('omits blocked reason copy when blocked workflow has no reason', () => {
    render(
      <WorkflowTransitionControls
        workflow={{
          ...WORKFLOW_SUMMARY,
          status: 'failed',
          activePhaseId: 'plan',
          blockedReason: undefined,
        }}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText(/This step needs attention/)).toBeInTheDocument()
    expect(screen.queryByText(/Completion checklist is still missing/i)).not.toBeInTheDocument()
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
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText(/completion checklist is still missing/i)).toBeInTheDocument()
    expect(screen.getByText(/This step needs attention/)).toBeInTheDocument()
    expect(screen.queryByText(/recovery|authority/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm|complete phase/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Retry this step/i }))

    expect(onRetry).toHaveBeenCalledWith({
      phaseId: 'plan',
      action: 'retry',
      transitionId: 'workflow-transition:plan:9:retry',
      stateVersion: 9,
    })
  })

  it.each([
    ['blocked', 'Waiting for the user to select an OAuth account.'],
    ['unable', 'The phase cannot continue because implementation notes are unavailable.'],
  ] as const)('exposes only recovery actions for %s workflow status', (blockedStatus, blockedReason) => {
    const onRetry = vi.fn()

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
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText(/This step needs attention/)).toBeInTheDocument()
    expect(screen.queryByText(/recovery|authority/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /complete phase/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Retry this step/i }))

    expect(onRetry).toHaveBeenCalledWith({
      phaseId: 'plan',
      action: 'retry',
      transitionId: `workflow-transition:plan:10:retry`,
      stateVersion: 10,
    })
  })
})

describe('WorkflowReportLink', () => {
  it('hides report affordances until a workflow report pointer exists', () => {
    const { container } = render(<WorkflowReportLink workflow={WORKFLOW_SUMMARY} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('opens the durable final report from the workflow report API', async () => {
    vi.mocked(sessionsApi.getWorkflowReport).mockResolvedValue({
      pointer: {
        kind: 'final-report',
        sessionId: 'session-001',
        artifactId: 'final',
        schemaVersion: 1,
        createdAt: '2026-05-20T00:10:00.000Z',
        label: 'Final workflow report',
      },
      report: {
        schemaVersion: 1,
        sessionId: 'session-001',
        status: 'completed',
        conversationSummary: 'Workflow completed.',
      },
    })

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
            sessionId: 'session-001',
            artifactId: 'final',
            schemaVersion: 1,
            createdAt: '2026-05-20T00:10:00.000Z',
            label: 'Final workflow report',
            uri: 'workflow-sessions/session-001/report.json',
          },
        }}
      />,
    )

    const button = screen.getByRole('button', { name: /final workflow report/i })
    fireEvent.click(button)

    expect(sessionsApi.getWorkflowReport).toHaveBeenCalledWith('session-001')
    const dialog = await screen.findByRole('dialog', { name: /final workflow report/i })
    expect(within(dialog).getByTestId('workflow-final-report-json')).toHaveTextContent(/workflow completed/i)
    expect(within(dialog).getAllByText(/session-001/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/workflow-sessions\/session-001\/report\.json/i)).toBeInTheDocument()
  })
})


describe('WorkflowTransitionControls route targets', () => {
  it('renders the server-approved Stage 4 route target instead of inferring Stage 7', () => {
    render(
      <WorkflowTransitionControls
        workflow={{
          ...WORKFLOW_SUMMARY,
          activePhaseId: 'validate',
          activePhaseIndex: 5,
          phaseCount: 7,
          pendingConfirmation: true,
          phaseNames: ['Discover', 'Shape', 'Specify', '分批实现与审查', 'Build', 'Validate', 'Release'],
          pendingTargetPhaseId: 'delegate-implement',
          pendingTargetPhaseIndex: 3,
          pendingTargetPhaseLabel: '分批实现与审查',
        } as typeof WORKFLOW_SUMMARY & {
          pendingTargetPhaseId: string
          pendingTargetPhaseIndex: number
          pendingTargetPhaseLabel: string
        }}
        stateVersion={12}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getAllByText(/Step 4: 分批实现与审查/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Stage 7: Release/i)).not.toBeInTheDocument()
  })
})


describe('WorkflowTransitionControls Chinese route cards', () => {
  it('uses Chinese confirmation text and the server-provided Stage 4 target in Chinese UI', () => {
    useSettingsStore.setState({ locale: 'zh' })
    render(
      <WorkflowTransitionControls
        workflow={{
          ...WORKFLOW_SUMMARY,
          activePhaseId: 'validate',
          activePhaseIndex: 5,
          phaseCount: 7,
          pendingConfirmation: true,
          pendingRoute: {
            routeId: 'route-stage-4', phaseId: 'validate', fromPhaseId: 'validate',
            targetPhaseId: 'delegate-implement', approvedTargetPhaseId: 'delegate-implement',
            intent: 'jump_to_phase', rationale: '需要返回修复。', requiresConfirmation: true, status: 'pending',
          },
          pendingTargetPhaseIndex: 3,
          pendingTargetPhaseLabel: '分批实现与审查',
        } as any}
        stateVersion={12}
        onConfirm={vi.fn()}
        onReject={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('当前阶段结果已准备好，请确认是否进入下一阶段。')).toBeInTheDocument()
    expect(screen.getAllByText(/返回 Stage 4：分批实现与审查/).length).toBeGreaterThan(0)
  })
})
