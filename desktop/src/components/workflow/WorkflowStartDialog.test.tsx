import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkflowStartDialog } from './WorkflowStartDialog'
import { useSettingsStore } from '../../stores/settingsStore'

const TEMPLATE = {
  id: 'requirements-to-implementation',
  source: 'user' as const,
  version: '1.0.0',
  name: 'Requirements to Implementation',
  description: 'Clarify, design, plan, implement, and verify.',
  phaseCount: 5,
  firstPhaseId: 'requirements-clarification',
  phaseNames: [
    'Requirements clarification',
    'Technical design',
    'Implementation planning',
    'Implementation',
    'Verification',
  ],
}

const BASE_PROPS = {
  open: true,
  templates: [],
  invalidTemplates: [],
  selectedTemplateId: null,
  selectedTemplateSource: null,
  onSelect: vi.fn(),
  onStart: vi.fn(),
  onClose: vi.fn(),
  requestText: '',
  workspaceRoot: '/repo',
}

describe('WorkflowStartDialog template loading recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ locale: 'en' })
  })

  it('shows loading status instead of an empty-template message while templates are being fetched', () => {
    render(<WorkflowStartDialog {...BASE_PROPS} templatesLoading />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading workflows…')
    expect(screen.queryByText('No workflow templates are available.')).not.toBeInTheDocument()
  })

  it('renders the template phase names without shortening them', () => {
    const template = {
      ...TEMPLATE,
      phaseNames: ['Inherit Context + Mini Scope'],
      phaseCount: 1,
      firstPhaseId: 'feature-memory-plan',
    }

    render(
      <WorkflowStartDialog
        {...BASE_PROPS}
        templates={[template]}
        selectedTemplateId={template.id}
        selectedTemplateSource={template.source}
      />,
    )

    expect(screen.getByText('Inherit Context + Mini Scope')).toBeInTheDocument()
  })
  it('shows a retry action after loading fails and renders recovered templates', () => {
    const onRetryTemplates = vi.fn()
    const { rerender } = render(
      <WorkflowStartDialog
        {...BASE_PROPS}
        templatesLoadFailed
        onRetryTemplates={onRetryTemplates}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load workflows.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetryTemplates).toHaveBeenCalledTimes(1)

    rerender(
      <WorkflowStartDialog
        {...BASE_PROPS}
        templates={[TEMPLATE]}
        selectedTemplateId={TEMPLATE.id}
        selectedTemplateSource={TEMPLATE.source}
        onRetryTemplates={onRetryTemplates}
      />,
    )

    expect(screen.getByRole('button', { name: /Requirements to Implementation/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})