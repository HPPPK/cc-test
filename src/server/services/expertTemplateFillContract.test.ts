import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import * as os from 'node:os'
import * as path from 'node:path'
import { ExpertSessionService } from './expertSessionService.js'
import { sessionService } from './sessionService.js'
import { ExpertPackRegistryService, resetExpertPackRegistryForTests } from './expertPackRegistryService.js'
import { ZipPackAdapter } from './zipPackAdapter.js'
import { handleSessionsApi } from '../api/sessions.js'
import { commitExpertTemplateFillCli, queryExpertTemplateFillSchema, runExpertTemplateFillCli } from '../../cli/expertTemplateFill.js'
import { EXPERT_TEMPLATE_FILL_FORMAT, renderExpertTemplateFill } from '../../utils/expertTemplateFill.js'

const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
const roots: string[] = []
const template = '<!DOCTYPE html><html data-template-id="contract-v1"><head><style>.fixed{color:#123456;display:grid}</style></head><body class="fixed"><h1>{{REPORT_TITLE}}</h1><section><!-- SLOT: NOTES --></section><table><thead><tr><th>Name</th><th>URL</th></tr></thead><tbody><!-- SLOT: SOURCES --></tbody></table></body></html>'
const fields = { REPORT_TITLE: '<script>untrusted()</script>', NOTES: ['Research & evidence'], SOURCES: [['Source', 'https://example.com/evidence']] }

afterEach(async () => {
  if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  resetExpertPackRegistryForTests()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'expert-contract-')))
  roots.push(root)
  const configRoot = path.join(root, 'config')
  const workDir = path.join(root, 'work')
  await fs.mkdir(workDir)
  process.env.CLAUDE_CONFIG_DIR = configRoot
  resetExpertPackRegistryForTests()
  await new ExpertPackRegistryService().importExpertPackZip(await new ZipPackAdapter().write({
    'manifest.json': JSON.stringify({ packId: 'contract-pack', name: 'Contract Pack', version: '1.0.0', schemaVersion: 1, type: 'expert-pack', entrypoints: { experts: ['experts/contract/expert.json'], skills: ['contract-skill'] } }),
    'experts/contract/expert.json': JSON.stringify({ id: 'contract-expert', name: 'Contract', description: 'Contract fixture', promptPaths: { system: 'experts/contract/system.md' }, outputMode: 'template-fill', outputTemplatePath: 'experts/contract/report.html', skillIds: ['contract-skill'] }),
    'experts/contract/system.md': 'Use the fixed template.',
    'experts/contract/report.html': template,
    'skills/contract-skill/SKILL.md': 'Contract fixture.',
  }))
  const service = new ExpertSessionService()
  const { sessionId } = await sessionService.createSession(workDir)
  await service.enterExpertMode(sessionId, 'contract-expert')
  const outputPath = path.join(workDir, 'report.html')
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = new Request(url, init)
    const parsed = new URL(request.url)
    return await handleSessionsApi(request, parsed, parsed.pathname.split('/').filter(Boolean)) ?? new Response('Not found', { status: 404 })
  }) as unknown as typeof globalThis.fetch
  return { service, sessionId, workDir, outputPath, fetch }
}

async function expertOf(sessionId: string) {
  const expert = (await sessionService.getSession(sessionId))?.expert
  if (!expert?.runtimeBinding) throw new Error('Missing fixture runtime binding')
  return expert
}

describe('fixed-template CLI server contract', () => {
  test('queries only the active snapshot, derives real fields, and writes no session metadata', async () => {
    const f = await fixture()
    const lookup = spyOn(ExpertPackRegistryService.prototype, 'getExpert').mockRejectedValue(new Error('Installed template must not be read'))
    const append = spyOn(sessionService, 'appendSessionMetadata')
    try {
      const schema = await queryExpertTemplateFillSchema({ schema: true, serverUrl: 'http://local', sessionId: f.sessionId }, { env: {}, fetch: f.fetch })
      expect(schema).toMatchObject({ format: EXPERT_TEMPLATE_FILL_FORMAT, templateId: 'contract-v1', delivery: 'structured-write', lifecycle: { stage: 'initial', allowedModes: [], initialSubmission: { allowed: true, omitMode: true } } })
      expect(schema.fields).toEqual([{ id: 'REPORT_TITLE', kind: 'text' }, { id: 'NOTES', kind: 'paragraphs' }, { id: 'SOURCES', kind: 'table-rows', columns: ['Name', 'URL'], urlColumnIndex: 1 }])
      expect(lookup).not.toHaveBeenCalled()
      expect(append).not.toHaveBeenCalled()
    } finally { lookup.mockRestore(); append.mockRestore() }
  })

  test('advertises only valid explicit modes and a repair candidate scoped to the same runtime binding and TTL', async () => {
    const f = await fixture()
    const initial = await f.service.getTemplateFillSchema(f.sessionId)
    expect(initial.lifecycle).toMatchObject({ allowedModes: [], initialSubmission: { allowed: true, omitMode: true } })
    await expect(f.service.renderTemplateFill(f.sessionId, { templateId: 'contract-v1', fields: { REPORT_TITLE: 'Retained' } }, { outputPath: f.outputPath })).rejects.toThrow('NOTES')
    const candidate = await f.service.getTemplateFillSchema(f.sessionId)
    expect(candidate.lifecycle).toMatchObject({ stage: 'initial', allowedModes: ['patch'], initialSubmission: { allowed: true, omitMode: true }, repairCandidate: { outputPath: f.outputPath, fieldIds: ['REPORT_TITLE'] } })
    expect(JSON.stringify(candidate)).not.toContain('Retained')
    expect(candidate.lifecycle.allowedModes.every(mode => mode === 'patch' || mode === 'finalize')).toBe(true)
    const now = Date.now()
    const clock = spyOn(Date, 'now').mockReturnValue(now + 2 * 60 * 60 * 1000 + 1)
    try {
      const expired = await f.service.getTemplateFillSchema(f.sessionId)
      expect(expired.lifecycle.allowedModes).toEqual([])
      expect(expired.lifecycle).not.toHaveProperty('repairCandidate')
    } finally { clock.mockRestore() }
    const expert = await expertOf(f.sessionId)
    expert.runtimeBinding.outputTemplate!.content = template.replace('#123456', '#654321')
    await sessionService.appendSessionMetadata(f.sessionId, { workDir: f.workDir, expert })
    const rebound = await f.service.getTemplateFillSchema(f.sessionId)
    expect(rebound.lifecycle.allowedModes).toEqual([])
    expect(rebound.lifecycle).not.toHaveProperty('repairCandidate')
  })

  test('rejects schema mutation requests and sessions without a template runtime', async () => {
    const f = await fixture()
    const url = `http://local/api/sessions/${f.sessionId}/expert/template-fill-schema`
    expect((await f.fetch(url, { method: 'POST' })).status).toBe(405)
    const { sessionId } = await sessionService.createSession(f.workDir)
    await expect(f.service.getTemplateFillSchema(sessionId)).rejects.toMatchObject({ statusCode: 400 })
    await expect(f.service.getTemplateFillSchema('missing-contract-session')).rejects.toMatchObject({ statusCode: 404 })
  })

  test('uses CLI recovery instructions for commercial expired receipts and unconfirmed writes', async () => {
    const f = await fixture()
    const expert = await expertOf(f.sessionId)
    expert.runtimeBinding.expertId = 'commercialization-research-report'
    expert.runtimeBinding.outputTemplate!.content = template.replace('{{REPORT_TITLE}}', '{{REPORT_TITLE}} {{REPORT_DATE}}')
    await sessionService.appendSessionMetadata(f.sessionId, { expert, workDir: f.workDir })
    await expect(f.service.commitTemplateFillWrite(f.sessionId, { receipt: 'expired' })).rejects.toThrow('expert-template-fill CLI')
    const rendered = await f.service.renderTemplateFill(f.sessionId, { templateId: 'contract-v1', fields }, { outputPath: f.outputPath })
    await fs.writeFile(f.outputPath, '<html>incomplete</html>')
    await expect(f.service.commitTemplateFillWrite(f.sessionId, { receipt: rendered.writeReceipt })).rejects.toThrow('expert-template-fill CLI')
  })

  test('exposes draft/finalized lifecycle and restricts CLI delivery to the exact commercialization identity', async () => {
    const f = await fixture()
    const expert = await expertOf(f.sessionId)
    const now = new Date().toISOString()
    expert.runtimeBinding.expertId = 'commercialization-research-report'
    expert.templateFillDraft = { templateId: 'contract-v1', fields, savedAt: now, updatedAt: now, completionReview: { initialRenderedAt: now, reportPath: f.outputPath } }
    await sessionService.appendSessionMetadata(f.sessionId, { expert, workDir: f.workDir })
    expect(await f.service.getTemplateFillSchema(f.sessionId)).toMatchObject({ delivery: 'cli-only', lifecycle: { stage: 'draft', allowedModes: ['patch', 'finalize'], reportPath: f.outputPath } })
    expert.templateFillDraft = undefined
    expert.templateFillDelivery = { templateId: 'contract-v1', finalizedAt: now, reportPath: f.outputPath }
    expert.runtimeBinding.expertId = 'commercialization-research-report-copy'
    await sessionService.appendSessionMetadata(f.sessionId, { expert, workDir: f.workDir })
    expect(await f.service.getTemplateFillSchema(f.sessionId)).toMatchObject({ delivery: 'structured-write', lifecycle: { stage: 'finalized', allowedModes: [], reportPath: f.outputPath } })
  })

  test('runs CLI through the API renderer and receipt commit preserving the exact fixed template and escaped fields', async () => {
    const f = await fixture()
    const result = await runExpertTemplateFillCli({ dataFromStdin: true, outputPath: 'report.html', serverUrl: 'http://local', sessionId: f.sessionId }, {
      env: { CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT: f.workDir, CC_JIANGXIA_EXPERT_TEMPLATE_FILL_DELIVERY: 'cli-only' },
      readStdin: async () => JSON.stringify({ format: EXPERT_TEMPLATE_FILL_FORMAT, templateId: 'contract-v1', fields }),
      readFile: fs.readFile, mkdir: fs.mkdir, writeFile: fs.writeFile, fetch: f.fetch,
    })
    const actual = await fs.readFile(f.outputPath, 'utf8')
    const expected = renderExpertTemplateFill(template, { format: EXPERT_TEMPLATE_FILL_FORMAT, templateId: 'contract-v1', fields }).content
    expect(createHash('sha256').update(actual).digest('hex')).toBe(createHash('sha256').update(expected).digest('hex'))
    expect(actual).toContain('<style>.fixed{color:#123456;display:grid}</style>')
    expect(actual).toContain('&lt;script&gt;untrusted()&lt;/script&gt;')
    expect(result.completionReviewRequired).toBe(false)
    expect((await expertOf(f.sessionId)).templateFillDelivery?.reportPath).toBe(f.outputPath)
  })

  test('delivers a CLI draft only after the required 08 reviewer audit and finalizes idempotently', async () => {
    const f = await fixture()
    const expert = await expertOf(f.sessionId)
    expert.runtimeBinding.researchArtifactPolicy = {
      mode: 'markdown-path-only', directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: ['commercialization-research/02-competitors.md'],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      completionReviewPath: 'commercialization-research/08-report-completeness-review.md', maxCharacters: 90_000,
    }
    const researchRoot = path.join(f.workDir, 'commercialization-research')
    await fs.mkdir(researchRoot)
    await fs.writeFile(path.join(researchRoot, '01-research-brief.md'), '# Brief\n- Product: a test product')
    await fs.writeFile(path.join(researchRoot, '07-report-field-absorption.md'), '# Approved field material\n- source-supported detail')
    await sessionService.appendSessionMetadata(f.sessionId, { workDir: f.workDir, expert })
    const options = { dataFromStdin: true as const, outputPath: 'report.html', serverUrl: 'http://local', sessionId: f.sessionId }
    const dependencies = {
      env: { CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT: f.workDir, CC_JIANGXIA_EXPERT_TEMPLATE_FILL_DELIVERY: 'cli-only' },
      readStdin: async () => JSON.stringify({ templateId: 'contract-v1', fields }),
      readFile: fs.readFile, mkdir: fs.mkdir, writeFile: fs.writeFile, fetch: f.fetch,
    }
    const initial = await runExpertTemplateFillCli(options, dependencies)
    expect(initial.completionReviewRequired).toBe(true)
    const draftHtml = await fs.readFile(f.outputPath, 'utf8')
    expect(draftHtml).toContain('<style>.fixed{color:#123456;display:grid}</style>')
    const initialState = await expertOf(f.sessionId)
    expect(initialState.templateFillDraft?.completionReview?.reportPath).toBe(f.outputPath)
    expect(initialState.templateFillDelivery).toBeUndefined()
    dependencies.readStdin = async () => JSON.stringify({ templateId: 'contract-v1', mode: 'finalize', fields: {} })
    await expect(runExpertTemplateFillCli(options, dependencies)).rejects.toMatchObject({ code: 'EXPERT_REPORT_COMPLETENESS_REVIEW_REQUIRED', action: 'resume-prerequisites' })
    expect(await fs.readFile(f.outputPath, 'utf8')).toBe(draftHtml)
    await fs.writeFile(path.join(researchRoot, '08-report-completeness-review.md'), '# Covered\n- No unsupported additions.')
    await expect(runExpertTemplateFillCli(options, dependencies)).rejects.toMatchObject({ code: 'EXPERT_REPORT_COMPLETENESS_REVIEWER_REQUIRED' })
    expect(await fs.readFile(f.outputPath, 'utf8')).toBe(draftHtml)
    await f.service.recordResearchAudit(f.sessionId, {
      agentId: 'contract-output-reviewer', agentType: 'expert-evidence-output-reviewer', entries: [],
      artifactPath: 'commercialization-research/08-report-completeness-review.md', content: '完整性复核已写入；无需补写。',
    })
    const finalized = await runExpertTemplateFillCli(options, dependencies)
    expect(finalized.completionReviewRequired).toBe(false)
    const finalState = await expertOf(f.sessionId)
    expect(finalState.templateFillDraft).toBeUndefined()
    expect(finalState.templateFillDelivery).toMatchObject({ templateId: 'contract-v1', reportPath: f.outputPath })
    expect(await fs.readFile(f.outputPath, 'utf8')).toBe(draftHtml)
    const receipt = { ...finalState.templateFillDelivery }
    await expect(runExpertTemplateFillCli(options, dependencies)).resolves.toMatchObject({ completionReviewRequired: false })
    const retriedState = await expertOf(f.sessionId)
    expect(retriedState.templateFillDraft).toBeUndefined()
    expect(retriedState.templateFillDelivery).toEqual(receipt)
    expect(await fs.readFile(f.outputPath, 'utf8')).toBe(draftHtml)
  })

  test('recovers an unacknowledged on-disk report using only its CLI receipt command', async () => {
    const f = await fixture()
    let renders = 0
    let recoveryReceipt = ''
    const interruptedFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/template-fill-commit')) throw new TypeError('Ack transport unavailable')
      renders += 1
      return f.fetch(url, init)
    }) as unknown as typeof globalThis.fetch
    try {
      await runExpertTemplateFillCli({ dataFromStdin: true, outputPath: 'report.html', serverUrl: 'http://local', sessionId: f.sessionId }, {
        env: { CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT: f.workDir }, readStdin: async () => JSON.stringify({ templateId: 'contract-v1', fields }),
        readFile: fs.readFile, mkdir: fs.mkdir, writeFile: fs.writeFile, fetch: interruptedFetch,
      })
      throw new Error('Expected acknowledgement transport failure')
    } catch (error) {
      expect(error).toMatchObject({ action: 'retry-commit', code: 'EXPERT_TEMPLATE_FILL_COMMIT_UNAVAILABLE' })
      recoveryReceipt = (error as { receipt: string }).receipt
    }
    const before = await fs.stat(f.outputPath)
    const content = await fs.readFile(f.outputPath, 'utf8')
    expect((await expertOf(f.sessionId)).templateFillDelivery).toBeUndefined()
    await expect(commitExpertTemplateFillCli({ commitReceipt: recoveryReceipt, outputPath: 'report.html', serverUrl: 'http://local', sessionId: f.sessionId }, {
      env: { CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT: f.workDir }, fetch: f.fetch,
    })).resolves.toEqual({ committed: true, outputPath: f.outputPath })
    expect(renders).toBe(1)
    expect((await fs.stat(f.outputPath)).mtimeMs).toBe(before.mtimeMs)
    expect(await fs.readFile(f.outputPath, 'utf8')).toBe(content)
    expect((await expertOf(f.sessionId)).templateFillDelivery?.reportPath).toBe(f.outputPath)
  })

  test.each([{ html: '<html>free</html>' }, { format: 'wrong/v2' }])('rejects unsupported input at the server without a write: %j', async extra => {
    const f = await fixture()
    const request = new Request(`http://local/api/sessions/${f.sessionId}/expert/template-fill`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payload: { templateId: 'contract-v1', fields, ...extra }, outputPath: f.outputPath }) })
    const response = await f.fetch(request)
    expect(response.status).toBe(400)
    expect(await fs.stat(f.outputPath).catch(() => null)).toBeNull()
  })

  test('keeps the original HTML on missing-field renderer failure and gives CLI repair instructions', async () => {
    const f = await fixture()
    const expert = await expertOf(f.sessionId)
    expert.runtimeBinding.expertId = 'commercialization-research-report'
    await sessionService.appendSessionMetadata(f.sessionId, { expert, workDir: f.workDir })
    await fs.writeFile(f.outputPath, '<html>original</html>')
    await expect(runExpertTemplateFillCli({ dataFromStdin: true, outputPath: 'report.html', serverUrl: 'http://local', sessionId: f.sessionId }, {
      env: { CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT: f.workDir },
      readStdin: async () => JSON.stringify({ templateId: 'contract-v1', fields: {} }),
      readFile: fs.readFile, mkdir: fs.mkdir, writeFile: fs.writeFile, fetch: f.fetch,
    })).rejects.toThrow('expert-template-fill')
    expect(await fs.readFile(f.outputPath, 'utf8')).toBe('<html>original</html>')
  })

  test('rejects a caller-supplied commit path that differs from the receipt path', async () => {
    const f = await fixture()
    const rendered = await f.service.renderTemplateFill(f.sessionId, { format: EXPERT_TEMPLATE_FILL_FORMAT, templateId: 'contract-v1', fields }, { outputPath: f.outputPath })
    await fs.writeFile(f.outputPath, rendered.content)
    await expect(f.service.commitTemplateFillWrite(f.sessionId, { receipt: rendered.writeReceipt, outputPath: path.join(f.workDir, 'other.html') })).rejects.toMatchObject({ code: 'EXPERT_TEMPLATE_FILL_WRITE_PATH_MISMATCH' })
    expect((await expertOf(f.sessionId)).templateFillDelivery).toBeUndefined()
    await expect(f.service.commitTemplateFillWrite(f.sessionId, { receipt: rendered.writeReceipt, outputPath: f.outputPath })).resolves.toEqual({ committed: true })
  })
})
