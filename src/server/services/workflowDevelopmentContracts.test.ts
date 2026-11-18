import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import * as path from 'node:path'
import { validateAndNormalizeWorkflowTemplate } from './workflowTemplateValidation.js'
import { getUnsafePublicBrowserUrlReason } from '../../tools/PlaywrightTool/runtime.js'

const packRoot = path.resolve(import.meta.dir, '../../../workflows/efficient-constrained-dev-debug-workflow-v5')
const template = JSON.parse(await readFile(path.join(packRoot, 'workflows/efficient-constrained-dev-debug-workflow-v5.workflow.json'), 'utf8'))
const phase = (id: string) => template.phases.find((candidate: { id: string }) => candidate.id === id)
const instructions = (id: string) => [phase(id).instructions, phase(id).contract.instructions] as string[]

describe('canonical development workflow execution contracts', () => {
  test('source template remains valid and public browser continues rejecting local targets', () => {
    const result = validateAndNormalizeWorkflowTemplate(template, { source: 'import' })
    expect(result.issues).toEqual([])
    expect(result.template?.id).toBe(template.id)
    for (const url of ['http://127.0.0.1:8000/', 'http://localhost:8765/', 'file:///C:/demo/index.html']) {
      expect(getUnsafePublicBrowserUrlReason(url)).not.toBeNull()
    }
    expect(getUnsafePublicBrowserUrlReason('https://example.com/')).toBeNull()
  })

  test('plans evidence against available local capabilities instead of public-browser localhost retries', () => {
    for (const text of instructions('delivery-plan')) {
      expect(text).toContain('Playwright is public-web research only')
      expect(text).toContain('HTTP/resource checks can accept a skeleton-only batch')
      expect(text).toContain('never represent HTTP success as browser interaction evidence')
      expect(text).toContain('Do not invent a fixed number of batches')
      expect(text).toContain('Do not add unconditional repair or re-review batches')
    }
    for (const text of instructions('scenario-review')) {
      expect(text).toContain('localhost browser access is not available')
      expect(text).toContain('record not-run and the capability limitation')
      expect(text).toContain('not a code defect or a reason to rerun the same blocked browser call')
    }
  })

  test('continues accepted same-batch fixes without interrupting an already running worker', () => {
    for (const text of instructions('delegate-implement')) {
      expect(text).toContain('Same-batch fixes within the accepted scope require no new user confirmation')
      expect(text).toContain('Do not launch a worker and then ask an optional approval question')
      expect(text).toContain('Incidental regenerable check output')
      expect(text).toContain('keep it and record it once as non-blocking')
    }
  })

  test('reviewer and local-preview skills apply the same capability and cache boundaries', async () => {
    const review = await readFile(path.join(packRoot, 'skills/workflow-lightweight-batch-review/SKILL.md'), 'utf8')
    const preview = await readFile(path.join(packRoot, 'skills/workflow-local-preview-runner/SKILL.md'), 'utf8')
    expect(review).toContain('Review the evidence promised for this batch')
    expect(review).toContain('regenerable caches')
    expect(review).toContain('Playwright is public-web research only')
    expect(preview).toContain('Start App and Stop App')
    expect(preview).toContain('does not supply browser rendering or interaction evidence')
    expect(preview).toContain('Do not use the public-web Playwright tool for localhost')
  })

  test('review findings and recovery instructions agree with runtime role boundaries', () => {
    for (const text of instructions('delegate-implement')) {
      expect(text).toContain('requiredFixes accepts non-empty strings or finding objects')
      expect(text).toContain('Missing shell alone is not a code defect')
      expect(text).toContain('retries only the Reviewer with accepted Coder evidence')
      expect(text).toContain('Directly dispatch the same Batch Coder, then its Reviewer')
      expect(text).toContain('that route requires confirmation')
      expect(text).toContain('{"readyForReview":true}')
      expect(text).toContain('{"readyForReview":false}')
      expect(text).toContain('must be reviewed again before that batch succeeds')
      expect(text).toContain('never permission to start a dependent Batch')
      expect(text).toContain('subagent_type=general-purpose')
      expect(text).toContain('they do not invoke nested workflows')
    }
  })

  test('file approval, evidence transfer and unfinished work match executable Stage 4 behavior', async () => {
    for (const text of instructions('delegate-implement')) {
      expect(text).toContain('ordinary AskUserQuestion answer does not change file write scopes')
      expect(text).toContain('scopeAmendment=')
      expect(text).toContain('single confirmation updates the accepted plan and actual permissions together')
      expect(text).toContain('preserves unaffected passed batches')
      expect(text).toContain('No extra evidence handoff file is required')
      expect(text).toContain('production PostgreSQL requirement does not mean')
      expect(text).toContain('never permission to start a dependent Batch')
    }
    const review = await readFile(path.join(packRoot, 'skills/workflow-lightweight-batch-review/SKILL.md'), 'utf8')
    expect(review).toContain('workflow-coder-evidence')
    expect(review).toContain('do not require another handoff file')
    expect(review).toContain('scopeAmendment={batchId,addWriteScopes}')
  })
})
