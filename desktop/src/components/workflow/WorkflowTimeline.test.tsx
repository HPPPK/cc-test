// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkflowTimeline } from './WorkflowTimeline'
import { getWorkflowTimeline, type WorkflowTimelinePage } from '../../api/workflowTimeline'

vi.mock('../../api/workflowTimeline', () => ({ getWorkflowTimeline: vi.fn() }))
vi.mock('../shared/Modal', () => ({ Modal: ({ open, children, onClose }: { open: boolean; children: React.ReactNode; onClose: () => void }) => open ? <div role="dialog"><button onClick={onClose}>关闭时间线</button>{children}</div> : null }))
const page = (events: WorkflowTimelinePage['events'], hasMore = false): WorkflowTimelinePage => ({ events, hasMore, historySource: 'recorded', warnings: [], updatedAt: new Date().toISOString() })
const start = { id: 'start', kind: 'tool-start' as const, at: '2026-11-18T00:00:01Z', summary: 'Bash', toolName: 'Bash', toolUseId: 't1', detail: 'bun test', status: 'running', source: 'live' as const }
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks() })

it('shows tools, results, errors and expandable details', async () => {
  vi.mocked(getWorkflowTimeline).mockResolvedValue(page([start, { ...start, id: 'result', kind: 'tool-result', summary: '工具返回结果', detail: '4 tests passed', status: 'succeeded' }, { ...start, id: 'error', kind: 'error', summary: 'TIMEOUT', detail: 'provider unavailable', status: 'failed' }]))
  render(<WorkflowTimeline sessionId="s1" />)
  fireEvent.click(screen.getByRole('button', { name: /执行时间线/ }))
  expect(await screen.findByText('4 tests passed')).toBeTruthy()
  expect(screen.getByText('provider unavailable')).toBeTruthy()
  expect(screen.getByText('bun test')).toBeTruthy()
  expect(screen.getByText('TIMEOUT')).toBeTruthy()
})

it('polls while open, merges repeated events and stops when closed', async () => {
  vi.useFakeTimers()
  vi.mocked(getWorkflowTimeline).mockResolvedValue(page([start]))
  const view = render(<WorkflowTimeline sessionId="s1" />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /执行时间线/ })) })
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
  expect(getWorkflowTimeline).toHaveBeenCalledTimes(2)
  expect(screen.getAllByText('bun test')).toHaveLength(1)
  view.unmount()
  await act(async () => { await vi.advanceTimersByTimeAsync(4_000) })
  expect(getWorkflowTimeline).toHaveBeenCalledTimes(2)
})

it('loads older history, keeps it on refresh, supports filters and retries', async () => {
  vi.mocked(getWorkflowTimeline)
    .mockRejectedValueOnce(new Error('network offline'))
    .mockResolvedValueOnce(page([start], true))
    .mockResolvedValueOnce(page([{ ...start, id: 'older', kind: 'phase', summary: '旧阶段', at: '2026-11-18T00:00:00Z' }]))
  render(<WorkflowTimeline sessionId="s1" />)
  fireEvent.click(screen.getByRole('button', { name: /执行时间线/ }))
  expect(await screen.findByText(/network offline/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '刷新' }))
  fireEvent.click(await screen.findByRole('button', { name: '加载更早记录' }))
  expect(await screen.findByText('旧阶段')).toBeTruthy()
  expect(getWorkflowTimeline).toHaveBeenLastCalledWith('s1', 'start')
  fireEvent.change(screen.getByLabelText('筛选执行事件'), { target: { value: 'problems' } })
  expect(screen.queryByText('旧阶段')).toBeNull()
})

it('does not display stale session data when switching sessions during a request', async () => {
  let resolve!: (value: WorkflowTimelinePage) => void
  vi.mocked(getWorkflowTimeline).mockImplementationOnce(() => new Promise(done => { resolve = done })).mockResolvedValue(page([]))
  const view = render(<WorkflowTimeline sessionId="s1" />)
  fireEvent.click(screen.getByRole('button', { name: /执行时间线/ }))
  view.rerender(<WorkflowTimeline sessionId="s2" />)
  await act(async () => { resolve(page([start])) })
  expect(screen.queryByText('bun test')).toBeNull()
})

it('keeps older history through automatic refresh and catches up across bursts larger than a page', async () => {
  vi.useFakeTimers()
  const old = { ...start, id: 'old', kind: 'phase' as const, summary: '早期阶段', at: '2026-11-18T00:00:00Z' }
  const newest = { ...start, id: 'new', summary: 'new tool', at: '2026-11-18T00:00:04Z' }
  const middle = { ...start, id: 'middle', summary: 'middle tool', at: '2026-11-18T00:00:03Z' }
  vi.mocked(getWorkflowTimeline).mockResolvedValueOnce(page([start], true)).mockResolvedValueOnce(page([old]))
    .mockResolvedValueOnce(page([newest], true)).mockResolvedValueOnce(page([start, middle], true))
  render(<WorkflowTimeline sessionId="s1" />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /执行时间线/ })) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '加载更早记录' })) })
  expect((screen.getByLabelText('跟随最新') as HTMLInputElement).checked).toBe(false)
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
  expect(screen.getByText('早期阶段')).toBeTruthy()
  expect(screen.getByText('middle tool')).toBeTruthy()
  expect(screen.getByText('new tool')).toBeTruthy()
  expect(getWorkflowTimeline).toHaveBeenLastCalledWith('s1', 'new')
  fireEvent.click(screen.getByLabelText('跟随最新'))
  const list = screen.getByLabelText('执行事件列表')
  Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 600 })
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 })
  fireEvent.scroll(list, { target: { scrollTop: 0 } })
  expect((screen.getByLabelText('跟随最新') as HTMLInputElement).checked).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '关闭时间线' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('shows authoritative blockers, confirmation and terminal states, with log warnings', async () => {
  vi.mocked(getWorkflowTimeline).mockResolvedValue({ ...page([start]), warnings: ['日志写入失败'], historySource: 'reconstructed' })
  const view = render(<WorkflowTimeline sessionId="s1" blockedReason="缺少授权" />)
  fireEvent.click(screen.getByRole('button', { name: /执行时间线/ }))
  expect(await screen.findByText('日志写入失败')).toBeTruthy()
  expect(screen.getByText('被阻塞：缺少授权')).toBeTruthy()
  view.rerender(<WorkflowTimeline sessionId="s1" pendingConfirmation />)
  expect(screen.getByText('等待你确认当前阶段')).toBeTruthy()
  view.rerender(<WorkflowTimeline sessionId="s1" chatState="permission_pending" />)
  expect(screen.getByText('等待你的回答或授权')).toBeTruthy()
  view.rerender(<WorkflowTimeline sessionId="s1" workflowStatus="completed" />)
  expect(screen.getByText('工作流已完成，可回看执行记录')).toBeTruthy()
  expect(screen.getByText('已中断')).toBeTruthy()
  view.rerender(<WorkflowTimeline sessionId="s1" workflowStatus="stopped" />)
  expect(screen.getByText('工作流已停止，可回看执行记录')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('筛选执行事件'), { target: { value: 'tools' } })
  expect(screen.getByText('bun test')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('筛选执行事件'), { target: { value: 'phases' } })
  expect(screen.getByText('暂无符合条件的执行记录')).toBeTruthy()
})

it('describes silence as a wait rather than claiming a stalled task failed', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-18T00:02:00Z'))
  vi.mocked(getWorkflowTimeline).mockResolvedValue(page([start]))
  render(<WorkflowTimeline sessionId="s1" chatState="tool_executing" />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /执行时间线/ })) })
  expect(screen.getByText(/119 秒没有新执行事件/)).toBeTruthy()
})

it('correlates reused subagent tool ids with their own parent calls', async () => {
  vi.mocked(getWorkflowTimeline).mockResolvedValue(page([
    { ...start, id: 'a-start', parentToolUseId: 'parent-a' },
    { ...start, id: 'b-start', toolName: 'Read', summary: 'Read', parentToolUseId: 'parent-b' },
    { ...start, id: 'a-result', kind: 'tool-result', summary: '工具返回结果', parentToolUseId: 'parent-a', status: 'succeeded' },
    { ...start, id: 'b-result', kind: 'tool-result', summary: '工具返回结果', parentToolUseId: 'parent-b', status: 'failed' },
  ]))
  render(<WorkflowTimeline sessionId="s1" />)
  fireEvent.click(screen.getByRole('button', { name: /执行时间线/ }))
  expect(await screen.findByText('Bash · 工具返回结果')).toBeTruthy()
  expect(screen.getByText('Read · 工具返回结果')).toBeTruthy()
})

it('names a result even when its launch event is on an older page', async () => {
  vi.mocked(getWorkflowTimeline).mockResolvedValue(page([
    { ...start, id: 'result-only', kind: 'tool-result', summary: '工具返回结果', status: 'succeeded' },
  ]))
  render(<WorkflowTimeline sessionId="s1" />)
  fireEvent.click(screen.getByRole('button', { name: /执行时间线/ }))
  expect(await screen.findByText('Bash · 工具返回结果')).toBeTruthy()
})
