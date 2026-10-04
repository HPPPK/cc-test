// @vitest-environment jsdom

// @ts-expect-error jsdom is installed in this workspace without local type declarations
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionsApi } from '../../api/sessions'
import { useSettingsStore } from '../../stores/settingsStore'
import { useUIStore } from '../../stores/uiStore'
import { WorkflowTemplateManager } from './WorkflowTemplateManager'

if (typeof document === 'undefined') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
  const { window } = dom
  Object.assign(globalThis, {
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })
}

const { cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react')
await import('@testing-library/jest-dom/vitest')

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
    applyBundledUpdate: vi.fn(),
  },
}))

const listWorkflowTemplatesMock = sessionsApi.listWorkflowTemplates as unknown as ReturnType<typeof vi.fn>
const applyBundledUpdateMock = (sessionsApi as unknown as {
  applyBundledUpdate: ReturnType<typeof vi.fn>
}).applyBundledUpdate

const updateTemplate = {
  id: 'efficient-constrained-dev-debug-workflow-v5',
  source: 'user' as const,
  version: '22',
  name: 'Guided Development Workflow',
  description: 'A managed workflow with a user-owned local ZIP.',
  phaseCount: 7,
  firstPhaseId: 'requirements',
  startable: true,
  editable: true,
  copyable: true,
  bundledUpdate: true,
  localVersion: '22',
  bundledVersion: '23',
  localSha256: 'local-sha-256',
  bundledSha256: 'bundled-sha-256',
}

const unchangedTemplate = {
  id: 'unrelated-workflow',
  source: 'user' as const,
  version: '1',
  name: 'Unrelated Workflow',
  phaseCount: 1,
  firstPhaseId: 'run',
  startable: true,
  editable: true,
  copyable: true,
}

function templateResponse(templates: Array<typeof updateTemplate | typeof unchangedTemplate>) {
  return { templates, invalidTemplates: [] }
}

describe('WorkflowTemplateManager bundled updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listWorkflowTemplatesMock.mockReset()
    applyBundledUpdateMock.mockReset()
    useSettingsStore.setState({ locale: 'en' })
    useUIStore.setState({ toasts: [] })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows a bundled update only for the affected template, confirms backup, applies it, and refreshes', async () => {
    listWorkflowTemplatesMock
      .mockResolvedValueOnce(templateResponse([updateTemplate, unchangedTemplate]))
      .mockResolvedValueOnce(templateResponse([
        { ...updateTemplate, version: '23', bundledUpdate: false, localVersion: '23' },
        unchangedTemplate,
      ]))
    applyBundledUpdateMock.mockResolvedValue({
      backupFilename: 'efficient-constrained-dev-debug-workflow-v5.backup-22.zip',
      previousVersion: '22',
      installedVersion: '23',
      installedSha256: 'bundled-sha-256',
    })

    render(<WorkflowTemplateManager />)

    const updateRow = await screen.findByTestId('workflow-template-row-user-efficient-constrained-dev-debug-workflow-v5')
    const unchangedRow = screen.getByTestId('workflow-template-row-user-unrelated-workflow')

    expect(within(updateRow).getByText('Official workflow update available')).toBeInTheDocument()
    expect(within(updateRow).getByText(/Local 22.*Official 23/)).toBeInTheDocument()
    expect(within(updateRow).getByText(/backed up before replacement/i)).toBeInTheDocument()
    expect(within(unchangedRow).queryByText('Official workflow update available')).not.toBeInTheDocument()
    expect(within(unchangedRow).queryByRole('button', { name: /update unrelated workflow/i })).not.toBeInTheDocument()

    fireEvent.click(within(updateRow).getByRole('button', { name: /update guided product development workflow/i }))

    const dialog = await screen.findByRole('dialog', { name: 'Official workflow update available' })
    expect(dialog).toHaveTextContent(/update from 22 to 23/i)
    expect(dialog).toHaveTextContent(/back up the current local ZIP/i)
    expect(dialog).toHaveTextContent(/restore the previous ZIP/i)

    fireEvent.click(within(dialog).getByRole('button', { name: /update and back up/i }))

    await waitFor(() => {
      expect(applyBundledUpdateMock).toHaveBeenCalledWith('efficient-constrained-dev-debug-workflow-v5')
      expect(sessionsApi.listWorkflowTemplates).toHaveBeenCalledTimes(2)
    })
    const refreshedRow = await screen.findByTestId('workflow-template-row-user-efficient-constrained-dev-debug-workflow-v5')
    expect(within(refreshedRow).getByText(/^23$/)).toBeInTheDocument()
    expect(screen.queryByText('Official workflow update available')).not.toBeInTheDocument()
    const toasts = useUIStore.getState().toasts
    expect(toasts[toasts.length - 1]?.message).toContain('efficient-constrained-dev-debug-workflow-v5.backup-22.zip')
  })

  it('keeps the update available and explains rollback when applying the bundled ZIP fails', async () => {
    listWorkflowTemplatesMock.mockResolvedValue(templateResponse([updateTemplate]))
    applyBundledUpdateMock.mockRejectedValue(new Error('Atomic replacement failed'))

    render(<WorkflowTemplateManager />)

    const updateRow = await screen.findByTestId('workflow-template-row-user-efficient-constrained-dev-debug-workflow-v5')
    fireEvent.click(within(updateRow).getByRole('button', { name: /update guided product development workflow/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Official workflow update available' })
    fireEvent.click(within(dialog).getByRole('button', { name: /update and back up/i }))

    expect(await within(dialog).findByText(/update failed.*existing ZIP was kept or restored.*Atomic replacement failed/i)).toBeInTheDocument()
    expect(applyBundledUpdateMock).toHaveBeenCalledTimes(1)
    expect(sessionsApi.listWorkflowTemplates).toHaveBeenCalledTimes(1)
    expect(within(updateRow).getByRole('button', { name: /update guided product development workflow/i })).toBeInTheDocument()
  })
})
