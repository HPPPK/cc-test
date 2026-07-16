// @vitest-environment jsdom

// @ts-expect-error jsdom is installed in this workspace without local type declarations
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkflowGitCheckpointControls } from './WorkflowGitCheckpointControls'
import type { WorkflowGitCheckpoint } from '../../types/session'

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
    HTMLSelectElement: window.HTMLSelectElement,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
  })
}

const { cleanup, fireEvent, render, screen } = await import('@testing-library/react')
await import('@testing-library/jest-dom/vitest')

const checkpoints: WorkflowGitCheckpoint[] = [
  {
    id: 'v2',
    ref: 'refs/cc-jiangxia/workflow/session-session-a/v2',
    version: 2,
    commit: 'commit-2',
    phaseId: 'implementation',
    phaseIndex: 1,
    label: 'Implementation save',
    createdAt: '2026-07-03T00:00:00.000Z',
    message: 'cc-jiangxia workflow checkpoint v2 - Implementation save',
  },
  {
    id: 'v1',
    ref: 'refs/cc-jiangxia/workflow/session-session-a/v1',
    version: 1,
    commit: 'commit-1',
    phaseId: 'plan',
    phaseIndex: 0,
    label: 'Plan save',
    createdAt: '2026-07-02T00:00:00.000Z',
    message: 'cc-jiangxia workflow checkpoint v1 - Plan save',
  },
]

describe('WorkflowGitCheckpointControls', () => {
  afterEach(() => cleanup())

  it('shows the latest saved version and triggers storage', () => {
    const onCreate = vi.fn()

    render(
      <WorkflowGitCheckpointControls
        enabled
        latestVersion={2}
        checkpoints={checkpoints}
        onCreate={onCreate}
        onRestore={vi.fn()}
      />,
    )

    expect(screen.getByTestId('workflow-git-checkpoint-latest')).toHaveTextContent('最近 v2')
    fireEvent.click(screen.getByRole('button', { name: '存档' }))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('lets users select a checkpoint version and roll back to it', () => {
    const onRestore = vi.fn()

    render(
      <WorkflowGitCheckpointControls
        enabled
        latestVersion={2}
        checkpoints={checkpoints}
        onCreate={vi.fn()}
        onRestore={onRestore}
      />,
    )

    fireEvent.change(screen.getByLabelText('历史版本'), { target: { value: 'v1' } })
    fireEvent.click(screen.getByRole('button', { name: '回退' }))

    expect(onRestore).toHaveBeenCalledWith('v1')
  })

  it('disables storage when checkpoint workspace is unavailable', () => {
    const onCreate = vi.fn()

    render(
      <WorkflowGitCheckpointControls
        enabled={false}
        reason="Workflow checkpoints require a git repository workspace."
        latestVersion={null}
        checkpoints={[]}
        onCreate={onCreate}
        onRestore={vi.fn()}
      />,
    )

    expect(screen.getByTestId('workflow-git-checkpoint-controls')).toHaveAttribute(
      'title',
      'Workflow checkpoints require a git repository workspace.',
    )
    expect(screen.getByRole('button', { name: '存档' })).toBeDisabled()
    expect(screen.getByText('Workflow checkpoints require a git repository workspace.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '存档' }))
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '回退' })).toBeDisabled()
    expect(screen.getByTestId('workflow-git-checkpoint-latest')).toHaveTextContent('尚未存储')
  })
})
