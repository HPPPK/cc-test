import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToolCallGroup } from './ToolCallGroup'
import type { AgentTaskNotification, UIMessage } from '../../types/chat'

const call: Extract<UIMessage, { type: 'tool_use' }> = { id: 'call', type: 'tool_use', toolName: 'Agent', toolUseId: 'review', input: { description: '检查已渲染报告完整性' }, timestamp: 1 }
function show(error?: string, notification?: Partial<AgentTaskNotification>) {
  render(<ToolCallGroup toolCalls={[call]} resultMap={new Map(error ? [['review', { id: 'result', type: 'tool_result', toolUseId: 'review', content: error, isError: true, timestamp: 2 }]] : [])} childToolCallsByParent={new Map()} agentTaskNotifications={{ review: { taskId: 'task', toolUseId: 'review', status: 'failed', summary: '检查已渲染报告完整性', ...notification } }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Expand agent' }))
}
describe('Agent failure details', () => {
  it('shows the tool failure instead of repeating the task name', () => {
    show('EXPERT_TEMPLATE_OUTPUT_REVIEW_DRAFT_REQUIRED: 请先保存初始报告。')
    expect(screen.getByText(/EXPERT_TEMPLATE_OUTPUT_REVIEW_DRAFT_REQUIRED/)).toBeTruthy()
  })
  it('uses a background task failure result when no tool error is available', () => {
    show(undefined, { result: '审查启动失败：初稿尚未保存。' })
    expect(screen.getByText('审查启动失败：初稿尚未保存。')).toBeTruthy()
  })
})

const { getAgentResult } = vi.hoisted(() => ({ getAgentResult: vi.fn() }))
vi.mock('../../api/sessions', () => ({ sessionsApi: { getAgentResult } }))
describe('Agent artifact result viewer', () => {
  const receipt = '文件交接：未捕获 Markdown 路径；状态：子代理已结束，请按任务中已分配的 Markdown Read 核验。'
  function showReceipt() {
    render(<ToolCallGroup {...{ sessionId: 'session-fixture' }} toolCalls={[call]} resultMap={new Map([['review', { id: 'result', type: 'tool_result', toolUseId: 'review', content: receipt, isError: false, timestamp: 2 }]])} childToolCallsByParent={new Map()} agentTaskNotifications={{}} />)
    fireEvent.click(screen.getByRole('button', { name: /View result|查看结果/ }))
  }
  it('labels a completed process as ended without certifying a deliverable', async () => {
    getAgentResult.mockResolvedValueOnce({ status: 'missing', content: '' })
    showReceipt()
    expect(screen.getByText(/^(已结束|Ended)$/)).toBeTruthy()
    expect(screen.queryByText(/^(完成|Done)$/)).toBeNull()
    expect(await screen.findByText(/未找到已保存的子代理结果|No saved agent result/)).toBeTruthy()
  })
  it('loads saved content by session and tool call instead of the model receipt', async () => {
    getAgentResult.mockResolvedValueOnce({ status: 'available', content: '# 实际调研结果\n已验证的市场证据' })
    showReceipt()
    expect(await screen.findByText('已验证的市场证据')).toBeTruthy()
    expect(getAgentResult).toHaveBeenCalledWith('session-fixture', 'review')
    expect(screen.queryByText(receipt)).toBeNull()
  })
  it('shows loading until the saved result is fetched', async () => {
    let resolveResult!: (value: { status: 'available'; content: string }) => void
    getAgentResult.mockReturnValueOnce(new Promise((resolve) => { resolveResult = resolve }))
    showReceipt()
    expect(screen.getByRole('status').textContent).toMatch(/正在读取|Loading/)
    resolveResult({ status: 'available', content: '读取完成' })
    expect(await screen.findByText('读取完成')).toBeTruthy()
  })
  it('reports missing saved output truthfully', async () => {
    getAgentResult.mockResolvedValueOnce({ status: 'missing', content: '' })
    showReceipt()
    expect(await screen.findByText(/未找到已保存的子代理结果|No saved agent result/)).toBeTruthy()
    expect(screen.queryByText(receipt)).toBeNull()
  })
  it('labels a final response without presenting it as a verified saved artifact', async () => {
    getAgentResult.mockResolvedValueOnce({ status: 'available', source: 'transcript', content: '未写入，Google 人工验证待处理。' })
    showReceipt()
    expect(await screen.findByText('未写入，Google 人工验证待处理。')).toBeTruthy()
    expect(screen.getByText(/未找到可核验的 Markdown 文件|no verified Markdown artifact/)).toBeTruthy()
  })
  it('allows retry after a failed read', async () => {
    getAgentResult.mockRejectedValueOnce(new Error('offline'))
    showReceipt()
    const retry = await screen.findByRole('button', { name: /Retry|重试/ })
    getAgentResult.mockResolvedValueOnce({ status: 'available', content: '重新读取成功' })
    fireEvent.click(retry)
    expect(await screen.findByText('重新读取成功')).toBeTruthy()
  })
})
