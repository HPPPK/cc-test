// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '../../stores/settingsStore'
import type { WorkflowStatusPanelSummary } from './WorkflowStatusPanel'
import { WorkflowTransitionControls } from './WorkflowTransitionControls'

describe('confirmed Batch file scope amendment', () => {
  afterEach(cleanup)
  it.each(['zh', 'en'] as const)('shows precise files and keeps confirmation bound to this request (%s)', locale => {
    useSettingsStore.setState({ locale })
    const confirm = vi.fn()
    const reject = vi.fn()
    const workflow = { status: 'pending-confirmation', activePhaseId: 'delegate-implement', activePhaseIndex: 3,
      phaseCount: 7, pendingConfirmation: false, pendingConfirmationId: 'scope-123',
      pendingRoute: { routeId: 'scope-123', intent: 'rework_current_phase', status: 'pending',
        phaseId: 'delegate-implement', fromPhaseId: 'delegate-implement', targetPhaseId: 'delegate-implement',
        approvedTargetPhaseId: 'delegate-implement', rationale: 'Register the roster app', requiresConfirmation: true,
        scopeAmendment: { batchId: 'B3', addWriteScopes: ['config/settings.py'] } },
    } as WorkflowStatusPanelSummary
    render(<WorkflowTransitionControls workflow={workflow} stateVersion={42} onConfirm={confirm} onReject={reject} onRetry={vi.fn()} />)
    expect(screen.getByText('config/settings.py')).toBeInTheDocument()
    expect(screen.getByText('Register the roster app')).toBeInTheDocument()
    expect(screen.getByText(locale === 'zh' ? '仅为 B3 新增文件修改范围' : 'Add file scope only for B3')).toBeInTheDocument()
    expect(screen.getByText(locale === 'zh'
      ? '批准后在当前阶段继续，保留不受影响的已通过批次；不会自动编辑这些文件。'
      : 'Continue in this step and retain unaffected passing batches. Approval does not edit these files automatically.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: locale === 'zh' ? /批准这些文件/ : /Approve these files/ }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ action: 'confirm', confirmationId: 'scope-123', phaseId: 'delegate-implement', stateVersion: 42 }))
    expect(reject).not.toHaveBeenCalled()
  })
})
