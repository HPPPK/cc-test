import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
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
    sendMock.mockReset()
    setPendingRequest()
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
    expect(screen.getByText('浏览器已打开 Google 的验证页面。')).not.toBeNull()
    expect(screen.queryByText('https://www.google.com/search?q=markdown+reader')).toBeNull()
    expect(screen.queryByText(/不要刷新页面/)).toBeNull()
  })

  it('names Baidu and summarizes queued verification pages without exposing the URL', () => {
    setPendingRequest({
      kind: 'expert-playwright-verification',
      verification: {
        url: 'https://wappass.baidu.com/static/captcha?opaque=private',
        engine: '百度',
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

  it('returns the selected completion without creating an AskUserQuestion card', () => {
    render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '我已完成，继续' }))

    expect(sendMock).toHaveBeenCalledWith(SESSION_ID, {
      type: 'permission_response',
      requestId: 'verification-request',
      allowed: true,
      updatedInput: { verificationResolution: 'verification_completed' },
    })
  })

  it('does not auto-resolve when the user closes, escapes, or clicks the backdrop', () => {
    render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    const dialog = screen.getByRole('dialog', { name: 'Google 需要验证' })
    const backdrop = dialog.parentElement?.querySelector('.absolute.inset-0')
    if (!backdrop) throw new Error('Expected verification modal backdrop')
    fireEvent.click(backdrop)

    expect(sendMock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Google 需要验证' })).not.toBeNull()
  })

  it('returns the explicit public-entry fallback decision', () => {
    render(
      <ExpertHumanVerificationModal
        sessionId={SESSION_ID}
        request={useChatStore.getState().sessions[SESSION_ID]!.pendingPermission}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '暂不验证，换其他入口' }))

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
