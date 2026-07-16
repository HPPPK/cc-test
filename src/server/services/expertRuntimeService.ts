import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as vm from 'node:vm'
import { ExpertPackRegistryService, type ExpertDefinition, type ExpertIntakeState, type ExpertToolManifest } from './expertPackRegistryService.js'
import { assertSafeZipPath } from './zipPackAdapter.js'

export type ExpertRuntimeSkill = {
  skillId: string
  path: string
  source: 'expert-pack'
  packId: string
  packVersion: string
  sha256: string
  bytes: number
  version?: string
  title: string
  content: string
}

export type ExpertRuntimeContext = {
  expert: ExpertDefinition
  prompts: { system?: string; intake?: string }
  forms: Array<{ path: string; content: string; json?: unknown }>
  outputProtocol?: { path: string; content: string; json?: unknown }
  skills: ExpertRuntimeSkill[]
  hostTools: ExpertDefinition['hostTools']
  permissions: ExpertDefinition['permissions']
  runtimeInstructions: string
  globalSkillFallbackUsed: false
}

export type ExpertRuntimeInput = {
  projectRoot: string
  title?: string
  notes?: string
  runId?: string
  outputDir?: string
  intakeState?: ExpertIntakeState
  confirmExecutableTools?: boolean
}

export type ExpertRuntimeAnalysis = {
  context: ExpertRuntimeContext
  summary: string
  evidence: string
  material: Record<string, unknown>
}

export type ExpertRuntimeToolRecord = {
  toolId: string
  name: string
  type: ExpertToolManifest['type']
  source: 'host-builtin-ref' | 'expert-pack'
  entrypoint: string
  permissions: ExpertToolManifest['permissions']
  network?: ExpertToolManifest['network']
  executed: boolean
  result: string
  reason: string
  exitStatus: 'not-run' | 'completed' | 'rejected' | 'failed'
  startedAt?: string
  completedAt?: string
  durationMs?: number
  command?: string
  hostToolId?: string
  outputPaths?: string[]
  inputSummary?: string[]
  error?: string
}


const MAX_TOOL_READ_BYTES = 256 * 1024

const registry = new ExpertPackRegistryService()

export class ExpertRuntimeService {
  async loadContext(expertId: string): Promise<ExpertRuntimeContext> {
    const expert = await registry.getExpert(expertId)
    if (!expert) throw new Error(`Expert not found: ${expertId}`)
    const pack = await registry.getPackForExpert(expertId)
    if (!pack) throw new Error(`Expert pack not found for expert: ${expertId}`)
    if (pack.packId !== expert.packId) throw new Error(`Expert pack mismatch: ${expertId}`)
    if (expert.skillIds.length === 0) throw new Error(`Expert has no package-local skills: ${expertId}`)

    const prompts: ExpertRuntimeContext['prompts'] = {}
    if (expert.promptPaths.system) prompts.system = await registry.readPackText(expert.packId, expert.promptPaths.system)
    if (expert.promptPaths.intake) prompts.intake = await registry.readPackText(expert.packId, expert.promptPaths.intake)

    const forms: ExpertRuntimeContext['forms'] = []
    for (const formPath of expert.formPaths) {
      const content = await registry.readPackText(expert.packId, formPath)
      forms.push({ path: formPath, content, json: parseJsonLenient(content) })
    }

    const outputProtocol = expert.outputProtocolPath
      ? await readOutputProtocol(expert.packId, expert.outputProtocolPath)
      : undefined

    const skills: ExpertRuntimeSkill[] = []
    for (const skillId of expert.skillIds) {
      const skillPath = `skills/${skillId}/SKILL.md`
      const content = await registry.readPackText(expert.packId, skillPath)
      skills.push({
        skillId,
        path: skillPath,
        source: 'expert-pack',
        packId: expert.packId,
        packVersion: expert.packVersion,
        sha256: sha256(content),
        bytes: Buffer.byteLength(content, 'utf-8'),
        version: parseSkillVersion(content),
        title: parseSkillTitle(content) || skillId,
        content,
      })
    }

    return {
      expert,
      prompts,
      forms,
      outputProtocol,
      skills,
      hostTools: expert.hostTools,
      permissions: expert.permissions,
      runtimeInstructions: buildRuntimeInstructions(expert, skills),
      globalSkillFallbackUsed: false,
    }
  }

  async analyze(expertId: string, input: ExpertRuntimeInput): Promise<ExpertRuntimeAnalysis> {
    const context = await this.loadContext(expertId)
    const toolRecords = await buildToolRecords(context, input)
    const now = new Date().toISOString()
    const title = input.title?.trim() || context.expert.name
    const summary = context.prompts.system?.trim() || context.skills.map((skill) => skill.content.trim()).filter(Boolean).join('\n\n') || title
    const evidence = [
      `Expert: ${context.expert.name}`,
      `Pack: ${context.expert.packId}@${context.expert.packVersion}`,
      `Project root: ${input.projectRoot}`,
      input.notes?.trim() ? `Notes: ${input.notes.trim()}` : '',
      context.prompts.system?.trim() ?? '',
      ...context.skills.map((skill) => `## ${skill.title || skill.skillId}\n${skill.content}`),
      ...toolRecords.map((tool) => `## Tool ${tool.toolId}\n${tool.result ?? tool.reason ?? ''}`),
    ].filter(Boolean).join('\n\n')
    const material = {
      schemaVersion: 2,
      runtime: 'expert-pack-runtime',
      status: 'completed',
      expertId: context.expert.id,
      expertName: context.expert.name,
      packId: context.expert.packId,
      packVersion: context.expert.packVersion,
      createdAt: now,
      title,
      summary: firstParagraph(summary),
      run: { runId: input.runId ?? null, outputDir: input.outputDir ?? null },
      input: {
        projectRoot: input.projectRoot,
        notes: input.notes?.trim() || null,
        intakeState: input.intakeState ?? null,
      },
      promptsLoaded: {
        system: Boolean(context.prompts.system),
        intake: Boolean(context.prompts.intake),
      },
      formsLoaded: context.forms.map((form) => form.path),
      outputProtocolLoaded: context.outputProtocol?.path ?? null,
      packageLocalSkills: context.skills.map((skill) => ({
        skillId: skill.skillId,
        title: skill.title,
        source: skill.source,
        packId: skill.packId,
        packVersion: skill.packVersion,
        path: skill.path,
        sha256: skill.sha256,
        bytes: skill.bytes,
        ...(skill.version ? { version: skill.version } : {}),
      })),
      usedTools: toolRecords,
      safety: {
        workflowAutoStarted: false,
        workflowStageAdvanced: false,
        sourceModified: false,
        packageLocalSkillsOnly: true,
        packageLocalExecutableToolsExecuted: toolRecords.some((tool) => tool.type === 'packageLocalExecutable' && tool.executed),
        packageLocalExecutableToolsRequireSandbox: toolRecords.some((tool) => tool.type === 'packageLocalExecutable'),
        packageLocalExecutableToolsConfirmed: input.confirmExecutableTools === true,
      },
    }
    return { context, summary, evidence, material }
  }
}

async function readOutputProtocol(packId: string, outputProtocolPath: string): Promise<NonNullable<ExpertRuntimeContext['outputProtocol']>> {
  const content = await registry.readPackText(packId, outputProtocolPath)
  return { path: outputProtocolPath, content, json: parseJsonLenient(content) }
}

function buildRuntimeInstructions(expert: ExpertDefinition, skills: ExpertRuntimeSkill[]): string {
  const skillList = skills.map((skill) => `- ${skill.skillId} (${skill.path}, sha256:${skill.sha256})`).join('\n')
  const skillBodies = skills.map((skill) => {
    const body = stripFrontmatter(skill.content)
    return `## ${skill.title || skill.skillId}\n\n${body}`
  }).join('\n\n---\n\n')
  return [
    `Expert: ${expert.name}`,
    'Runtime context is loaded only from the selected Expert ZIP.',
    'Package-local skills loaded for this run:',
    skillList || '(none)',
    skillBodies,
  ].filter(Boolean).join('\n\n')
}

// 从 SKILL.md 内容中提取 frontmatter（YAML 格式）和正文
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return content
  return content.slice(match[0].length)
}

async function buildToolRecords(context: ExpertRuntimeContext, input: ExpertRuntimeInput): Promise<ExpertRuntimeToolRecord[]> {
  const records: ExpertRuntimeToolRecord[] = []
  for (const tool of context.expert.tools) {
    const base: ExpertRuntimeToolRecord = {
      toolId: tool.id,
      name: tool.name,
      type: tool.type,
      source: tool.type === 'hostBuiltinRef' ? 'host-builtin-ref' : 'expert-pack',
      entrypoint: tool.entrypoint,
      permissions: tool.permissions,
      network: tool.network,
      executed: false,
      result: 'not-run',
      reason: '',
      exitStatus: 'not-run',
      ...(tool.command ? { command: tool.command } : {}),
      ...(tool.hostToolId ? { hostToolId: tool.hostToolId } : {}),
    }
    if (tool.type === 'hostBuiltinRef') {
      records.push({ ...base, result: 'available-to-host', reason: 'Host built-in tool reference is available to the app shell and must still follow host permissions.' })
      continue
    }
    if (tool.type === 'packageLocalDeclarative') {
      records.push({ ...base, result: 'declared-not-run-by-current-runtime', reason: 'Package-local declarative tools are recorded for portability but are not invoked by the current material run.' })
      continue
    }
    records.push(await executePackageLocalExecutableTool(context, input, tool, base))
  }
  return records
}

async function executePackageLocalExecutableTool(context: ExpertRuntimeContext, input: ExpertRuntimeInput, tool: ExpertToolManifest, base: ExpertRuntimeToolRecord): Promise<ExpertRuntimeToolRecord> {
  if (input.confirmExecutableTools !== true) {
    return {
      ...base,
      result: 'blocked-pending-permission-confirmation',
      reason: 'Package-local executable tool was not run because the user has not confirmed this tool execution for the current expert run.',
    }
  }
  if (tool.network === 'declared') {
    return {
      ...base,
      result: 'rejected-network-not-allowed',
      reason: 'Package-local executable tools run with network disabled by default. This tool declares network access and needs a future explicit network permission path.',
      exitStatus: 'rejected',
    }
  }
  if (!tool.command) {
    return {
      ...base,
      result: 'rejected-missing-command',
      reason: 'Package-local executable tool must declare a package-local JavaScript command file.',
      exitStatus: 'rejected',
    }
  }

  const startedAt = new Date().toISOString()
  const started = Date.now()
  const outputRoot = path.resolve(input.outputDir ?? path.join(input.projectRoot, '.workflow', 'intake', 'expert-runs', input.runId ?? 'runtime', context.expert.id))
  const projectRoot = path.resolve(input.projectRoot)
  const outputPaths: string[] = []
  const inputSummary: string[] = []
  const logs: string[] = []

  try {
    assertSafeZipPath(tool.command)
    if (!/\.[cm]?js$/i.test(tool.command)) throw new Error('Only package-local JavaScript tool commands are supported by the expert sandbox.')
    const source = await registry.readPackText(context.expert.packId, tool.command)
    rejectDangerousToolSource(source)
    await fs.mkdir(outputRoot, { recursive: true })

    const api = Object.freeze({
      projectRoot,
      outputRoot,
      async listDir(relativePath = '.') {
        const dir = resolveInside(projectRoot, String(relativePath || '.'))
        const entries = await fs.readdir(dir, { withFileTypes: true })
        inputSummary.push(`list:${path.relative(projectRoot, dir).replace(/\\/g, '/') || '.'}`)
        return entries.map((entry) => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other' }))
      },
      async readText(relativePath: string) {
        const filePath = resolveInside(projectRoot, String(relativePath))
        const stat = await fs.stat(filePath)
        if (!stat.isFile()) throw new Error('Only files can be read.')
        if (stat.size > MAX_TOOL_READ_BYTES) throw new Error('Tool read is limited to small text files.')
        inputSummary.push(`read:${path.relative(projectRoot, filePath).replace(/\\/g, '/')}`)
        return fs.readFile(filePath, 'utf-8')
      },
      async writeText(relativePath: string, content: unknown) {
        const filePath = resolveInside(outputRoot, String(relativePath))
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, String(content), 'utf-8')
        const normalized = path.relative(outputRoot, filePath).replace(/\\/g, '/')
        outputPaths.push(path.join(outputRoot, normalized))
        return { path: normalized }
      },
      async writeJson(relativePath: string, value: unknown) {
        return this.writeText(relativePath, `${JSON.stringify(value, null, 2)}
`)
      },
      log(message: unknown) {
        logs.push(String(message).slice(0, 1000))
      },
    })

    const script = new vm.Script(`(async () => { const expert = __expertApi; ${source}
})()`, { filename: tool.command })
    const sandbox = vm.createContext(Object.create(null))
    Object.defineProperty(sandbox, '__expertApi', { value: api, enumerable: false })
    Object.defineProperty(sandbox, 'console', { value: Object.freeze({ log: api.log, warn: api.log, error: api.log }), enumerable: false })
    const result = await withTimeout(Promise.resolve(script.runInContext(sandbox, { timeout: 1000 }) as Promise<unknown>), 3000)
    const completedAt = new Date().toISOString()
    return {
      ...base,
      executed: true,
      result: 'completed-in-sandbox',
      reason: 'Package-local executable tool ran in the expert sandbox after explicit confirmation. It could only read the authorized project directory and write the expert output directory.',
      exitStatus: 'completed',
      startedAt,
      completedAt,
      durationMs: Date.now() - started,
      outputPaths,
      inputSummary,
      ...(logs.length ? { logs } as Record<string, unknown> : {}),
      ...(result === undefined ? {} : { returnValue: result } as Record<string, unknown>),
    } as ExpertRuntimeToolRecord
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const rejected = /outside the allowed directory|network|Only package-local|Dangerous/.test(message)
    return {
      ...base,
      executed: true,
      result: rejected ? 'rejected-by-sandbox' : 'failed-in-sandbox',
      reason: rejected ? 'The expert sandbox rejected this tool before it could perform an unsafe operation.' : 'The package-local executable tool failed inside the expert sandbox.',
      exitStatus: rejected ? 'rejected' : 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      outputPaths,
      inputSummary,
      error: message,
    }
  }
}

function resolveInside(root: string, relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error('Tool path is outside the allowed directory.')
  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, relativePath)
  if (!isInside(resolvedRoot, target)) throw new Error('Tool path is outside the allowed directory.')
  return target
}

function rejectDangerousToolSource(source: string): void {
  const blockedPattern = new RegExp('\\b(require|import)\\s*\\(|\\bprocess\\b|node:')
  if (blockedPattern.test(source)) {
    throw new Error('Dangerous package-local tool source is not allowed in the expert sandbox.')
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Package-local tool timed out in the expert sandbox.')), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function parseJsonLenient(content: string): unknown | undefined {
  try { return JSON.parse(content) } catch { return undefined }
}

function parseSkillTitle(content: string): string | undefined {
  const heading = content.split(/\r?\n/).find((line) => line.startsWith('# '))
  return heading?.replace(/^#\s+/, '').trim()
}

function parseSkillVersion(content: string): string | undefined {
  const match = content.match(/^version:\s*["']?([^"'\n]+)["']?\s*$/m)
  return match?.[1]?.trim()
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}

function firstParagraph(markdown: string): string {
  return markdown.split(/\n\n+/).find((part) => !part.startsWith('#') && part.trim())?.trim() ?? markdown.slice(0, 160)
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

