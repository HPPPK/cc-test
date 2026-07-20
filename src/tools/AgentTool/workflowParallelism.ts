import {
  resolveWorkflowParallelism,
  workflowParallelismLimiter,
  type WorkflowParallelismQueueEvent,
} from '../../utils/workflowParallelism.js'
import { loadCurrentWorkflowTemplate } from '../../server/services/workflowRuntimeTemplateService.js'
import type { WorkflowSessionState } from '../../server/services/workflowTypes.js'

export type WorkflowParallelismLifecycleOptions = {
  signal?: AbortSignal
  onQueued?: (event: WorkflowParallelismQueueEvent) => void
  onStarted?: () => void
  onCancelled?: () => void
}


function inlineParallelismTemplate(workflow: unknown): unknown {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return null
  const record = workflow as Record<string, unknown>
  if (record.template && typeof record.template === 'object' && !Array.isArray(record.template)
    && Array.isArray((record.template as Record<string, unknown>).phases)) {
    return record.template
  }
  return null
}

function hasStoredTemplateReference(workflow: unknown): boolean {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return false
  const record = workflow as Record<string, unknown>
  const identity = record.templateIdentity
  if (identity && typeof identity === 'object' && !Array.isArray(identity)
    && typeof (identity as Record<string, unknown>).id === 'string'
    && ((identity as Record<string, unknown>).id as string).trim()) {
    return true
  }
  const template = record.template
  return !!(template && typeof template === 'object' && !Array.isArray(template)
    && typeof (template as Record<string, unknown>).id === 'string'
    && ((template as Record<string, unknown>).id as string).trim())
}

async function loadParallelismTemplate(workflow: unknown): Promise<unknown> {
  return inlineParallelismTemplate(workflow) ?? (
    hasStoredTemplateReference(workflow)
      ? loadCurrentWorkflowTemplate(workflow as WorkflowSessionState)
      : null
  )
}

export async function runWithinWorkflowParallelism<T>(
  workflow: unknown,
  lifecycle: () => Promise<T>,
  options: WorkflowParallelismLifecycleOptions = {},
): Promise<T | undefined> {
  const inlineTemplate = inlineParallelismTemplate(workflow)
  const template = inlineTemplate ?? await loadParallelismTemplate(workflow)
  const parallelism = resolveWorkflowParallelism(workflow, template)
  if (!parallelism) {
    options.onStarted?.()
    return lifecycle()
  }

  try {
    const release = await workflowParallelismLimiter.acquire(parallelism, {
      signal: options.signal,
      onQueued: options.onQueued,
    })
    if (options.signal?.aborted) {
      release()
      options.onCancelled?.()
      return undefined
    }

    options.onStarted?.()
    try {
      return await lifecycle()
    } finally {
      release()
    }
  } catch (error) {
    if (options.signal?.aborted) {
      options.onCancelled?.()
      return undefined
    }
    throw error
  }
}
