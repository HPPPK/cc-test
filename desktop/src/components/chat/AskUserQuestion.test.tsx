import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

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

vi.mock('../controls/PermissionModeSelector', () => ({
  PermissionModeSelector: () => <button type="button">Permission mode</button>,
}))

import { AskUserQuestion } from './AskUserQuestion'
import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTabStore } from '../../stores/tabStore'

const ACTIVE_TAB = 'active-tab'

describe('AskUserQuestion', () => {
  beforeEach(() => {
    sendMock.mockReset()
    useSettingsStore.setState({ locale: 'en' })
    useTabStore.setState({
      activeTabId: ACTIVE_TAB,
      tabs: [{ sessionId: ACTIVE_TAB, title: 'Test', type: 'session', status: 'idle' }],
    })
    useChatStore.setState({
      sessions: {
        [ACTIVE_TAB]: {
          messages: [],
          chatState: 'permission_pending',
          connectionState: 'connected',
          streamingText: '',
          streamingToolInput: '',
          activeToolUseId: null,
          activeToolName: null,
          activeThinkingId: null,
          pendingPermission: {
            requestId: 'perm-1',
            toolName: 'AskUserQuestion',
            toolUseId: 'tool-1',
            input: {
              questions: [
                {
                  question: 'Should we persist data?',
                  options: [{ label: 'No' }, { label: 'Yes' }],
                },
              ],
            },
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
  })

  it('submits answers through permission_response updatedInput instead of sending a chat message', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [
            {
              question: 'Should we persist data?',
              options: [{ label: 'No' }, { label: 'Yes' }],
            },
          ],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^No$/ }))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(sendMock).toHaveBeenCalledWith(ACTIVE_TAB, {
      type: 'permission_response',
      requestId: 'perm-1',
      allowed: true,
      updatedInput: {
        questions: [
          {
            question: 'Should we persist data?',
            options: [{ label: 'No' }, { label: 'Yes' }],
          },
        ],
        answers: {
          'Should we persist data?': 'No',
        },
      },
    })
  })

  it('sends workflow choice actions as structured runtime data instead of ordinary chat text', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          workflowQuestionContext: {
            sessionId: ACTIVE_TAB,
            phaseId: 'requirements',
            stateVersion: 3,
            requestId: 'perm-1',
            issues: [{ issueId: 'ask:perm-1:0', questionId: 'confirm_next_action' }],
          },
          questions: [{
            id: 'confirm_next_action',
            prompt: '进入下一阶段？',
            choices: [{
              id: 'enter_next_stage',
              label: '进入下一阶段',
              action: 'advance_phase',
              targetPhaseId: 'feature-implement',
            }, { id: 'stay', label: '返回修改当前阶段', action: 'return_to_phase' }],
          }],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^进入下一阶段$/ }))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(sendMock).toHaveBeenCalledWith(ACTIVE_TAB, expect.objectContaining({
      type: 'permission_response',
      updatedInput: expect.objectContaining({
        answers: { confirm_next_action: '进入下一阶段' },
        workflowChoiceActions: [{
          questionId: 'confirm_next_action',
          choiceId: 'enter_next_stage',
          action: 'advance_phase',
          targetPhaseId: 'feature-implement',
        }],
      }),
    }))
  })

  it('serializes a structured jump route by stable option id and preserves the route action', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          workflowQuestionContext: {
            sessionId: ACTIVE_TAB,
            phaseId: 'requirements',
            stateVersion: 3,
            requestId: 'perm-1',
            issues: [{ issueId: 'ask:perm-1:0', questionId: 'route_after_validation' }],
          },
          questions: [{
            id: 'route_after_validation',
            prompt: '发现问题后要怎么做？',
            choices: [
              {
                id: 'return-to-stage-4',
                label: '返回 Stage 4 修复该问题',
                action: {
                  kind: 'workflow-route',
                  intent: 'jump_to_phase',
                  targetPhaseId: 'delegate-implement',
                },
              },
              { id: 'continue-stage-7', label: '继续下一阶段' },
            ],
          }],
        }}
      />,
    )

    const routeOption = screen.getByRole('button', { name: /^返回 Stage 4 修复该问题$/ })
    fireEvent.click(routeOption)
    expect(routeOption.querySelector('svg')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(sendMock).toHaveBeenCalledWith(ACTIVE_TAB, expect.objectContaining({
      type: 'permission_response',
      updatedInput: expect.objectContaining({
        answers: { route_after_validation: '返回 Stage 4 修复该问题' },
        workflowChoiceActions: [{
          questionId: 'route_after_validation',
          choiceId: 'return-to-stage-4',
          action: {
            kind: 'workflow-route',
            intent: 'jump_to_phase',
            targetPhaseId: 'delegate-implement',
          },
        }],
      }),
    }))
  })

  it('shows the real permission mode control when a workflow asks for tool access', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [
            {
              question: '当前会话中缺少创建文件的工具权限，无法自动写入项目代码。如何继续？',
              options: [
                { label: '请我手动创建目录和文件 (Recommended)' },
                { label: '授权终端访问权限', description: '如果可能，授权我使用终端来创建目录结构和文件' },
                { label: '暂停，稍后继续' },
              ],
            },
          ],
        }}
      />,
    )

    expect(screen.getByText(/choose permissions in the selector/i)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /permission mode/i }).length).toBeGreaterThan(0)
    expect((screen.getByRole('button', { name: /授权终端访问权限/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/use the permission selector above/i)).toBeTruthy()
  })

  it('does not submit fake permission grant answers as workflow authorization', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [
            {
              question: '当前会话缺少文件/终端权限。如何继续？',
              options: [
                { label: '授予文件/终端权限 (Recommended)' },
                { label: '请我手动创建目录和文件' },
                { label: '暂停，稍后继续' },
              ],
            },
          ],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /授予文件\/终端权限/i }))
    expect((screen.getByRole('button', { name: /submit/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(sendMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /请我手动创建目录和文件/i }))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(sendMock).toHaveBeenCalledWith(ACTIVE_TAB, {
      type: 'permission_response',
      requestId: 'perm-1',
      allowed: true,
      updatedInput: {
        questions: [
          {
            question: '当前会话缺少文件/终端权限。如何继续？',
            options: [
              { label: '授予文件/终端权限 (Recommended)' },
              { label: '请我手动创建目录和文件' },
              { label: '暂停，稍后继续' },
            ],
          },
        ],
        answers: {
          '当前会话缺少文件/终端权限。如何继续？': '请我手动创建目录和文件',
        },
      },
    })
  })

  it('allows multiple selections when a question is marked multiSelect', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [
            {
              question: 'Which tasks should run?',
              multiSelect: true,
              options: [
                { label: 'Lint' },
                { label: 'Tests' },
                { label: 'Build' },
              ],
            },
          ],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Lint$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Tests$/ }))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(sendMock).toHaveBeenCalledWith(ACTIVE_TAB, {
      type: 'permission_response',
      requestId: 'perm-1',
      allowed: true,
      updatedInput: {
        questions: [
          {
            question: 'Which tasks should run?',
            multiSelect: true,
            options: [
              { label: 'Lint' },
              { label: 'Tests' },
              { label: 'Build' },
            ],
          },
        ],
        answers: {
          'Which tasks should run?': 'Lint, Tests',
        },
      },
    })
  })

  it('advances to the next question after choosing a single-select option', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [
            {
              header: 'Tech',
              question: 'What technology should we use?',
              options: [{ label: 'Web' }, { label: 'Pygame' }],
            },
            {
              header: 'Scope',
              question: 'Which features are in scope?',
              options: [{ label: 'Basic' }, { label: 'Advanced' }],
            },
          ],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Web$/ }))

    expect(screen.getByText('Which features are in scope?')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Web$/ })).toBeNull()
  })

  it('preserves multiSelect for single-question input shape', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          question: 'Which tasks should run?',
          multiSelect: true,
          options: [
            { label: 'Lint' },
            { label: 'Tests' },
            { label: 'Build' },
          ],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Lint$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Tests$/ }))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(sendMock).toHaveBeenCalledWith(ACTIVE_TAB, {
      type: 'permission_response',
      requestId: 'perm-1',
      allowed: true,
      updatedInput: {
        question: 'Which tasks should run?',
        multiSelect: true,
        options: [
          { label: 'Lint' },
          { label: 'Tests' },
          { label: 'Build' },
        ],
        answers: {
          'Which tasks should run?': 'Lint, Tests',
        },
      },
    })
  })

  it('responds to the provided session instead of the active tab', () => {
    useTabStore.setState({
      activeTabId: 'other-tab',
      tabs: [
        { sessionId: 'other-tab', title: 'Other', type: 'session', status: 'idle' },
        { sessionId: 'target-tab', title: 'Target', type: 'session', status: 'idle' },
      ],
    })
    useChatStore.setState((state) => ({
      sessions: {
        ...state.sessions,
        'target-tab': {
          ...state.sessions[ACTIVE_TAB]!,
          pendingPermission: {
            requestId: 'perm-target',
            toolName: 'AskUserQuestion',
            toolUseId: 'tool-target',
            input: {
              questions: [
                {
                  question: 'Run tests?',
                  options: [{ label: 'No' }, { label: 'Yes' }],
                },
              ],
            },
          },
        },
      },
    }))

    render(
      <AskUserQuestion
        sessionId="target-tab"
        toolUseId="tool-target"
        input={{
          questions: [
            {
              question: 'Run tests?',
              options: [{ label: 'No' }, { label: 'Yes' }],
            },
          ],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Yes$/ }))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(sendMock).toHaveBeenCalledWith('target-tab', {
      type: 'permission_response',
      requestId: 'perm-target',
      allowed: true,
      updatedInput: {
        questions: [
          {
            question: 'Run tests?',
            options: [{ label: 'No' }, { label: 'Yes' }],
          },
        ],
        answers: {
          'Run tests?': 'Yes',
        },
      },
    })
  })

  it('renders answered historical questions as a compact summary instead of another input prompt', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-answered"
        input={{
          questions: [
            {
              question: 'What platform should the game use?',
              options: [{ label: 'Terminal' }, { label: 'Browser' }],
            },
          ],
        }}
        result={{
          answers: {
            'What platform should the game use?': 'Browser',
          },
        }}
      />,
    )

    expect(screen.getByText(/Answered:/)).toBeTruthy()
    expect(screen.getByText('Browser')).toBeTruthy()
    expect(screen.queryByText('Claude needs your input')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Terminal$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
  })

  it('restores answered state from persisted tool result text after session resume', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-answered"
        input={{
          questions: [
            {
              question: 'What platform should the game use?',
              options: [{ label: 'Terminal' }, { label: 'Browser' }],
            },
          ],
        }}
        result="User has answered your questions: &quot;What platform should the game use?&quot;=&quot;Browser&quot;. You can now continue with the user's answers in mind."
      />,
    )

    expect(screen.getByText(/Answered:/)).toBeTruthy()
    expect(screen.getByText('Browser')).toBeTruthy()
    expect(screen.queryByText('Claude needs your input')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Terminal$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
  })

  it('keeps custom responses scoped to each question tab', () => {
    const input = {
      questions: [
        {
          header: 'Q1',
          question: 'First question?',
          options: [{ label: 'A1' }, { label: 'B1' }],
        },
        {
          header: 'Q2',
          question: 'Second question?',
          options: [{ label: 'A2' }, { label: 'B2' }],
        },
      ],
    }

    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={input}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Type your answer...'), {
      target: { value: 'transient-q1' },
    })
    fireEvent.change(screen.getByPlaceholderText('Type your answer...'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^A1$/ }))
    fireEvent.click(screen.getByRole('button', { name: /Q1$/ }))
    fireEvent.change(screen.getByPlaceholderText('Type your answer...'), {
      target: { value: 'custom-q1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Q2$/ }))

    expect((screen.getByPlaceholderText('Type your answer...') as HTMLTextAreaElement).value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: /^A2$/ }))
    fireEvent.click(screen.getByRole('button', { name: /Q1$/ }))

    expect((screen.getByPlaceholderText('Type your answer...') as HTMLTextAreaElement).value).toBe('custom-q1')

    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(sendMock).toHaveBeenCalledWith(ACTIVE_TAB, {
      type: 'permission_response',
      requestId: 'perm-1',
      allowed: true,
      updatedInput: {
        ...input,
        answers: {
          'First question?': 'custom-q1',
          'Second question?': 'A2',
        },
      },
    })
  })

  it('submits an answered question without requiring every question tab', () => {
    const input = {
      questions: [
        {
          header: 'Scope',
          question: 'What should we include?',
          options: [{ label: 'Everything' }, { label: 'Only the current issue' }],
        },
        {
          header: 'Timing',
          question: 'When should we start?',
          options: [{ label: 'Now' }, { label: 'Later' }],
        },
      ],
    }

    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={input}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Type your answer...'), {
      target: { value: 'Please only fix the current issue and keep the workflow unchanged.' },
    })

    const submitButton = screen.getByRole('button', { name: /submit/i })
    expect((submitButton as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(submitButton)

    expect(sendMock).toHaveBeenCalledWith(ACTIVE_TAB, {
      type: 'permission_response',
      requestId: 'perm-1',
      allowed: true,
      updatedInput: {
        ...input,
        answers: {
          'What should we include?': 'Please only fix the current issue and keep the workflow unchanged.',
        },
      },
    })
  })
  it('uses a multiline custom response box and submits it with Ctrl+Enter', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [
            {
              question: 'What context should we restore?',
              options: [{ label: 'Skip' }],
            },
          ],
        }}
      />,
    )

    const textarea = screen.getByPlaceholderText('Type your answer...')
    expect(textarea.tagName).toBe('TEXTAREA')
    expect(textarea.getAttribute('rows')).toBe('3')

    fireEvent.change(textarea, {
      target: { value: 'First restored context line\nSecond restored context line' },
    })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(sendMock).not.toHaveBeenCalled()

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

    expect(sendMock).toHaveBeenCalledWith(ACTIVE_TAB, {
      type: 'permission_response',
      requestId: 'perm-1',
      allowed: true,
      updatedInput: {
        questions: [
          {
            question: 'What context should we restore?',
            options: [{ label: 'Skip' }],
          },
        ],
        answers: {
          'What context should we restore?': 'First restored context line\nSecond restored context line',
        },
      },
    })
  })

  it('keeps a question non-terminal until acknowledgement and restores it after a rejected response', async () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [{
            question: 'Which scope should be used?',
            options: [{ label: 'Current scope' }, { label: 'Expanded scope' }],
          }],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Current scope' }))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(screen.queryByText(/answered/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()

    await act(async () => {
      useChatStore.setState((state) => ({
        sessions: {
          ...state.sessions,
          [ACTIVE_TAB]: {
            ...state.sessions[ACTIVE_TAB]!,
            permissionResponse: {
              requestId: 'perm-1',
              status: 'rejected',
              message: 'The selected action was rejected. Please choose again.',
            },
            pendingPermission: state.sessions[ACTIVE_TAB]!.pendingPermission,
            chatState: 'permission_pending',
          },
        },
      }))
    })

    expect(screen.getByRole('alert').textContent).toContain('Please choose again')
    expect(screen.getByRole('button', { name: /submit/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it('renders aborted permission results as terminal instead of asking again', () => {
    useChatStore.setState((state) => ({
      sessions: {
        ...state.sessions,
        [ACTIVE_TAB]: {
          ...state.sessions[ACTIVE_TAB]!,
          pendingPermission: null,
          chatState: 'idle',
        },
      },
    }))

    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [
            {
              question: 'Which scope?',
              options: [{ label: 'Single page' }, { label: 'Tabs' }],
            },
          ],
        }}
        result="Tool permission request failed: AbortError"
      />,
    )

    expect(screen.queryByPlaceholderText('Type your answer...')).toBeNull()
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
    expect(screen.getByText(/Tool permission request failed: AbortError/)).toBeTruthy()
  })
})
