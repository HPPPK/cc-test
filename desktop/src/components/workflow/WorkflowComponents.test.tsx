import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'

import {
  WorkflowReportLink,
  WorkflowStatusPanel,
  WorkflowTemplatePicker,
  WorkflowTransitionControls,
} from './WorkflowComponents'

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
