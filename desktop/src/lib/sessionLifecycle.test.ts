import { describe, expect, it } from 'vitest'
import { transitionSessionLifecycle, type SessionLifecycle, type LifecycleInput } from './sessionLifecycle'

const running: SessionLifecycle = { status: 'running', run: 1, announcedWaits: [] }
const workflow = (patch: Record<string, unknown> = {}) => ({
  mode: 'workflow', status: 'running', runStatus: 'active', activePhaseId: 'plan',
  pendingConfirmation: false, ...patch,
}) as LifecycleInput['workflow']
const step = (input: Partial<LifecycleInput>, previous = running) =>
  transitionSessionLifecycle(previous, { signal: 'progress', chatState: 'thinking', ...input })

describe('global session lifecycle', () => {
  it('ends without text and announces only once', () => {
    const done = step({ signal: 'settled', chatState: 'idle' })
    expect(done.lifecycle.status).toBe('ended')
    expect(done.notice?.body).toContain('执行已结束')
    expect(step({ signal: 'settled', chatState: 'idle' }, done.lifecycle).notice).toBeUndefined()
  })
  it('does not announce historical idle or completed workflow snapshots', () => {
    const idle: SessionLifecycle = { status: 'idle', run: 0, announcedWaits: [] }
    expect(step({ signal: 'snapshot', chatState: 'idle' }, idle).notice).toBeUndefined()
    expect(step({ signal: 'snapshot', chatState: 'idle', workflow: workflow({ status: 'completed', runStatus: 'completed' }) }, idle).notice).toBeUndefined()
  })
  it('announces each new request without replay duplicates', () => {
    const first = step({ signal: 'wait', waits: [{ key: 'question:1', body: '请回答问题' }] })
    expect(first.lifecycle.status).toBe('waiting_for_user')
    expect(first.notice?.key).toBe('question:1')
    expect(step({ signal: 'wait', waits: [{ key: 'question:1', body: '请回答问题' }] }, first.lifecycle).notice).toBeUndefined()
    expect(step({ signal: 'wait', waits: [{ key: 'question:1', body: '' }, { key: 'question:2', body: '新问题' }] }, first.lifecycle).notice?.key).toBe('question:2')
  })
  it('keeps real pending requests ahead of incidental progress and completion', () => {
    const next = step({ signal: 'settled', chatState: 'idle', waits: [{ key: 'permission:1', body: '请授权' }] })
    expect(next.lifecycle.status).toBe('waiting_for_user')
    expect(next.notice?.attention).toBe(true)
  })
  it('distinguishes pause, resume and stop', () => {
    const paused = step({ signal: 'workflow', workflow: workflow({ runStatus: 'paused', status: 'paused' }) })
    expect(paused.lifecycle.status).toBe('paused')
    expect(paused.notice).toBeUndefined()
    expect(step({ signal: 'settled', workflow: workflow({ runStatus: 'paused', status: 'paused' }) }, paused.lifecycle).lifecycle.status).toBe('paused')
    expect(step({ signal: 'workflow', workflow: workflow() }, paused.lifecycle).lifecycle.status).toBe('running')
    expect(step({ signal: 'stopped' }, paused.lifecycle).lifecycle.endReason).toBe('stopped')
  })
  it('announces failure once and preserves it across trailing completion', () => {
    const failed = step({ signal: 'failed' })
    expect(failed.lifecycle.endReason).toBe('failed')
    expect(failed.notice?.body).toContain('失败')
    const later = step({ signal: 'settled', chatState: 'idle' }, failed.lifecycle)
    expect(later.notice).toBeUndefined()
    expect(later.lifecycle.endReason).toBe('failed')
  })
  it('recognizes workflow confirmation even when transport is idle', () => {
    const next = step({ signal: 'workflow', chatState: 'idle', workflow: workflow({ runStatus: 'waiting_for_user', pendingConfirmation: true, pendingConfirmationId: 'confirm-1' }) })
    expect(next.lifecycle.status).toBe('waiting_for_user')
    expect(next.notice?.key).toContain('confirm-1')
  })
  it('keeps automatic workflow continuation running between turns', () => {
    const next = step({ signal: 'settled', chatState: 'idle', workflow: workflow() })
    expect(next.lifecycle.status).toBe('running')
    expect(next.notice).toBeUndefined()
  })
  it('supports legacy workflow summaries that only carry status', () => {
    expect(step({ signal: 'settled', chatState: 'idle', workflow: workflow({ runStatus: undefined }) }).lifecycle.status).toBe('running')
    expect(step({ signal: 'workflow', chatState: 'idle', workflow: workflow({ runStatus: undefined, status: 'pending-confirmation' }) }).lifecycle.status).toBe('waiting_for_user')
  })
  it('announces workflow completion once despite trailing result', () => {
    const wf = workflow({ status: 'completed', runStatus: 'completed' })
    const done = step({ signal: 'workflow', workflow: wf })
    expect(done.lifecycle.status).toBe('ended')
    expect(done.notice?.body).toContain('工作流已完成')
    expect(step({ signal: 'settled', chatState: 'idle', workflow: wf }, done.lifecycle).notice).toBeUndefined()
  })
  it('waits for manual help only after automatic recovery expires', () => {
    const wf = workflow({ runStatus: 'blocked', blockedReason: '需要检查', autoRecovery: { expiresAt: '2030-01-01T00:00:00Z' } })
    const recovering = step({ signal: 'workflow', workflow: wf, now: Date.parse('2029-01-01') })
    expect(recovering.lifecycle.status).toBe('running')
    expect(recovering.notice).toBeUndefined()
    const manual = step({ signal: 'workflow', workflow: wf, now: Date.parse('2030-01-02') }, recovering.lifecycle)
    expect(manual.lifecycle.status).toBe('waiting_for_user')
    expect(manual.notice?.body).toContain('需要检查')
  })
  it('keeps an unstarted draft idle and supports explicit reset', () => {
    const idle: SessionLifecycle = { status: 'idle', run: 0, announcedWaits: [] }
    expect(step({ signal: 'workflow', chatState: 'idle', workflow: workflow({ runStatus: 'draft' }) }, idle).lifecycle.status).toBe('idle')
    expect(step({ signal: 'reset' }).lifecycle).toEqual(idle)
  })
  it('announces pending route IDs and stopped workflows', () => {
    const route = step({ signal: 'workflow', workflow: workflow({ pendingRoute: { status: 'pending', routeId: 'route-1' } }) })
    expect(route.notice?.key).toContain('route-1')
    expect(step({ signal: 'workflow', workflow: workflow({ runStatus: 'cancelled' }) }).lifecycle.endReason).toBe('stopped')
  })
  it('restores a running snapshot and resumes after a question acknowledgement', () => {
    const idle: SessionLifecycle = { status: 'idle', run: 0, announcedWaits: [] }
    expect(step({ signal: 'snapshot', chatState: 'thinking' }, idle).lifecycle.status).toBe('running')
    const waiting = step({ signal: 'wait', waits: [{ key: 'q', body: 'Question' }] }).lifecycle
    expect(step({ signal: 'progress', chatState: 'tool_executing' }, waiting).lifecycle.status).toBe('running')
  })
  it('keeps an actual question visible during automatic recovery', () => {
    const next = step({ signal: 'wait', waits: [{ key: 'question:recovery', body: '请回答' }], workflow: workflow({ runStatus: 'blocked', autoRecovery: { expiresAt: '2030-01-01T00:00:00Z' } }), now: Date.parse('2029-01-01') })
    expect(next.lifecycle.status).toBe('waiting_for_user')
    expect(next.notice?.key).toBe('question:recovery')
  })
  it('starts a new generation only for a new task', () => {
    const ended: SessionLifecycle = { ...running, status: 'ended', endReason: 'completed' }
    expect(step({ signal: 'snapshot', chatState: 'idle' }, ended).lifecycle).toEqual(ended)
    expect(step({ signal: 'start' }, ended).lifecycle).toMatchObject({ status: 'running', run: 2 })
  })
})
