import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const { notifyDesktopMock, sendMock, requestBrowserVisibilityMock, requestVerificationCheckMock } = vi.hoisted(() => ({
  notifyDesktopMock: vi.fn(),
  sendMock: vi.fn(),
  requestBrowserVisibilityMock: vi.fn(async () => ({ activity: null, presentationConfirmed: true })),
  requestVerificationCheckMock: vi.fn(async () => ({ activity: null })),
}))

vi.mock('../../api/websocket', () => ({
  wsManager: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onMessage: vi.fn(() => () => {}),
    clearHandlers: vi.fn(),
    send: sendMock,
  },
}))

vi.mock('../../api/sessions', () => ({
  sessionsApi: {
    getMessages: vi.fn(async () => ({ messages: [] })),
    getSlashCommands: vi.fn(async () => ({ commands: [] })),
  },
}))

vi.mock('../../api/experts', () => ({
  expertsApi: {
    requestResearchBrowserVisibility: requestBrowserVisibilityMock,
    requestResearchBrowserVerificationCheck: requestVerificationCheckMock,
  },
}))

vi.mock('../../lib/desktopNotifications', () => ({
  notifyDesktop: notifyDesktopMock,
}))

import { ExpertHumanVerificationModal } from './ExpertHumanVerificationModal'
import { useChatStore } from '../../stores/chatStore'

const SESSION_ID = 'expert-session'
const input = {
  kind: 'expert-playwright-verification',
  verification: {
    url: 'https://www.google.com/search?q=markdown+reader',
    title: 'Google verification',
    engine: 'Google',
    detail: 'CAPTCHA',
  },
  queue: { remaining: 0 },
}

function setPendingRequest(requestInput: unknown = input, toolName = 'Playwright') {
  useChatStore.setState({
    sessions: {
      [SESSION_ID]: {
        messages: [],
        chatState: 'permission_pending',
        connectionState: 'connected',
        streamingText: '',
        streamingToolInput: '',
        activeToolUseId: null,
        activeToolName: null,
        activeThinkingId: null,
        pendingPermission: {
          requestId: 'verification-request',
          toolName,
          toolUseId: 'child-playwright-1',
          input: requestInput,
        },
        pendingComputerUsePermission: null,
        tokenUsage: { input_tokens: 0, output_tokens: 0 },
        elapsedSeconds: 0,
        statusVerb: '',
        slashCommands: [],
        agentTaskNotifications: {},
        elapsedTimer: null,
      },
    },
  })
}

describe('ExpertHumanVerificationModal', () => {
  beforeEach(() => {
    notifyDesktopMock.mockReset()
    sendMock.mockReset()
    requestBrowserVisibilityMock.mockReset()
    requestBrowserVisibilityMock.mockResolvedValue({ activity: null, presentationConfirmed: true })
    requestVerificationCheckMock.mockReset()
    requestVerificationCheckMock.mockResolvedValue({ activity: null })
    setPendingRequest()
  })

  it('sends a desktop reminder when research is blocked for human verification', () => {
    render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    expect(notifyDesktopMock).toHaveBeenCalledWith(expect.objectContaining({
      dedupeKey: 'expert-human-verification:expert-session:verification-request',
      title: expect.stringContaining('Google'),
      requestAttention: true,
      target: { type: 'session', sessionId: SESSION_ID },
    }))
  })

  it('shows only the website and the concrete action, not a long verification URL', () => {
    render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Google 需要验证' })).not.toBeNull()
    expect(screen.getByText('请完成：页面显示的安全验证')).not.toBeNull()
    expect(screen.getByText(/已为你保留 Google 的验证页面。完成网页验证后，软件会自动检测并继续当前检索/)).not.toBeNull()
    expect(screen.getByText(/点击“打开验证浏览器”才会按你的这次操作恢复该托管 Chromium/)).not.toBeNull()
    expect(screen.getByRole('button', { name: '打开验证浏览器' })).not.toBeNull()
    expect(screen.getByText(/关闭此提示会改查其他公开入口/)).not.toBeNull()
    expect(screen.queryByText('https://www.google.com/search?q=markdown+reader')).toBeNull()
    expect(screen.queryByText(/不要刷新页面/)).toBeNull()
  })

  it('uses the same manual-window explanation for historical verification payloads', async () => {
    setPendingRequest({
      ...input,
      verification: {
        ...input.verification,
        windowPresentationConfirmed: false,
      },
    })

    render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    expect(screen.getByText(/点击“打开验证浏览器”才会按你的这次操作恢复该托管 Chromium/)).not.toBeNull()
    expect(screen.queryByText(/未能确认 Chromium 已自动恢复到前台/)).toBeNull()
    expect(screen.queryByRole('button', { name: '我已完成，继续' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '立即检查' }))
    await waitFor(() => expect(requestVerificationCheckMock).toHaveBeenCalledWith(SESSION_ID))
    expect(sendMock).not.toHaveBeenCalled()
  })
  it('names Baidu and summarizes queued verification pages without exposing the URL', () => {
    setPendingRequest({
      kind: 'expert-playwright-verification',
      verification: {
        url: 'https://wappass.baidu.com/static/captcha?opaque=private',
        engine: '百度',
        detail: 'Baidu security verification',
      },
      queue: { remaining: 2 },
    })

    render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    expect(screen.getByRole('dialog', { name: '百度 需要验证' })).not.toBeNull()
    expect(screen.getByText('请完成：百度安全验证（如拖动滑块）')).not.toBeNull()
    expect(screen.getByText('还有 2 个网站验证，会按顺序提示。')).not.toBeNull()
    expect(screen.queryByText(/wappass.baidu.com/)).toBeNull()
  })

  it('does not label an ordinary Baidu page as a slider challenge without a concrete challenge kind', () => {
    setPendingRequest({
      kind: 'expert-playwright-verification',
      verification: {
        url: 'https://www.baidu.com/',
        engine: '百度',
        detail: 'A browser action timed out while waiting for a selector.',
      },
      queue: { remaining: 0 },
    })

    render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    expect(screen.getByText('请完成：页面显示的安全验证')).not.toBeNull()
    expect(screen.queryByText('请完成：百度安全验证（如拖动滑块）')).toBeNull()
  })

  it('opens the preserved managed browser only after the user explicitly requests it', async () => {
    render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '打开验证浏览器' }))

    await waitFor(() => expect(requestBrowserVisibilityMock).toHaveBeenCalledWith(SESSION_ID))
    expect((await screen.findByRole('status')).textContent).toContain('验证浏览器已打开')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('uses passive immediate checking without completing the verification or creating an AskUserQuestion card', async () => {
    render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    expect(screen.queryByRole('button', { name: '我已完成，继续' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '立即检查' }))

    await waitFor(() => expect(requestVerificationCheckMock).toHaveBeenCalledWith(SESSION_ID))
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('treats Escape as an explicit decision to check another public entry', () => {
    render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(sendMock).toHaveBeenCalledWith(SESSION_ID, {
      type: 'permission_response',
      requestId: 'verification-request',
      allowed: true,
      updatedInput: { verificationResolution: 'switch_public_entry' },
    })
  })

  it('treats the close button as an explicit decision to check another public entry', () => {
    render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))

    expect(sendMock).toHaveBeenCalledWith(SESSION_ID, {
      type: 'permission_response',
      requestId: 'verification-request',
      allowed: true,
      updatedInput: { verificationResolution: 'switch_public_entry' },
    })
  })

  it('treats a backdrop click as an explicit decision to check another public entry', () => {
    render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Google 需要验证' })
    const backdrop = dialog.parentElement?.querySelector('.absolute.inset-0')
    if (!backdrop) throw new Error('Expected verification modal backdrop')
    fireEvent.click(backdrop)

    expect(sendMock).toHaveBeenCalledWith(SESSION_ID, {
      type: 'permission_response',
      requestId: 'verification-request',
      allowed: true,
      updatedInput: { verificationResolution: 'switch_public_entry' },
    })
  })

  it('returns the explicit public-entry fallback decision', () => {
    render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '改查其他入口' }))

    expect(sendMock).toHaveBeenCalledWith(SESSION_ID, {
      type: 'permission_response',
      requestId: 'verification-request',
      allowed: true,
      updatedInput: { verificationResolution: 'switch_public_entry' },
    })
  })

  it('does not treat an ordinary AskUserQuestion as a verification modal', () => {
    setPendingRequest({
      questions: [{
        id: 'product-direction',
        prompt: 'Which product direction should we use?',
        choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      }],
    }, 'AskUserQuestion')

    const { container } = render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    expect(container.innerHTML).toBe('')
  })
})
