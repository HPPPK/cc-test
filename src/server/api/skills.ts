/**
 * Skills REST API
 *
 * GET /api/skills              — List all installed skills (metadata only)
 * GET /api/skills/detail       — Full skill data (tree + files)
 *       ?source=user&name=xxx
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import { parseFrontmatter } from '../../utils/frontmatterParser.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getProjectDirsUpToHome } from '../../utils/markdownConfigLoader.js'
import { getCwd } from '../../utils/cwd.js'
import { loadAllPlugins, loadAllPluginsCacheOnly } from '../../utils/plugins/pluginLoader.js'
import { getSkillDirCommands } from '../../skills/loadSkillsDir.js'
import type { LoadedPlugin } from '../../types/plugin.js'
import { ApiError, errorResponse } from '../middleware/errorHandler.js'
import type { WorkflowPhaseSkillSource } from '../services/workflowTypes.js'

// ─── Types ───────────────────────────────────────────────────────────────────

type SkillMeta = {
  name: string
  displayName?: string
  description: string
  source: SkillCatalogSource
  catalogStatus: 'available' | 'fallback-contract'
  nativeProvider?: 'skill-tool'
  userInvocable: boolean
  version?: string
  contentLength: number
  hasDirectory: boolean
  createdAt: string
  updatedAt: string
  pluginName?: string
  namespace?: string
  referenceId?: string
  contentHash?: string
  provenance?: {
    sourcePath?: string
    namespace?: string
    referenceId?: string
    version?: string
    contentHash?: string
    pluginName?: string
  }
}

type SkillCatalogSource = Extract<
  WorkflowPhaseSkillSource,
  | 'workflow'
  | 'fallback'
  | 'superpowers'
  | 'spec-kit-plus'
  | 'codex'
  | 'claude-code'
  | 'user'
  | 'project'
  | 'plugin'
>
type SkillSource = SkillCatalogSource
type InstalledSkillSource = Extract<SkillSource, 'user' | 'project' | 'plugin'>

type FileTreeNode = {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
}

type SkillFile = {
  path: string
  content: string
  language: string
  frontmatter?: Record<string, unknown>
  body?: string
  isEntry?: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILES = 50
const MAX_FILE_SIZE = 100 * 1024 // 100 KB
const SKIP_ENTRIES = new Set(['node_modules', '.git', '__pycache__', '.DS_Store'])
const FALLBACK_WORKFLOW_SKILL_IDS = [
  'workflow:subagent-orchestrator',
  'workflow:coder-subagent',
  'workflow:reviewer-subagent',
  'workflow:qa-scenario-subagent',
  'workflow:task-router',
  'workflow:project-memory',
  'workflow:follow-up-router',
  'workflow:local-preview-runner',
  'workflow:process-manager',
  'workflow:problem-investigation',
  'superpowers:brainstorming',
  'superpowers:writing-plans',
  'superpowers:systematic-debugging',
  'superpowers:test-driven-development',
  'superpowers:verification-before-completion',
  'superpowers:requesting-code-review',
  'superpowers:finishing-a-development-branch',
  'spec-kit-plus:discussion',
  'spec-kit-plus:specify',
  'spec-kit-plus:plan',
  'spec-kit-plus:tasks',
  'spec-kit-plus:implement',
  'spec-kit-plus:testing',
  'spec-kit-plus:ask',
  'spec-kit-plus:check',
  'spec-kit-plus:implement-review',
  'codex:todo-planning',
  'codex:edit-and-test',
  'codex:test-generation',
  'claude-code:read-grep-edit-bash-todo',
  'claude-code:todo-write',
] as const

const LANG_MAP: Record<string, string> = {
  md: 'markdown', ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', json: 'json',
  yaml: 'yaml', yml: 'yaml', sh: 'bash', bash: 'bash',
  py: 'python', toml: 'toml', css: 'css', html: 'html',
  txt: 'text', xml: 'xml', sql: 'sql', rs: 'rust', go: 'go',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return LANG_MAP[ext] || 'text'
}

function normalizeFrontmatter(content: string, sourcePath?: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const parsed = parseFrontmatter(content, sourcePath)
  return {
    frontmatter: parsed.frontmatter as Record<string, unknown>,
    body: parsed.content,
  }
}

function getUserSkillsDir(): string {
  return path.join(getClaudeConfigHomeDir(), 'skills')
}

function getRequestedCwd(url: URL): string {
  return url.searchParams.get('cwd') || getCwd()
}

function getProjectSkillsDirs(cwd: string): string[] {
  return getProjectDirsUpToHome('skills', cwd)
}

function sourceForFallbackSkill(id: string): SkillCatalogSource {
  const namespace = id.split(':', 1)[0]
  if (
    namespace === 'workflow' ||
    namespace === 'superpowers' ||
    namespace === 'spec-kit-plus' ||
    namespace === 'codex' ||
    namespace === 'claude-code'
  ) {
    return namespace
  }
  return 'fallback'
}

function sourceForInstalledWorkflowProviderSkill(id: string): SkillCatalogSource | null {
  const namespace = id.split(':', 1)[0]
  if (
    namespace === 'superpowers' ||
    namespace === 'spec-kit-plus' ||
    namespace === 'codex' ||
    namespace === 'claude-code' ||
    namespace === 'workflow'
  ) {
    return namespace
  }
  return null
}

function frontmatterString(frontmatter: Record<string, unknown>, key: string): string | null {
  const value = frontmatter[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getInstalledWorkflowProviderIdentity(
  skillName: string,
  frontmatter: Record<string, unknown>,
): string {
  const referenceId = frontmatterString(frontmatter, 'referenceId')
    ?? frontmatterString(frontmatter, 'reference-id')
  if (referenceId && sourceForInstalledWorkflowProviderSkill(referenceId)) {
    return referenceId
  }

  const declaredName = frontmatterString(frontmatter, 'name')
  if (declaredName && sourceForInstalledWorkflowProviderSkill(declaredName)) {
    return declaredName
  }

  return skillName
}

function displayNameForFallbackSkill(id: string): string {
  return id
    .split(':')
    .map((part) => part
      .split('-')
      .map((token) => token ? `${token[0]!.toUpperCase()}${token.slice(1)}` : token)
      .join(' '))
    .join(': ')
}

function collectFallbackWorkflowSkills(existingSkills: SkillMeta[] = []): SkillMeta[] {
  const existingNames = new Set(existingSkills.map((skill) => skill.name))
  const timestamp = new Date(0).toISOString()
  return FALLBACK_WORKFLOW_SKILL_IDS
    .filter((id) => !existingNames.has(id))
    .map((id): SkillMeta => ({
      name: id,
      displayName: displayNameForFallbackSkill(id),
      description: `Workflow fallback contract for ${id}. Native provider execution is optional and must not be assumed.`,
      source: sourceForFallbackSkill(id),
      catalogStatus: 'fallback-contract',
      userInvocable: false,
      contentLength: 0,
      hasDirectory: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      namespace: id.split(':', 1)[0],
      referenceId: id,
      provenance: {
        namespace: id.split(':', 1)[0],
        referenceId: id,
      },
    }))
}

async function loadSkillMeta(
  skillDir: string,
  skillName: string,
  source: SkillSource,
  pluginName?: string,
): Promise<SkillMeta | null> {
  const skillFile = path.join(skillDir, 'SKILL.md')
  try {
    const stat = await fs.stat(skillFile)
    const raw = await fs.readFile(skillFile, 'utf-8')
    const { frontmatter, body } = normalizeFrontmatter(raw, skillFile)

    const description =
      (frontmatter.description as string) ||
      body
        .split('\n')
        .find((l) => l.trim().length > 0)
        ?.trim() ||
      'No description'

    const identityName = getInstalledWorkflowProviderIdentity(skillName, frontmatter)
    const providerSource = sourceForInstalledWorkflowProviderSkill(identityName)
    const declaredDisplayName = frontmatterString(frontmatter, 'name')

    return {
      name: identityName,
      displayName: declaredDisplayName && declaredDisplayName !== identityName ? declaredDisplayName : undefined,
      description,
      source: providerSource ?? source,
      catalogStatus: 'available',
      ...(providerSource ? { nativeProvider: 'skill-tool' as const } : {}),
      userInvocable: frontmatter['user-invocable'] !== false,
      version: frontmatter.version != null ? String(frontmatter.version) : undefined,
      contentLength: raw.length,
      hasDirectory: true,
      createdAt: stat.birthtime.toISOString(),
      updatedAt: stat.mtime.toISOString(),
      pluginName,
      ...(providerSource ? {
        namespace: identityName.split(':', 1)[0],
        referenceId: identityName,
      } : {}),
    }
  } catch {
    return null
  }
}

async function buildFileTree(
  dirPath: string,
): Promise<{ tree: FileTreeNode[]; files: SkillFile[] }> {
  const tree: FileTreeNode[] = []
  const files: SkillFile[] = []
  let fileCount = 0

  async function walk(currentPath: string, nodes: FileTreeNode[]) {
    if (fileCount >= MAX_FILES) return

    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true })
    } catch {
      return
    }

    // directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    for (const entry of entries) {
      if (fileCount >= MAX_FILES) break
      if (SKIP_ENTRIES.has(entry.name) || entry.name.startsWith('.')) continue

      const fullPath = path.join(currentPath, entry.name)
      const relPath = path.relative(dirPath, fullPath)

      if (entry.isDirectory()) {
        const node: FileTreeNode = {
          name: entry.name,
          path: relPath,
          type: 'directory',
          children: [],
        }
        nodes.push(node)
        await walk(fullPath, node.children!)
        if (node.children!.length === 0) delete node.children
      } else if (entry.isFile()) {
        nodes.push({ name: entry.name, path: relPath, type: 'file' })

        try {
          const stat = await fs.stat(fullPath)
          if (stat.size <= MAX_FILE_SIZE) {
            const content = await fs.readFile(fullPath, 'utf-8')
            const language = detectLanguage(entry.name)
            const isEntry = relPath === 'SKILL.md'

            if (isEntry && language === 'markdown') {
              const { frontmatter, body } = normalizeFrontmatter(content, fullPath)
              files.push({
                path: relPath,
                content: body,
                body,
                frontmatter,
                language,
                isEntry: true,
              })
            } else {
              files.push({
                path: relPath,
                content,
                language,
                isEntry: false,
              })
            }
            fileCount++
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  await walk(dirPath, tree)
  return { tree, files }
}

async function collectSkillsFromRoots(
  skillRoots: string[],
  source: SkillSource,
): Promise<SkillMeta[]> {
  const skills: SkillMeta[] = []
  const seenNames = new Set<string>()

  for (const root of skillRoots) {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(root, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (
        (!entry.isDirectory() && !entry.isSymbolicLink()) ||
        entry.name.startsWith('.')
      ) {
        continue
      }

      const meta = await loadSkillMeta(path.join(root, entry.name), entry.name, source)
      if (!meta || seenNames.has(meta.name)) continue

      seenNames.add(meta.name)
      skills.push(meta)
    }
  }

  return skills
}

async function resolveSkillDir(
  source: InstalledSkillSource,
  name: string,
  cwd: string,
): Promise<string | null> {
  const skillRoots =
    source === 'user'
      ? [getUserSkillsDir()]
      : source === 'project'
        ? getProjectSkillsDirs(cwd)
        : []

  for (const root of skillRoots) {
    const skillDir = path.join(root, name)
    try {
      const stat = await fs.stat(skillDir)
      if (stat.isDirectory()) {
        return skillDir
      }
    } catch {
      // Try the next candidate root.
    }
  }

  return null
}

async function findSkillDirByCatalogName(
  skillRoots: string[],
  source: InstalledSkillSource,
  name: string,
): Promise<string | null> {
  for (const root of skillRoots) {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(root, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if ((!entry.isDirectory() && !entry.isSymbolicLink()) || entry.name.startsWith('.')) {
        continue
      }

      const skillDir = path.join(root, entry.name)
      const meta = await loadSkillMeta(skillDir, entry.name, source)
      if (meta?.name === name) {
        return skillDir
      }
    }
  }

  return null
}

async function resolveNativeProviderSkillDir(
  source: SkillCatalogSource,
  name: string,
  cwd: string,
): Promise<{ skillDir: string; source: InstalledSkillSource; pluginName?: string } | null> {
  if (sourceForInstalledWorkflowProviderSkill(name) !== source) {
    return null
  }

  const userSkillDir = await resolveSkillDir('user', name, cwd)
    ?? await findSkillDirByCatalogName([getUserSkillsDir()], 'user', name)
  if (userSkillDir) {
    return { skillDir: userSkillDir, source: 'user' }
  }

  const projectSkillRoots = getProjectSkillsDirs(cwd)
  const projectSkillDir = await resolveSkillDir('project', name, cwd)
    ?? await findSkillDirByCatalogName(projectSkillRoots, 'project', name)
  if (projectSkillDir) {
    return { skillDir: projectSkillDir, source: 'project' }
  }

  const pluginLocations = await collectPluginSkillDirectories()
  const directPluginLocation = pluginLocations.get(name)
  if (directPluginLocation) {
    return {
      skillDir: directPluginLocation.skillDir,
      source: 'plugin',
      pluginName: directPluginLocation.pluginName,
    }
  }

  for (const location of pluginLocations.values()) {
    const meta = await loadSkillMeta(location.skillDir, path.basename(location.skillDir), 'plugin', location.pluginName)
    if (meta?.name === name) {
      return {
        skillDir: location.skillDir,
        source: 'plugin',
        pluginName: location.pluginName,
      }
    }
  }

  return null
}

type PluginSkillLocation = {
  skillDir: string
  pluginName: string
}

export type SkillSlashCommand = {
  name: string
  description: string
  argumentHint?: string
}

async function collectLegacySlashCommands(cwd: string): Promise<SkillSlashCommand[]> {
  const commands = await getSkillDirCommands(cwd)
  return commands
    .filter((command) =>
      command.type === 'prompt' &&
      command.loadedFrom === 'commands_DEPRECATED' &&
      command.userInvocable !== false &&
      !command.isHidden)
    .map((command) => ({
      name: command.name,
      description: command.description || '',
      ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}),
    }))
}

function buildPluginSkillName(pluginName: string, skillDir: string): string {
  return `${pluginName}:${path.basename(skillDir)}`
}

async function collectPluginSkillDirectories(): Promise<Map<string, PluginSkillLocation>> {
  const locations = new Map<string, PluginSkillLocation>()

  let enabledPlugins: LoadedPlugin[]
  try {
    const result = await loadAllPluginsCacheOnly()
    if (result.errors.some((error) => error.type === 'plugin-cache-miss')) {
      enabledPlugins = (await loadAllPlugins()).enabled
    } else {
      enabledPlugins = result.enabled
    }
  } catch {
    return locations
  }

  for (const plugin of enabledPlugins) {
    const candidateRoots = [plugin.skillsPath, ...(plugin.skillsPaths ?? [])]

    for (const root of candidateRoots) {
      if (!root) continue

      const directSkillFile = path.join(root, 'SKILL.md')
      try {
        const stat = await fs.stat(directSkillFile)
        if (stat.isFile()) {
          const name = buildPluginSkillName(plugin.name, root)
          if (!locations.has(name)) {
            locations.set(name, { skillDir: root, pluginName: plugin.name })
          }
          continue
        }
      } catch {
        // Fall through and inspect as a skills root.
      }

      let entries: import('fs').Dirent[]
      try {
        entries = await fs.readdir(root, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue

        const skillDir = path.join(root, entry.name)
        const skillFile = path.join(skillDir, 'SKILL.md')
        try {
          const stat = await fs.stat(skillFile)
          if (!stat.isFile()) continue
        } catch {
          continue
        }

        const name = buildPluginSkillName(plugin.name, skillDir)
        if (!locations.has(name)) {
          locations.set(name, { skillDir, pluginName: plugin.name })
        }
      }
    }
  }

  return locations
}

async function collectPluginSkills(): Promise<SkillMeta[]> {
  const locations = await collectPluginSkillDirectories()
  const skills: SkillMeta[] = []

  for (const [name, location] of locations) {
    const meta = await loadSkillMeta(
      location.skillDir,
      name,
      'plugin',
      location.pluginName,
    )
    if (meta) {
      skills.push(meta)
    }
  }

  return skills
}

async function collectAllSkills(cwd?: string): Promise<SkillMeta[]> {
  const [userSkills, projectSkills, pluginSkills] = await Promise.all([
    collectSkillsFromRoots([getUserSkillsDir()], 'user'),
    collectSkillsFromRoots(getProjectSkillsDirs(cwd), 'project'),
    collectPluginSkills(),
  ])

  const skills = [...userSkills, ...projectSkills, ...pluginSkills]
  skills.sort((a, b) => a.name.localeCompare(b.name))
  return skills
}

export async function listSkillSlashCommands(cwd?: string): Promise<SkillSlashCommand[]> {
  const requestedCwd = cwd || getCwd()
  const [skills, legacyCommands] = await Promise.all([
    collectAllSkills(requestedCwd),
    collectLegacySlashCommands(requestedCwd),
  ])

  const byName = new Map<string, SkillSlashCommand>()

  for (const skill of skills) {
    if (!skill.userInvocable) continue
    byName.set(skill.name, {
      name: skill.name,
      description: skill.description || '',
    })
  }

  for (const command of legacyCommands) {
    if (!byName.has(command.name)) {
      byName.set(command.name, command)
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// ─── Router ──────────────────────────────────────────────────────────────────

export async function handleSkillsApi(
  req: Request,
  url: URL,
  segments: string[],
): Promise<Response> {
  try {
    if (req.method !== 'GET') {
      throw new ApiError(405, `Method ${req.method} not allowed`, 'METHOD_NOT_ALLOWED')
    }

    const sub = segments[2]

    switch (sub) {
      case undefined:
        return await listSkills(url)
      case 'detail':
        return await getSkillDetail(url)
      default:
        throw ApiError.notFound(`Unknown skills endpoint: ${sub}`)
    }
  } catch (error) {
    return errorResponse(error)
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function listSkills(url: URL): Promise<Response> {
  const cwd = getRequestedCwd(url)
  const workflowOnly = url.searchParams.get('workflowOnly') === 'true'
  const skills = await collectAllSkills(cwd)
  const catalogSkills = workflowOnly
    ? dedupeWorkflowCatalogSkills([...skills, ...collectFallbackWorkflowSkills(skills)])
    : skills
  catalogSkills.sort((a, b) => a.name.localeCompare(b.name))
  return Response.json({ skills: catalogSkills })
}

function dedupeWorkflowCatalogSkills(skills: SkillMeta[]): SkillMeta[] {
  const byName = new Map<string, SkillMeta>()
  for (const skill of skills) {
    const existing = byName.get(skill.name)
    if (!existing || scoreWorkflowCatalogSkill(skill) > scoreWorkflowCatalogSkill(existing)) {
      byName.set(skill.name, skill)
    }
  }
  return [...byName.values()]
}

function scoreWorkflowCatalogSkill(skill: SkillMeta): number {
  if (skill.nativeProvider === 'skill-tool') return 3
  if (skill.catalogStatus === 'available') return 2
  if (skill.catalogStatus === 'fallback-contract') return 1
  return 0
}

async function getSkillDetail(url: URL): Promise<Response> {
  const source = url.searchParams.get('source')
  const name = url.searchParams.get('name')

  if (!source || !name) {
    throw ApiError.badRequest('Missing required query parameters: source, name')
  }

  // Prevent path traversal
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw ApiError.badRequest('Invalid skill name')
  }

  const nativeProviderSource = sourceForInstalledWorkflowProviderSkill(name)
  const isDirectSource = source === 'user' || source === 'project' || source === 'plugin'
  const isNativeProviderSource = nativeProviderSource === source

  if (!isDirectSource && !isNativeProviderSource) {
    throw ApiError.badRequest(`Unsupported source: ${source}`)
  }

  const cwd = getRequestedCwd(url)
  const directPluginLocations =
    source === 'plugin' ? await collectPluginSkillDirectories() : null

  const directPluginLocation = directPluginLocations?.get(name)
  const nativeProviderLocation = isNativeProviderSource && !isDirectSource
    ? await resolveNativeProviderSkillDir(source as SkillCatalogSource, name, cwd)
    : null
  const skillDir = isDirectSource
    ? source === 'plugin'
      ? directPluginLocation?.skillDir ?? null
      : await resolveSkillDir(source, name, cwd)
    : nativeProviderLocation?.skillDir ?? null
  const resolvedSource = isDirectSource
    ? source
    : nativeProviderLocation?.source
  const resolvedPluginName = isDirectSource
    ? directPluginLocation?.pluginName
    : nativeProviderLocation?.pluginName

  if (!skillDir) {
    throw ApiError.notFound(`Skill not found: ${name}`)
  }

  const meta = await loadSkillMeta(
    skillDir,
    name,
    resolvedSource as InstalledSkillSource,
    resolvedPluginName,
  )
  if (!meta) {
    throw ApiError.notFound(`Skill missing SKILL.md: ${name}`)
  }

  const { tree, files } = await buildFileTree(skillDir)

  return Response.json({
    detail: { meta, tree, files, skillRoot: skillDir },
  })
}
