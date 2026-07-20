import { describe, expect, test } from 'bun:test'
import {
  WorkflowParallelScheduler,
  validateWorkflowParallelPlan,
  type WorkflowParallelTask,
} from './workflowParallelScheduler.js'

function task(overrides: Partial<WorkflowParallelTask> & Pick<WorkflowParallelTask, 'id'>): WorkflowParallelTask {
  return {
    id: overrides.id,
    dependsOn: overrides.dependsOn ?? [],
    writeScopes: overrides.writeScopes ?? [],
    resourceClaims: overrides.resourceClaims ?? [],
  }
}

describe('workflow parallel scheduler', () => {
  test('starts independent tasks up to the configured concurrency cap', () => {
    const scheduler = new WorkflowParallelScheduler({ maxParallel: 2 }, [
      task({ id: 'server' }),
      task({ id: 'desktop' }),
      task({ id: 'docs' }),
    ])

    expect(scheduler.takeReadyTasks()).toEqual(['server', 'desktop'])
    expect(scheduler.snapshot().tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'server', status: 'running' }),
      expect.objectContaining({ id: 'desktop', status: 'running' }),
      expect.objectContaining({ id: 'docs', status: 'ready' }),
    ]))
  })

  test('waits for dependencies and unlocks their consumers after success', () => {
    const scheduler = new WorkflowParallelScheduler({ maxParallel: 2 }, [
      task({ id: 'contract' }),
      task({ id: 'desktop', dependsOn: ['contract'] }),
      task({ id: 'docs' }),
    ])

    expect(scheduler.takeReadyTasks()).toEqual(['contract', 'docs'])
    scheduler.markSucceeded('contract')
    scheduler.markSucceeded('docs')

    expect(scheduler.takeReadyTasks()).toEqual(['desktop'])
  })

  test('does not concurrently schedule overlapping write scopes or exclusive resources', () => {
    const scheduler = new WorkflowParallelScheduler({ maxParallel: 3 }, [
      task({ id: 'api', writeScopes: ['src/server/api/**'] }),
      task({ id: 'routes', writeScopes: ['src/server/**'] }),
      task({ id: 'desktop', writeScopes: ['desktop/src/**'] }),
      task({ id: 'preview', resourceClaims: ['port:3456'] }),
      task({ id: 'server-preview', resourceClaims: ['port:3456'] }),
    ])

    expect(scheduler.takeReadyTasks()).toEqual(['api', 'desktop', 'preview'])
    expect(scheduler.snapshot().tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'routes', status: 'ready' }),
      expect.objectContaining({ id: 'server-preview', status: 'ready' }),
    ]))

    scheduler.markSucceeded('api')
    scheduler.markSucceeded('desktop')
    scheduler.markSucceeded('preview')

    expect(scheduler.takeReadyTasks()).toEqual(['routes', 'server-preview'])
  })

  test('rejects duplicate task ids, unknown dependencies, cycles, and invalid caps', () => {
    expect(() => validateWorkflowParallelPlan({ maxParallel: 0 }, [task({ id: 'one' })]))
      .toThrow('maxParallel must be a positive integer')

    expect(() => validateWorkflowParallelPlan({ maxParallel: 1 }, [
      task({ id: 'duplicate' }),
      task({ id: 'duplicate' }),
    ])).toThrow('Duplicate workflow task id: duplicate')

    expect(() => validateWorkflowParallelPlan({ maxParallel: 1 }, [
      task({ id: 'consumer', dependsOn: ['missing'] }),
    ])).toThrow('Unknown workflow task dependency: consumer -> missing')

    expect(() => validateWorkflowParallelPlan({ maxParallel: 1 }, [
      task({ id: 'one', dependsOn: ['two'] }),
      task({ id: 'two', dependsOn: ['one'] }),
    ])).toThrow('Workflow task dependency cycle: one -> two -> one')
  })

  test('claims only the requested ready task without reserving unrelated work', () => {
    const scheduler = new WorkflowParallelScheduler({ maxParallel: 2 }, [
      task({ id: 'api' }),
      task({ id: 'desktop' }),
    ])

    expect(scheduler.tryStartTask('desktop')).toEqual({ status: 'started' })
    expect(scheduler.snapshot().tasks).toEqual([
      expect.objectContaining({ id: 'api', status: 'ready' }),
      expect.objectContaining({ id: 'desktop', status: 'running' }),
    ])

    expect(scheduler.tryStartTask('api')).toEqual({ status: 'started' })
  })

  test('keeps failed dependencies blocked and exposes their reason', () => {
    const scheduler = new WorkflowParallelScheduler({ maxParallel: 2 }, [
      task({ id: 'api' }),
      task({ id: 'desktop', dependsOn: ['api'] }),
    ])

    expect(scheduler.takeReadyTasks()).toEqual(['api'])
    scheduler.markFailed('api', 'API contract mismatch')

    expect(scheduler.snapshot().tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'desktop', status: 'blocked', blockedReason: 'Dependency api failed: API contract mismatch' }),
    ]))
    expect(scheduler.takeReadyTasks()).toEqual([])
  })
})
