import { AppStoreContext, getDefaultAppState } from '../../state/AppState.js'
import { createStore } from '../../state/store.js'
import { TerminalSizeContext } from '../../ink/components/TerminalSizeContext.js'
import React from 'react'
import { beforeAll, expect, test } from 'bun:test'
import { Text, ThemeProvider } from '../../ink.js'
import { renderToScreen } from '../../ink/render-to-screen.js'
import { createAssistantMessage, createProgressMessage, createUserMessage } from '../../utils/messages.js'
import { asAgentId } from '../../types/ids.js'
import type { AgentToolProgress } from '../../types/tools.js'
import { EMPTY_USAGE } from '../../services/api/emptyUsage.js'
import { outputSchema } from './AgentTool.js'
import { getCliHighlightPromise } from '../../utils/cliHighlight.js'
import { cellAt } from '../../ink/screen.js'
import { AgentPromptDisplay, AgentResponseDisplay, renderGroupedAgentToolUse, renderToolResultMessage, renderToolUseProgressMessage, renderToolUseRejectedMessage } from './UI.js'

const progress = (message: AgentToolProgress['message']) => createProgressMessage<AgentToolProgress>({ toolUseID: 'worker', parentToolUseID: 'parent', data: { type: 'agent_progress', agentId: asAgentId('worker'), prompt: 'Inspect the fixture', message } })
class RenderBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null }
  static getDerivedStateFromError(error: unknown) { return { error: error instanceof Error ? error.message : String(error) } }
  render() { return this.state.error ? <Text>{this.state.error}</Text> : this.props.children }
}
function screen(node: React.ReactNode) { return renderToScreen(<TerminalSizeContext.Provider value={{ columns: 120, rows: 40 }}><AppStoreContext.Provider value={createStore(getDefaultAppState())}><ThemeProvider><RenderBoundary>{node}</RenderBoundary></ThemeProvider></AppStoreContext.Provider></TerminalSizeContext.Provider>, 120).screen }
function expectVisible(node: React.ReactNode, text: string) {
  const rendered = screen(node)
  const lines = Array.from({ length: rendered.height }, (_, y) => Array.from({ length: rendered.width }, (_, x) => cellAt(rendered, x, y)?.char ?? ' ').join('')).join('\n')
  expect(lines).toContain(text)
}
beforeAll(async () => {
  screen(<AgentPromptDisplay prompt="Warmup" />)
  await getCliHighlightPromise()
  await new Promise(resolve => setTimeout(resolve, 0))
})
const assistant = createAssistantMessage({ content: 'Evidence reviewed', usage: { ...EMPTY_USAGE, input_tokens: 10, output_tokens: 5 } })
const resultProgress = progress({ ...createUserMessage({ content: 'result' }), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'read-fixture', content: 'file read' }] } })

test('prompt and response displays render the agent content with separate labels', () => {
  expectVisible(<AgentPromptDisplay prompt="Inspect the contract fixture" />, 'Inspect the contract fixture')
  expectVisible(<AgentPromptDisplay prompt="Inspect the contract fixture" />, 'Prompt:')
  expectVisible(<AgentResponseDisplay content={[{ type: 'text', text: 'Contract verified' }]} />, 'Contract verified')
})

test('completed transcript renders prompt, response, and completion tool statistics', () => {
  const data = outputSchema().parse({ status: 'completed', agentId: 'worker', prompt: 'Inspect fixture evidence', content: [{ type: 'text', text: 'The fixture is correct' }], totalToolUseCount: 2, totalDurationMs: 1500, totalTokens: 15, usage: { ...EMPTY_USAGE, input_tokens: 10, output_tokens: 5 } })
  const node = renderToolResultMessage(data, [progress(assistant)], { tools: [], verbose: true, theme: 'dark', isTranscriptMode: true })
  expectVisible(node, 'Inspect fixture evidence')
  expectVisible(node, 'The fixture is correct')
  expectVisible(node, '2 tool uses')
})

test('small terminals summarize active tool use and token usage without losing the progress state', () => {
  const toolMessage = createAssistantMessage({ content: [{ type: 'tool_use', caller: { type: 'direct' }, id: 'read-fixture', name: 'Read', input: {} }], usage: { ...EMPTY_USAGE, input_tokens: 10, output_tokens: 5 } })
  const node = renderToolUseProgressMessage([progress(toolMessage)], { tools: [], verbose: false, terminalSize: { columns: 120, rows: 5 } })
  expectVisible(node, 'In progress')
  expectVisible(node, '1 tool use')
  expectVisible(node, '15 tokens')
})

test('rejected agent calls preserve already-received progress', () => {
  const node = renderToolUseRejectedMessage({ description: 'Inspect', prompt: 'Review', subagent_type: 'general-purpose' }, { columns: 120, messages: [], progressMessagesForMessage: [progress(assistant)], tools: [], theme: 'dark', verbose: true, isTranscriptMode: true })
  expectVisible(node, 'Evidence reviewed')
})

test('grouped agent rows count real tool-result progress and completed token usage', () => {
  const node = renderGroupedAgentToolUse([{ param: { type: 'tool_use', id: 'agent-fixture', name: 'Agent', input: { description: 'Inspect fixture', prompt: 'Review', subagent_type: 'general-purpose' } }, isResolved: false, isError: false, isInProgress: true, progressMessages: [resultProgress, progress(assistant)] }], { shouldAnimate: false, tools: [] })
  expectVisible(node, 'Inspect fixture')
  expectVisible(node, '1 tool use')
})
