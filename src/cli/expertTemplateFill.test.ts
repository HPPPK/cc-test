import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { EXPERT_TEMPLATE_FILL_FORMAT } from '../utils/expertTemplateFill.js'
import { parseExpertTemplateFillCliArgs, runExpertTemplateFillCli } from './expertTemplateFill.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('expert-template-fill CLI', () => {
  test('parses the compact data and output arguments', () => {
    expect(parseExpertTemplateFillCliArgs(['--data', 'report-fields.json', '--output', 'final.html'])).toEqual({
      dataPath: 'report-fields.json',
      outputPath: 'final.html',
    })
    expect(parseExpertTemplateFillCliArgs(['--data-stdin', '--output', 'final.html'])).toEqual({
      dataFromStdin: true,
      outputPath: 'final.html',
    })
    expect(() => parseExpertTemplateFillCliArgs(['--data', 'report-fields.json', '--data-stdin', '--output', 'final.html'])).toThrow('exactly one')
    expect(() => parseExpertTemplateFillCliArgs(['--data', 'report-fields.json', '--output', 'final.txt'])).toThrow('.html')
    expect(() => parseExpertTemplateFillCliArgs(['--wat'])).toThrow('Unknown option')
  })

  test('preserves an opt-in evidence absorption map when forwarding fields to the active session', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-template-fill-absorption-cli-'))
    roots.push(root)
    const dataPath = path.join(root, 'report-fields.json')
    await fs.writeFile(dataPath, JSON.stringify({
      templateId: 'commercialization-research-classic-v1',
      fields: { REPORT_TITLE: 'AI 视频翻译' },
      evidenceAbsorption: {
        version: 'cc-jiangxia-evidence-absorption/v1',
        records: [{ sourceUrl: 'https://example.com/', disposition: 'used', fieldIds: ['REPORT_TITLE'], note: 'Supported title context.' }],
      },
    }))
    let requestedBody: Record<string, unknown> | undefined
    await runExpertTemplateFillCli({ dataPath, outputPath: path.join(root, 'report.html') }, {
      env: { CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:61237', CC_JIANGXIA_EXPERT_SESSION_ID: 'session-123' },
      readFile: fs.readFile, mkdir: fs.mkdir, writeFile: fs.writeFile,
      fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
        requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return new Response(JSON.stringify({ templateId: 'commercialization-research-classic-v1', content: '<html>ok</html>' }), { status: 200 })
      }) as typeof fetch,
    })
    expect((requestedBody?.payload as Record<string, unknown>).evidenceAbsorption).toMatchObject({ version: 'cc-jiangxia-evidence-absorption/v1' })
  })

  test('submits compact fields to the current Expert session and writes rendered HTML', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-template-fill-cli-'))
    roots.push(root)
    const dataPath = path.join(root, 'report-fields.json')
    const outputPath = path.join(root, 'nested', 'report.html')
    await fs.writeFile(dataPath, JSON.stringify({
      templateId: 'commercialization-research-classic-v1',
      fields: { REPORT_TITLE: 'AI 视频翻译' },
    }))
    let requestedUrl = ''
    let requestedBody: unknown

    const result = await runExpertTemplateFillCli(
      { dataPath, outputPath },
      {
        env: {
          CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:61237',
          CC_JIANGXIA_EXPERT_SESSION_ID: 'session-123',
        },
        readFile: fs.readFile,
        mkdir: fs.mkdir,
        writeFile: fs.writeFile,
        fetch: (async (url: string | URL | Request, init?: RequestInit) => {
          requestedUrl = String(url)
          requestedBody = JSON.parse(String(init?.body))
          return new Response(JSON.stringify({
            templateId: 'commercialization-research-classic-v1',
            content: '<html><body>固定母版</body></html>',
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }) as typeof fetch,
      },
    )

    expect(requestedUrl).toBe('http://127.0.0.1:61237/api/sessions/session-123/expert/template-fill')
    expect(requestedBody).toEqual({
      payload: {
        format: EXPERT_TEMPLATE_FILL_FORMAT,
        templateId: 'commercialization-research-classic-v1',
        fields: { REPORT_TITLE: 'AI 视频翻译' },
      },
    })
    expect(await fs.readFile(outputPath, 'utf8')).toBe('<html><body>固定母版</body></html>')
    expect(result).toEqual({
      outputPath: path.resolve(outputPath),
      templateId: 'commercialization-research-classic-v1',
      bytes: Buffer.byteLength('<html><body>固定母版</body></html>', 'utf8'),
    })
  })

  test('submits compact fields from standard input without creating a report-fields file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-template-fill-cli-'))
    roots.push(root)
    const outputPath = path.join(root, 'report.html')
    let requestedBody: unknown

    await runExpertTemplateFillCli(
      { dataFromStdin: true, outputPath },
      {
        env: { CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:61237', CC_JIANGXIA_EXPERT_SESSION_ID: 'session-stdin' },
        readFile: fs.readFile,
        readStdin: async () => JSON.stringify({ templateId: 'commercialization-research-classic-v1', fields: { REPORT_TITLE: 'stdin report' } }),
        mkdir: fs.mkdir,
        writeFile: fs.writeFile,
        fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
          requestedBody = JSON.parse(String(init?.body))
          return new Response(JSON.stringify({ templateId: 'commercialization-research-classic-v1', content: '<html>stdin</html>' }), { status: 200, headers: { 'content-type': 'application/json' } })
        }) as typeof fetch,
      },
    )

    expect(requestedBody).toEqual({
      payload: {
        format: EXPERT_TEMPLATE_FILL_FORMAT,
        templateId: 'commercialization-research-classic-v1',
        fields: { REPORT_TITLE: 'stdin report' },
      },
    })
    expect(await fs.readFile(outputPath, 'utf8')).toBe('<html>stdin</html>')
  })

  test('writes a direct-output Expert report only at the provided session workDir root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-template-fill-cli-'))
    const sessionWorkDir = path.join(root, 'selected-session-directory')
    roots.push(root)
    const writes: string[] = []

    const result = await runExpertTemplateFillCli(
      { dataFromStdin: true, outputPath: '产品方向-商业化调研报告.html' },
      {
        env: {
          CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:61237',
          CC_JIANGXIA_EXPERT_SESSION_ID: 'session-workdir',
          CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT: sessionWorkDir,
        },
        readFile: fs.readFile,
        readStdin: async () => JSON.stringify({ templateId: 'commercialization-research-classic-v1', fields: { REPORT_TITLE: 'session-root' } }),
        mkdir: fs.mkdir,
        writeFile: (async (filePath: string, content: string) => {
          writes.push(filePath)
          await fs.writeFile(filePath, content, 'utf8')
        }) as typeof fs.writeFile,
        fetch: (async () => new Response(JSON.stringify({ templateId: 'commercialization-research-classic-v1', content: '<html>session-root</html>' }), { status: 200 })) as typeof fetch,
      },
    )

    const expected = path.resolve(sessionWorkDir, '产品方向-商业化调研报告.html')
    expect(result.outputPath).toBe(expected)
    expect(writes).toEqual([expected])
    expect(await fs.readFile(expected, 'utf8')).toBe('<html>session-root</html>')
  })

  test('rejects absolute paths and subdirectories for a direct-output Expert session', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-template-fill-cli-'))
    roots.push(root)
    const dependencies = {
      env: {
        CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:61237',
        CC_JIANGXIA_EXPERT_SESSION_ID: 'session-workdir',
        CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT: root,
      },
      readFile: fs.readFile,
      readStdin: async () => JSON.stringify({ templateId: 'commercialization-research-classic-v1', fields: { REPORT_TITLE: 'blocked' } }),
      mkdir: fs.mkdir,
      writeFile: fs.writeFile,
      fetch: (async () => new Response(JSON.stringify({ templateId: 'commercialization-research-classic-v1', content: '<html>blocked</html>' }), { status: 200 })) as typeof fetch,
    }

    await expect(runExpertTemplateFillCli({ dataFromStdin: true, outputPath: path.join(root, 'absolute.html') }, dependencies)).rejects.toThrow('filename directly')
    await expect(runExpertTemplateFillCli({ dataFromStdin: true, outputPath: path.join('nested', 'report.html') }, dependencies)).rejects.toThrow('filename directly')
  })

  test('surfaces field validation returned by the bound template renderer', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-template-fill-cli-'))
    roots.push(root)
    const dataPath = path.join(root, 'report-fields.json')
    await fs.writeFile(dataPath, JSON.stringify({ templateId: 'classic-v1', fields: {} }))

    await expect(runExpertTemplateFillCli(
      { dataPath, outputPath: path.join(root, 'report.html') },
      {
        env: { DESKTOP_SERVER_URL: 'http://127.0.0.1:61237', EXPERT_SESSION_ID: 'session-123' },
        readFile: fs.readFile,
        mkdir: fs.mkdir,
        writeFile: fs.writeFile,
        fetch: (async () => new Response(JSON.stringify({ message: '专家模板字段校验未通过：缺少模板字段：REPORT_TITLE。' }), { status: 400 })) as typeof fetch,
      },
    )).rejects.toThrow('缺少模板字段：REPORT_TITLE')
  })
  test('writes the report when Bun on Windows reports EEXIST for an existing output directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-template-fill-cli-'))
    roots.push(root)
    const dataPath = path.join(root, 'report-fields.json')
    const outputPath = path.join(root, 'report.html')
    await fs.writeFile(dataPath, JSON.stringify({ templateId: 'commercialization-research-classic-v1', fields: { REPORT_TITLE: 'Windows output' } }))
    const existsError = Object.assign(new Error('EEXIST: file already exists'), { code: 'EEXIST' })

    await expect(runExpertTemplateFillCli(
      { dataPath, outputPath },
      {
        env: { CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:61237', CC_JIANGXIA_EXPERT_SESSION_ID: 'session-eexist' },
        readFile: fs.readFile,
        mkdir: (async () => { throw existsError }) as typeof fs.mkdir,
        stat: (async () => ({ isDirectory: () => true })) as typeof fs.stat,
        writeFile: fs.writeFile,
        fetch: (async () => new Response(JSON.stringify({ templateId: 'commercialization-research-classic-v1', content: '<html>windows</html>' }), { status: 200 })) as typeof fetch,
      },
    )).resolves.toMatchObject({ outputPath: path.resolve(outputPath) })

    expect(await fs.readFile(outputPath, 'utf8')).toBe('<html>windows</html>')
  })

  test('does not treat EEXIST as success when the output parent is a file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'expert-template-fill-cli-'))
    roots.push(root)
    const dataPath = path.join(root, 'report-fields.json')
    const outputPath = path.join(root, 'report.html')
    await fs.writeFile(dataPath, JSON.stringify({ templateId: 'commercialization-research-classic-v1', fields: { REPORT_TITLE: 'Blocked output' } }))
    const existsError = Object.assign(new Error('EEXIST: file already exists'), { code: 'EEXIST' })

    await expect(runExpertTemplateFillCli(
      { dataPath, outputPath },
      {
        env: { CC_JIANGXIA_DESKTOP_SERVER_URL: 'http://127.0.0.1:61237', CC_JIANGXIA_EXPERT_SESSION_ID: 'session-eexist-file' },
        readFile: fs.readFile,
        mkdir: (async () => { throw existsError }) as typeof fs.mkdir,
        stat: (async () => ({ isDirectory: () => false })) as typeof fs.stat,
        writeFile: fs.writeFile,
        fetch: (async () => new Response(JSON.stringify({ templateId: 'commercialization-research-classic-v1', content: '<html>blocked</html>' }), { status: 200 })) as typeof fetch,
      },
    )).rejects.toThrow('EEXIST')
  })

})
