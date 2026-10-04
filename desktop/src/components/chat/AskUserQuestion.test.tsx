import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

const { notifyDesktopMock, sendMock } = vi.hoisted(() => ({
  notifyDesktopMock: vi.fn(),
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

vi.mock('../../lib/desktopNotifications', () => ({
  notifyDesktop: notifyDesktopMock,
}))

import { AskUserQuestion } from './AskUserQuestion'
import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTabStore } from '../../stores/tabStore'

const ACTIVE_TAB = 'active-tab'

describe('AskUserQuestion', () => {
  beforeEach(() => {
    notifyDesktopMock.mockReset()
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

  it('does not render a superseded AskUserQuestion whose tool use is not the active permission request', () => {
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
        toolUseId="superseded-tool-use"
        input={{
          questions: [{
            question: 'Which scope should be used?',
            options: [{ label: 'Current scope' }, { label: 'Expanded scope' }],
          }],
        }}
      />,
    )

    expect(screen.queryByText('Claude needs your input')).toBeNull()
    expect(screen.queryByTestId('ask-user-option-0-Current scope')).toBeNull()
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
  })

  it('notifies the user when a successful AskUserQuestion call is waiting for an answer', () => {
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

    expect(notifyDesktopMock).toHaveBeenCalledWith({
      dedupeKey: 'ask-user-question:active-tab:perm-1',
      title: 'Claude needs your input',
      body: 'Should we persist data?',
      requestAttention: true,
      target: { type: 'session', sessionId: ACTIVE_TAB },
    })
  })

  it('does not notify again for an AskUserQuestion that already has a result', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [{ question: 'Should we persist data?' }],
        }}
        result={{ answers: { 'Should we persist data?': 'Yes' } }}
      />,
    )

    expect(notifyDesktopMock).not.toHaveBeenCalled()
  })

  it('shows the commercialization free-text field only after “other” is selected and retains the choice id', () => {
    const input = {
      questions: [{
        id: 'expert-intake:core-differentiation',
        question: 'Which differentiation should be researched?',
        intakeFreeTextOptionId: 'other',
        options: [
          { id: 'fewer-steps', label: 'Fewer steps' },
          { id: 'other', label: 'Other / explain' },
        ],
      }],
    }
    useChatStore.setState((state) => ({
      sessions: {
        ...state.sessions,
        [ACTIVE_TAB]: {
          ...state.sessions[ACTIVE_TAB]!,
          pendingPermission: {
            requestId: 'perm-1',
            toolName: 'AskUserQuestion',
            toolUseId: 'tool-1',
            input,
          },
        },
      },
    }))

    render(<AskUserQuestion toolUseId="tool-1" input={input} />)
    expect(screen.queryByRole('textbox')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Other \/ explain/i }))
    const textarea = screen.getByRole('textbox')
    expect((screen.getByRole('button', { name: /submit/i }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(textarea, { target: { value: 'A local-first privacy benefit' } })
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(sendMock).toHaveBeenCalledWith(ACTIVE_TAB, expect.objectContaining({
      type: 'permission_response',
      updatedInput: expect.objectContaining({
        answers: { 'expert-intake:core-differentiation': 'A local-first privacy benefit' },
        answerChoiceIds: { 'expert-intake:core-differentiation': ['other'] },
      }),
    }))
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

  it('submits a legacy action-shaped option as an ordinary current-phase answer', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          workflowQuestionContext: {
            sessionId: ACTIVE_TAB,
            phaseId: 'requirements',
            stateVersion: 3,
            requestId: 'perm-1',
            issues: [{ issueId: 'ask:perm-1:0', questionId: 'adjustment' }],
          },
          questions: [{
            id: 'adjustment',
            prompt: 'What should be adjusted?',
            choices: [
              { id: 'adjust', label: 'Adjust current work', action: 'return_to_phase' },
              { id: 'continue', label: 'Continue current work' },
            ],
          }],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Adjust current work' }))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(sendMock).toHaveBeenCalledWith(ACTIVE_TAB, expect.objectContaining({
      type: 'permission_response',
      updatedInput: expect.objectContaining({ answers: { adjustment: 'Adjust current work' } }),
    }))
    const sent = sendMock.mock.calls[sendMock.mock.calls.length - 1]?.[1] as { updatedInput?: Record<string, unknown> }
    expect(sent.updatedInput?.workflowChoiceActions).toBeUndefined()
  })

  it('does not serialize a legacy structured jump action from an Ask answer', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [{
            id: 'route-after-validation',
            prompt: 'What should happen after validation?',
            choices: [
              {
                id: 'repair',
                label: 'Return to repair',
                action: { kind: 'workflow-route', intent: 'jump_to_phase', targetPhaseId: 'delegate-implement' },
              },
              { id: 'continue', label: 'Continue current work' },
            ],
          }],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Return to repair' }))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    const sent = sendMock.mock.calls[sendMock.mock.calls.length - 1]?.[1] as { updatedInput?: Record<string, unknown> }
    expect(sent.updatedInput?.answers).toEqual({ 'route-after-validation': 'Return to repair' })
    expect(sent.updatedInput?.workflowChoiceActions).toBeUndefined()
  })

  it('submits a business authorization answer without rendering or invoking runtime permission control', () => {
    const question = '\u662f\u5426\u5177\u5907\u5b66\u6821\u6388\u6743\uff0c\u53ef\u4ee5\u5904\u7406\u771f\u5b9e\u5b66\u751f\u6570\u636e\uff1f'
    const authorized = '\u6709\u6388\u6743\uff08\u63a8\u8350\uff09'

    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{ questions: [{ question, options: [{ label: authorized }, { label: '\u6682\u65e0\u6388\u6743' }] }] }}
      />,
    )

    expect(screen.queryByText(/choose permissions in the selector/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /permission mode/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: authorized }))
    expect((screen.getByRole('button', { name: /submit/i }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(sendMock).toHaveBeenCalledWith(ACTIVE_TAB, {
      type: 'permission_response',
      requestId: 'perm-1',
      allowed: true,
      updatedInput: {
        questions: [{ question, options: [{ label: authorized }, { label: '\u6682\u65e0\u6388\u6743' }] }],
        answers: { [question]: authorized },
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

  it('keeps an accepted answer compact after the card remounts before its tool result is persisted', () => {
    const answeredSession = {
      ...useChatStore.getState().sessions[ACTIVE_TAB]!,
      pendingPermission: null,
      permissionResponse: { requestId: 'perm-1', status: 'accepted' as const },
      answeredAskUserQuestions: {
        'tool-1': {
          requestId: 'perm-1',
          status: 'accepted' as const,
          answers: { 'Should we persist data?': 'Yes' },
        },
      },
    }
    useChatStore.setState((state) => ({
      sessions: { ...state.sessions, [ACTIVE_TAB]: answeredSession as never },
    }))

    const firstView = render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [{ question: 'Should we persist data?', options: [{ label: 'No' }, { label: 'Yes' }] }],
        }}
      />,
    )

    expect(screen.getByText(/Answered:/)).toBeTruthy()
    expect(screen.getByText('Yes')).toBeTruthy()
    expect(screen.queryByText('Claude needs your input')).toBeNull()
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()

    firstView.unmount()
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [{ question: 'Should we persist data?', options: [{ label: 'No' }, { label: 'Yes' }] }],
        }}
      />,
    )

    expect(screen.getByText(/Answered:/)).toBeTruthy()
    expect(screen.queryByText('Claude needs your input')).toBeNull()
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
  })

  it('keeps a submitted answer compact after a tab/window remount before acknowledgement', () => {
    const firstView = render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [{ question: 'Should we persist data?', options: [{ label: 'No' }, { label: 'Yes' }] }],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    expect(screen.getByText('Answer submitted:')).toBeTruthy()
    expect(screen.queryByText('Claude needs your input')).toBeNull()

    firstView.unmount()
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [{ question: 'Should we persist data?', options: [{ label: 'No' }, { label: 'Yes' }] }],
        }}
      />,
    )

    expect(screen.getByText('Answer submitted:')).toBeTruthy()
    expect(screen.getByText('Yes')).toBeTruthy()
    expect(screen.queryByText('Claude needs your input')).toBeNull()
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
  })

  it('collapses a legacy accepted acknowledgement when no persisted result is available yet', () => {
    useChatStore.setState((state) => ({
      sessions: {
        ...state.sessions,
        [ACTIVE_TAB]: {
          ...state.sessions[ACTIVE_TAB]!,
          pendingPermission: null,
          permissionResponse: { requestId: 'legacy-perm-1', toolUseId: 'tool-1', status: 'accepted' },
        },
      },
    }))

    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          questions: [{ question: 'Should we persist data?', options: [{ label: 'No' }, { label: 'Yes' }] }],
        }}
      />,
    )

    expect(screen.getByText(/Answered:/)).toBeTruthy()
    expect(screen.queryByText('Claude needs your input')).toBeNull()
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

  it('collapses a submitted answer before acknowledgement and restores the form after rejection', async () => {
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

    expect(screen.getByText('Answer submitted:')).toBeTruthy()
    expect(screen.getByText('Current scope')).toBeTruthy()
    expect(screen.queryByText('Claude needs your input')).toBeNull()
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()

    await act(async () => {
      useChatStore.getState().handleServerMessage(ACTIVE_TAB, {
        type: 'permission_response_ack',
        requestId: 'perm-1',
        status: 'rejected',
        message: 'The selected action was rejected. Please choose again.',
      })
    })

    expect(screen.getByRole('alert').textContent).toContain('Please choose again')
    expect(screen.getByRole('button', { name: /submit/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it('collapses an unrecovered input-validation failure instead of leaving a disabled question form', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-validation-failure"
        input={{
          questions: [{
            question: 'Which scope?',
            options: [{ label: 'Single page' }, { label: 'Tabs' }],
          }],
        }}
        result="<tool_use_error>InputValidationError: AskUserQuestion failed because an unexpected parameter `header` was provided</tool_use_error>"
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain('InputValidationError')
    expect(screen.queryByTestId('ask-user-option-0-Single page')).toBeNull()
    expect(screen.queryByPlaceholderText('Type your answer...')).toBeNull()
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
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

  it('returns stable option IDs only for a trusted research recovery question', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          metadata: {
            research_recovery_field: 'competitor_pricing',
            research_recovery_state: 'access_limited',
            attempted_urls: ['https://example.com/pricing'],
          },
          questions: [{
            id: 'research-recovery:competitor_pricing',
            prompt: '竞品价格页受限后如何处理？',
            choices: [
              { id: 'provide_alternative_source', label: '提供链接' },
              { id: 'provide_internal_material', label: '提供材料' },
              { id: 'keep_evidence_gap', label: '保留缺口' },
              { id: 'keep_hypothesis', label: '保留假设' },
            ],
          }],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^保留缺口$/ }))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(sendMock).toHaveBeenCalledWith(ACTIVE_TAB, expect.objectContaining({
      updatedInput: expect.objectContaining({
        answers: { 'research-recovery:competitor_pricing': '保留缺口' },
        answerChoiceIds: { 'research-recovery:competitor_pricing': ['keep_evidence_gap'] },
      }),
    }))
  })

  it('returns stable option IDs for a research delivery confirmation question', () => {
    render(
      <AskUserQuestion
        toolUseId="tool-1"
        input={{
          metadata: {
            expert_research_delivery: {
              question_id: 'research-delivery:commercialization-report',
              unresolved_evidence: ['Need a user-provided App Store screenshot'],
            },
          },
          questions: [{
            id: 'research-delivery:commercialization-report',
            prompt: '是否接受当前证据缺口并交付？',
            choices: [
              { id: 'accept_current_scope', label: '交付当前范围' },
              { id: 'provide_material_and_continue', label: '继续补证' },
              { id: 'pause_research', label: '暂不交付' },
            ],
          }],
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^交付当前范围$/ }))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(sendMock).toHaveBeenCalledWith(ACTIVE_TAB, expect.objectContaining({
      updatedInput: expect.objectContaining({
        answers: { 'research-delivery:commercialization-report': '交付当前范围' },
        answerChoiceIds: { 'research-delivery:commercialization-report': ['accept_current_scope'] },
      }),
    }))
  })

  it('queues two live questions through submit, acknowledgement and remount without hiding an unanswered request', async () => {
    useChatStore.setState(state => ({ sessions: { ...state.sessions, [ACTIVE_TAB]: { ...state.sessions[ACTIVE_TAB]!, pendingPermission: null } } }))
    const input1 = { questions: [{ question: 'First real question?', options: [{ label: 'First answer' }, { label: 'No' }] }] }
    const input2 = { questions: [{ question: 'Second real question?', options: [{ label: 'Second answer' }, { label: 'No' }] }] }
    await act(async () => {
      for (const [n, input] of [[1, input1], [2, input2]] as const) {
        useChatStore.getState().handleServerMessage(ACTIVE_TAB, { type: 'permission_request', requestId: 'perm-' + n, toolUseId: 'tool-' + n, toolName: 'AskUserQuestion', input })
      }
    })
    const cards = <><AskUserQuestion toolUseId="tool-1" input={input1} /><AskUserQuestion toolUseId="tool-2" input={input2} /></>
    const firstMount = render(cards)
    expect(screen.getByText('First real question?')).toBeTruthy()
    expect(screen.queryByText('Second real question?')).toBeNull()
    fireEvent.click(screen.getByTestId('ask-user-option-0-First answer'))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    expect(sendMock.mock.calls[0]?.[1]).toMatchObject({ requestId: 'perm-1', updatedInput: { answers: { 'First real question?': 'First answer' } } })
    await act(async () => {
      useChatStore.getState().handleServerMessage(ACTIVE_TAB, { type: 'permission_response_ack', requestId: 'perm-1', status: 'accepted' })
    })
    firstMount.unmount()
    render(cards)
    expect(screen.getByText('Second real question?')).toBeTruthy()
    expect(screen.queryByTestId('ask-user-option-0-First answer')).toBeNull()
    expect(screen.getByText(/Answered:/)).toBeTruthy()
    fireEvent.click(screen.getByTestId('ask-user-option-0-Second answer'))
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await act(async () => {
      useChatStore.getState().handleServerMessage(ACTIVE_TAB, { type: 'permission_response_ack', requestId: 'perm-2', status: 'accepted' })
    })
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
    expect(sendMock.mock.calls.map(([, message]) => message.requestId)).toEqual(['perm-1', 'perm-2'])
    expect(useChatStore.getState().sessions[ACTIVE_TAB]!.pendingPermission).toBeNull()
  })

})
