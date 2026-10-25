import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { writeExpertText } from '../server/services/expertFilesystemBoundary.js'
import { EXPERT_TEMPLATE_FILL_FORMAT, type ExpertTemplateFillPayload } from '../utils/expertTemplateFill.js'

type RecordValue = Record<string, unknown>

export type ExpertTemplateFillCliOptions = {
  schema?: true
  commitReceipt?: string
  dataPath?: string
  dataFromStdin?: true
  outputPath?: string
  serverUrl?: string
  sessionId?: string
}

export type ExpertTemplateFillCliResult = {
  outputPath: string
  templateId: string
  bytes: number
  completionReviewRequired?: boolean
}

export type ExpertTemplateFillCliDependencies = {
  env: Record<string, string | undefined>
  readFile: typeof fs.readFile
  readStdin?: () => Promise<string>
  mkdir: typeof fs.mkdir
  /** Optional only to keep tests able to model Bun/Windows EEXIST behaviour. */
  stat?: typeof fs.stat
  writeFile: typeof fs.writeFile
  fetch: typeof fetch
}

const usage = 'Usage: cc-jiangxia expert-template-fill (--schema | --commit-receipt <receipt> | --data <report-fields.json> | --data-stdin) --output <final-report.html> [--server-url <url>] [--session-id <id>]'

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function optionValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value. ${usage}`)
  return value
}

export function parseExpertTemplateFillCliArgs(args: string[]): ExpertTemplateFillCliOptions {
  const options: Partial<ExpertTemplateFillCliOptions> = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') throw new Error(usage)
    if (arg === '--commit-receipt') {
      if (options.commitReceipt) throw new Error('--commit-receipt may only be provided once.')
      options.commitReceipt = optionValue(args, index, arg)
      index += 1
      continue
    }
    if (arg === '--schema') {
      if (options.schema) throw new Error('--schema may only be provided once.')
      options.schema = true
      continue
    }
    if (arg === '--data') {
      if (options.dataPath || options.dataFromStdin) throw new Error(`Provide exactly one of --data or --data-stdin. ${usage}`)
      options.dataPath = optionValue(args, index, arg)
      index += 1
      continue
    }
    if (arg === '--data-stdin') {
      if (options.dataPath || options.dataFromStdin) throw new Error(`Provide exactly one of --data or --data-stdin. ${usage}`)
      options.dataFromStdin = true
      continue
    }
    if (arg === '--output') {
      if (options.outputPath) throw new Error(`--output may only be provided once. ${usage}`)
      options.outputPath = optionValue(args, index, arg)
      index += 1
      continue
    }
    if (arg === '--server-url') {
      if (options.serverUrl) throw new Error(`--server-url may only be provided once. ${usage}`)
      options.serverUrl = optionValue(args, index, arg)
      index += 1
      continue
    }
    if (arg === '--session-id') {
      if (options.sessionId) throw new Error(`--session-id may only be provided once. ${usage}`)
      options.sessionId = optionValue(args, index, arg)
      index += 1
      continue
    }
    throw new Error(`Unknown option: ${arg}. ${usage}`)
  }
  if (options.schema) {
    if (options.dataPath || options.dataFromStdin || options.outputPath || options.commitReceipt) throw new Error('--schema cannot be combined with data or output options.')
    return options
  }
  if (options.commitReceipt && (options.dataPath || options.dataFromStdin)) throw new Error('--commit-receipt cannot be combined with a data source.')
  if ((!options.commitReceipt && !options.dataPath && !options.dataFromStdin) || !options.outputPath) {
    throw new Error(`One data source (--data or --data-stdin) and --output are required. ${usage}`)
  }
  if (!/\.html?$/i.test(options.outputPath)) throw new Error('--output must be an .html or .htm file.')
  return options as ExpertTemplateFillCliOptions
}

function parseFieldsDocument(content: string): ExpertTemplateFillPayload {
  let document: unknown
  try {
    document = JSON.parse(content)
  } catch (error) {
    throw new Error(`Could not parse --data JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isRecord(document)) throw new Error('--data must be a JSON object with templateId and fields.')
  const allowedKeys = new Set(['format', 'templateId', 'fields', 'mode', 'evidenceAbsorption'])
  const unknownKeys = Object.keys(document).filter(key => !allowedKeys.has(key))
  if (unknownKeys.length) throw new Error(`Unsupported --data properties: ${unknownKeys.join(', ')}. Supply fixed-template fields only.`)
  if (document.mode !== undefined && document.mode !== 'patch' && document.mode !== 'finalize') {
    throw new Error('--data.mode must be patch or finalize.')
  }
  if (document.format !== undefined && document.format !== EXPERT_TEMPLATE_FILL_FORMAT) {
    throw new Error(`Unsupported template-fill format: ${String(document.format)}.`)
  }
  if (typeof document.templateId !== 'string' || !document.templateId.trim()) {
    throw new Error('--data.templateId must be a non-empty string.')
  }
  if (!isRecord(document.fields)) throw new Error('--data.fields must be an object keyed by template field ID.')
  return {
    format: EXPERT_TEMPLATE_FILL_FORMAT,
    templateId: document.templateId.trim(),
    fields: document.fields,
    ...(document.mode === 'patch' || document.mode === 'finalize' ? { mode: document.mode } : {}),
    ...(document.evidenceAbsorption !== undefined ? { evidenceAbsorption: document.evidenceAbsorption } : {}),
  }
}

export class ExpertTemplateFillCliError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly action: 'repair-fields' | 'retry-render' | 'retry-write' | 'retry-commit' | 'rerender-same-fields' | 'restart-session' | 'resume-prerequisites',
    readonly retryable: boolean,
    readonly outputPath?: string,
    readonly receipt?: string,
  ) {
    super(message)
    this.name = 'ExpertTemplateFillCliError'
  }
}

async function responseError(response: Response, commit = false, outputPath?: string, receipt?: string): Promise<ExpertTemplateFillCliError> {
  let body: RecordValue = {}
  try {
    const value: unknown = await response.json()
    if (isRecord(value)) body = value
  } catch {
    // Preserve a useful HTTP error even when a proxy returns non-JSON content.
  }
  const code = typeof body.code === 'string' ? body.code : typeof body.error === 'string' ? body.error : commit ? 'EXPERT_TEMPLATE_FILL_COMMIT_FAILED' : 'EXPERT_TEMPLATE_FILL_RENDER_FAILED'
  const message = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : `Template renderer returned HTTP ${response.status}.`
  const transient = response.status >= 500 || response.status === 429 || response.status === 408
  const prerequisite = ['EXPERT_REPORT_COMPLETENESS_REVIEWER_REQUIRED', 'EXPERT_REPORT_COMPLETENESS_REVIEW_REQUIRED', 'EXPERT_RESEARCH_BRIEF_REQUIRED', 'EXPERT_RESEARCH_EVIDENCE_ABSORPTION_REQUIRED', 'EXPERT_RESEARCH_REPORT_ABSORPTION_REQUIRED', 'EXPERT_RESEARCH_REVIEW_REQUIRED'].includes(code)
  const action = !commit ? transient ? 'retry-render' : prerequisite ? 'resume-prerequisites' : 'repair-fields'
    : code === 'EXPERT_TEMPLATE_FILL_WRITE_RECEIPT_EXPIRED' ? 'rerender-same-fields'
      : code === 'EXPERT_TEMPLATE_FILL_WRITE_BINDING_CHANGED' ? 'restart-session'
        : code === 'EXPERT_TEMPLATE_FILL_WRITE_NOT_CONFIRMED' ? 'retry-write' : 'retry-commit'
  return new ExpertTemplateFillCliError(message, code, action, transient, outputPath, receipt)
}

async function acknowledgeWrite(
  url: string,
  receipt: string,
  outputPath: string,
  fetch: typeof globalThis.fetch,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ receipt, outputPath }),
      })
    } catch (error) {
      if (attempt < 2) continue
      throw new ExpertTemplateFillCliError(`Report saved, but write acknowledgement could not reach the server: ${error instanceof Error ? error.message : String(error)}. Preserve the report and retry only its receipt acknowledgement.`, 'EXPERT_TEMPLATE_FILL_COMMIT_UNAVAILABLE', 'retry-commit', true, outputPath, receipt)
    }
    if (!response.ok) {
      const error = await responseError(response, true, outputPath, receipt)
      if (error.retryable && attempt < 2) continue
      throw error
    }
    let result: unknown
    try { result = await response.json() } catch { /* Invalid acknowledgements never prove delivery. */ }
    if (!isRecord(result) || result.committed !== true) {
      if (attempt < 2) continue
      throw new ExpertTemplateFillCliError('Report saved, but the server returned an invalid write acknowledgement. Retry only its receipt acknowledgement.', 'EXPERT_TEMPLATE_FILL_COMMIT_UNAVAILABLE', 'retry-commit', true, outputPath, receipt)
    }
    return
  }
}

function resolveExpertTemplateFillOutputPath(
  outputPath: string,
  env: Record<string, string | undefined>,
): string {
  const outputRoot = (env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT
    ?? env.CC_HAHA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT)?.trim()
  if (!outputRoot) return path.resolve(outputPath)

  if (path.isAbsolute(outputPath) || path.basename(outputPath) !== outputPath || outputPath === '.' || outputPath === '..') {
    throw new Error('This Expert writes reports only as a filename directly in the current session workDir.')
  }
  return path.resolve(outputRoot, outputPath)
}

function readExpertTemplateFillStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let content = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { content += chunk })
    process.stdin.once('error', reject)
    process.stdin.once('end', () => resolve(content))
  })
}

function resolveServerUrl(value: string | undefined): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error('Missing Desktop Expert renderer URL. Run this command from the active Expert session, or pass --server-url.')
  try {
    return new URL(normalized).toString().replace(/\/$/, '')
  } catch {
    throw new Error(`Invalid --server-url: ${normalized}`)
  }
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error) && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'EEXIST'
}

async function ensureOutputDirectory(directory: string, dependencies: Pick<ExpertTemplateFillCliDependencies, 'mkdir' | 'stat'>): Promise<void> {
  try {
    await dependencies.mkdir(directory, { recursive: true })
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error
    const entry = await (dependencies.stat ?? fs.stat)(directory)
    if (!entry.isDirectory()) throw error
  }
}

export async function commitExpertTemplateFillCli(
  options: ExpertTemplateFillCliOptions,
  dependencies: Pick<ExpertTemplateFillCliDependencies, 'env' | 'fetch'> = { env: process.env, fetch: globalThis.fetch },
): Promise<{ committed: true; outputPath: string }> {
  if (!options.commitReceipt?.trim() || !options.outputPath || options.schema || options.dataPath || options.dataFromStdin) {
    throw new Error('Receipt recovery requires --commit-receipt and --output only, without data or schema options.')
  }
  const serverUrl = resolveServerUrl(options.serverUrl ?? dependencies.env.CC_JIANGXIA_DESKTOP_SERVER_URL ?? dependencies.env.DESKTOP_SERVER_URL)
  const sessionId = (options.sessionId ?? dependencies.env.CC_JIANGXIA_EXPERT_SESSION_ID ?? dependencies.env.EXPERT_SESSION_ID)?.trim()
  if (!sessionId) throw new Error('Missing Expert session ID. Run this command from the active Expert session, or pass --session-id.')
  const outputPath = resolveExpertTemplateFillOutputPath(options.outputPath, dependencies.env)
  await acknowledgeWrite(`${serverUrl}/api/sessions/${encodeURIComponent(sessionId)}/expert/template-fill-commit`, options.commitReceipt, outputPath, dependencies.fetch)
  return { committed: true, outputPath }
}

export async function queryExpertTemplateFillSchema(
  options: ExpertTemplateFillCliOptions,
  dependencies: Pick<ExpertTemplateFillCliDependencies, 'env' | 'fetch'> = { env: process.env, fetch: globalThis.fetch },
): Promise<RecordValue> {
  const serverUrl = resolveServerUrl(options.serverUrl ?? dependencies.env.CC_JIANGXIA_DESKTOP_SERVER_URL ?? dependencies.env.DESKTOP_SERVER_URL)
  const sessionId = (options.sessionId ?? dependencies.env.CC_JIANGXIA_EXPERT_SESSION_ID ?? dependencies.env.EXPERT_SESSION_ID)?.trim()
  if (!sessionId) throw new Error('Missing Expert session ID. Run this command from the active Expert session, or pass --session-id.')
  let response: Response
  try {
    response = await dependencies.fetch(`${serverUrl}/api/sessions/${encodeURIComponent(sessionId)}/expert/template-fill-schema`, { method: 'GET' })
  } catch (error) {
    throw new ExpertTemplateFillCliError(`Could not query the bound template schema: ${error instanceof Error ? error.message : String(error)}`, 'EXPERT_TEMPLATE_FILL_RENDER_UNAVAILABLE', 'retry-render', true)
  }
  if (!response.ok) throw await responseError(response)
  const result: unknown = await response.json()
  if (!isRecord(result)) throw new Error('The Desktop Expert returned an invalid template schema.')
  return result
}

export async function runExpertTemplateFillCli(
  options: ExpertTemplateFillCliOptions,
  dependencies: ExpertTemplateFillCliDependencies = {
    env: process.env,
    readFile: fs.readFile,
    mkdir: fs.mkdir,
    stat: fs.stat,
    writeFile: fs.writeFile,
    fetch: globalThis.fetch,
  },
): Promise<ExpertTemplateFillCliResult> {
  if (!options.outputPath || options.schema || options.commitReceipt) throw new Error(`Template delivery requires --output and a data source. ${usage}`)
  if ((options.dataPath ? 1 : 0) + (options.dataFromStdin ? 1 : 0) !== 1) {
    throw new Error(`Provide exactly one of --data or --data-stdin. ${usage}`)
  }
  const fieldsDocument = options.dataFromStdin
    ? await (dependencies.readStdin ?? readExpertTemplateFillStdin)()
    : await dependencies.readFile(options.dataPath!, 'utf8')
  const payload = parseFieldsDocument(fieldsDocument)
  const serverUrl = resolveServerUrl(options.serverUrl ?? dependencies.env.CC_JIANGXIA_DESKTOP_SERVER_URL ?? dependencies.env.DESKTOP_SERVER_URL)
  const resolvedOutputPath = resolveExpertTemplateFillOutputPath(options.outputPath, dependencies.env)
  const sessionId = (options.sessionId ?? dependencies.env.CC_JIANGXIA_EXPERT_SESSION_ID ?? dependencies.env.EXPERT_SESSION_ID)?.trim()
  if (!sessionId) throw new Error('Missing Expert session ID. Run this command from the active Expert session, or pass --session-id.')

  let response: Response
  try {
    response = await dependencies.fetch(`${serverUrl}/api/sessions/${encodeURIComponent(sessionId)}/expert/template-fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload, outputPath: resolvedOutputPath }),
    })
  } catch (error) {
    throw new ExpertTemplateFillCliError(`Could not reach the Desktop Expert template renderer: ${error instanceof Error ? error.message : String(error)}`, 'EXPERT_TEMPLATE_FILL_RENDER_UNAVAILABLE', 'retry-render', true)
  }
  if (!response.ok) throw await responseError(response)

  const body = await response.json() as { content?: unknown; templateId?: unknown; completionReviewRequired?: unknown; writeReceipt?: unknown }
  if (typeof body.content !== 'string' || !body.content.trim() || typeof body.templateId !== 'string' || !body.templateId.trim()) {
    throw new Error('The Desktop Expert template renderer returned an invalid result.')
  }

  const receipt = typeof body.writeReceipt === 'string' && body.writeReceipt.trim() ? body.writeReceipt : undefined
  const receiptRequired = dependencies.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_DELIVERY === 'cli-only'
    || Boolean((dependencies.env.CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT ?? dependencies.env.CC_HAHA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT)?.trim())
  if (receiptRequired && !receipt && body.completionReviewRequired !== false) {
    throw new ExpertTemplateFillCliError('The fixed-template renderer did not provide a write receipt. Preserve the fields and retry through the active session renderer.', 'EXPERT_TEMPLATE_FILL_WRITE_RECEIPT_REQUIRED', 'retry-render', false)
  }
  if (body.writeReceipt !== undefined && !receipt) throw new Error('The Desktop Expert template renderer returned an invalid write receipt.')
  try {
    await ensureOutputDirectory(path.dirname(resolvedOutputPath), dependencies)
    if (receiptRequired && dependencies.writeFile === fs.writeFile) {
      const canonicalRoot = await fs.realpath(path.dirname(resolvedOutputPath))
      await writeExpertText(canonicalRoot, path.basename(resolvedOutputPath), body.content)
    } else {
      await dependencies.writeFile(resolvedOutputPath, body.content, 'utf8')
    }
  } catch (error) {
    throw new ExpertTemplateFillCliError(`Could not save the rendered report: ${error instanceof Error ? error.message : String(error)}. Preserve the fields and retry the same fixed-template delivery.`, 'EXPERT_TEMPLATE_FILL_WRITE_FAILED', 'retry-write', true, resolvedOutputPath, receipt)
  }
  if (receipt) await acknowledgeWrite(`${serverUrl}/api/sessions/${encodeURIComponent(sessionId)}/expert/template-fill-commit`, receipt, resolvedOutputPath, dependencies.fetch)
  return {
    outputPath: resolvedOutputPath,
    templateId: body.templateId,
    bytes: Buffer.byteLength(body.content, 'utf8'),
    ...(typeof body.completionReviewRequired === 'boolean' ? { completionReviewRequired: body.completionReviewRequired } : {}),
  }
}

export async function expertTemplateFillMain(args: string[]): Promise<void> {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.log(usage)
    return
  }
  try {
    const options = parseExpertTemplateFillCliArgs(args)
    if (options.commitReceipt) {
      console.log(JSON.stringify({ ok: true, ...await commitExpertTemplateFillCli(options) }))
      return
    }
    if (options.schema) {
      console.log(JSON.stringify({ ok: true, ...await queryExpertTemplateFillSchema(options) }))
      return
    }
    const result = await runExpertTemplateFillCli(options)
    console.log(JSON.stringify({ ok: true, ...result }))
  } catch (error) {
    if (error instanceof ExpertTemplateFillCliError) {
      console.error(JSON.stringify({ ok: false, message: error.message, code: error.code, action: error.action, retryable: error.retryable, outputPath: error.outputPath, receipt: error.receipt }))
    } else {
      console.error(`expert-template-fill: ${error instanceof Error ? error.message : String(error)}`)
    }
    process.exitCode = 1
  }
}
