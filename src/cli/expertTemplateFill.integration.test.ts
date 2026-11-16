import { withFetchPreconnect } from '../server/__tests__/fixtureAssertions.js'
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as expertCli from './expertTemplateFill.js'
import { EXPERT_TEMPLATE_FILL_FORMAT } from '../utils/expertTemplateFill.js'
import { guardExpertResearchToolCall } from '../services/tools/expertResearchBudgetRuntime.js'
import { expertTemplateFillMain, parseExpertTemplateFillCliArgs, queryExpertTemplateFillSchema, runExpertTemplateFillCli } from './expertTemplateFill.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))) })

async function fixture(document: Record<string, unknown> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-cli-delivery-'))
  roots.push(root)
  const outputPath = path.join(root, 'report.html')
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const dependencies = {
    env: { DESKTOP_SERVER_URL: 'http://localhost:3456', EXPERT_SESSION_ID: 'session/cli' },
    readFile: fs.readFile, mkdir: fs.mkdir, writeFile: fs.writeFile,
    readStdin: async () => JSON.stringify({ templateId: 'fixed-v1', fields: { REPORT_TITLE: 'Report' }, ...document }),
    fetch: withFetchPreconnect(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      if (String(url).endsWith('template-fill-commit')) return Response.json({ committed: true })
      return Response.json({ content: '<html>fixed</html>', templateId: 'fixed-v1', completionReviewRequired: true, writeReceipt: 'receipt-1' })
    }),
  }
  return { root, outputPath, calls, dependencies, options: { dataFromStdin: true as const, outputPath } }
}

describe('expert CLI receipt delivery', () => {
  test('malformed literal report data reaches JSON validation without research reservation or file changes, then correct data delivers', async () => {
    const f = await fixture({ mode: 'patch' })
    const original = await f.dependencies.readStdin()
    const malformed = original.slice(0, -1) + ',"description":"Playwright and curl are source descriptions"}}'
    const command = "claude expert-template-fill --data-stdin --output report.html <<'JSON'\n" + malformed + '\nJSON'
    await guardExpertResearchToolCall({ toolName: 'Bash', input: { command }, env: {
      ...f.dependencies.env, CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE: '1', CC_JIANGXIA_EXPERT_TEMPLATE_FILL_DELIVERY: 'cli-only',
    }, fetchImpl: async () => { throw new Error('Report data must not reserve browser access') } })
    f.dependencies.readStdin = async () => malformed
    await expect(runExpertTemplateFillCli(f.options, f.dependencies)).rejects.toMatchObject({
      code: 'EXPERT_TEMPLATE_FILL_INVALID_JSON', action: 'repair-fields', retryable: false,
      message: expect.stringContaining('末尾多了一个右花括号'),
    })
    expect(f.calls).toHaveLength(0)
    await expect(fs.access(f.outputPath)).rejects.toThrow()
    f.dependencies.readStdin = async () => original
    await runExpertTemplateFillCli(f.options, f.dependencies)
    expect(f.calls.map(call => call.url.split('/').at(-1))).toEqual(['template-fill', 'template-fill-commit'])
    expect(await fs.readFile(f.outputPath, 'utf8')).toBe('<html>fixed</html>')
  })

  test('delivers through the real HTTP boundary and acknowledges the on-disk bytes', async () => {
    const f = await fixture({ mode: 'finalize' })
    let acknowledged = false
    const server = Bun.serve({
      hostname: '127.0.0.1', port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        const body = await request.json() as Record<string, unknown>
        if (url.pathname.endsWith('/template-fill')) {
          expect(body).toMatchObject({ outputPath: f.outputPath, payload: { mode: 'finalize' } })
          return Response.json({ content: '<html>HTTP fixed</html>', templateId: 'fixed-v1', completionReviewRequired: false, writeReceipt: 'http-receipt' })
        }
        expect(url.pathname).toBe('/api/sessions/session%2Fcli/expert/template-fill-commit')
        expect(body).toEqual({ receipt: 'http-receipt', outputPath: f.outputPath })
        expect(await fs.readFile(f.outputPath, 'utf8')).toBe('<html>HTTP fixed</html>')
        acknowledged = true
        return Response.json({ committed: true })
      },
    })
    try {
      const result = await runExpertTemplateFillCli({ ...f.options, serverUrl: server.url.toString() }, { ...f.dependencies, fetch: globalThis.fetch })
      expect(result.completionReviewRequired).toBe(false)
      expect(acknowledged).toBe(true)
    } finally { server.stop(true) }
  })

  test('prints schema JSON and structured delivery errors through the CLI entrypoint', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const error = spyOn(console, 'error').mockImplementation(() => {})
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(withFetchPreconnect(async () => Response.json({ templateId: 'bound-cli' })))
    const exitCode = process.exitCode
    try {
      await expertTemplateFillMain(['--help'])
      expect(log.mock.calls[0]?.[0]).toContain('--schema')
      await expertTemplateFillMain(['--schema', '--server-url', 'http://localhost:3456', '--session-id', 'bound'])
      expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({ ok: true, templateId: 'bound-cli' })
      fetch.mockImplementation(withFetchPreconnect(async () => Response.json({ committed: true })))
      await expertTemplateFillMain(['--commit-receipt', 'opaque-receipt', '--output', 'report.html', '--server-url', 'http://localhost:3456', '--session-id', 'bound'])
      expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({ ok: true, committed: true })
      fetch.mockImplementation(withFetchPreconnect(async () => Response.json({ error: 'EXPERT_TEMPLATE_FILL_PATCH_REQUIRED', message: 'Use patch mode' }, { status: 409 })))
      await expertTemplateFillMain(['--schema', '--server-url', 'http://localhost:3456', '--session-id', 'bound'])
      expect(JSON.parse(String(error.mock.calls.at(-1)?.[0]))).toMatchObject({ ok: false, code: 'EXPERT_TEMPLATE_FILL_PATCH_REQUIRED', action: 'repair-fields' })
      await expertTemplateFillMain(['--unknown'])
      expect(error.mock.calls.at(-1)?.[0]).toContain('Unknown option')
    } finally {
      log.mockRestore()
      error.mockRestore()
      fetch.mockRestore()
      process.exitCode = exitCode ?? 0
    }
  })

  test('retries transient server acknowledgement failures without rerendering', async () => {
    const f = await fixture()
    let commits = 0
    const fetch = f.dependencies.fetch
    f.dependencies.fetch = withFetchPreconnect(async (url, init) => {
      if (String(url).endsWith('template-fill-commit') && ++commits < 3) return Response.json({ error: 'UNAVAILABLE' }, { status: 503 })
      return fetch(url, init)
    })
    await runExpertTemplateFillCli(f.options, f.dependencies)
    expect(commits).toBe(3)
    expect(f.calls.filter(call => call.url.endsWith('/template-fill'))).toHaveLength(1)
  })

  test('does not accept invalid acknowledgement responses as delivery success', async () => {
    const f = await fixture()
    let commits = 0
    const fetch = f.dependencies.fetch
    f.dependencies.fetch = withFetchPreconnect(async (url, init) => {
      if (String(url).endsWith('template-fill-commit')) { commits += 1; return new Response('invalid JSON') }
      return fetch(url, init)
    })
    await expect(runExpertTemplateFillCli(f.options, f.dependencies)).rejects.toMatchObject({ code: 'EXPERT_TEMPLATE_FILL_COMMIT_UNAVAILABLE', action: 'retry-commit' })
    expect(commits).toBe(3)
    expect(await fs.readFile(f.outputPath, 'utf8')).toBe('<html>fixed</html>')
  })

  test.each(['symlink', 'hardlink'])('refuses a scoped %s report without modifying its target or acknowledging delivery', async kind => {
    const f = await fixture()
    const target = path.join(f.root, 'original.html')
    await fs.writeFile(target, '<html>preserved</html>')
    if (kind === 'symlink') {
      try { await fs.symlink(target, f.outputPath) } catch (error) {
        if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') {
          console.info('Symlink fixture skipped: Windows symlink capability unavailable (EPERM). Hardlink protection remains tested.')
          return
        }
        throw error
      }
    } else await fs.link(target, f.outputPath)
    Object.assign(f.dependencies.env, { CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT: f.root })
    await expect(runExpertTemplateFillCli({ dataFromStdin: true, outputPath: 'report.html' }, f.dependencies)).rejects.toMatchObject({ code: 'EXPERT_TEMPLATE_FILL_WRITE_FAILED' })
    expect(await fs.readFile(target, 'utf8')).toBe('<html>preserved</html>')
    expect(f.calls).toHaveLength(1)
  })

  test('parses receipt-only recovery and acknowledges without rendering or writing', async () => {
    expect(parseExpertTemplateFillCliArgs(['--commit-receipt', 'opaque-receipt', '--output', 'report.html'])).toEqual({ commitReceipt: 'opaque-receipt', outputPath: 'report.html' })
    for (const args of [['--commit-receipt', 'r', '--output', 'report.html', '--data-stdin'], ['--commit-receipt', 'r', '--output', 'report.html', '--schema'], ['--commit-receipt', 'r']]) {
      expect(() => parseExpertTemplateFillCliArgs(args)).toThrow()
    }
    const f = await fixture()
    const result = await expertCli.commitExpertTemplateFillCli({ commitReceipt: 'opaque-receipt', outputPath: 'report.html' }, {
      env: { DESKTOP_SERVER_URL: 'http://localhost:3456', EXPERT_SESSION_ID: 'session/cli', CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT: f.root }, fetch: f.dependencies.fetch,
    })
    expect(result).toEqual({ committed: true, outputPath: f.outputPath })
    expect(f.calls).toEqual([{ url: 'http://localhost:3456/api/sessions/session%2Fcli/expert/template-fill-commit', body: { receipt: 'opaque-receipt', outputPath: f.outputPath } }])
    expect(await fs.stat(f.outputPath).catch(() => null)).toBeNull()
  })

  test('directs missing research review to prerequisite recovery without retrying', async () => {
    const f = await fixture()
    let calls = 0
    f.dependencies.fetch = withFetchPreconnect(async () => { calls += 1; return Response.json({ error: 'EXPERT_REPORT_COMPLETENESS_REVIEW_REQUIRED', message: 'Review required' }, { status: 409 }) })
    await expect(runExpertTemplateFillCli(f.options, f.dependencies)).rejects.toMatchObject({ action: 'resume-prerequisites', retryable: false })
    expect(calls).toBe(1)
  })

  test('queries the bound session schema without a data source or output file', async () => {
    expect(parseExpertTemplateFillCliArgs(['--schema'])).toEqual({ schema: true })
    const f = await fixture()
    f.dependencies.fetch = withFetchPreconnect(async (url, init) => {
      expect(String(url)).toBe('http://localhost:3456/api/sessions/session%2Fcli/expert/template-fill-schema')
      expect(init?.method).toBe('GET')
      return Response.json({ templateId: 'bound-v1', fields: [{ id: 'TITLE' }], state: { draft: true } })
    })
    expect(await queryExpertTemplateFillSchema({ schema: true }, f.dependencies)).toMatchObject({ templateId: 'bound-v1', state: { draft: true } })
    expect(() => parseExpertTemplateFillCliArgs(['--schema', '--output', 'report.html'])).toThrow()
  })

  test.each(['CC_JIANGXIA_EXPERT_TEMPLATE_FILL_DELIVERY', 'CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT'])('requires a receipt for scoped delivery via %s', async key => {
    const f = await fixture()
    Object.assign(f.dependencies.env, { [key]: key.endsWith('ROOT') ? f.root : 'cli-only' })
    f.dependencies.fetch = withFetchPreconnect(async () => Response.json({ content: '<html>unsafe</html>', templateId: 'fixed-v1' }))
    await expect(runExpertTemplateFillCli({ dataFromStdin: true, outputPath: 'report.html' }, f.dependencies)).rejects.toMatchObject({ code: 'EXPERT_TEMPLATE_FILL_WRITE_RECEIPT_REQUIRED', action: 'retry-render' })
    expect(await fs.stat(f.outputPath).catch(() => null)).toBeNull()
  })

  test.each(['patch', 'finalize'])('forwards %s and output path, writes HTML before acknowledging receipt', async mode => {
    const f = await fixture({ mode })
    const fetch = f.dependencies.fetch
    f.dependencies.fetch = withFetchPreconnect(async (url, init) => {
      if (String(url).endsWith('template-fill-commit')) expect(await fs.readFile(f.outputPath, 'utf8')).toBe('<html>fixed</html>')
      return fetch(url, init)
    })
    const result = await runExpertTemplateFillCli(f.options, f.dependencies)
    expect(f.calls).toHaveLength(2)
    expect(f.calls[0]?.body).toMatchObject({ outputPath: f.outputPath, payload: { mode } })
    expect(f.calls[1]).toEqual({ url: 'http://localhost:3456/api/sessions/session%2Fcli/expert/template-fill-commit', body: { receipt: 'receipt-1', outputPath: f.outputPath } })
    expect(result).toMatchObject({ completionReviewRequired: true })
  })

  test.each([{ html: '<html>free</html>' }, { unexpected: true }, { mode: 'replace' }])('rejects unsupported document before rendering: %j', async document => {
    const f = await fixture(document)
    await expect(runExpertTemplateFillCli(f.options, f.dependencies)).rejects.toThrow()
    expect(f.calls).toHaveLength(0)
  })

  test('retries only acknowledgement transport errors and never rewrites the report', async () => {
    const f = await fixture()
    let commits = 0
    let writes = 0
    const fetch = f.dependencies.fetch
    f.dependencies.writeFile = (async (...args: Parameters<typeof fs.writeFile>) => { writes += 1; return fs.writeFile(...args) }) as typeof fs.writeFile
    f.dependencies.fetch = withFetchPreconnect(async (url, init) => {
      if (String(url).endsWith('template-fill-commit') && ++commits < 3) throw new TypeError('connection reset')
      return fetch(url, init)
    })
    await runExpertTemplateFillCli(f.options, f.dependencies)
    expect(commits).toBe(3)
    expect(writes).toBe(1)
    expect(f.calls.filter(call => call.url.endsWith('/template-fill'))).toHaveLength(1)
  })

  test('preserves written content and returns classified recovery details after acknowledgement retry limit', async () => {
    const f = await fixture()
    let commits = 0
    const fetch = f.dependencies.fetch
    f.dependencies.fetch = withFetchPreconnect(async (url, init) => {
      if (String(url).endsWith('template-fill-commit')) { commits += 1; throw new TypeError('offline') }
      return fetch(url, init)
    })
    await expect(runExpertTemplateFillCli(f.options, f.dependencies)).rejects.toMatchObject({ code: 'EXPERT_TEMPLATE_FILL_COMMIT_UNAVAILABLE', retryable: true, action: 'retry-commit', outputPath: f.outputPath, receipt: 'receipt-1' })
    expect(commits).toBe(3)
    expect(await fs.readFile(f.outputPath, 'utf8')).toBe('<html>fixed</html>')
  })

  test('does not retry an expired receipt or replace the already written report', async () => {
    const f = await fixture()
    let commits = 0
    const fetch = f.dependencies.fetch
    f.dependencies.fetch = withFetchPreconnect(async (url, init) => {
      if (String(url).endsWith('template-fill-commit')) { commits += 1; return Response.json({ error: 'EXPERT_TEMPLATE_FILL_WRITE_RECEIPT_EXPIRED', message: 'Receipt expired' }, { status: 409 }) }
      return fetch(url, init)
    })
    await expect(runExpertTemplateFillCli(f.options, f.dependencies)).rejects.toMatchObject({ code: 'EXPERT_TEMPLATE_FILL_WRITE_RECEIPT_EXPIRED', retryable: false, action: 'rerender-same-fields' })
    expect(commits).toBe(1)
    expect(await fs.readFile(f.outputPath, 'utf8')).toBe('<html>fixed</html>')
  })

  test('does not acknowledge a failed filesystem write', async () => {
    const f = await fixture()
    f.dependencies.writeFile = (async () => { throw new Error('disk full') }) as typeof fs.writeFile
    await expect(runExpertTemplateFillCli(f.options, f.dependencies)).rejects.toMatchObject({ code: 'EXPERT_TEMPLATE_FILL_WRITE_FAILED', action: 'retry-write', retryable: true })
    expect(f.calls).toHaveLength(1)
  })

  test('preserves existing report on renderer rejection and exposes server error code', async () => {
    const f = await fixture()
    await fs.writeFile(f.outputPath, '<html>existing</html>')
    f.dependencies.fetch = withFetchPreconnect(async () => Response.json({ error: 'EXPERT_TEMPLATE_FILL_FINAL_REVIEW_STALE', message: 'Review is stale' }, { status: 409 }))
    await expect(runExpertTemplateFillCli(f.options, f.dependencies)).rejects.toMatchObject({ code: 'EXPERT_TEMPLATE_FILL_FINAL_REVIEW_STALE', action: 'repair-fields', retryable: false })
    expect(await fs.readFile(f.outputPath, 'utf8')).toBe('<html>existing</html>')
  })
})


describe('expert CLI structured field recovery', () => {
  const payload = { format: EXPERT_TEMPLATE_FILL_FORMAT, templateId: 'fixed-v1', fields: { TITLE: '完整报告', ITEMS: [{ label: 'saved' }] }, evidenceAbsorption: { version: 'v1', records: [] } }

  test('parses read-only recovery and rejects every delivery or schema combination', () => {
    expect(parseExpertTemplateFillCliArgs(['--recover-fields'])).toEqual({ recoverFields: true })
    for (const args of [['--schema'], ['--data', 'fields.json'], ['--data-stdin'], ['--output', 'report.html'], ['--commit-receipt', 'receipt'], ['--recover-fields']]) {
      expect(() => parseExpertTemplateFillCliArgs(['--recover-fields', ...args])).toThrow('--recover-fields')
    }
  })

  test('gets complete stored fields over HTTP without writing any file', async () => {
    const f = await fixture()
    const requests: string[] = []
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
      requests.push(request.method + ' ' + new URL(request.url).pathname)
      expect(request.body).toBeNull()
      return Response.json(payload)
    } })
    try {
      expect(await expertCli.queryExpertTemplateFillFields({ recoverFields: true, serverUrl: server.url.toString() }, { env: f.dependencies.env, fetch: globalThis.fetch })).toEqual(payload)
      expect(requests).toEqual(['GET /api/sessions/session%2Fcli/expert/template-fill-fields'])
      expect(await fs.readdir(f.root)).toEqual([])
    } finally { server.stop(true) }
  })

  test('prints recovered fields JSON and recovery guidance through the CLI entrypoint', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const error = spyOn(console, 'error').mockImplementation(() => {})
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(withFetchPreconnect(async () => Response.json(payload)))
    const exitCode = process.exitCode
    try {
      await expertTemplateFillMain(['--help'])
      expect(log.mock.calls.at(-1)?.[0]).toContain('--recover-fields')
      await expertTemplateFillMain(['--recover-fields', '--server-url', 'http://localhost:3456', '--session-id', 'bound'])
      expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toEqual(payload)
      fetch.mockImplementation(withFetchPreconnect(async () => Response.json({ error: 'EXPERT_TEMPLATE_FILL_FINAL_REVIEW_STALE', message: 'Review is stale' }, { status: 409 })))
      await expertTemplateFillMain(['--schema', '--server-url', 'http://localhost:3456', '--session-id', 'bound'])
      expect(JSON.parse(String(error.mock.calls.at(-1)?.[0]))).toMatchObject({ action: 'repair-fields', recoveryCommand: 'cc-jiangxia expert-template-fill --recover-fields' })
    } finally { log.mockRestore(); error.mockRestore(); fetch.mockRestore(); process.exitCode = exitCode ?? 0 }
  })

  test.each(['transport', 'http'])('retries %s failures for read-only GET then returns fields', async failure => {
    let calls = 0
    const fetch = withFetchPreconnect(async () => {
      if (++calls < 3) {
        if (failure === 'transport') throw new TypeError('offline')
        return Response.json({ message: 'Busy' }, { status: 503 })
      }
      return Response.json(payload)
    })
    expect(await expertCli.queryExpertTemplateFillFields({ serverUrl: 'http://localhost:3456', sessionId: 'bound' }, { env: {}, fetch })).toEqual(payload)
    expect(calls).toBe(3)
  })

  test('recovered JSON can be delivered unchanged as complete fields', async () => {
    const f = await fixture()
    const recovered = await expertCli.queryExpertTemplateFillFields({ serverUrl: 'http://localhost:3456', sessionId: 'bound' }, { env: {}, fetch: withFetchPreconnect(async () => Response.json(payload)) })
    f.dependencies.readStdin = async () => JSON.stringify(recovered)
    await runExpertTemplateFillCli(f.options, f.dependencies)
    expect(f.calls[0]?.body.payload).toEqual(payload)
    expect((f.calls[0]?.body.payload as Record<string, unknown>).mode).toBeUndefined()
  })

  test('classifies exhausted transport failures and preserves the final transient HTTP error', async () => {
    for (const failure of ['transport', 'http']) {
      let calls = 0
      const fetch = withFetchPreconnect(async () => {
        calls += 1
        if (failure === 'transport') throw new TypeError('offline')
        return Response.json({ error: 'TEMPORARILY_BUSY', message: 'Busy' }, { status: 503 })
      })
      await expect(expertCli.queryExpertTemplateFillFields({ serverUrl: 'http://localhost:3456', sessionId: 'bound' }, { env: {}, fetch })).rejects.toMatchObject({ code: failure === 'transport' ? 'EXPERT_TEMPLATE_FILL_FIELDS_UNAVAILABLE' : 'TEMPORARILY_BUSY', retryable: true, action: 'retry-render' })
      expect(calls).toBe(3)
    }
  })

  test('schema query retains its response and error conventions through the shared GET helper', async () => {
    const options = { serverUrl: 'http://localhost:3456', sessionId: 'bound' }
    const schema = { templateId: 'bound-v1', fields: [{ id: 'TITLE' }], state: { draft: true } }
    expect(await queryExpertTemplateFillSchema(options, { env: {}, fetch: withFetchPreconnect(async () => Response.json(schema)) })).toEqual(schema)
    await expect(queryExpertTemplateFillSchema(options, { env: {}, fetch: withFetchPreconnect(async () => { throw new TypeError('offline') }) })).rejects.toMatchObject({ code: 'EXPERT_TEMPLATE_FILL_RENDER_UNAVAILABLE', retryable: true })
    await expect(queryExpertTemplateFillSchema(options, { env: {}, fetch: withFetchPreconnect(async () => Response.json([])) })).rejects.toThrow('invalid template schema')
    await expect(expertCli.queryExpertTemplateFillFields(options, { env: {}, fetch: withFetchPreconnect(async () => new Response('bad JSON')) })).rejects.toThrow('invalid recovered template fields')
  })

  test('programmatic delivery and commit reject recovery before any writes or requests', async () => {
    const f = await fixture()
    await expect(runExpertTemplateFillCli({ ...f.options, recoverFields: true }, f.dependencies)).rejects.toThrow('Template delivery requires')
    await expect(expertCli.commitExpertTemplateFillCli({ commitReceipt: 'r', outputPath: 'report.html', recoverFields: true }, f.dependencies)).rejects.toThrow('Receipt recovery requires')
    expect(f.calls).toEqual([])
    expect(await fs.readdir(f.root)).toEqual([])
  })

  test('keeps precise unavailable and corrupt recovery errors without retrying 409', async () => {
    for (const code of ['EXPERT_TEMPLATE_FILL_FIELDS_UNAVAILABLE', 'EXPERT_TEMPLATE_FILL_FIELDS_CHANGED']) {
      let calls = 0
      const fetch = withFetchPreconnect(async () => { calls += 1; return Response.json({ error: code, message: 'Stored structured fields unavailable' }, { status: 409 }) })
      await expect(expertCli.queryExpertTemplateFillFields({ serverUrl: 'http://localhost:3456', sessionId: 'bound' }, { env: {}, fetch })).rejects.toMatchObject({ code, retryable: false })
      expect(calls).toBe(1)
    }
  })

  test.each([{}, { ...payload, mode: 'patch' }, { ...payload, fields: [] }, { ...payload, format: 'unknown' }, { ...payload, content: '<html>saved</html>' }])('rejects malformed recovery without deriving fields from HTML: %j', async document => {
    await expect(expertCli.queryExpertTemplateFillFields({ serverUrl: 'http://localhost:3456', sessionId: 'bound' }, { env: {}, fetch: withFetchPreconnect(async () => Response.json(document)) })).rejects.toThrow('invalid recovered template fields')
  })
})
