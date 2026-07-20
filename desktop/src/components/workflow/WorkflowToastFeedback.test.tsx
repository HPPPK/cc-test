import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import { sessionsApi } from '../../api/sessions'
import { useSettingsStore } from '../../stores/settingsStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useUIStore } from '../../stores/uiStore'
import type { WorkflowTemplateDetail, WorkflowTemplateListItem } from '../../types/session'
import { ToastContainer } from '../shared/Toast'
import { WorkflowTemplateEditor } from './WorkflowTemplateEditor'
import { WorkflowTemplateManager } from './WorkflowTemplateManager'

vi.mock('../../api/sessions', () => ({
  sessionsApi: {
    listWorkflowTemplates: vi.fn(),
    validateWorkflowTemplate: vi.fn(),
    createWorkflowTemplate: vi.fn(),
    updateWorkflowTemplate: vi.fn(),
    duplicateWorkflowTemplate: vi.fn(),
  },
}))

const template: WorkflowTemplateListItem = {
  id: 'release-workflow',
  source: 'user',
  version: '1',
  name: 'Release Workflow',
  description: 'Coordinate release readiness.',
  phaseCount: 1,
  firstPhaseId: 'plan',
  editable: true,
  copyable: true,
}

const templateDetail: WorkflowTemplateDetail = {
  schemaVersion: 1,
  id: template.id,
  source: template.source,
  version: template.version,
  name: template.name,
  description: template.description ?? '',
  editable: template.editable ?? true,
  copyable: template.copyable ?? true,
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
      transition: { authority: 'user-confirmation' },
    },
  ],
}

function renderWithToasts(element: React.ReactNode) {
  return render(<>{element}<ToastContainer /></>)
}

function expectToast(type: 'success' | 'error', message: string) {
  return waitFor(() => {
    expect(useUIStore.getState().toasts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type, message }),
    ]))
  })
}

beforeEach(() => {
  useSettingsStore.setState({ locale: 'en' })
  useUIStore.setState({ toasts: [] })
  useSessionStore.setState({ sessions: [], activeSessionId: null })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.mocked(sessionsApi.listWorkflowTemplates).mockReset()
  vi.mocked(sessionsApi.validateWorkflowTemplate).mockReset()
  vi.mocked(sessionsApi.createWorkflowTemplate).mockReset()
  vi.mocked(sessionsApi.updateWorkflowTemplate).mockReset()
  vi.mocked(sessionsApi.duplicateWorkflowTemplate).mockReset()
  useSettingsStore.setState({ locale: 'en' })
  useUIStore.setState({ toasts: [] })
  useSessionStore.setState({ sessions: [], activeSessionId: null })
})

describe('workflow template toast feedback', () => {
  it('shows a global success toast after copying a template', async () => {
    const copiedTemplate = { ...templateDetail, id: 'release-workflow-copy', name: 'Release Workflow Copy' }
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({ templates: [template], invalidTemplates: [] })
    vi.mocked(sessionsApi.duplicateWorkflowTemplate).mockResolvedValue({
      template: copiedTemplate,
      templates: [template, { ...template, id: copiedTemplate.id, name: copiedTemplate.name }],
      invalidTemplates: [],
    } as never)

    renderWithToasts(<WorkflowTemplateManager />)

    const row = await screen.findByTestId('workflow-template-row-user-release-workflow')
    fireEvent.click(within(row).getByRole('button', { name: /copy release workflow/i }))

    await expectToast('success', 'Workflow template "Release Workflow Copy" copied.')
  })

  it('shows a global error toast after copying a template fails', async () => {
    vi.mocked(sessionsApi.listWorkflowTemplates).mockResolvedValue({ templates: [template], invalidTemplates: [] })
    vi.mocked(sessionsApi.duplicateWorkflowTemplate).mockRejectedValue(new Error('Copy service unavailable'))

    renderWithToasts(<WorkflowTemplateManager />)

    const row = await screen.findByTestId('workflow-template-row-user-release-workflow')
    fireEvent.click(within(row).getByRole('button', { name: /copy release workflow/i }))

    await expectToast('error', 'Copy service unavailable')
  })

  it('shows a global success toast after saving an edited template', async () => {
    const savedTemplate = { ...templateDetail, name: 'Release Workflow Updated', version: '2' }
    vi.mocked(sessionsApi.validateWorkflowTemplate).mockResolvedValue({
      valid: true,
      template: savedTemplate,
      issues: [],
    } as never)
    vi.mocked(sessionsApi.updateWorkflowTemplate).mockResolvedValue({
      template: savedTemplate,
      templates: [],
      invalidTemplates: [],
    } as never)

    renderWithToasts(<WorkflowTemplateEditor template={templateDetail} mode="edit" onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await expectToast('success', 'Workflow template "Release Workflow Updated" saved.')
  })

  it('shows a global error toast after saving an edited template fails', async () => {
    vi.mocked(sessionsApi.validateWorkflowTemplate).mockResolvedValue({
      valid: true,
      template: templateDetail,
      issues: [],
    } as never)
    vi.mocked(sessionsApi.updateWorkflowTemplate).mockRejectedValue(new Error('Unable to save template'))

    renderWithToasts(<WorkflowTemplateEditor template={templateDetail} mode="edit" onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await expectToast('error', 'Unable to save template')
  })
})
