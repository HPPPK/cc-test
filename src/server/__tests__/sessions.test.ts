/**
 * Unit tests for SessionService and Sessions API
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import * as fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import * as path from 'node:path'
import * as os from 'node:os'
import { SessionService, sessionService } from '../services/sessionService.js'
import {
  getRepositoryContext,
  prepareSessionWorkspace,
} from '../services/repositoryLaunchService.js'
import { conversationService } from '../services/conversationService.js'
import { clearCommandsCache } from '../../commands.js'
import { sanitizePath } from '../../utils/sessionStoragePortable.js'
import { clearInstalledPluginsCache } from '../../utils/plugins/installedPluginsManager.js'
import { clearPluginCache } from '../../utils/plugins/pluginLoader.js'
import { resetSettingsCache } from '../../utils/settings/settingsCache.js'
import { __resetWebSocketHandlerStateForTests, handleWebSocket, updateSessionSlashCommands } from '../ws/handler.js'
import { WorkflowSessionCreateService } from '../services/workflowSessionCreateService.js'
import { WorkflowSessionLinkService } from '../services/workflowSessionLinkService.js'
import { WorkflowSessionStateService } from '../services/workflowSessionStateService.js'
import { setWorkflowRuntimeTemplateLoaderForTests } from '../services/workflowRuntimeTemplateService.js'
import { recalculateWorkflowCompletionEligibility } from '../services/workflowCompletionGate.js'
import { getSessionChatState, setSessionChatState } from '../api/conversations.js'
import { PackRegistryService, resetPackRegistryForTests } from '../services/packRegistryService.js'
import { resetWorkflowTemplateRegistryForTests } from '../services/workflowTemplateRegistryService.js'

const WORKFLOW_ERROR_CODES = [
  'WORKFLOW_TEMPLATE_NOT_FOUND',
  'WORKFLOW_TEMPLATE_INVALID',
  'WORKFLOW_TEMPLATE_CONFLICT',
  'WORKFLOW_WORKSPACE_INVALID',
  'WORKFLOW_SOURCE_INVALID',
  'WORKFLOW_SOURCE_ACTIVE',
  'WORKFLOW_LINK_DUPLICATE',
  'WORKFLOW_CONTEXT_TOO_LARGE',
  'WORKFLOW_CONTEXT_SUMMARY_UNAVAILABLE',
  'WORKFLOW_NOT_ENABLED',
  'WORKFLOW_STATE_UNAVAILABLE',
  'WORKFLOW_STATE_CONFLICT',
  'WORKFLOW_TRANSITION_INVALID',
  'WORKFLOW_STATE_STALE',
  'WORKFLOW_PENDING_CONFLICT',
  'WORKFLOW_REPORT_NOT_READY',
  'WORKFLOW_REPORT_UNAVAILABLE',
  'WORKFLOW_MODEL_UNAVAILABLE',
  'WORKFLOW_CHECKPOINT_INVALID',
  'WORKFLOW_CHECKPOINT_WORKSPACE_REQUIRED',
  'WORKFLOW_PREVIEW_ACTIVE',
] as const

// ============================================================================
// Test helpers
// ============================================================================

let tmpDir: string
let service: SessionService
let originalGitCeilingDirectories: string | undefined

/** Create a temporary config dir and configure the service to use it. */
async function setupTmpConfigDir(): Promise<string> {
  tmpDir = path.join(os.tmpdir(), `claude-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(path.join(tmpDir, 'projects'), { recursive: true })
  originalGitCeilingDirectories = process.env.GIT_CEILING_DIRECTORIES
  process.env.CLAUDE_CONFIG_DIR = tmpDir
  process.env.GIT_CEILING_DIRECTORIES = tmpDir
  return tmpDir
}

async function cleanupTmpDir(): Promise<void> {
  if (tmpDir) {
    let lastError: unknown
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true })
        lastError = null
        break
      } catch (error) {
        lastError = error
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
    if (lastError) {
      throw lastError
    }
  }
  delete process.env.CLAUDE_CONFIG_DIR
  if (originalGitCeilingDirectories !== undefined) {
    process.env.GIT_CEILING_DIRECTORIES = originalGitCeilingDirectories
  } else {
    delete process.env.GIT_CEILING_DIRECTORIES
  }
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
  })
}

async function createCleanGitRepo(baseDir: string): Promise<string> {
  const workDir = path.join(
    baseDir,
    `repo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )

  await fs.mkdir(workDir, { recursive: true })
  git(workDir, 'init')
  git(workDir, 'config', 'user.email', 'sessions-api@example.com')
  git(workDir, 'config', 'user.name', 'Sessions API')
  git(workDir, 'checkout', '-b', 'main')
  await fs.writeFile(path.join(workDir, 'README.md'), 'main\n')
  git(workDir, 'add', 'README.md')
  git(workDir, 'commit', '-m', 'initial')
  git(workDir, 'checkout', '-b', 'feature/rail')
  await fs.writeFile(path.join(workDir, 'feature.txt'), 'feature\n')
  git(workDir, 'add', 'feature.txt')
  git(workDir, 'commit', '-m', 'feature')
  git(workDir, 'checkout', 'main')

  return workDir
}

/** Write a JSONL session file with given entries. */
async function writeSessionFile(
  projectDir: string,
  sessionId: string,
  entries: Record<string, unknown>[]
): Promise<string> {
  const dir = path.join(tmpDir, 'projects', projectDir)
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${sessionId}.jsonl`)
  const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
  await fs.writeFile(filePath, content, 'utf-8')
  return filePath
}

async function writeSubagentTranscriptFile(
  projectDir: string,
  sessionId: string,
  agentId: string,
  entries: Record<string, unknown>[],
): Promise<string> {
  const dir = path.join(tmpDir, 'projects', projectDir, sessionId, 'subagents')
  await fs.mkdir(dir, { recursive: true })
  const normalizedAgentId = agentId.startsWith('agent-') ? agentId : `agent-${agentId}`
  const filePath = path.join(dir, `${normalizedAgentId}.jsonl`)
  const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
  await fs.writeFile(filePath, content, 'utf-8')
  return filePath
}

async function writeSkill(
  rootDir: string,
  skillName: string,
  description: string,
): Promise<void> {
  const skillDir = path.join(rootDir, skillName)
  await fs.mkdir(skillDir, { recursive: true })
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    ['---', `description: ${description}`, '---', '', `# ${skillName}`].join('\n'),
    'utf-8',
  )
}

async function writeLegacySlashCommand(
  commandsDir: string,
  commandName: string,
  description: string,
): Promise<void> {
  await fs.mkdir(commandsDir, { recursive: true })
  await fs.writeFile(
    path.join(commandsDir, `${commandName}.md`),
    ['---', `description: ${description}`, 'argument-hint: <topic>', '---', '', `Run ${commandName}.`].join('\n'),
    'utf-8',
  )
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
  })
}

async function createWorkspaceApiGitRepo(baseDir: string): Promise<string> {
  const workDir = path.join(
    baseDir,
    `workspace-api-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )

  await fs.mkdir(path.join(workDir, 'src'), { recursive: true })
  git(workDir, 'init')
  git(workDir, 'config', 'user.email', 'sessions-api@example.com')
  git(workDir, 'config', 'user.name', 'Sessions API')

  await fs.writeFile(path.join(workDir, 'tracked.txt'), 'before\n')
  await fs.writeFile(path.join(workDir, 'src', 'app.ts'), 'export const answer = 42\n')
  git(workDir, 'add', 'tracked.txt', 'src/app.ts')
  git(workDir, 'commit', '-m', 'initial')

  await fs.writeFile(path.join(workDir, 'tracked.txt'), 'before\nafter\n')

  return workDir
}

async function createCleanGitRepo(baseDir: string): Promise<string> {
  const workDir = path.join(
    baseDir,
    `repo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )

  await fs.mkdir(workDir, { recursive: true })
  git(workDir, 'init')
  git(workDir, 'config', 'user.email', 'sessions-api@example.com')
  git(workDir, 'config', 'user.name', 'Sessions API')
  git(workDir, 'checkout', '-b', 'main')
  await fs.writeFile(path.join(workDir, 'README.md'), 'main\n')
  git(workDir, 'add', 'README.md')
  git(workDir, 'commit', '-m', 'initial')
  git(workDir, 'checkout', '-b', 'feature/rail')
  await fs.writeFile(path.join(workDir, 'feature.txt'), 'feature\n')
  git(workDir, 'add', 'feature.txt')
  git(workDir, 'commit', '-m', 'feature')
  git(workDir, 'checkout', 'main')

  return workDir
}

// Sample entries matching real CLI format
function makeSnapshotEntry(): Record<string, unknown> {
  return {
    type: 'file-history-snapshot',
    messageId: crypto.randomUUID(),
    snapshot: {
      messageId: crypto.randomUUID(),
      trackedFileBackups: {},
      timestamp: '2026-01-01T00:00:00.000Z',
    },
    isSnapshotUpdate: false,
  }
}

function makeFileHistorySnapshotEntry(
  snapshotMessageId: string,
  trackedFileBackups: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: 'file-history-snapshot',
    messageId: crypto.randomUUID(),
    snapshot: {
      messageId: snapshotMessageId,
      trackedFileBackups,
      timestamp: '2026-01-01T00:00:00.000Z',
    },
    isSnapshotUpdate: false,
  }
}

function makeUserEntry(content: string, uuid?: string): Record<string, unknown> {
  return {
    parentUuid: null,
    isSidechain: false,
    type: 'user',
    message: { role: 'user', content },
    uuid: uuid || crypto.randomUUID(),
    timestamp: '2026-01-01T00:01:00.000Z',
    userType: 'external',
    cwd: '/tmp/test',
    sessionId: 'test-session',
  }
}

function makeAssistantEntry(content: string, parentUuid?: string): Record<string, unknown> {
  return {
    parentUuid: parentUuid || null,
    isSidechain: false,
    type: 'assistant',
    message: {
      model: 'claude-opus-4-7',
      id: `msg_${crypto.randomUUID().slice(0, 20)}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: content }],
    },
    uuid: crypto.randomUUID(),
    timestamp: '2026-01-01T00:02:00.000Z',
  }
}

function makeAssistantToolUseEntry(
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  parentUuid?: string,
): Record<string, unknown> {
  return {
    parentUuid: parentUuid || null,
    isSidechain: false,
    type: 'assistant',
    message: {
      model: 'claude-opus-4-7',
      id: `msg_${crypto.randomUUID().slice(0, 20)}`,
      type: 'message',
      role: 'assistant',
      content: toolUses.map((toolUse) => ({
        type: 'tool_use',
        id: toolUse.id,
        name: toolUse.name,
        input: toolUse.input,
      })),
    },
    uuid: crypto.randomUUID(),
    timestamp: '2026-01-01T00:02:00.000Z',
  }
}

function makeMetaUserEntry(): Record<string, unknown> {
  return {
    parentUuid: null,
    isSidechain: false,
    type: 'user',
    message: { role: 'user', content: '<local-command-caveat>internal</local-command-caveat>' },
    isMeta: true,
    uuid: crypto.randomUUID(),
    timestamp: '2026-01-01T00:00:30.000Z',
  }
}

function makeSessionMetaEntry(workDir: string): Record<string, unknown> {
  return {
    type: 'session-meta',
    isMeta: true,
    workDir,
    timestamp: '2026-01-01T00:00:00.000Z',
  }
}

function makeWorktreeStateEntry(
  sessionId: string,
  worktreePath: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: 'worktree-state',
    sessionId,
    worktreeSession: {
      originalCwd: '/tmp/source',
      worktreePath,
      worktreeName: 'desktop-main-12345678',
      worktreeBranch: 'worktree-desktop-main-12345678',
      originalBranch: 'main',
      sessionId,
      ...overrides,
    },
  }
}

function makeWorkflowPointer(
  sessionId: string,
  kind: 'workflow-state' | 'phase-artifact' | 'final-report',
  artifactId: string,
  timestamp = '2026-01-01T00:00:00.000Z',
): Record<string, unknown> {
  return {
    kind,
    sessionId,
    artifactId,
    schemaVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    label: artifactId,
  }
}

function makeWorkflowSessionMetaEntry(
  sessionId: string,
  workDir: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const statePointer = makeWorkflowPointer(sessionId, 'workflow-state', 'state')
  const reportPointer = makeWorkflowPointer(sessionId, 'final-report', 'final')

  return {
    type: 'session-meta',
    isMeta: true,
    workDir,
    workflow: {
      mode: 'workflow',
      schemaVersion: 1,
      templateId: 'requirements-to-implementation',
      templateVersion: '1',
      templateSource: 'builtin',
      templateSnapshotId: 'requirements-to-implementation-v1',
      status: 'running',
      workflowStatus: 'running',
      activePhaseId: 'technical-design',
      statePointer,
      stateRef: statePointer,
      reportPointer,
      reportRef: reportPointer,
      stateRevision: 7,
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    },
    timestamp: '2026-01-01T00:00:00.000Z',
  }
}

function workflowTemplatePhase(
  id: string,
  name: string,
  authority: 'auto' | 'user-confirmation',
  skillName: string,
): Record<string, unknown> {
  return {
    id,
    name,
    instructions: `Complete the ${name} phase.`,
    objective: `Prepare ${name} evidence.`,
    requiredIntake: ['Use the current session context.'],
    handoffRules: ['Summarize phase evidence and the next action.'],
    executionRules: ['Stay within the workflow contract.'],
    outputArtifact: {
      id: `${id}-artifact`,
      name: `${name} Artifact`,
      kind: 'markdown',
      description: `${name} phase artifact.`,
      required: true,
    },
    completionCriteria: {
      type: 'artifact-required',
      description: `${name} phase artifact is complete.`,
    },
    transition: { authority },
    skills: [{ name: skillName, mode: 'recommended', source: 'managed' }],
  }
}

function followUpWorkflowTemplate(
  id: string,
  label: 'new-product' | 'enhancement' | 'bug',
  phaseId: string,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id,
    version: '1',
    name: `${id} Follow-up`,
    description: `Follow-up fixture for ${id}.`,
    labels: [label],
    phases: [workflowTemplatePhase(phaseId, `${id} intake`, 'user-confirmation', 'sp-discussion')],
  }
}

function agentDevelopmentUserWorkflowTemplate(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'agent-development',
    version: '1',
    name: 'Agent Development',
    description: 'User-owned workflow fixture for API tests.',
    phases: [
      workflowTemplatePhase('discussion', 'Discussion', 'user-confirmation', 'sp-discussion'),
      workflowTemplatePhase('specify', 'Specify', 'auto', 'sp-specify'),
      workflowTemplatePhase('plan', 'Plan', 'auto', 'sp-plan'),
      workflowTemplatePhase('tasks', 'Tasks', 'auto', 'sp-tasks'),
      workflowTemplatePhase('implement', 'Implement', 'auto', 'sp-implement'),
    ],
  }
}

async function writeWorkflowConfigTemplates(templates: Array<Record<string, unknown>>): Promise<void> {
  const workflowConfigPath = path.join(tmpDir, 'cc-jiangxia', 'workflows.json')
  await fs.mkdir(path.dirname(workflowConfigPath), { recursive: true })
  await fs.writeFile(
    workflowConfigPath,
    JSON.stringify({ schemaVersion: 1, templates }),
    'utf-8',
  )
  await new PackRegistryService().writeSingleWorkflowPacks(templates.map((template) => ({
    ...template,
    source: 'user',
  }) as any))
  resetPackRegistryForTests()
  resetWorkflowTemplateRegistryForTests()
}

async function readJsonlEntries(filePath: string): Promise<Array<Record<string, unknown>>> {
  const raw = await fs.readFile(filePath, 'utf-8')
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

async function collectFiles(root: string): Promise<string[]> {
  const found: string[] = []

  async function walk(current: string): Promise<void> {
    let entries: Array<import('node:fs').Dirent>
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
      if (code === 'ENOENT') return
      throw error
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        found.push(fullPath)
      }
    }
  }

  await walk(root)
  return found.sort()
}

function expectNoAbsolutePathLeak(value: unknown): void {
  const serialized = JSON.stringify(value)
  expect(serialized).not.toContain(tmpDir)
  expect(serialized).not.toContain(tmpDir.replace(/\\/g, '\\\\'))
}

function expectWorkflowErrorShape(
  body: { error?: unknown; code?: unknown; message?: unknown },
  expectedCode: typeof WORKFLOW_ERROR_CODES[number],
): void {
  expect(body.error ?? body.code).toBe(expectedCode)
  expect(typeof body.message).toBe('string')
}

async function loadWorkflowSessionFixture(name: string): Promise<Record<string, unknown>> {
  const fixturePath = path.join(
    process.cwd(),
    'src/server/services/__fixtures__/workflow-sessions',
    name,
  )
  return JSON.parse(await fs.readFile(fixturePath, 'utf-8')) as Record<string, unknown>
}

function rewriteWorkflowFixtureSessionIds(value: unknown, sessionId: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteWorkflowFixtureSessionIds(item, sessionId))
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  const rewritten: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    rewritten[key] = key === 'sessionId'
      ? sessionId
      : rewriteWorkflowFixtureSessionIds(nested, sessionId)
  }
  return rewritten
}

async function writeWorkflowSessionStateFixture(
  sessionId: string,
  fixtureName: string,
): Promise<Record<string, unknown>> {
  const state = rewriteWorkflowFixtureSessionIds(
    await loadWorkflowSessionFixture(fixtureName),
    sessionId,
  ) as Record<string, unknown>
  const statePath = path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions', sessionId, 'state.json')
  await fs.mkdir(path.dirname(statePath), { recursive: true })
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
  return state
}

async function writeWorkflowSessionState(
  sessionId: string,
  state: Record<string, unknown>,
): Promise<void> {
  const statePath = path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions', sessionId, 'state.json')
  await fs.mkdir(path.dirname(statePath), { recursive: true })
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
}

async function readWorkflowSessionState(sessionId: string): Promise<Record<string, unknown>> {
  const statePath = path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions', sessionId, 'state.json')
  return JSON.parse(await fs.readFile(statePath, 'utf-8')) as Record<string, unknown>
}

function withCompletionEligibleRuntimeContract(state: Record<string, unknown>): Record<string, unknown> {
  const phases = state.phases as Array<Record<string, unknown>>
  const activePhaseId = state.activePhaseId as string
  const now = state.updatedAt as string
  return recalculateWorkflowCompletionEligibility({
    ...(state as any),
    runtimeContract: {
      schemaVersion: 1,
      migrationStatus: 'current',
      phaseStates: Object.fromEntries(phases.map((phase) => {
        const phaseId = phase.id as string
        return [phaseId, {
          phaseId,
          workStatus: phaseId === activePhaseId ? 'ready-for-review' : 'not-started',
          eligibility: 'ineligible',
          blockerReasons: [],
          issues: [],
          artifactRequirements: [],
          checks: [{
            id: 'completion-criteria',
            description: 'Fixture completion review.',
            required: true,
            status: phaseId === activePhaseId ? 'passed' : 'pending',
            evidenceArtifactIds: [],
            updatedAt: now,
          }],
          taskSnapshots: [],
          evaluatedAt: now,
        }]
      })),
      audit: [{
        at: now,
        type: 'runtime-contract-created',
        summary: 'Fixture workflow completion contract.',
      }],
    },
  }, state.templateSnapshot as any, now) as unknown as Record<string, unknown>
}

function makePendingWorkflowTransitionState(
  sessionId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const createdAt = '2026-05-21T00:00:00.000Z'
  const updatedAt = '2026-05-21T00:01:00.000Z'
  const pendingArtifact = {
    kind: 'phase-artifact',
    sessionId,
    artifactId: 'discussion-ready-1',
    schemaVersion: 1,
    createdAt: updatedAt,
    updatedAt,
    label: 'Discussion phase completion',
    phaseId: 'discussion',
    title: 'Discussion phase completion',
    lifecycleStatus: 'pending',
  }

  const state = {
    schemaVersion: 1,
    sessionId,
    mode: 'workflow',
    template: {
      id: 'agent-development',
      version: '1',
      source: 'builtin',
      snapshotId: 'agent-development-v1',
      sourceState: 'current',
    },
    templateSnapshot: {
      schemaVersion: 1,
      id: 'agent-development',
      source: 'builtin',
      version: '1',
      displayName: 'Agent Development',
      description: 'Ready confirmation transition fixture.',
      phases: [
        {
          id: 'discussion',
          label: 'Discussion',
          instructions: 'Discuss the request.',
          requestedModel: null,
          skillDeclarations: [],
          requiredArtifacts: [],
          completionCriteria: { type: 'agent-reported' },
          transitionAuthority: 'user-confirmation',
        },
        {
          id: 'specify',
          label: 'Specify',
          instructions: 'Write the specification.',
          requestedModel: null,
          skillDeclarations: [],
          requiredArtifacts: [],
          completionCriteria: { type: 'agent-reported' },
          transitionAuthority: 'user-confirmation',
        },
      ],
    },
    templateIdentity: {
      id: 'agent-development',
      source: 'builtin',
      version: '1',
      registryKey: 'builtin:agent-development',
    },
    sourceTemplateStatus: 'current',
    status: 'pending-confirmation',
    workflowStatus: 'pending-confirmation',
    activePhaseId: 'discussion',
    phases: [
      {
        id: 'discussion',
        index: 0,
        status: 'pending-confirmation',
        artifactPointers: [pendingArtifact],
      },
      {
        id: 'specify',
        index: 1,
        status: 'created',
        artifactPointers: [],
      },
    ],
    phaseRuns: [],
    transitionHistory: [
      {
        transitionId: 'submit-discussion-ready',
        requestId: 'submit-discussion-ready',
        fromPhaseId: 'discussion',
        toPhaseId: 'specify',
        authority: 'completion-check',
        action: 'confirmation-requested',
        result: 'accepted',
        completionCheckId: 'submit-discussion-ready',
        artifactRefs: [pendingArtifact],
        createdAt: updatedAt,
        stateVersion: 3,
      },
    ],
    artifactIndex: [pendingArtifact],
    finalReportRef: null,
    stateVersion: 3,
    revision: 3,
    createdAt,
    updatedAt,
    pendingConfirmation: {
      confirmationId: 'submit-discussion-ready',
      phaseId: 'discussion',
      fromPhaseId: 'discussion',
      toPhaseId: 'specify',
      completionCheckId: 'submit-discussion-ready',
      artifactRefs: [pendingArtifact],
      createdAt: updatedAt,
      status: 'pending',
      submission: {
        phaseId: 'discussion',
        stateVersion: 2,
        status: 'ready',
        handoff: {
          summary: 'Discussion is ready for confirmation.',
          artifacts: [],
          next: 'Confirm or request retry.',
        },
        rationale: 'The agent completed the discussion phase.',
        evidence: [
          {
            kind: 'artifact',
            label: 'Discussion summary',
            ref: 'discussion-ready-1',
          },
        ],
      },
    },
    ...overrides,
  }
  return withCompletionEligibleRuntimeContract(state)
}

function makeFinalPendingWorkflowTransitionState(sessionId: string): Record<string, unknown> {
  return makePendingWorkflowTransitionState(sessionId, {
    activePhaseId: 'discussion',
    phases: [
      {
        id: 'discussion',
        index: 0,
        status: 'pending-confirmation',
        artifactPointers: [
          {
            kind: 'phase-artifact',
            sessionId,
            artifactId: 'discussion-final-ready-1',
            schemaVersion: 1,
            createdAt: '2026-05-21T00:01:00.000Z',
            updatedAt: '2026-05-21T00:01:00.000Z',
            label: 'Final discussion completion',
            phaseId: 'discussion',
            title: 'Final discussion completion',
            lifecycleStatus: 'pending',
          },
        ],
      },
    ],
    templateSnapshot: {
      schemaVersion: 1,
      id: 'agent-development',
      source: 'builtin',
      version: '1',
      displayName: 'Agent Development',
      description: 'Final ready confirmation transition fixture.',
      phases: [
        {
          id: 'discussion',
          label: 'Discussion',
          instructions: 'Discuss the request.',
          requestedModel: null,
          skillDeclarations: [],
          requiredArtifacts: [],
          completionCriteria: { type: 'agent-reported' },
          transitionAuthority: 'user-confirmation',
        },
      ],
    },
    pendingConfirmation: {
      confirmationId: 'submit-discussion-final-ready',
      phaseId: 'discussion',
      fromPhaseId: 'discussion',
      toPhaseId: null,
      completionCheckId: 'submit-discussion-final-ready',
      artifactRefs: [
        {
          kind: 'phase-artifact',
          sessionId,
          artifactId: 'discussion-final-ready-1',
          schemaVersion: 1,
          createdAt: '2026-05-21T00:01:00.000Z',
          updatedAt: '2026-05-21T00:01:00.000Z',
          label: 'Final discussion completion',
          phaseId: 'discussion',
          title: 'Final discussion completion',
          lifecycleStatus: 'pending',
        },
      ],
      createdAt: '2026-05-21T00:01:00.000Z',
      status: 'pending',
      submission: {
        phaseId: 'discussion',
        stateVersion: 2,
        status: 'ready',
        handoff: {
          summary: 'Final workflow phase is ready.',
          artifacts: [],
          next: 'Confirm final report creation.',
        },
        rationale: 'The final phase is complete.',
        evidence: [],
      },
    },
    artifactIndex: [
      {
        kind: 'phase-artifact',
        sessionId,
        artifactId: 'discussion-final-ready-1',
        schemaVersion: 1,
        createdAt: '2026-05-21T00:01:00.000Z',
        updatedAt: '2026-05-21T00:01:00.000Z',
        label: 'Final discussion completion',
        phaseId: 'discussion',
        title: 'Final discussion completion',
        lifecycleStatus: 'pending',
      },
    ],
  })
}

async function writeWorkflowFinalReportFixture(
  sessionId: string,
  fixtureName: string,
): Promise<Record<string, unknown>> {
  const report = rewriteWorkflowFixtureSessionIds(
    await loadWorkflowSessionFixture(fixtureName),
    sessionId,
  ) as Record<string, unknown>
  const reportPath = path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions', sessionId, 'reports', 'final.json')
  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  return report
}

async function writeFileHistoryBackup(
  sessionId: string,
  backupFileName: string,
  content: string,
): Promise<void> {
  const dir = path.join(tmpDir, 'file-history', sessionId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, backupFileName), content, 'utf-8')
}

type ThreeTurnCheckpointFixture = {
  sessionId: string
  workDir: string
  stepFile: string
  createdFile: string
  firstUserId: string
  secondUserId: string
  thirdUserId: string
}

async function createThreeTurnCheckpointFixture(
  sessionId: string,
): Promise<ThreeTurnCheckpointFixture> {
  const workDir = path.join(tmpDir, `turn-checkpoints-${sessionId}`)
  const stepFile = path.join(workDir, 'src', 'step.js')
  const createdFile = path.join(workDir, 'notes', 'generated.txt')
  const firstUserId = crypto.randomUUID()
  const secondUserId = crypto.randomUUID()
  const thirdUserId = crypto.randomUUID()
  const backupBase = `${sessionId}-step@v1`
  const backupV1 = `${sessionId}-step@v2`
  const backupV2 = `${sessionId}-step@v3`

  await fs.mkdir(path.dirname(stepFile), { recursive: true })
  await fs.mkdir(path.dirname(createdFile), { recursive: true })
  await fs.writeFile(stepFile, "export const STEP = 'v3'\n", 'utf-8')
  await fs.writeFile(createdFile, 'generated third turn\n', 'utf-8')
  await writeFileHistoryBackup(sessionId, backupBase, "export const STEP = 'base'\n")
  await writeFileHistoryBackup(sessionId, backupV1, "export const STEP = 'v1'\n")
  await writeFileHistoryBackup(sessionId, backupV2, "export const STEP = 'v2'\n")

  await writeSessionFile('-tmp-api-turn-checkpoints', sessionId, [
    makeSessionMetaEntry(workDir),
    makeFileHistorySnapshotEntry(firstUserId, {
      'src/step.js': {
        backupFileName: backupBase,
        version: 1,
        backupTime: '2026-01-01T00:00:00.000Z',
      },
    }),
    {
      ...makeUserEntry('make v1', firstUserId),
      cwd: workDir,
      sessionId,
    },
    makeAssistantEntry('DONE v1', firstUserId),
    makeFileHistorySnapshotEntry(secondUserId, {
      'src/step.js': {
        backupFileName: backupV1,
        version: 2,
        backupTime: '2026-01-01T00:00:00.000Z',
      },
    }),
    {
      ...makeUserEntry('make v2', secondUserId),
      cwd: workDir,
      sessionId,
    },
    makeAssistantEntry('DONE v2', secondUserId),
    makeFileHistorySnapshotEntry(thirdUserId, {
      'src/step.js': {
        backupFileName: backupV2,
        version: 3,
        backupTime: '2026-01-01T00:00:00.000Z',
      },
      'notes/generated.txt': {
        backupFileName: null,
        version: 3,
        backupTime: '2026-01-01T00:00:00.000Z',
      },
    }),
    {
      ...makeUserEntry('make v3 and create file', thirdUserId),
      cwd: workDir,
      sessionId,
    },
    makeAssistantEntry('DONE v3', thirdUserId),
  ])

  return {
    sessionId,
    workDir,
    stepFile,
    createdFile,
    firstUserId,
    secondUserId,
    thirdUserId,
  }
}

// ============================================================================
// SessionService tests
// ============================================================================

describe('SessionService', () => {
  beforeEach(async () => {
    await setupTmpConfigDir()
    service = new SessionService()
    clearInstalledPluginsCache()
    clearPluginCache('sessions-api-test-setup')
    resetSettingsCache()
  })

  afterEach(async () => {
    clearCommandsCache()
    clearInstalledPluginsCache()
    clearPluginCache('session-service-test-teardown')
    resetSettingsCache()
    await cleanupTmpDir()
  })

  // --------------------------------------------------------------------------
  // listSessions
  // --------------------------------------------------------------------------

  it('should return empty list when no sessions exist', async () => {
    const result = await service.listSessions()
    expect(result.sessions).toEqual([])
    expect(result.total).toBe(0)
  })

  it('should list sessions from JSONL files', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const projectRoot = path.join(tmpDir, 'testproject')
    const projectPath = sanitizePath(projectRoot)
    await fs.mkdir(projectRoot, { recursive: true })
    await writeSessionFile(projectPath, sessionId, [
      makeSnapshotEntry(),
      {
        ...makeUserEntry('Hello Claude'),
        cwd: projectRoot,
      },
      makeAssistantEntry('Hi there!'),
    ])

    const result = await service.listSessions()
    expect(result.total).toBe(1)
    expect(result.sessions).toHaveLength(1)

    const session = result.sessions[0]!
    expect(session.id).toBe(sessionId)
    expect(session.title).toBe('Hello Claude')
    expect(session.messageCount).toBe(2) // 1 user + 1 assistant
    expect(session.projectPath).toBe(projectPath)
    expect(session.projectRoot).toBe(await fs.realpath(projectRoot))
  })

  it('should expose the source project root for persisted worktree sessions', async () => {
    const sourceWorkDir = path.join(tmpDir, 'source-repo')
    const worktreePath = path.join(sourceWorkDir, '.claude', 'worktrees', 'desktop-main-12345678')
    await fs.mkdir(worktreePath, { recursive: true })
    const sessionId = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile(sanitizePath(worktreePath), sessionId, [
      makeSnapshotEntry(),
      makeSessionMetaEntry(worktreePath),
      makeWorktreeStateEntry(sessionId, worktreePath, {
        originalCwd: sourceWorkDir,
      }),
      makeUserEntry('Hello from worktree'),
    ])

    const result = await service.listSessions()

    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0]).toMatchObject({
      id: sessionId,
      projectPath: sanitizePath(worktreePath),
      projectRoot: await fs.realpath(sourceWorkDir),
      workDir: worktreePath,
    })
  })

  it('should paginate results with limit and offset', async () => {
    // Create 3 sessions
    for (let i = 0; i < 3; i++) {
      const id = `0000000${i}-bbbb-cccc-dddd-eeeeeeeeeeee`
      await writeSessionFile('-tmp-test', id, [
        makeSnapshotEntry(),
        makeUserEntry(`Message ${i}`),
      ])
    }

    const page1 = await service.listSessions({ limit: 2, offset: 0 })
    expect(page1.total).toBe(3)
    expect(page1.sessions).toHaveLength(2)

    const page2 = await service.listSessions({ limit: 2, offset: 2 })
    expect(page2.total).toBe(3)
    expect(page2.sessions).toHaveLength(1)
  })

  it('should only parse the requested page when listing many sessions', async () => {
    for (let i = 0; i < 12; i++) {
      const id = `1000000${i.toString(16)}-bbbb-cccc-dddd-eeeeeeeeeeee`
      const filePath = await writeSessionFile('-tmp-many-sessions', id, [
        makeSnapshotEntry(),
        makeUserEntry(`Message ${i}`),
      ])
      const mtime = new Date(Date.now() - i * 1000)
      await fs.utimes(filePath, mtime, mtime)
    }

    const serviceWithSpy = service as unknown as {
      readJsonlFile: (...args: unknown[]) => Promise<unknown>
    }
    const originalReadJsonlFile = serviceWithSpy.readJsonlFile.bind(service)
    let readCount = 0
    serviceWithSpy.readJsonlFile = async (...args) => {
      readCount += 1
      return originalReadJsonlFile(...args)
    }

    const result = await service.listSessions({ limit: 3, offset: 0 })

    expect(result.total).toBe(12)
    expect(result.sessions).toHaveLength(3)
    expect(readCount).toBe(3)
  })

  it('should filter sessions by project', async () => {
    const id1 = 'aaaaaaaa-1111-cccc-dddd-eeeeeeeeeeee'
    const id2 = 'aaaaaaaa-2222-cccc-dddd-eeeeeeeeeeee'

    await writeSessionFile('-project-a', id1, [makeSnapshotEntry(), makeUserEntry('In A')])
    await writeSessionFile('-project-b', id2, [makeSnapshotEntry(), makeUserEntry('In B')])

    const resultA = await service.listSessions({ project: '/project/a' })
    expect(resultA.total).toBe(1)
    expect(resultA.sessions[0]!.id).toBe(id1)
  })

  // --------------------------------------------------------------------------
  // getSession
  // --------------------------------------------------------------------------

  it('should return null for non-existent session', async () => {
    const result = await service.getSession('00000000-0000-0000-0000-000000000000')
    expect(result).toBeNull()
  })

  it('should return session detail with messages', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const userUuid = crypto.randomUUID()
    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      makeUserEntry('Tell me a joke', userUuid),
      makeAssistantEntry('Why did the chicken cross the road?', userUuid),
    ])

    const detail = await service.getSession(sessionId)
    expect(detail).not.toBeNull()
    expect(detail!.id).toBe(sessionId)
    expect(detail!.title).toBe('Tell me a joke')
    expect(detail!.messages).toHaveLength(2)
    expect(detail!.messages[0]!.type).toBe('user')
    expect(detail!.messages[1]!.type).toBe('assistant')
  })

  it('should keep normal dialogue sessions readable without workflow metadata by default', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-dialogue-project', sessionId, [
      makeSnapshotEntry(),
      makeSessionMetaEntry('/tmp/dialogue-project'),
      makeUserEntry('Plain dialogue remains the default'),
      makeAssistantEntry('No workflow metadata is required'),
    ])

    const detail = await service.getSession(sessionId)
    const list = await service.listSessions()

    expect(detail).not.toBeNull()
    expect(detail!.messages).toHaveLength(2)
    expect(detail!.messages[0]).toMatchObject({
      type: 'user',
      content: 'Plain dialogue remains the default',
    })
    expect(detail!.messages[1]).toMatchObject({ type: 'assistant' })
    expect('workflow' in (detail as unknown as Record<string, unknown>)).toBe(false)
    expect('workflow' in (list.sessions[0] as unknown as Record<string, unknown>)).toBe(false)
  })

  it('should expose additive workflow metadata pointers for staged session detail and list recovery', async () => {
    const sessionId = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'
    const workDir = path.join(tmpDir, 'workflow-project')
    const statePointer = makeWorkflowPointer(sessionId, 'workflow-state', 'state')
    const reportPointer = makeWorkflowPointer(sessionId, 'final-report', 'final')
    await writeSessionFile(sanitizePath(workDir), sessionId, [
      makeSnapshotEntry(),
      makeWorkflowSessionMetaEntry(sessionId, workDir, {
        statePointer,
        stateRef: statePointer,
        reportPointer,
        reportRef: reportPointer,
      }),
      makeUserEntry('Run the staged workflow'),
      makeAssistantEntry('Workflow phase is running'),
    ])

    const detail = await service.getSession(sessionId) as unknown as {
      workflow?: {
        mode: string
        templateId: string
        status: string
        activePhaseId: string
        statePointer: Record<string, unknown>
        reportPointer: Record<string, unknown>
      }
    }
    const list = await service.listSessions() as unknown as {
      sessions: Array<{
        id: string
        workflow?: {
          mode: string
          statePointer: Record<string, unknown>
          reportPointer: Record<string, unknown>
        }
      }>
    }

    expect(detail.workflow).toMatchObject({
      mode: 'workflow',
      templateId: 'requirements-to-implementation',
      status: 'running',
      activePhaseId: 'technical-design',
      statePointer,
      reportPointer,
    })
    expect(list.sessions.find((session) => session.id === sessionId)?.workflow).toMatchObject({
      mode: 'workflow',
      statePointer,
      reportPointer,
    })
  })

  it('should skip meta entries in messages', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      makeMetaUserEntry(),
      makeUserEntry('Real message'),
    ])

    const detail = await service.getSession(sessionId)
    expect(detail!.messages).toHaveLength(1)
    expect(detail!.messages[0]!.content).toBe('Real message')
  })

  // --------------------------------------------------------------------------
  // getSessionMessages
  // --------------------------------------------------------------------------

  it('should throw for non-existent session messages', async () => {
    expect(
      service.getSessionMessages('00000000-0000-0000-0000-000000000000')
    ).rejects.toThrow('Session not found')
  })

  it('should return messages only', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      makeUserEntry('Hello'),
      makeAssistantEntry('World'),
    ])

    const messages = await service.getSessionMessages(sessionId)
    expect(messages).toHaveLength(2)
  })

  it('should append subagent tool calls under their parent agent tool result', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const projectDir = '-tmp-project'
    const agentId = 'abc123'

    await writeSessionFile(projectDir, sessionId, [
      makeSnapshotEntry(),
      makeUserEntry('Dispatch an agent'),
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'Agent:0',
              name: 'Agent',
              input: { description: 'Inspect alpha' },
            },
          ],
        },
        uuid: crypto.randomUUID(),
        timestamp: '2026-01-01T00:00:02.000Z',
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'Agent:0',
              content: [
                {
                  type: 'text',
                  text: `alpha summary\nagentId: ${agentId} (use SendMessage with to: '${agentId}' to continue this agent)\n<usage>total_tokens: 10\ntool_uses: 2\nduration_ms: 30</usage>`,
                },
              ],
            },
          ],
        },
        uuid: crypto.randomUUID(),
        timestamp: '2026-01-01T00:00:03.000Z',
      },
    ])
    await writeSubagentTranscriptFile(projectDir, sessionId, agentId, [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'Read:0',
              name: 'Read',
              input: { file_path: '/tmp/alpha.txt' },
            },
          ],
        },
        uuid: crypto.randomUUID(),
        timestamp: '2026-01-01T00:00:04.000Z',
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'Read:0',
              content: 'alpha body',
            },
          ],
        },
        uuid: crypto.randomUUID(),
        timestamp: '2026-01-01T00:00:05.000Z',
      },
    ])

    const messages = await service.getSessionMessages(sessionId)
    const childToolUse = messages.find(
      (message) => message.type === 'tool_use' && message.parentToolUseId === 'Agent:0',
    )
    const childToolResult = messages.find(
      (message) => message.type === 'tool_result' && message.parentToolUseId === 'Agent:0',
    )

    expect(childToolUse?.content).toEqual([
      {
        type: 'tool_use',
        id: 'Agent:0/abc123/Read:0',
        name: 'Read',
        input: { file_path: '/tmp/alpha.txt' },
      },
    ])
    expect(childToolResult?.content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'Agent:0/abc123/Read:0',
        content: 'alpha body',
      },
    ])
  })

  it('should hide synthetic interruption, no-response, and command breadcrumb transcript entries', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      makeUserEntry('正常用户消息', crypto.randomUUID()),
      {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: '[Request interrupted by user]' }],
        },
        uuid: crypto.randomUUID(),
        timestamp: '2026-01-01T00:00:02.000Z',
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'No response requested.' }],
          model: '<synthetic>',
        },
        uuid: crypto.randomUUID(),
        timestamp: '2026-01-01T00:00:03.000Z',
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: '<command-name>/exit</command-name>\n<command-message>exit</command-message>\n<command-args></command-args>',
        },
        uuid: crypto.randomUUID(),
        timestamp: '2026-01-01T00:00:04.000Z',
      },
      makeAssistantEntry('正常助手消息', crypto.randomUUID()),
    ])

    const messages = await service.getSessionMessages(sessionId)

    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ type: 'user', content: '正常用户消息' })
    expect(messages[1]).toMatchObject({
      type: 'assistant',
      content: [{ type: 'text', text: '正常助手消息' }],
    })
  })

  it('should keep /goal local command transcript entries for desktop history restore', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      {
        parentUuid: null,
        isSidechain: false,
        type: 'system',
        subtype: 'local_command',
        content: '<command-name>/goal</command-name>\n<command-message>goal</command-message>\n<command-args>ship persisted goal</command-args>',
        level: 'info',
        timestamp: '2026-01-01T00:00:01.000Z',
        uuid: 'goal-command',
      },
      {
        parentUuid: 'goal-command',
        isSidechain: false,
        type: 'system',
        subtype: 'local_command',
        content: '<local-command-stdout>Goal set: ship persisted goal</local-command-stdout>',
        level: 'info',
        timestamp: '2026-01-01T00:00:02.000Z',
        uuid: 'goal-output',
      },
      makeAssistantEntry('正常助手消息', crypto.randomUUID()),
    ])

    const messages = await service.getSessionMessages(sessionId)

    expect(messages).toMatchObject([
      {
        id: 'goal-command',
        type: 'system',
        content: expect.stringContaining('<command-name>/goal</command-name>'),
      },
      {
        id: 'goal-output',
        type: 'system',
        content: expect.stringContaining('Goal set: ship persisted goal'),
      },
      {
        type: 'assistant',
      },
    ])
  })

  it('should hide task-notification turns and their automatic responses from history', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const firstUserId = crypto.randomUUID()
    const firstAssistantId = crypto.randomUUID()
    const taskNotificationId = crypto.randomUUID()
    const taskAssistantId = crypto.randomUUID()
    const taskToolUseMessageId = crypto.randomUUID()
    const taskToolResultId = crypto.randomUUID()
    const taskAfterToolId = crypto.randomUUID()
    const realFollowUpId = crypto.randomUUID()
    const realAssistantId = crypto.randomUUID()

    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      {
        ...makeUserEntry('创建一个项目', firstUserId),
        parentUuid: null,
      },
      {
        ...makeAssistantEntry('项目已经创建', firstUserId),
        uuid: firstAssistantId,
      },
      {
        ...makeUserEntry(
          '<task-notification>\n<task-id>bg-1</task-id>\n<tool-use-id>toolu_bg</tool-use-id>\n<status>completed</status>\n<summary>Background command completed</summary>\n</task-notification>',
          taskNotificationId,
        ),
        parentUuid: firstAssistantId,
      },
      {
        ...makeAssistantEntry('旧后台任务通知，无需处理', taskNotificationId),
        uuid: taskAssistantId,
      },
      {
        ...makeAssistantToolUseEntry([{
          id: 'toolu_restart',
          name: 'Bash',
          input: { command: 'npm run dev' },
        }], taskAssistantId),
        uuid: taskToolUseMessageId,
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: 'toolu_restart',
            content: 'server restarted',
          }],
        },
        uuid: taskToolResultId,
        parentUuid: taskToolUseMessageId,
        timestamp: '2026-01-01T00:03:00.000Z',
      },
      {
        ...makeAssistantEntry('后台任务触发的工具调用完成', taskToolResultId),
        uuid: taskAfterToolId,
      },
      {
        ...makeUserEntry('继续真实问题', realFollowUpId),
        parentUuid: taskAfterToolId,
      },
      {
        ...makeAssistantEntry('真实回答', realFollowUpId),
        uuid: realAssistantId,
      },
    ])

    const messages = await service.getSessionMessages(sessionId)
    const taskNotifications = await service.getSessionTaskNotifications(sessionId)

    expect(messages.map((message) => message.id)).toEqual([
      firstUserId,
      firstAssistantId,
      realFollowUpId,
      realAssistantId,
    ])
    expect(JSON.stringify(messages)).not.toContain('<task-notification>')
    expect(JSON.stringify(messages)).not.toContain('旧后台任务通知')
    expect(JSON.stringify(messages)).not.toContain('server restarted')
    expect(JSON.stringify(messages)).not.toContain('后台任务触发的工具调用完成')
    expect(taskNotifications).toEqual([
      {
        taskId: 'bg-1',
        toolUseId: 'toolu_bg',
        status: 'completed',
        summary: 'Background command completed',
        timestamp: '2026-01-01T00:01:00.000Z',
      },
    ])
  })

  it('should reconstruct parent agent tool linkage from parentUuid chains', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const userUuid = crypto.randomUUID()
    const agentAssistantUuid = crypto.randomUUID()
    const childAssistantUuid = crypto.randomUUID()

    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      makeUserEntry('Inspect the codebase', userUuid),
      {
        parentUuid: userUuid,
        isSidechain: false,
        type: 'assistant',
        message: {
          model: 'claude-opus-4-7',
          id: `msg_${crypto.randomUUID().slice(0, 20)}`,
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Agent',
              id: 'agent-tool-1',
              input: { description: 'Inspect src/components' },
            },
          ],
        },
        uuid: agentAssistantUuid,
        timestamp: '2026-01-01T00:02:00.000Z',
      },
      {
        parentUuid: agentAssistantUuid,
        isSidechain: true,
        type: 'assistant',
        message: {
          model: 'claude-opus-4-7',
          id: `msg_${crypto.randomUUID().slice(0, 20)}`,
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              id: 'read-tool-1',
              input: { file_path: 'src/components/App.tsx' },
            },
          ],
        },
        uuid: childAssistantUuid,
        timestamp: '2026-01-01T00:02:30.000Z',
      },
      {
        parentUuid: childAssistantUuid,
        isSidechain: true,
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'read-tool-1',
              content: 'ok',
              is_error: false,
            },
          ],
        },
        uuid: crypto.randomUUID(),
        timestamp: '2026-01-01T00:03:00.000Z',
        userType: 'external',
        cwd: '/tmp/test',
        sessionId: 'test-session',
      },
    ])

    const messages = await service.getSessionMessages(sessionId)

    expect(messages[1]).toMatchObject({
      type: 'tool_use',
      parentToolUseId: undefined,
    })
    expect(messages[2]).toMatchObject({
      type: 'tool_use',
      parentToolUseId: 'agent-tool-1',
    })
    expect(messages[3]).toMatchObject({
      type: 'tool_result',
      parentToolUseId: 'agent-tool-1',
    })
  })

  it('should recover workDir from session-meta entries', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      makeSessionMetaEntry('/tmp/from-meta'),
      makeUserEntry('Hello'),
    ])

    const workDir = await service.getSessionWorkDir(sessionId)
    expect(workDir).toBe('/tmp/from-meta')
  })

  it('should recover workDir from the latest session-meta entry', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      makeSessionMetaEntry('/tmp/old-worktree'),
      makeUserEntry('Hello'),
      makeSessionMetaEntry('/tmp/latest-worktree'),
    ])

    const workDir = await service.getSessionWorkDir(sessionId)
    expect(workDir).toBe('/tmp/latest-worktree')
  })

  it('should prefer the newest duplicate session file when worktree metadata moves', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const sourceFile = await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      makeSessionMetaEntry('/tmp/project'),
    ])
    const worktreeFile = await writeSessionFile('-tmp-project--claude-worktrees-desktop-main-12345678', sessionId, [
      makeSnapshotEntry(),
      makeSessionMetaEntry('/tmp/project/.claude/worktrees/desktop-main-12345678'),
    ])

    const oldTime = new Date('2026-01-01T00:00:00.000Z')
    const newTime = new Date('2026-01-01T00:00:01.000Z')
    await fs.utimes(sourceFile, oldTime, oldTime)
    await fs.utimes(worktreeFile, newTime, newTime)

    const workDir = await service.getSessionWorkDir(sessionId)
    expect(workDir).toBe('/tmp/project/.claude/worktrees/desktop-main-12345678')
  })

  it('should recover CLI worktree state from transcript metadata', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-project--claude-worktrees-desktop-main-12345678', sessionId, [
      makeSnapshotEntry(),
      makeSessionMetaEntry('/tmp/project/.claude/worktrees/desktop-main-12345678'),
      makeWorktreeStateEntry(sessionId, '/tmp/project/.claude/worktrees/desktop-main-12345678', {
        originalCwd: '/tmp/project',
      }),
      makeUserEntry('Hello from CLI worktree'),
    ])

    const launchInfo = await service.getSessionLaunchInfo(sessionId)
    expect(launchInfo?.worktreeSession).toMatchObject({
      originalCwd: '/tmp/project',
      worktreePath: '/tmp/project/.claude/worktrees/desktop-main-12345678',
      worktreeName: 'desktop-main-12345678',
      worktreeBranch: 'worktree-desktop-main-12345678',
      originalBranch: 'main',
    })
  })

  it('should preserve repository metadata when replacing placeholder transcripts', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    const { sessionId, workDir: sessionWorkDir } = await service.createSession(
      workDir,
      { branch: 'feature/rail', worktree: true },
    )

    await service.clearSessionTranscript(sessionId, sessionWorkDir)
    const launchInfo = await service.getSessionLaunchInfo(sessionId)

    expect(launchInfo?.workDir).toBe(sessionWorkDir)
    expect(launchInfo?.repository).toMatchObject({
      requestedWorkDir: await fs.realpath(workDir),
      worktree: true,
      worktreePath: expect.stringContaining(path.join('.claude', 'worktrees', 'desktop-feature-rail-')),
    })
  }, 60_000)

  it('should preserve staged workflow metadata pointers when clearing a transcript', async () => {
    const sessionId = 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee'
    const workDir = path.join(tmpDir, 'workflow-clear-project')
    const statePointer = makeWorkflowPointer(sessionId, 'workflow-state', 'state')
    const reportPointer = makeWorkflowPointer(sessionId, 'final-report', 'final')
    const filePath = await writeSessionFile(sanitizePath(workDir), sessionId, [
      makeSnapshotEntry(),
      makeWorkflowSessionMetaEntry(sessionId, workDir, {
        statePointer,
        stateRef: statePointer,
        reportPointer,
        reportRef: reportPointer,
        stateRevision: 9,
      }),
      makeUserEntry('workflow turn before clear'),
      makeAssistantEntry('workflow response before clear'),
    ])

    await service.clearSessionTranscript(sessionId, workDir)

    const entries = await readJsonlEntries(filePath)
    const metaEntry = entries.findLast((entry) => entry.type === 'session-meta')
    expect(metaEntry).toMatchObject({
      type: 'session-meta',
      isMeta: true,
      workDir,
      workflow: {
        mode: 'workflow',
        statePointer,
        stateRef: statePointer,
        reportPointer,
        reportRef: reportPointer,
        stateRevision: 9,
      },
    })
    expect(await service.getSessionMessages(sessionId)).toEqual([])
  })

  it('should remove stale placeholder files after native CLI worktree startup', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const sourceFile = await writeSessionFile('-tmp-source', sessionId, [
      makeSnapshotEntry(),
      { type: 'session-meta', isMeta: true, workDir: '/tmp/source', timestamp: '2026-01-01T00:00:00.000Z' },
      { type: 'session-meta', isMeta: true, workDir: '/tmp/source/.claude/worktrees/desktop-agent', timestamp: '2026-01-01T00:00:02.000Z' },
    ])
    const worktreeFile = await writeSessionFile('-tmp-source--claude-worktrees-desktop-agent', sessionId, [
      makeSnapshotEntry(),
      { type: 'session-meta', isMeta: true, workDir: '/tmp/source/.claude/worktrees/desktop-agent', timestamp: '2026-01-01T00:00:01.000Z' },
      makeUserEntry('Hello from worktree'),
    ])

    const removed = await service.deletePlaceholderSessionFiles(
      sessionId,
      '/tmp/source/.claude/worktrees/desktop-agent',
    )

    expect(removed).toBe(1)
    await expect(fs.access(sourceFile)).rejects.toThrow()
    await expect(fs.access(worktreeFile)).resolves.toBeNull()
  })

  it('should move repository metadata to the CLI worktree transcript before deleting placeholders', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    const { sessionId } = await service.createSession(
      workDir,
      { branch: 'main', worktree: true },
    )
    const initialLaunchInfo = await service.getSessionLaunchInfo(sessionId)
    const worktreePath = initialLaunchInfo?.repository?.worktreePath
    expect(worktreePath).toBeTruthy()

    const worktreeFile = await writeSessionFile(sanitizePath(worktreePath!), sessionId, [
      makeSnapshotEntry(),
      {
        type: 'system',
        subtype: 'init',
        cwd: worktreePath,
        timestamp: '2026-01-01T00:00:01.000Z',
      },
      makeUserEntry('Hello from worktree'),
    ])

    await service.appendSessionMetadata(sessionId, {
      workDir: worktreePath!,
    })
    const removed = await service.deletePlaceholderSessionFiles(sessionId, worktreePath!)
    const launchInfo = await service.getSessionLaunchInfo(sessionId)

    expect(removed).toBe(1)
    await expect(fs.access(worktreeFile)).resolves.toBeNull()
    expect(launchInfo?.workDir).toBe(worktreePath)
    expect(launchInfo?.repository).toMatchObject({
      requestedWorkDir: await fs.realpath(workDir),
      branch: 'main',
      worktree: true,
      worktreePath,
      worktreeSlug: initialLaunchInfo?.repository?.worktreeSlug,
    })
  }, 60_000)

  it('should recover workDir from transcript cwd when session-meta is missing', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      {
        ...makeUserEntry('Hello'),
        cwd: '/tmp/from-cwd',
      },
    ])

    const workDir = await service.getSessionWorkDir(sessionId)
    expect(workDir).toBe('/tmp/from-cwd')
  })

  // --------------------------------------------------------------------------
  // createSession
  // --------------------------------------------------------------------------

  it('should create a new session file', async () => {
    const workDir = path.join(tmpDir, 'workspace', 'my-project')
    await fs.mkdir(workDir, { recursive: true })
    const { sessionId } = await service.createSession(workDir)
    expect(sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )

    // Verify the file was created
    const canonicalWorkDir = await fs.realpath(workDir)
    const sanitized = sanitizePath(canonicalWorkDir)
    const filePath = path.join(tmpDir, 'projects', sanitized, `${sessionId}.jsonl`)
    const stat = await fs.stat(filePath)
    expect(stat.isFile()).toBe(true)

    // Verify the file starts with the initial snapshot entry
    const content = await fs.readFile(filePath, 'utf-8')
    const entry = JSON.parse(content.trim().split('\n')[0]!)
    expect(entry.type).toBe('file-history-snapshot')
  })

  it('should defer isolated worktree creation until CLI startup', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    const { sessionId, workDir: sessionWorkDir } = await service.createSession(
      workDir,
      { branch: 'feature/rail', worktree: true },
    )

    expect(sessionWorkDir).toBe(await fs.realpath(workDir))
    expect(git(workDir, 'branch', '--show-current')).toBe('main\n')
    expect(git(workDir, 'status', '--porcelain')).toBe('')

    const sanitized = sanitizePath(await fs.realpath(workDir))
    const filePath = path.join(tmpDir, 'projects', sanitized, `${sessionId}.jsonl`)
    const lines = (await fs.readFile(filePath, 'utf-8')).trim().split('\n')
    const metadata = JSON.parse(lines[1]!)
    const plannedWorktreePath = metadata.repository.worktreePath as string
    expect(metadata.workDir).toBe(await fs.realpath(workDir))
    expect(metadata.repository).toMatchObject({
      requestedWorkDir: await fs.realpath(workDir),
      branch: 'feature/rail',
      worktree: true,
      baseRef: 'feature/rail',
      worktreePath: expect.stringContaining(path.join('.claude', 'worktrees', 'desktop-feature-rail-')),
      worktreeBranch: expect.stringContaining('worktree-desktop-feature-rail-'),
      worktreeSlug: expect.stringContaining('desktop-feature-rail-'),
    })
    await expect(fs.access(plannedWorktreePath)).rejects.toThrow()

    const context = await getRepositoryContext(workDir)
    expect(context.state).toBe('ok')
    expect(context.branches.map((branch) => branch.name)).not.toContain(
      path.basename(plannedWorktreePath).replace(/^desktop-/, 'worktree-desktop-'),
    )
    expect(context.branches.some((branch) => branch.name.startsWith('worktree-desktop-'))).toBe(false)
  }, 60_000)

  it('should defer direct branch switching until CLI startup when worktree isolation is disabled', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    const { sessionId, workDir: sessionWorkDir } = await service.createSession(
      workDir,
      { branch: 'feature/rail', worktree: false },
    )

    expect(sessionWorkDir).toBe(await fs.realpath(workDir))
    expect(git(workDir, 'branch', '--show-current')).toBe('main\n')

    const sanitized = sanitizePath(await fs.realpath(workDir))
    const filePath = path.join(tmpDir, 'projects', sanitized, `${sessionId}.jsonl`)
    const lines = (await fs.readFile(filePath, 'utf-8')).trim().split('\n')
    const metadata = JSON.parse(lines[1]!)
    expect(metadata.workDir).toBe(await fs.realpath(workDir))
    expect(metadata.repository).toMatchObject({
      requestedWorkDir: await fs.realpath(workDir),
      branch: 'feature/rail',
      worktree: false,
      baseRef: 'feature/rail',
    })
  }, 60_000)

  it('should not list hidden desktop worktree branches', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    const existingWorktree = path.join(tmpDir, `desktop-hidden-${Date.now()}`)
    git(workDir, 'worktree', 'add', '-b', 'worktree-desktop-hidden', existingWorktree, 'feature/rail')

    expect(git(existingWorktree, 'branch', '--show-current')).toBe('worktree-desktop-hidden\n')

    const context = await getRepositoryContext(existingWorktree)
    expect(context.state).toBe('ok')
    expect(context.currentBranch).toBe('worktree-desktop-hidden')
    expect(context.branches.some((branch) => branch.name === context.currentBranch)).toBe(false)
    expect(context.branches.some((branch) => branch.name.startsWith('worktree-desktop-'))).toBe(false)
  })

  it('should keep stale worktree records when their paths cannot be resolved', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    const staleWorktreeName = `stale-worktree-${Date.now()}`
    const staleWorktree = path.join(tmpDir, staleWorktreeName)
    git(workDir, 'worktree', 'add', '-b', 'stale-worktree', staleWorktree, 'feature/rail')
    await fs.rm(staleWorktree, { recursive: true, force: true })

    const context = await getRepositoryContext(workDir)
    const expectedPath = path.join(await fs.realpath(tmpDir), staleWorktreeName).normalize('NFC')
    expect(context.state).toBe('ok')
    expect(context.worktrees.some((worktree) => (
      worktree.path === expectedPath && worktree.branch === 'stale-worktree' && !worktree.current
    ))).toBe(true)
  })

  it('should let git carry compatible dirty changes during direct branch launch', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    await fs.writeFile(path.join(workDir, 'README.md'), 'main\nlocal-pricing-edit\n')

    const { sessionId } = await service.createSession(
      workDir,
      { branch: 'feature/rail', worktree: false },
    )

    expect(git(workDir, 'branch', '--show-current')).toBe('main\n')
    expect(await fs.readFile(path.join(workDir, 'README.md'), 'utf-8'))
      .toContain('local-pricing-edit')
    const prepared = await prepareSessionWorkspace(
      workDir,
      { branch: 'feature/rail', worktree: false },
      sessionId,
    )

    expect(prepared.workDir).toBe(await fs.realpath(workDir))
    expect(git(workDir, 'branch', '--show-current')).toBe('feature/rail\n')
    expect(await fs.readFile(path.join(workDir, 'README.md'), 'utf-8'))
      .toContain('local-pricing-edit')
  }, 60_000)

  it('should plan isolated worktrees from dirty source checkouts without switching branches', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    await fs.writeFile(path.join(workDir, 'README.md'), 'main\nlocal-pricing-edit\n')

    const { sessionId } = await service.createSession(
      workDir,
      { branch: 'feature/rail', worktree: true },
    )
    const launchInfo = await service.getSessionLaunchInfo(sessionId)

    expect(launchInfo?.repository).toMatchObject({
      branch: 'feature/rail',
      worktree: true,
      baseRef: 'feature/rail',
    })
    expect(git(workDir, 'branch', '--show-current')).toBe('main\n')
    expect(await fs.readFile(path.join(workDir, 'README.md'), 'utf-8'))
      .toContain('local-pricing-edit')
  })

  it('should defer checked-out direct branch launch validation until CLI startup', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    const existingWorktree = path.join(tmpDir, `existing-feature-rail-${Date.now()}`)
    git(workDir, 'worktree', 'add', existingWorktree, 'feature/rail')

    const { sessionId } = await service.createSession(
      workDir,
      { branch: 'feature/rail', worktree: false },
    )

    expect(git(workDir, 'branch', '--show-current')).toBe('main\n')
    await expect(prepareSessionWorkspace(
      workDir,
      { branch: 'feature/rail', worktree: false },
      sessionId,
    )).rejects.toMatchObject({ code: 'REPOSITORY_BRANCH_CHECKED_OUT' })
  })

  it('should reject branch launch outside Git repositories with a stable error code', async () => {
    const workDir = path.join(tmpDir, `not-git-${Date.now()}`)
    await fs.mkdir(workDir, { recursive: true })

    await expect(service.createSession(
      workDir,
      { branch: 'main', worktree: false },
    )).rejects.toMatchObject({ code: 'REPOSITORY_NOT_GIT' })
  })

  it('should reject missing selected branches with a stable error code', async () => {
    const workDir = await createCleanGitRepo(tmpDir)

    await expect(service.createSession(
      workDir,
      { branch: 'missing/branch', worktree: true },
    )).rejects.toMatchObject({ code: 'REPOSITORY_BRANCH_NOT_FOUND' })
  })

  it('should create a Windows-safe project directory name', async () => {
    if (process.platform !== 'win32') return

    const workDir = process.cwd()
    const { sessionId } = await service.createSession(workDir)
    const sanitized = sanitizePath(workDir)
    const projectDir = path.join(tmpDir, 'projects', sanitized)

    expect(sanitized.includes(':')).toBe(false)
    const stat = await fs.stat(path.join(projectDir, `${sessionId}.jsonl`))
    expect(stat.isFile()).toBe(true)
  })

  it('should default to the user home directory when workDir is missing', async () => {
    const { sessionId } = await service.createSession('')
    const filePath = path.join(
      tmpDir,
      'projects',
      sanitizePath(os.homedir()),
      `${sessionId}.jsonl`,
    )

    const stat = await fs.stat(filePath)
    expect(stat.isFile()).toBe(true)
  })

  it('should throw when workDir does not exist', async () => {
    expect(service.createSession('/tmp/definitely-missing-claude-code-jiangxia')).rejects.toThrow(
      'Working directory does not exist'
    )
  })

  // --------------------------------------------------------------------------
  // deleteSession
  // --------------------------------------------------------------------------

  it('should delete an existing session', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const filePath = await writeSessionFile('-tmp-project', sessionId, [makeSnapshotEntry()])

    await service.deleteSession(sessionId)

    // File should no longer exist
    expect(fs.access(filePath)).rejects.toThrow()
  })

  it('should delete only the matching workflow companion artifacts for a staged session', async () => {
    const sessionId = 'dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee'
    const otherSessionId = 'eeeeeeee-bbbb-cccc-dddd-eeeeeeeeeeee'
    const sessionFilePath = await writeSessionFile('-tmp-workflow-delete-project', sessionId, [
      makeSnapshotEntry(),
      makeWorkflowSessionMetaEntry(sessionId, '/tmp/workflow-delete-project'),
      makeUserEntry('workflow session to delete'),
    ])
    await writeSessionFile('-tmp-other-workflow-project', otherSessionId, [
      makeSnapshotEntry(),
      makeWorkflowSessionMetaEntry(otherSessionId, '/tmp/other-workflow-project'),
    ])

    const workflowRoot = path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions')
    const sessionWorkflowDir = path.join(workflowRoot, sessionId)
    const otherWorkflowDir = path.join(workflowRoot, otherSessionId)
    const unrelatedCcJiangxiaFile = path.join(tmpDir, 'cc-jiangxia', 'settings.json')
    await fs.mkdir(path.join(sessionWorkflowDir, 'artifacts'), { recursive: true })
    await fs.mkdir(path.join(sessionWorkflowDir, 'reports'), { recursive: true })
    await fs.mkdir(path.join(otherWorkflowDir, 'reports'), { recursive: true })
    await fs.writeFile(path.join(sessionWorkflowDir, 'state.json'), '{"sessionId":"target"}\n', 'utf-8')
    await fs.writeFile(path.join(sessionWorkflowDir, 'artifacts', 'phase-1.json'), '{"artifact":true}\n', 'utf-8')
    await fs.writeFile(path.join(sessionWorkflowDir, 'reports', 'final.json'), '{"report":true}\n', 'utf-8')
    await fs.writeFile(path.join(otherWorkflowDir, 'state.json'), '{"sessionId":"other"}\n', 'utf-8')
    await fs.writeFile(unrelatedCcJiangxiaFile, '{"keep":true}\n', 'utf-8')

    await service.deleteSession(sessionId)

    await expect(fs.access(sessionFilePath)).rejects.toThrow()
    await expect(fs.access(sessionWorkflowDir)).rejects.toThrow()
    await expect(fs.access(path.join(otherWorkflowDir, 'state.json'))).resolves.toBeNull()
    await expect(fs.readFile(unrelatedCcJiangxiaFile, 'utf-8')).resolves.toContain('"keep":true')
  })

  it('should throw when deleting non-existent session', async () => {
    expect(
      service.deleteSession('00000000-0000-0000-0000-000000000000')
    ).rejects.toThrow('Session not found')
  })

  // --------------------------------------------------------------------------
  // renameSession
  // --------------------------------------------------------------------------

  it('should rename a session by appending custom-title entry', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const filePath = await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      makeUserEntry('Original message'),
    ])

    await service.renameSession(sessionId, 'My Custom Title')

    // Read the file and check the last entry
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n')
    const lastEntry = JSON.parse(lines[lines.length - 1]!)
    expect(lastEntry.type).toBe('custom-title')
    expect(lastEntry.customTitle).toBe('My Custom Title')

    // Verify the title is now returned in list
    const detail = await service.getSession(sessionId)
    expect(detail!.title).toBe('My Custom Title')
  })

  it('should throw when renaming non-existent session', async () => {
    expect(
      service.renameSession('00000000-0000-0000-0000-000000000000', 'Title')
    ).rejects.toThrow('Session not found')
  })

  // --------------------------------------------------------------------------
  // Title extraction
  // --------------------------------------------------------------------------

  it('should use first user message as title when no custom title', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      makeMetaUserEntry(),
      makeUserEntry('This is my first real question'),
    ])

    const detail = await service.getSession(sessionId)
    expect(detail!.title).toBe('This is my first real question')
  })

  it('should derive a clean title from slash command breadcrumb metadata', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      makeUserEntry([
        '<command-message>frontend-design</command-message>',
        '<command-name>/frontend-design</command-name>',
        '<command-args>@website 重新设计首页</command-args>',
      ].join('\n')),
    ])

    const detail = await service.getSession(sessionId)
    expect(detail!.title).toBe('/frontend-design @website 重新设计首页')
  })

  it('should keep a goal creation title instead of later goal status titles', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      {
        parentUuid: null,
        isSidechain: false,
        type: 'system',
        subtype: 'local_command',
        content: '<command-name>/goal</command-name>\n<command-message>goal</command-message>\n<command-args>ship the actual objective</command-args>',
        level: 'info',
        timestamp: '2026-01-01T00:00:01.000Z',
        uuid: 'goal-command',
      },
      {
        type: 'ai-title',
        aiTitle: '/goal status',
        timestamp: '2026-01-01T00:02:00.000Z',
      },
    ])

    const detail = await service.getSession(sessionId)
    expect(detail!.title).toBe('/goal ship the actual objective')
  })

  it('should display stored AI titles without internal XML tags', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      makeUserEntry('fallback message'),
      {
        type: 'ai-title',
        aiTitle: [
          '<command-message>frontend-design</command-message>',
          '<command-name>/frontend-design</command-name>',
          '<command-args>@website</command-args>',
        ].join(' '),
        timestamp: '2026-01-01T00:02:00.000Z',
      },
    ])

    const detail = await service.getSession(sessionId)
    expect(detail!.title).toBe('/frontend-design @website')
  })

  it('should truncate long titles to 80 chars', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const longMessage = 'A'.repeat(120)
    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      makeUserEntry(longMessage),
    ])

    const detail = await service.getSession(sessionId)
    expect(detail!.title.length).toBe(83) // 80 + '...'
    expect(detail!.title.endsWith('...')).toBe(true)
  })

  it('should fall back to "Untitled Session" when no user message', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-project', sessionId, [makeSnapshotEntry()])

    const detail = await service.getSession(sessionId)
    expect(detail!.title).toBe('Untitled Session')
  })

  it('should detect placeholder launch info for desktop-created sessions', async () => {
    const workDir = await fs.realpath(os.tmpdir())
    const { sessionId } = await service.createSession(workDir)

    const launchInfo = await service.getSessionLaunchInfo(sessionId)
    expect(launchInfo).not.toBeNull()
    expect(launchInfo!.workDir).toBe(workDir)
    expect(launchInfo!.transcriptMessageCount).toBe(0)
    expect(launchInfo!.customTitle).toBeNull()
  })

  it('should detect resumable launch info for transcript sessions', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const userUuid = crypto.randomUUID()
    await writeSessionFile('-tmp-project', sessionId, [
      makeSnapshotEntry(),
      { type: 'session-meta', isMeta: true, workDir: '/tmp/project', timestamp: '2026-01-01T00:00:00.000Z' },
      makeUserEntry('Hello again', userUuid),
      makeAssistantEntry('Welcome back', userUuid),
      { type: 'custom-title', customTitle: 'Saved chat', timestamp: '2026-01-01T00:03:00.000Z' },
    ])

    const launchInfo = await service.getSessionLaunchInfo(sessionId)
    expect(launchInfo).not.toBeNull()
    expect(launchInfo!.workDir).toBe('/tmp/project')
    expect(launchInfo!.transcriptMessageCount).toBe(2)
    expect(launchInfo!.customTitle).toBe('Saved chat')
  })

  it('should recover Windows drive paths from sanitized project dirs for old transcripts without metadata', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff'
    const userUuid = crypto.randomUUID()
    const userEntry = makeUserEntry('Resume this Windows session', userUuid)
    delete userEntry.cwd
    await writeSessionFile('g--AI-NTos-NT-deepseek-nano-core', sessionId, [
      makeSnapshotEntry(),
      userEntry,
      makeAssistantEntry('Welcome back', userUuid),
    ])

    const expectedWorkDir = 'g:\\AI\\NTos\\NT\\deepseek\\nano\\core'
    expect(await service.getSessionWorkDir(sessionId)).toBe(expectedWorkDir)

    const launchInfo = await service.getSessionLaunchInfo(sessionId)
    expect(launchInfo).not.toBeNull()
    expect(launchInfo!.workDir).toBe(expectedWorkDir)
    expect(launchInfo!.transcriptMessageCount).toBe(2)
  })
})

// ============================================================================
// Sessions API integration tests
// ============================================================================

describe('Sessions API', () => {
  let baseUrl: string
  let server: ReturnType<typeof Bun.serve> | null = null

  beforeEach(async () => {
    await setupTmpConfigDir()
    service = new SessionService()

    // Import and start a minimal test server
    const { handleApiRequest } = await import('../router.js')

    server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',

      async fetch(req) {
        const url = new URL(req.url)
        const segments = url.pathname.split('/').filter(Boolean)

        if (segments[0] === 'api') {
          return handleApiRequest(req, url)
        }

        return new Response('Not Found', { status: 404 })
      },
    })
    baseUrl = `http://127.0.0.1:${server.port}`
  })

  afterEach(async () => {
    if (server) {
      server.stop(true)
      server = null
    }
    clearInstalledPluginsCache()
    clearPluginCache('sessions-api-test-teardown')
    resetSettingsCache()
    await cleanupTmpDir()
  })

  it('GET /api/sessions should return empty list', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as { sessions: unknown[]; total: number }
    expect(body.sessions).toEqual([])
    expect(body.total).toBe(0)
  })

  it('POST /api/sessions should create a session', async () => {
    const workDir = await fs.mkdtemp(path.join(tmpDir, 'api-session-'))
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workDir }),
    })
    expect(res.status).toBe(201)

    const body = (await res.json()) as { sessionId: string }
    expect(body.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  it('POST /api/sessions should create a session when workDir is omitted', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(201)

    const body = (await res.json()) as { sessionId: string }
    expect(body.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  it('POST /api/sessions should keep dialogue create shape compatible when workflow is omitted', async () => {
    const workDir = await fs.mkdtemp(path.join(tmpDir, 'api-dialogue-session-'))

    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workDir }),
    })
    expect(res.status).toBe(201)

    const created = (await res.json()) as { sessionId: string; workDir?: string; workflow?: unknown }
    expect(created.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
    expect(created.workDir).toBe(await fs.realpath(workDir))
    expect('workflow' in created).toBe(false)

    const listRes = await fetch(`${baseUrl}/api/sessions`)
    expect(listRes.status).toBe(200)
    const list = (await listRes.json()) as {
      sessions: Array<{ id: string; workflow?: unknown }>
    }
    expect('workflow' in list.sessions.find((session) => session.id === created.sessionId)!).toBe(false)

    const detailRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}`)
    expect(detailRes.status).toBe(200)
    const detail = (await detailRes.json()) as { workflow?: unknown }
    expect('workflow' in detail).toBe(false)
  })

  describe('Workflow Session API contract', () => {
    beforeEach(async () => {
      await writeWorkflowConfigTemplates([agentDevelopmentUserWorkflowTemplate()])
    })

    it('POST /api/sessions should create a workflow session with additive summary and state pointer metadata', async () => {
      const workDir = await fs.mkdtemp(path.join(tmpDir, 'api-workflow-session-'))

      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDir,
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
        }),
      })
      expect(res.status).toBe(201)

      const created = (await res.json()) as {
        sessionId: string
        workDir?: string
        workflow?: {
          mode: string
          templateId: string
          templateVersion: string
          templateSource: string
          templateSnapshotId: string
          status: string
          activePhaseId: string | null
          activePhaseIndex: number
          phaseCount: number
          pendingConfirmation: boolean
          statePointer: Record<string, unknown>
          reportPointer?: Record<string, unknown>
        }
      }
      expect(created.workDir).toBe(await fs.realpath(workDir))
      expect(created.workflow).toMatchObject({
        mode: 'workflow',
        templateId: 'agent-development',
        templateVersion: '1',
        templateSource: 'user',
        templateSnapshotId: 'agent-development-v1',
        status: 'created',
        activePhaseId: 'discussion',
        activePhaseIndex: 0,
        phaseCount: 5,
        pendingConfirmation: false,
        statePointer: {
          kind: 'workflow-state',
          sessionId: created.sessionId,
          artifactId: 'state',
          schemaVersion: 1,
        },
      })
      expect(created.workflow?.reportPointer).toBeUndefined()
      expectNoAbsolutePathLeak(created.workflow)

      const listRes = await fetch(`${baseUrl}/api/sessions`)
      expect(listRes.status).toBe(200)
      const list = (await listRes.json()) as {
        sessions: Array<{ id: string; workflow?: unknown }>
      }
      expect(list.sessions.find((session) => session.id === created.sessionId)?.workflow).toMatchObject({
        mode: 'workflow',
        templateId: 'agent-development',
        activePhaseId: 'discussion',
        statePointer: {
          kind: 'workflow-state',
          sessionId: created.sessionId,
          artifactId: 'state',
        },
      })
      expectNoAbsolutePathLeak(list.sessions.find((session) => session.id === created.sessionId)?.workflow)

      const detailRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}`)
      expect(detailRes.status).toBe(200)
      const detail = (await detailRes.json()) as {
        workflow?: unknown
        messages: unknown[]
      }
      expect(detail.workflow).toMatchObject({
        mode: 'workflow',
        templateId: 'agent-development',
        statePointer: {
          kind: 'workflow-state',
          sessionId: created.sessionId,
          artifactId: 'state',
        },
      })
      expect(detail.messages).toEqual([])
      expectNoAbsolutePathLeak(detail.workflow)

      const stateRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow`)
      expect(stateRes.status).toBe(200)
      const statePayload = (await stateRes.json()) as {
        state?: {
          templateSnapshot?: {
            phases?: Array<{
              id: string
              actionPolicy?: {
                allowedActions?: string[]
                forbiddenActions?: string[]
              }
              phasePrompt?: {
                objective?: string
                handoffInput?: string[]
                executionRules?: string[]
                outputArtifact?: {
                  name?: string
                  sections?: string[]
                }
                completionRules?: string[]
              }
            }>
          }
        }
      }
      expect(statePayload.state?.templateSnapshot?.phases?.map((phase) => phase.id)).toEqual([
        'discussion',
        'specify',
        'plan',
        'tasks',
        'implement',
      ])

      expect(statePayload.state?.phaseSkillSnapshots).toContainEqual(expect.objectContaining({
        phaseId: 'discussion',
        references: expect.arrayContaining([
          expect.objectContaining({
            name: 'sp-discussion',
            mode: 'recommended',
          }),
        ]),
        resolutions: expect.arrayContaining([
          expect.objectContaining({
            reference: expect.objectContaining({ name: 'sp-discussion' }),
            status: 'available',
          }),
        ]),
      }))
      expect(created.workflow).toMatchObject({
        recommendedSkillStatus: expect.objectContaining({
          total: expect.any(Number),
          activePhaseItems: expect.arrayContaining([
            expect.objectContaining({
              name: 'sp-discussion',
              status: 'available',
            }),
          ]),
        }),
      })

      const sharedCreateService = new WorkflowSessionCreateService()
      const resolvedTemplate = await sharedCreateService.resolveTemplate({
        templateId: 'agent-development',
        templateSource: 'user',
        initialPhaseId: 'discussion',
      })
      expect(resolvedTemplate.id).toBe('agent-development')
      expect(resolvedTemplate.phases[0]?.id).toBe('discussion')
    })

    it('POST /api/sessions/:id/workflow/exit cancels the workflow while preserving history and artifacts', async () => {
      const workDir = await createCleanGitRepo(tmpDir)
      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDir,
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
        }),
      })
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()) as { sessionId: string }
      const stateService = new WorkflowSessionStateService()
      await stateService.updateState(created.sessionId, (state) => ({
        ...state,
        artifactIndex: [{
          artifactId: 'requirements',
          phaseId: 'discussion',
          kind: 'document',
          title: 'Requirements',
          lifecycleStatus: 'accepted',
        }],
      }))
      const stopSpy = spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()

      const exitRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/exit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      expect(exitRes.status).toBe(200)
      const body = (await exitRes.json()) as {
        ok: boolean
        state: { status: string; workflowStatus: string; artifactIndex: unknown[]; transitionHistory: unknown[] }
        workflow: { status: string; runStatus: string }
      }
      expect(body.ok).toBe(true)
      expect(body.state.status).toBe('cancelled')
      expect(body.state.workflowStatus).toBe('cancelled')
      expect(body.workflow).toMatchObject({ status: 'cancelled', runStatus: 'cancelled' })
      expect(body.state.artifactIndex).toHaveLength(1)
      expect(body.state.transitionHistory.length).toBeGreaterThan(0)
      expect(stopSpy).toHaveBeenCalledWith(created.sessionId)

      const chatStatusRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/chat/status`)
      expect(chatStatusRes.status).toBe(200)
      expect(await chatStatusRes.json()).toEqual({ state: 'idle' })

      const stateRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow`)
      expect(stateRes.status).toBe(200)
      const persisted = (await stateRes.json()) as { state: { status: string; artifactIndex: unknown[] } }
      expect(persisted.state.status).toBe('cancelled')
      expect(persisted.state.artifactIndex).toHaveLength(1)
      stopSpy.mockRestore()
    })
    it('allows an exited workflow session to start a new linked workflow', async () => {
      const workDir = await createCleanGitRepo(tmpDir)
      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDir,
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
        }),
      })
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()) as { sessionId: string }
      spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()

      const exitRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/exit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      expect(exitRes.status).toBe(200)

      const startRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'clear',
          clientRequestId: 'relaunch-after-workflow-exit-0001',
        }),
      })
      expect(startRes.status).toBe(201)
      const body = (await startRes.json()) as { sessionId?: string; workflow?: { status?: string } }
      expect(body.sessionId).not.toBe(created.sessionId)
      expect(body.workflow?.status).toBe('created')
    })
    it('workflow checkpoint routes create, list, and restore git-backed workflow versions', async () => {
      const workDir = await createCleanGitRepo(tmpDir)
      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDir,
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
        }),
      })
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()) as { sessionId: string; workDir: string }
      const sessionWorkDir = created.workDir
      const firstUserId = crypto.randomUUID()
      const firstAssistantId = crypto.randomUUID()
      const secondUserId = crypto.randomUUID()
      const secondAssistantId = crypto.randomUUID()
      const sessionFilePath = path.join(tmpDir, 'projects', sanitizePath(sessionWorkDir), `${created.sessionId}.jsonl`)
      const checkpointTranscriptEntries = [
        {
          ...makeUserEntry('checkpoint prompt', firstUserId),
          cwd: sessionWorkDir,
          sessionId: created.sessionId,
        },
        {
          ...makeAssistantEntry('checkpoint reply', firstUserId),
          uuid: firstAssistantId,
          cwd: sessionWorkDir,
          sessionId: created.sessionId,
        },
      ]
      await fs.appendFile(
        sessionFilePath,
        checkpointTranscriptEntries.map((entry) => JSON.stringify(entry)).join('\n') + '\n',
        'utf-8',
      )

      await fs.writeFile(path.join(workDir, 'README.md'), 'checkpoint content\n')
      const saveRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/checkpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          phaseIndex: 0,
          label: 'Discussion save',
        }),
      })
      expect(saveRes.status).toBe(200)
      const saveBody = (await saveRes.json()) as {
        latestVersion: number
        checkpoint: { id: string; phaseId: string | null; phaseIndex: number | null; label: string }
      }
      expect(saveBody.latestVersion).toBe(1)
      expect(saveBody.checkpoint).toMatchObject({
        id: 'v1',
        phaseId: 'discussion',
        phaseIndex: 0,
        label: 'Discussion save',
      })

      const listRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/checkpoints`)
      expect(listRes.status).toBe(200)
      const listBody = (await listRes.json()) as {
        enabled: boolean
        latestVersion: number | null
        checkpoints: Array<{ id: string }>
      }
      expect(listBody.enabled).toBe(true)
      expect(listBody.latestVersion).toBe(1)
      expect(listBody.checkpoints.map((checkpoint) => checkpoint.id)).toEqual(['v1'])

      await fs.writeFile(path.join(workDir, 'README.md'), 'regressed content\n')
      await fs.writeFile(path.join(workDir, 'generated-after-save.txt'), 'generated after checkpoint\n')
      await fs.appendFile(
        sessionFilePath,
        [
        {
          ...makeUserEntry('post-checkpoint prompt', secondUserId),
          parentUuid: firstAssistantId,
          cwd: sessionWorkDir,
          sessionId: created.sessionId,
        },
        {
          ...makeAssistantEntry('post-checkpoint reply', secondUserId),
          uuid: secondAssistantId,
          cwd: sessionWorkDir,
          sessionId: created.sessionId,
        },
        ].map((entry) => JSON.stringify(entry)).join('\n') + '\n',
        'utf-8',
      )
      const stateService = new WorkflowSessionStateService()
      await stateService.updateState(created.sessionId, (state) => ({
        ...state,
        activePhaseId: 'implement',
        phases: state.phases.map((phase) =>
          phase.id === 'discussion'
            ? { ...phase, status: 'completed' }
            : phase.id === 'implement'
              ? { ...phase, status: 'running' }
              : phase
        ),
        phaseRuns: state.phaseRuns.map((phaseRun) =>
          phaseRun.phaseId === 'discussion'
            ? { ...phaseRun, status: 'completed', completedAt: new Date().toISOString() }
            : phaseRun.phaseId === 'implement'
              ? { ...phaseRun, status: 'running', startedAt: new Date().toISOString() }
              : phaseRun
        ),
      }))
      const stopSpy = spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
      setSessionChatState(created.sessionId, 'thinking')
      const restoreRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/checkpoints/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkpointId: 'v1' }),
      })
      expect(restoreRes.status).toBe(200)
      const restoreBody = (await restoreRes.json()) as {
        workflowStateRestored: boolean
        transcriptRestored: boolean
        conversation: { messagesRemoved: number; removedMessageIds: string[] }
        removedFiles: string[]
        workflow?: { activePhaseId: string | null; activePhaseIndex: number }
      }
      expect(restoreBody.workflowStateRestored).toBe(true)
      expect(restoreBody.transcriptRestored).toBe(true)
      expect(restoreBody.conversation.messagesRemoved).toBe(2)
      expect(restoreBody.conversation.removedMessageIds).toEqual([secondUserId, secondAssistantId])
      expect(restoreBody.workflow?.activePhaseId).toBe('discussion')
      expect(restoreBody.workflow?.activePhaseIndex).toBe(0)
      expect(stopSpy).toHaveBeenCalledWith(created.sessionId)
      stopSpy.mockRestore()
      expect(getSessionChatState(created.sessionId)).toBe('idle')
      expect(restoreBody.removedFiles).toContain('generated-after-save.txt')
      const restoredReadme = await fs.readFile(path.join(workDir, 'README.md'), 'utf8')
      expect(restoredReadme.replace(/\r\n/g, '\n')).toBe('checkpoint content\n')
      await expect(fs.stat(path.join(workDir, 'generated-after-save.txt'))).rejects.toThrow()
      const restoredMessages = await sessionService.getSessionMessages(created.sessionId)
      expect(restoredMessages.map((message) => message.id)).toEqual([firstUserId, firstAssistantId])
      expect(JSON.stringify(restoredMessages)).toContain('checkpoint prompt')
      expect(JSON.stringify(restoredMessages)).toContain('checkpoint reply')
      expect(JSON.stringify(restoredMessages)).not.toContain('post-checkpoint')
      const restoredState = await stateService.readState(created.sessionId)
      expect(restoredState.state?.activePhaseId).toBe('discussion')
      expect(restoredState.state?.lastCheckpointRestore).toMatchObject({
        checkpointId: 'v1',
        restoredActivePhaseId: 'discussion',
      })
    }, 60_000)

    it('workflow checkpoint routes reject malformed JSON request bodies', async () => {
      const workDir = await createCleanGitRepo(tmpDir)
      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDir,
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
        }),
      })
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()) as { sessionId: string }

      const res = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/checkpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad-json',
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error?: string; message?: string }
      expect(body.error).toBe('WORKFLOW_CHECKPOINT_INVALID')
      expect(body.message).toContain('valid JSON')
    })

    it('POST /api/sessions should reject workflow creation when workDir would default to the home directory', async () => {
      const projectsBefore = await collectFiles(path.join(tmpDir, 'projects'))
      const workflowArtifactsBefore = await collectFiles(path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions'))

      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
        }),
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as { error?: string; message?: string }
      expect(body.error).toBe('WORKFLOW_WORKSPACE_INVALID')
      expect(body.message).toContain('project workspace')
      expect(await collectFiles(path.join(tmpDir, 'projects'))).toEqual(projectsBefore)
      expect(await collectFiles(path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions'))).toEqual(workflowArtifactsBefore)
    })

    it('POST /api/sessions should reject workflow creation from broad user folders', async () => {
      const res = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDir: path.join(os.homedir(), 'Desktop'),
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
        }),
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as { error?: string; message?: string }
      expect(body.error).toBe('WORKFLOW_WORKSPACE_INVALID')
      expect(body.message).toContain('specific repository or app folder')
    })

    describe('Linked workflow session start contract', () => {
      async function createSourceDialogueSession(
        strategy: 'clear' | 'inherit' | 'summarize',
      ): Promise<{
        sessionId: string
        workDir: string
        filePath: string
        beforeRaw: string
        beforeDetail: Awaited<ReturnType<SessionService['getSession']>>
      }> {
        const sessionId = crypto.randomUUID()
        const workDir = path.join(tmpDir, `linked-workflow-source-${strategy}`)
        const userId = crypto.randomUUID()
        await fs.mkdir(workDir, { recursive: true })
        const filePath = await writeSessionFile(sanitizePath(workDir), sessionId, [
          makeSessionMetaEntry(workDir),
          {
            ...makeUserEntry(`Discuss linked workflow ${strategy}`, userId),
            cwd: workDir,
            sessionId,
          },
          makeAssistantEntry(`Recorded source context for ${strategy}.`, userId),
        ])
        const beforeRaw = await fs.readFile(filePath, 'utf-8')
        const beforeDetail = await service.getSession(sessionId)

        return { sessionId, workDir, filePath, beforeRaw, beforeDetail }
      }

      async function startLinkedWorkflow(
        sourceSessionId: string,
        body: Record<string, unknown>,
      ): Promise<Response> {
        return await fetch(`${baseUrl}/api/sessions/${sourceSessionId}/workflow/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      async function expectSourceSessionUnchanged(
        source: Awaited<ReturnType<typeof createSourceDialogueSession>>,
      ): Promise<void> {
        expect(await fs.readFile(source.filePath, 'utf-8')).toBe(source.beforeRaw)
        const afterDetail = await service.getSession(source.sessionId)
        expect(afterDetail?.workflow).toBeUndefined()
        expect(afterDetail?.messages).toEqual(source.beforeDetail?.messages)
      }

      async function expectLinkedWorkflowCreated(
        body: {
          sessionId?: string
          workDir?: string
          workflow?: Record<string, unknown>
          link?: Record<string, unknown>
        },
        source: Awaited<ReturnType<typeof createSourceDialogueSession>>,
        strategy: 'clear' | 'inherit' | 'summarize',
        clientRequestId: string,
      ): Promise<void> {
        expect(body.sessionId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        )
        expect(body.sessionId).not.toBe(source.sessionId)
        expect(body.workDir).toBe(await fs.realpath(source.workDir))
        expect(body.workflow).toMatchObject({
          mode: 'workflow',
          templateId: 'agent-development',
          templateVersion: '1',
          templateSource: 'user',
          templateSnapshotId: 'agent-development-v1',
          status: 'created',
          activePhaseId: 'discussion',
          activePhaseIndex: 0,
          phaseCount: 5,
          pendingConfirmation: false,
          statePointer: {
            kind: 'workflow-state',
            sessionId: body.sessionId,
            artifactId: 'state',
            schemaVersion: 1,
          },
        })
        expect(body.link).toMatchObject({
          sourceSessionId: source.sessionId,
          targetSessionId: body.sessionId,
          contextStrategy: strategy,
          sourceMessageCount: 2,
          clientRequestId,
        })
        expect(typeof body.link?.createdAt).toBe('string')

        const targetDetail = await service.getSession(body.sessionId!)
        expect(targetDetail?.workflow).toMatchObject({
          mode: 'workflow',
          templateId: 'agent-development',
          templateSnapshotId: 'agent-development-v1',
        })

        const targetState = await readWorkflowSessionState(body.sessionId!)
        expect(targetState).toMatchObject({
          sessionId: body.sessionId,
          mode: 'workflow',
          template: {
            id: 'agent-development',
            version: '1',
            source: 'user',
            snapshotId: 'agent-development-v1',
          },
          templateSnapshot: {
            id: 'agent-development',
            source: 'user',
            version: '1',
          },
          link: {
            sourceSessionId: source.sessionId,
            sourceMessageCount: 2,
            contextStrategy: strategy,
            clientRequestId,
          },
        })
        expectNoAbsolutePathLeak(body.workflow)
        expectNoAbsolutePathLeak(body.link)
      }

      async function expectLinkedWorkflowServiceCreated(
        body: {
          sessionId?: string
          workDir?: string
          workflow?: Record<string, unknown>
          link?: Record<string, unknown>
        },
        source: Awaited<ReturnType<typeof createSourceDialogueSession>>,
        strategy: 'clear' | 'inherit' | 'summarize',
        clientRequestId: string,
      ): Promise<void> {
        await expectLinkedWorkflowCreated(body, source, strategy, clientRequestId)
        await expectSourceSessionUnchanged(source)
      }

      function createLinkService(options: ConstructorParameters<typeof WorkflowSessionLinkService>[0] = {}) {
        return new WorkflowSessionLinkService(options)
      }

      it('WorkflowSessionLinkService clear should create linked target provenance without source context or source mutation', async () => {
        const source = await createSourceDialogueSession('clear')
        const clientRequestId = 'service-linked-clear-0001'

        const result = await createLinkService().createLinkedWorkflowSession(source.sessionId, {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'clear',
          clientRequestId,
        })

        expect(result.created).toBe(true)
        await expectLinkedWorkflowServiceCreated(result, source, 'clear', clientRequestId)
        expect(result.link.summaryArtifactId).toBeUndefined()
        const targetState = await readWorkflowSessionState(result.sessionId)
        expect(JSON.stringify(targetState)).not.toContain('Discuss linked workflow clear')
      })

      it('WorkflowSessionLinkService inherit should turn the source chat itself into the workflow without losing its history', async () => {
        const source = await createSourceDialogueSession('inherit')
        const clientRequestId = 'service-linked-inherit-0001'

        const result = await createLinkService().createLinkedWorkflowSession(source.sessionId, {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'inherit',
          clientRequestId,
        })

        expect(result.created).toBe(true)
        expect(result.sessionId).toBe(source.sessionId)
        expect(result.workDir).toBe(source.workDir)
        expect(result.link).toMatchObject({
          sourceSessionId: source.sessionId,
          targetSessionId: source.sessionId,
          contextStrategy: 'inherit',
          sourceMessageCount: 2,
          clientRequestId,
        })
        expect(result.link.summaryArtifactId).toBeUndefined()
        const sourceState = await readWorkflowSessionState(source.sessionId)
        expect(sourceState).toMatchObject({
          sessionId: source.sessionId,
          mode: 'workflow',
          link: {
            sourceSessionId: source.sessionId,
            targetSessionId: source.sessionId,
            contextStrategy: 'inherit',
          },
        })
        expect(sourceState.contextCarryover).toBeUndefined()
        const sourceAfter = await sessionService.getSession(source.sessionId)
        expect(sourceAfter?.messages).toEqual(source.beforeDetail?.messages)
      })

      it('WorkflowSessionLinkService should generate a summary preview without creating a workflow target', async () => {
        const source = await createSourceDialogueSession('summary-preview')
        const result = await createLinkService({
          summaryContext: {} as never,
          summaryCarryover: async ({ summaryInstructions }) => ({
            content: `Preview: ${summaryInstructions}`,
            rawSummary: `Preview: ${summaryInstructions}`,
            sourceMessageIds: [],
          }),
        }).previewSummary(source.sessionId, {
          summaryInstructions: 'Preserve decisions.',
        })

        expect(result).toEqual({
          content: 'Preview: Preserve decisions.',
          sourceMessageCount: 2,
        })
        await expectSourceSessionUnchanged(source)
      })

      it('WorkflowSessionLinkService summarize should coordinate non-mutating compact-style carryover on the target', async () => {
        const source = await createSourceDialogueSession('summarize')
        const clientRequestId = 'service-linked-summarize-0001'

        const result = await createLinkService({
          summaryContext: {} as never,
          summaryCarryover: async ({ messages, summaryInstructions }) => ({
            content: `Summary: ${summaryInstructions}`,
            rawSummary: `Raw: ${summaryInstructions}`,
            sourceMessageIds: messages.map((message) => message.uuid),
          }),
        }).createLinkedWorkflowSession(source.sessionId, {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'summarize',
          summaryInstructions: 'Preserve decisions.',
          clientRequestId,
        })

        await expectLinkedWorkflowServiceCreated(result, source, 'summarize', clientRequestId)
        expect(result.link.summaryArtifactId).toBe('context-carryover')
        const targetState = await readWorkflowSessionState(result.sessionId)
        expect(targetState.startupPrompt).toContain('Summary: Preserve decisions.')
        expect(JSON.stringify(targetState)).not.toContain('Recorded source context for summarize.')
        const artifactPath = path.join(
          tmpDir,
          'cc-jiangxia',
          'workflow-sessions',
          result.sessionId,
          'artifacts',
          'context-carryover.json',
        )
        const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf-8')) as Record<string, unknown>
        expect(JSON.stringify(artifact.content)).toContain('Summary: Preserve decisions.')
      })

      it('WorkflowSessionLinkService persists selected expert material content as a startup artifact', async () => {
        const source = await createSourceDialogueSession('expert-material')
        const runId = 'expert-material-run-0001'
        const materialDir = path.join(source.workDir, '.workflow', 'intake', 'expert-runs', runId, 'repo-health-check')
        await fs.mkdir(materialDir, { recursive: true })
        const summaryPath = path.join(materialDir, 'material-summary.md')
        const materialJsonPath = path.join(materialDir, 'material.json')
        const evidencePath = path.join(materialDir, 'evidence.md')
        await fs.writeFile(summaryPath, '# Repository health\n\nThe desktop workflow context must include this checked report.', 'utf-8')
        await fs.writeFile(materialJsonPath, JSON.stringify({ runId, summary: 'Checked report' }), 'utf-8')
        await fs.writeFile(evidencePath, 'Evidence: package scripts were inspected.', 'utf-8')
        const now = new Date().toISOString()
        await service.appendSessionMetadata(source.sessionId, {
          workDir: source.workDir,
          expert: {
            mode: 'expert',
            expertId: 'repo-health-check',
            expertName: 'Repository health',
            packId: 'repo-health-check',
            packVersion: '1.0.0',
            status: 'completed',
            materialRefs: [{
              runId,
              expertId: 'repo-health-check',
              expertName: 'Repository health',
              packId: 'repo-health-check',
              packVersion: '1.0.0',
              summaryPath,
              materialJsonPath,
              evidencePath,
              createdAt: now,
              title: 'Repository health report',
              shortSummary: 'Checked report',
            }],
            startedAt: now,
            updatedAt: now,
          },
        })

        const result = await createLinkService().createLinkedWorkflowSession(source.sessionId, {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
            repoMetadata: {
              expertMaterials: [{ runId }],
            },
          },
          contextStrategy: 'clear',
          clientRequestId: 'service-linked-expert-material-0001',
        })

        expect(result.link.expertMaterialArtifactId).toBe('expert-materials')
        const targetState = await readWorkflowSessionState(result.sessionId)
        expect(targetState.startupPrompt).toContain('Repository health report')
        expect(targetState.startupPrompt).toContain('desktop workflow context must include this checked report')
        expect(targetState.artifactIndex).toEqual(expect.arrayContaining([
          expect.objectContaining({ artifactId: 'expert-materials' }),
        ]))
        const artifactPath = path.join(
          tmpDir,
          'cc-jiangxia',
          'workflow-sessions',
          result.sessionId,
          'artifacts',
          'expert-materials.json',
        )
        const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf-8')) as Record<string, unknown>
        expect(JSON.stringify(artifact.content)).toContain(runId)
        expect(JSON.stringify(artifact.content)).toContain('Repository health report')
      })

      it('WorkflowSessionLinkService should reject non-completed workflow and active sources while inherit is not bounded by a copied-context limit', async () => {
        const workflowSourceSessionId = crypto.randomUUID()
        const workflowWorkDir = path.join(tmpDir, 'service-linked-workflow-source-is-workflow')
        const sourceFilePath = await writeSessionFile(sanitizePath(workflowWorkDir), workflowSourceSessionId, [
          makeWorkflowSessionMetaEntry(workflowSourceSessionId, workflowWorkDir),
          makeUserEntry('Existing workflow source invalid'),
        ])
        const sourceRawBefore = await fs.readFile(sourceFilePath, 'utf-8')
        const service = createLinkService()

        await expect(service.createLinkedWorkflowSession(workflowSourceSessionId, {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'clear',
          clientRequestId: 'service-linked-workflow-source-invalid-0001',
        })).rejects.toMatchObject({ statusCode: 400, code: 'WORKFLOW_SOURCE_INVALID' })
        expect(await fs.readFile(sourceFilePath, 'utf-8')).toBe(sourceRawBefore)

        const activeSource = await createSourceDialogueSession('clear')
        await expect(createLinkService({
          isSourceActive: (sessionId) => sessionId === activeSource.sessionId,
        }).createLinkedWorkflowSession(activeSource.sessionId, {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'clear',
          clientRequestId: 'service-linked-active-source-0001',
        })).rejects.toMatchObject({ statusCode: 409, code: 'WORKFLOW_SOURCE_ACTIVE' })
        await expectSourceSessionUnchanged(activeSource)

        const inheritSource = await createSourceDialogueSession('inherit')
        const inherited = await createLinkService({ inheritMaxCharacters: 1 }).createLinkedWorkflowSession(inheritSource.sessionId, {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'inherit',
          clientRequestId: 'service-linked-inherit-no-copy-limit-0001',
        })
        expect(inherited.sessionId).toBe(inheritSource.sessionId)
        const inheritAfter = await sessionService.getSession(inheritSource.sessionId)
        expect(inheritAfter?.messages).toEqual(inheritSource.beforeDetail?.messages)

      })

      it('WorkflowSessionLinkService summarize should fall back to local carryover when provider summary is unavailable', async () => {
        const summarizeSource = await createSourceDialogueSession('summarize')
        const result = await createLinkService().createLinkedWorkflowSession(summarizeSource.sessionId, {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'summarize',
          summaryInstructions: 'Keep decisions and open questions.',
          clientRequestId: 'service-linked-summary-local-fallback-0001',
        })

        await expectLinkedWorkflowServiceCreated(result, summarizeSource, 'summarize', 'service-linked-summary-local-fallback-0001')
        expect(result.link.summaryArtifactId).toBe('context-carryover')
        const targetState = await readWorkflowSessionState(result.sessionId)
        expect(targetState.startupPrompt).toContain('Local workflow context summary')
        expect(targetState.startupPrompt).toContain('Provider-backed summarization was unavailable')
        expect(targetState.startupPrompt).toContain('Keep decisions and open questions.')
        expect(targetState.startupPrompt).toContain('Discuss linked workflow summarize')
        await expectSourceSessionUnchanged(summarizeSource)
      })

      it('WorkflowSessionLinkService should replay duplicate clientRequestId deterministically', async () => {
        const source = await createSourceDialogueSession('clear')
        const clientRequestId = 'service-linked-idempotency-0001'
        const request = {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'clear',
          clientRequestId,
        }
        const service = createLinkService()

        const first = await service.createLinkedWorkflowSession(source.sessionId, request)
        const second = await service.createLinkedWorkflowSession(source.sessionId, request)

        expect(first.created).toBe(true)
        expect(second.created).toBe(false)
        expect(second.sessionId).toBe(first.sessionId)
        expect(second.workflow).toEqual(first.workflow)
        expect(second.link).toEqual(first.link)
        const snapshotFiles = (await collectFiles(path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions')))
          .filter((filePath) => filePath.endsWith(`${path.sep}state.json`))
        expect(snapshotFiles).toHaveLength(1)
        await expectSourceSessionUnchanged(source)
      })

      it('POST /api/sessions/:id/workflow/start clear should create a linked target without changing source transcript or metadata', async () => {
        const source = await createSourceDialogueSession('clear')
        const clientRequestId = 'linked-clear-0001'

        const res = await startLinkedWorkflow(source.sessionId, {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'clear',
          clientRequestId,
        })
        expect(res.status).toBe(201)

        const body = await res.json() as {
          sessionId?: string
          workDir?: string
          workflow?: Record<string, unknown>
          link?: Record<string, unknown>
        }
        await expectLinkedWorkflowCreated(body, source, 'clear', clientRequestId)
        expect(body.link?.summaryArtifactId).toBeUndefined()
        const targetState = await readWorkflowSessionState(body.sessionId!)
        expect(JSON.stringify(targetState)).not.toContain('Discuss linked workflow clear')
        await expectSourceSessionUnchanged(source)
      })

      it('POST /api/sessions/:id/workflow/start inherit should start the selected workflow in the source chat', async () => {
        const source = await createSourceDialogueSession('inherit')
        const clientRequestId = 'linked-inherit-0001'

        const res = await startLinkedWorkflow(source.sessionId, {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'inherit',
          clientRequestId,
        })
        expect(res.status).toBe(201)

        const body = await res.json() as {
          sessionId?: string
          workDir?: string
          workflow?: Record<string, unknown>
          link?: Record<string, unknown>
        }
        expect(body.sessionId).toBe(source.sessionId)
        expect(body.workDir).toBe(source.workDir)
        expect(body.link).toMatchObject({
          sourceSessionId: source.sessionId,
          targetSessionId: source.sessionId,
          contextStrategy: 'inherit',
          sourceMessageCount: 2,
          clientRequestId,
        })
        const sourceState = await readWorkflowSessionState(source.sessionId)
        expect(sourceState).toMatchObject({
          sessionId: source.sessionId,
          mode: 'workflow',
          link: {
            sourceSessionId: source.sessionId,
            targetSessionId: source.sessionId,
            contextStrategy: 'inherit',
          },
        })
        expect(sourceState.contextCarryover).toBeUndefined()
        const sourceAfter = await sessionService.getSession(source.sessionId)
        expect(sourceAfter?.messages).toEqual(source.beforeDetail?.messages)
      })

      it('POST /api/sessions/:id/workflow/start summarize should use local carryover fallback without source mutation', async () => {
        const source = await createSourceDialogueSession('summarize')
        const workflowRoot = path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions')
        const beforeArtifacts = await collectFiles(workflowRoot)

        const res = await startLinkedWorkflow(source.sessionId, {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'summarize',
          summaryInstructions: 'Require a provider-backed summary.',
          clientRequestId: 'linked-summary-unavailable-0001',
        })
        expect(res.status).toBe(201)

        const body = await res.json() as {
          sessionId?: string
          workDir?: string
          workflow?: Record<string, unknown>
          link?: Record<string, unknown>
        }
        await expectLinkedWorkflowCreated(body, source, 'summarize', 'linked-summary-unavailable-0001')
        expect(body.link?.summaryArtifactId).toBe('context-carryover')
        expect(await collectFiles(workflowRoot)).not.toEqual(beforeArtifacts)
        const targetState = await readWorkflowSessionState(body.sessionId!)
        expect(targetState.startupPrompt).toContain('Local workflow context summary')
        expect(targetState.startupPrompt).toContain('Provider-backed summarization was unavailable')
        expect(targetState.startupPrompt).toContain('Require a provider-backed summary.')
        await expectSourceSessionUnchanged(source)
      })

      it('POST /api/sessions/:id/workflow/start should allow completed workflow source sessions as historical context', async () => {
        const sourceSessionId = crypto.randomUUID()
        const workDir = path.join(tmpDir, 'linked-completed-workflow-source')
        await fs.mkdir(workDir, { recursive: true })
        const sourceFilePath = await writeSessionFile(sanitizePath(workDir), sourceSessionId, [
          makeSnapshotEntry(),
          makeWorkflowSessionMetaEntry(sourceSessionId, workDir, {
            status: 'completed',
            workflowStatus: 'completed',
            activePhaseId: null,
          }),
          makeUserEntry('Preserve the completed workflow decision.'),
          makeAssistantEntry('Completed workflow result that should be inherited.'),
        ])
        const sourceRawBefore = await fs.readFile(sourceFilePath, 'utf-8')
        const clientRequestId = 'linked-completed-workflow-source-0001'

        const res = await startLinkedWorkflow(sourceSessionId, {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'inherit',
          clientRequestId,
        })
        expect(res.status).toBe(201)

        const body = await res.json() as {
          sessionId?: string
          workDir?: string
          workflow?: Record<string, unknown>
          link?: Record<string, unknown>
        }
        expect(body.sessionId).toBe(sourceSessionId)
        expect(body.workDir).toBe(workDir)
        expect(body.workflow).toMatchObject({
          mode: 'workflow',
          templateId: 'agent-development',
          activePhaseId: 'discussion',
        })
        expect(body.link).toMatchObject({
          sourceSessionId,
          targetSessionId: body.sessionId,
          contextStrategy: 'inherit',
          sourceMessageCount: 2,
          clientRequestId,
        })
        expectNoAbsolutePathLeak(body.workflow)
        expectNoAbsolutePathLeak(body.link)

        const targetState = await readWorkflowSessionState(body.sessionId!)
        expect(targetState.link).toMatchObject({
          sourceSessionId,
          targetSessionId: sourceSessionId,
          contextStrategy: 'inherit',
          sourceMessageCount: 2,
          clientRequestId,
        })
        expect(targetState.contextCarryover).toBeUndefined()
        const sourceAfter = await sessionService.getSession(sourceSessionId)
        expect(JSON.stringify(sourceAfter?.messages)).toContain('Preserve the completed workflow decision.')
        expect(JSON.stringify(sourceAfter?.messages)).toContain('Completed workflow result that should be inherited.')
        expect(await fs.readFile(sourceFilePath, 'utf-8')).not.toBe(sourceRawBefore)
      })

      it('POST /api/sessions/:id/workflow/start should allow idle prewarmed source sessions', async () => {
        const source = await createSourceDialogueSession('clear')
        const workflowRoot = path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions')
        const sessionsMap = (conversationService as any).sessions as Map<string, { workDir: string }>

        sessionsMap.set(source.sessionId, { workDir: source.workDir })
        setSessionChatState(source.sessionId, 'idle')

        try {
          const res = await startLinkedWorkflow(source.sessionId, {
            workflow: {
              templateId: 'agent-development',
              templateSource: 'user',
              initialPhaseId: 'discussion',
            },
            contextStrategy: 'clear',
            clientRequestId: 'linked-idle-prewarmed-source-0001',
          })
          expect(res.status).toBe(201)

          const body = await res.json() as {
            sessionId?: string
            workDir?: string
            workflow?: Record<string, unknown>
            link?: Record<string, unknown>
          }
          await expectLinkedWorkflowCreated(body, source, 'clear', 'linked-idle-prewarmed-source-0001')
          expect(await collectFiles(workflowRoot)).toContain(
            path.join(workflowRoot, body.sessionId!, 'state.json'),
          )
          await expectSourceSessionUnchanged(source)
        } finally {
          sessionsMap.delete(source.sessionId)
          setSessionChatState(source.sessionId, 'idle')
        }
      })

      it('POST /api/sessions/:id/workflow/start should reject non-completed workflow source sessions without changing their snapshot', async () => {
        const sourceSessionId = crypto.randomUUID()
        const workDir = path.join(tmpDir, 'linked-workflow-source-is-workflow')
        const sourceFilePath = await writeSessionFile(sanitizePath(workDir), sourceSessionId, [
          makeWorkflowSessionMetaEntry(sourceSessionId, workDir),
          makeUserEntry('Existing workflow session must not become a linked source'),
        ])
        const sourceState = makePendingWorkflowTransitionState(sourceSessionId)
        await writeWorkflowSessionState(sourceSessionId, sourceState)
        const sourceRawBefore = await fs.readFile(sourceFilePath, 'utf-8')

        const res = await startLinkedWorkflow(sourceSessionId, {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'clear',
          clientRequestId: 'linked-workflow-source-invalid-0001',
        })
        expect(res.status).toBe(400)

        const body = await res.json() as { error?: unknown; code?: unknown; message?: unknown }
        expectWorkflowErrorShape(body, 'WORKFLOW_SOURCE_INVALID')
        expect(await readWorkflowSessionState(sourceSessionId)).toEqual(sourceState)
        expect(await fs.readFile(sourceFilePath, 'utf-8')).toBe(sourceRawBefore)
      })

      it('POST /api/sessions/:id/workflow/start should reject active source sessions without creating a target', async () => {
        const source = await createSourceDialogueSession('clear')
        const workflowRoot = path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions')
        const beforeArtifacts = await collectFiles(workflowRoot)
        const sessionsMap = (conversationService as any).sessions as Map<string, { workDir: string }>

        sessionsMap.set(source.sessionId, { workDir: source.workDir })
        setSessionChatState(source.sessionId, 'thinking')

        try {
          const res = await startLinkedWorkflow(source.sessionId, {
            workflow: {
              templateId: 'agent-development',
              templateSource: 'user',
              initialPhaseId: 'discussion',
            },
            contextStrategy: 'clear',
            clientRequestId: 'linked-active-source-0001',
          })
          expect(res.status).toBe(409)

          const body = await res.json() as { error?: unknown; code?: unknown; message?: unknown }
          expectWorkflowErrorShape(body, 'WORKFLOW_SOURCE_ACTIVE')
          expect(await collectFiles(workflowRoot)).toEqual(beforeArtifacts)
          await expectSourceSessionUnchanged(source)
        } finally {
          sessionsMap.delete(source.sessionId)
          setSessionChatState(source.sessionId, 'idle')
        }
      })

      it('POST /api/sessions/:id/workflow/start should replay duplicate clientRequestId without creating another target snapshot', async () => {
        const source = await createSourceDialogueSession('clear')
        const clientRequestId = 'linked-idempotency-0001'
        const request = {
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
          contextStrategy: 'clear',
          clientRequestId,
        }

        const firstRes = await startLinkedWorkflow(source.sessionId, request)
        expect(firstRes.status).toBe(201)
        const first = await firstRes.json() as {
          sessionId?: string
          workflow?: Record<string, unknown>
          link?: Record<string, unknown>
        }

        const secondRes = await startLinkedWorkflow(source.sessionId, request)
        expect(secondRes.status).toBe(200)
        const second = await secondRes.json() as {
          sessionId?: string
          workflow?: Record<string, unknown>
          link?: Record<string, unknown>
        }

        expect(second.sessionId).toBe(first.sessionId)
        expect(second.workflow).toEqual(first.workflow)
        expect(second.link).toEqual(first.link)

        const snapshotFiles = (await collectFiles(path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions')))
          .filter((filePath) => filePath.endsWith(`${path.sep}state.json`))
        expect(snapshotFiles).toHaveLength(1)
        await expectSourceSessionUnchanged(source)
      })
    })

    it('POST /api/sessions/:id/workflow/transition should advance a pending workflow confirmation', async () => {
      const workDir = await fs.mkdtemp(path.join(tmpDir, 'api-workflow-transition-'))

      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDir,
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
        }),
      })
      expect(createRes.status).toBe(201)

      const created = (await createRes.json()) as { sessionId: string }
      const retryRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          action: 'retry',
          transitionId: 'retry-requirements-ready',
        }),
      })
      expect(retryRes.status).toBe(200)
      const retryBody = (await retryRes.json()) as {
        workflow: { status: string; activePhaseId: string; stateVersion?: number; pendingConfirmation: boolean; pendingConfirmationId?: string }
      }
      expect(retryBody.workflow).toMatchObject({
        status: 'pending-confirmation',
        activePhaseId: 'discussion',
        pendingConfirmation: true,
      })

      const confirmRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          action: 'confirm',
          stateVersion: retryBody.workflow.stateVersion,
          confirmationId: retryBody.workflow.pendingConfirmationId,
          transitionId: 'confirm-requirements-ready',
        }),
      })
      expect(confirmRes.status).toBe(200)
      const confirmBody = (await confirmRes.json()) as {
        workflow: { status: string; activePhaseId: string; pendingConfirmation: boolean }
        state: { activePhaseId: string; phases: Array<{ id: string; status: string }> }
      }

      expect(confirmBody.workflow).toMatchObject({
        status: 'running',
        activePhaseId: 'specify',
        pendingConfirmation: false,
      })
      expect(confirmBody.state.activePhaseId).toBe('specify')
      expect(confirmBody.state.phases.find((phase) => phase.id === 'discussion')).toMatchObject({
        status: 'completed',
      })
      expect(confirmBody.state.phases.find((phase) => phase.id === 'specify')).toMatchObject({
        status: 'running',
      })
    })

    it('POST /api/sessions/:id/workflow/follow-up fails closed for existing CLIs across development, debug, and feature workflows', async () => {
      await writeWorkflowConfigTemplates([
        agentDevelopmentUserWorkflowTemplate(),
        followUpWorkflowTemplate('efficient-constrained-dev-debug-workflow-v5', 'new-product', 'route-context'),
        followUpWorkflowTemplate('debug-repair-workflow-v8', 'bug', 'debug-memory-intake'),
        followUpWorkflowTemplate('feature-extension-workflow-v8', 'enhancement', 'feature-memory-plan'),
      ])
      const stopSessionAndWait = spyOn(conversationService, 'stopSessionAndWait').mockResolvedValue()
      const startSession = spyOn(conversationService, 'startSession').mockResolvedValue()
      spyOn(conversationService, 'hasSession').mockReturnValue(true)

      for (const followUp of [
        {
          kind: 'development',
          templateId: 'efficient-constrained-dev-debug-workflow-v5',
          phaseId: 'route-context',
        },
        {
          kind: 'debug-repair',
          templateId: 'debug-repair-workflow-v8',
          phaseId: 'debug-memory-intake',
        },
        {
          kind: 'feature-extension',
          templateId: 'feature-extension-workflow-v8',
          phaseId: 'feature-memory-plan',
        },
      ] as const) {
        const workDir = await fs.mkdtemp(path.join(tmpDir, `api-follow-up-runtime-${followUp.kind}-`))
        const createRes = await fetch(`${baseUrl}/api/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workDir,
            workflow: {
              templateId: 'agent-development',
              templateSource: 'user',
              initialPhaseId: 'discussion',
              request: 'Prepare a completed workflow for a follow-up.',
            },
          }),
        })
        expect(createRes.status).toBe(201)
        const created = await createRes.json() as { sessionId: string }

        const stateService = new WorkflowSessionStateService()
        const stateRead = await stateService.readState(created.sessionId)
        const completed = stateRead.state!
        const firstRun = completed.workflowRuns![0]!
        firstRun.status = 'completed'
        completed.lastCompletedWorkflowRunId = firstRun.id
        completed.activeWorkflowRunId = undefined
        completed.runStatus = 'completed'
        completed.status = 'completed'
        completed.workflowStatus = 'completed'
        await stateService.writeState(created.sessionId, completed)

        const followUpRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/follow-up`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request: `Start ${followUp.kind} follow-up.`,
            kind: followUp.kind,
            templateId: followUp.templateId,
            templateSource: 'user',
            initialPhaseId: followUp.phaseId,
          }),
        })
        expect(followUpRes.status).toBe(200)
        const body = await followUpRes.json() as {
          state: { template: { id: string }; activePhaseId: string }
        }
        expect(body.state).toMatchObject({
          template: { id: followUp.templateId },
          activePhaseId: followUp.phaseId,
        })
        expect(stopSessionAndWait).toHaveBeenCalledWith(created.sessionId)
      }
      expect(stopSessionAndWait).toHaveBeenCalledTimes(3)
      expect(startSession).not.toHaveBeenCalled()
    })

    it('POST /api/sessions/:id/workflow/follow-up should append an inherited workflow run in the same session', async () => {
      const workDir = await fs.mkdtemp(path.join(tmpDir, 'api-workflow-follow-up-'))

      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDir,
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
            request: '开发一个学生管理系统',
          },
        }),
      })
      expect(createRes.status).toBe(201)
      const created = (await createRes.json()) as { sessionId: string }

      const stateService = new WorkflowSessionStateService()
      const stateRead = await stateService.readState(created.sessionId)
      expect(stateRead.state?.workflowRuns).toHaveLength(1)
      const completed = stateRead.state!
      const firstRun = completed.workflowRuns![0]!
      firstRun.status = 'completed'
      firstRun.artifacts.push({
        id: 'project-context',
        filename: 'project-context.md',
        kind: 'markdown',
        required: true,
        phaseId: 'discussion',
        createdAt: '2026-07-02T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
        content: 'projectName: Students\nworkspaceRoot: test\nrunCommands: bun run dev',
      })
      completed.lastCompletedWorkflowRunId = firstRun.id
      completed.activeWorkflowRunId = undefined
      completed.runStatus = 'completed'
      await stateService.writeState(created.sessionId, completed)

      const followUpRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: '刚才学生新增保存 500',
          errors: 'POST /students returned 500',
        }),
      })
      expect(followUpRes.status).toBe(200)
      const body = await followUpRes.json() as {
        workflow: { activeWorkflowRunId?: string; workflowRuns?: Array<{ id: string; primaryLabel?: string; inheritedFromRunId?: string }> }
        state: { workflowRuns?: Array<{ id: string; artifacts: Array<{ filename?: string }> }> }
      }

      expect(body.workflow.workflowRuns).toHaveLength(2)
      const nextRun = body.workflow.workflowRuns?.at(-1)
      expect(nextRun).toMatchObject({
        primaryLabel: 'bug',
        inheritedFromRunId: firstRun.id,
      })
      expect(body.workflow.activeWorkflowRunId).toBe(nextRun?.id)
      expect(body.state.workflowRuns?.at(-1)?.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ filename: 'project-context.md' }),
          expect.objectContaining({ filename: 'debug-context.md' }),
        ]),
      )
    })

    it('POST /api/sessions/:id/workflow/preview/start and stop should manage a workflow-owned preview process', async () => {
      const workDir = await fs.mkdtemp(path.join(tmpDir, 'api-workflow-preview-'))

      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDir,
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
            request: '开发一个学生管理系统',
          },
        }),
      })
      expect(createRes.status).toBe(201)
      const created = await createRes.json() as { sessionId: string }
      const command = `${process.execPath} -e "console.log('preview-ready'); setInterval(() => {}, 1000)"`

      const startRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/preview/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          detectedUrl: 'http://127.0.0.1:5173',
          detectedPort: 5173,
        }),
      })
      expect(startRes.status).toBe(200)
      const started = await startRes.json() as {
        workflow: { preview?: { status: string; detectedUrl?: string } }
        state: { preview?: { status: string; pid?: number }; workflowRuns?: Array<{ artifacts: Array<{ id: string; filename?: string }> }> }
      }

      expect(started.workflow.preview).toMatchObject({
        status: 'running',
        detectedUrl: 'http://127.0.0.1:5173',
      })
      expect(started.state.preview?.pid).toBeGreaterThan(0)
      expect(started.state.workflowRuns?.[0]?.artifacts).toContainEqual(
        expect.objectContaining({
          id: 'run-preview',
          filename: 'run-preview.md',
        }),
      )

      const stopRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/preview/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'test cleanup' }),
      })
      expect(stopRes.status).toBe(200)
      const stopped = await stopRes.json() as {
        workflow: { preview?: { status: string } }
        state: { preview?: { status: string } }
      }

      expect(stopped.workflow.preview?.status).toBe('stopped')
      expect(stopped.state.preview?.status).toBe('stopped')
    })

    it('POST /api/sessions/:id/workflow/transition should record clear next phase context on confirmation', async () => {
      const workDir = await fs.mkdtemp(path.join(tmpDir, 'api-workflow-transition-clear-'))

      const createRes = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workDir,
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'discussion',
          },
        }),
      })
      expect(createRes.status).toBe(201)

      const created = (await createRes.json()) as { sessionId: string }
      const retryRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          action: 'retry',
          transitionId: 'retry-clear-context-ready',
        }),
      })
      expect(retryRes.status).toBe(200)
      const retryBody = (await retryRes.json()) as {
        workflow: { stateVersion?: number; pendingConfirmationId?: string }
      }
      expect(retryBody.workflow.pendingConfirmationId).toBeTruthy()
      expect(retryBody.workflow.stateVersion).toBeTypeOf('number')

      const confirmRes = await fetch(`${baseUrl}/api/sessions/${created.sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          action: 'confirm',
          stateVersion: retryBody.workflow.stateVersion,
          confirmationId: retryBody.workflow.pendingConfirmationId,
          transitionId: 'confirm-clear-context-ready',
          nextPhaseContextStrategy: 'clear',
        }),
      })
      expect(confirmRes.status).toBe(200)
      const confirmBody = (await confirmRes.json()) as {
        state: {
          activePhaseId: string
          nextPhaseContextStrategy?: string
          transitionHistory: Array<{
            transitionId: string
            nextPhaseContextStrategy?: string
          }>
        }
      }

      expect(confirmBody.state.activePhaseId).toBe('specify')
      expect(confirmBody.state.nextPhaseContextStrategy).toBe('clear')
      expect(confirmBody.state.transitionHistory).toContainEqual(expect.objectContaining({
        transitionId: 'confirm-clear-context-ready',
        nextPhaseContextStrategy: 'clear',
      }))
    })

    it.each([
      ['confirm', 'accepted', 'specify', false, 'accepted'],
      ['reject', 'rejected', 'discussion', false, 'rejected'],
      ['retry', 'superseded', 'discussion', false, 'superseded'],
    ] as const)('POST /api/sessions/:id/workflow/transition should %s a ready pending confirmation with canonical stateVersion', async (
      action,
      expectedResult,
      expectedActivePhaseId,
      expectedPending,
      expectedArtifactStatus,
    ) => {
      const sessionId = `aaaaaaaa-bbbb-cccc-dddd-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
      const workDir = path.join(tmpDir, `api-workflow-${action}`)
      await writeWorkflowSessionState(sessionId, makePendingWorkflowTransitionState(sessionId))
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          templateId: 'agent-development',
          templateSnapshotId: 'agent-development-v1',
          status: 'pending-confirmation',
          workflowStatus: 'pending-confirmation',
          activePhaseId: 'discussion',
          stateRevision: 3,
          reportPointer: undefined,
          reportRef: undefined,
        }),
        makeUserEntry('Confirm the ready workflow phase'),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          action,
          ...(action === 'confirm' || action === 'reject' ? { confirmationId: 'submit-discussion-ready' } : {}),
          stateVersion: 3,
          transitionId: `${action}-discussion-ready`,
        }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        state: {
          activePhaseId: string
          pendingConfirmation: unknown
          phases: Array<{ id: string; status: string; artifactPointers: Array<{ lifecycleStatus?: string }> }>
          transitionHistory: Array<{ transitionId: string; result?: string; stateVersion?: number }>
        }
        workflow: { activePhaseId: string; pendingConfirmation: boolean }
      }

      expect(body.workflow).toMatchObject({
        activePhaseId: expectedActivePhaseId,
        pendingConfirmation: expectedPending,
      })
      expect(body.state.activePhaseId).toBe(expectedActivePhaseId)
      expect(body.state.pendingConfirmation).toBeNull()
      expect(body.state.transitionHistory).toContainEqual(expect.objectContaining({
        transitionId: `${action}-discussion-ready`,
        result: expectedResult,
        stateVersion: expect.any(Number),
      }))
      expect(body.state.phases.find((phase) => phase.id === 'discussion')?.artifactPointers).toContainEqual(
        expect.objectContaining({ lifecycleStatus: expectedArtifactStatus }),
      )
      expectNoAbsolutePathLeak(body.workflow)
    })

    it('POST /api/sessions/:id/workflow/transition accepts needs_user as a structured pending gate', async () => {
      const sessionId = `aaaaaaaa-bbbb-cccc-dddd-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
      const workDir = path.join(tmpDir, 'api-workflow-needs-user')
      const state = makePendingWorkflowTransitionState(sessionId, {
        status: 'running',
        workflowStatus: 'running',
        runStatus: 'active',
        stateVersion: 1,
        revision: 1,
        pendingConfirmation: null,
        transitionHistory: [],
        artifactIndex: [],
        phases: [
          {
            id: 'discussion',
            index: 0,
            status: 'running',
            transitionAuthority: 'auto',
            artifactPointers: [],
          },
          {
            id: 'specify',
            index: 1,
            status: 'created',
            transitionAuthority: 'user-confirmation',
            artifactPointers: [],
          },
        ],
      })
      state.templateSnapshot.phases[0]!.transitionAuthority = 'auto'
      await writeWorkflowSessionState(sessionId, state)
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          templateId: 'agent-development',
          templateSnapshotId: 'agent-development-v1',
          status: 'running',
          workflowStatus: 'running',
          activePhaseId: 'discussion',
          stateRevision: 1,
          reportPointer: undefined,
          reportRef: undefined,
        }),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          action: 'needs_user',
          stateVersion: 1,
          handoff: { summary: 'Need a user confirmation.' },
          rationale: 'The next step changes the approved scope.',
          evidence: [],
        }),
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { state: { activePhaseId: string; pendingConfirmation: { submission?: { status?: string } } | null } }
      expect(body.state.activePhaseId).toBe('discussion')
      expect(body.state.pendingConfirmation?.submission?.status).toBe('needs_user')
    })

    it('POST /api/sessions/:id/workflow/transition should reject stale canonical stateVersion without advancing', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-111111111117'
      const workDir = path.join(tmpDir, 'api-workflow-stale-transition')
      await writeWorkflowSessionState(sessionId, makePendingWorkflowTransitionState(sessionId))
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          templateId: 'agent-development',
          templateSnapshotId: 'agent-development-v1',
          status: 'pending-confirmation',
          workflowStatus: 'pending-confirmation',
          activePhaseId: 'discussion',
          stateRevision: 3,
          reportPointer: undefined,
          reportRef: undefined,
        }),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          action: 'confirm',
          confirmationId: 'submit-discussion-ready',
          stateVersion: 2,
          transitionId: 'stale-discussion-ready',
        }),
      })
      const body = (await res.json()) as {
        error?: unknown
        code?: unknown
        message?: unknown
        state?: { activePhaseId: string; pendingConfirmation?: { confirmationId?: string } | null }
        workflow?: { activePhaseId: string; pendingConfirmation: boolean; pendingConfirmationId?: string }
      }
      expect(res.status).toBe(409)
      expectWorkflowErrorShape(body, 'WORKFLOW_STATE_STALE')
      expectNoAbsolutePathLeak(body)
      expect(body.state).toMatchObject({
        activePhaseId: 'discussion',
        pendingConfirmation: { confirmationId: 'submit-discussion-ready' },
      })
      expect(body.workflow).toMatchObject({
        activePhaseId: 'discussion',
        pendingConfirmation: true,
        pendingConfirmationId: 'submit-discussion-ready',
      })

      const stateRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow`)
      const stateBody = (await stateRes.json()) as {
        state: { activePhaseId: string; pendingConfirmation: unknown }
        workflow: { activePhaseId: string; pendingConfirmation: boolean }
      }
      expect(stateBody.state.activePhaseId).toBe('discussion')
      expect(stateBody.workflow.pendingConfirmation).toBe(true)
    })

    it('POST /api/sessions/:id/workflow/transition should reject a superseded confirmation and return the current authoritative card', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-111111111118'
      const workDir = path.join(tmpDir, 'api-workflow-superseded-confirmation')
      await writeWorkflowSessionState(sessionId, makePendingWorkflowTransitionState(sessionId))
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          templateId: 'agent-development',
          templateSnapshotId: 'agent-development-v1',
          status: 'pending-confirmation',
          workflowStatus: 'pending-confirmation',
          activePhaseId: 'discussion',
          stateRevision: 3,
          reportPointer: undefined,
          reportRef: undefined,
        }),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          action: 'confirm',
          confirmationId: 'superseded-discussion-ready',
          stateVersion: 3,
          transitionId: 'superseded-discussion-confirm',
        }),
      })
      const body = (await res.json()) as {
        error?: unknown
        state?: { activePhaseId: string; pendingConfirmation?: { confirmationId?: string } | null }
        workflow?: { activePhaseId: string; pendingConfirmation: boolean; pendingConfirmationId?: string }
      }

      expect(res.status).toBe(409)
      expectWorkflowErrorShape(body, 'WORKFLOW_CONFIRMATION_SUPERSEDED')
      expect(body.state).toMatchObject({
        activePhaseId: 'discussion',
        pendingConfirmation: { confirmationId: 'submit-discussion-ready' },
      })
      expect(body.workflow).toMatchObject({
        activePhaseId: 'discussion',
        pendingConfirmation: true,
        pendingConfirmationId: 'submit-discussion-ready',
      })
      expectNoAbsolutePathLeak(body)
    })
    it('POST /api/sessions/:id/workflow/transition should replay duplicate transitionId without advancing twice', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-121212121217'
      const workDir = path.join(tmpDir, 'api-workflow-duplicate-transition')
      await writeWorkflowSessionState(sessionId, makePendingWorkflowTransitionState(sessionId))
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          templateId: 'agent-development',
          templateSnapshotId: 'agent-development-v1',
          status: 'pending-confirmation',
          workflowStatus: 'pending-confirmation',
          activePhaseId: 'discussion',
          stateRevision: 3,
          reportPointer: undefined,
          reportRef: undefined,
        }),
      ])

      const requestBody = {
        phaseId: 'discussion',
        action: 'confirm',
        confirmationId: 'submit-discussion-ready',
        stateVersion: 3,
        transitionId: 'confirm-discussion-idempotent',
      }
      const firstRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      expect(firstRes.status).toBe(200)

      const secondRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...requestBody, stateVersion: 4 }),
      })
      expect(secondRes.status).toBe(200)
      const secondBody = (await secondRes.json()) as {
        state: {
          activePhaseId: string
          phases: Array<{ id: string; artifactPointers: unknown[] }>
          transitionHistory: Array<{ transitionId: string }>
        }
      }

      expect(secondBody.state.activePhaseId).toBe('specify')
      expect(secondBody.state.phases.find((phase) => phase.id === 'discussion')?.artifactPointers).toHaveLength(1)
      expect(secondBody.state.transitionHistory.filter((transition) =>
        transition.transitionId === 'confirm-discussion-idempotent'
      )).toHaveLength(1)
    })

    it('POST /api/sessions/:id/workflow/transition should reject ready when another completion is pending', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-131313131317'
      const workDir = path.join(tmpDir, 'api-workflow-pending-conflict')
      await writeWorkflowSessionState(sessionId, makePendingWorkflowTransitionState(sessionId))
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          templateId: 'agent-development',
          templateSnapshotId: 'agent-development-v1',
          status: 'pending-confirmation',
          workflowStatus: 'pending-confirmation',
          activePhaseId: 'discussion',
          stateRevision: 3,
          reportPointer: undefined,
          reportRef: undefined,
        }),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          action: 'ready',
          stateVersion: 3,
          transitionId: 'submit-second-ready',
          handoff: {
            summary: 'Second ready attempt.',
            artifacts: [],
            next: 'Confirm.',
          },
          rationale: 'Trying to submit ready again.',
          evidence: [],
        }),
      })
      const body = (await res.json()) as { error?: unknown; code?: unknown; message?: unknown }

      expect(res.status).toBe(409)
      expectWorkflowErrorShape(body, 'WORKFLOW_PENDING_CONFLICT')
      expectNoAbsolutePathLeak(body)
    })

    it('POST /api/sessions/:id/workflow/transition manual_complete should use shared required-field validation', async () => {
      const agentSessionId = 'aaaaaaaa-bbbb-cccc-dddd-141414141417'
      const manualSessionId = 'aaaaaaaa-bbbb-cccc-dddd-151515151517'
      const agentWorkDir = path.join(tmpDir, 'api-workflow-agent-shared-validation')
      const manualWorkDir = path.join(tmpDir, 'api-workflow-manual-shared-validation')
      const runningOverrides = {
        status: 'running',
        workflowStatus: 'running',
        activePhaseId: 'discussion',
        phases: [
          {
            id: 'discussion',
            index: 0,
            status: 'running',
            artifactPointers: [],
          },
          {
            id: 'specify',
            index: 1,
            status: 'created',
            artifactPointers: [],
          },
        ],
        transitionHistory: [],
        artifactIndex: [],
        pendingConfirmation: null,
        stateVersion: 3,
        revision: 3,
      }

      await writeWorkflowSessionState(agentSessionId, makePendingWorkflowTransitionState(agentSessionId, runningOverrides))
      await writeWorkflowSessionState(manualSessionId, makePendingWorkflowTransitionState(manualSessionId, runningOverrides))
      await writeSessionFile(sanitizePath(agentWorkDir), agentSessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(agentSessionId, agentWorkDir, {
          templateId: 'agent-development',
          templateSnapshotId: 'agent-development-v1',
          status: 'running',
          workflowStatus: 'running',
          activePhaseId: 'discussion',
          stateRevision: 3,
          reportPointer: undefined,
          reportRef: undefined,
        }),
      ])
      await writeSessionFile(sanitizePath(manualWorkDir), manualSessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(manualSessionId, manualWorkDir, {
          templateId: 'agent-development',
          templateSnapshotId: 'agent-development-v1',
          status: 'running',
          workflowStatus: 'running',
          activePhaseId: 'discussion',
          stateRevision: 3,
          reportPointer: undefined,
          reportRef: undefined,
        }),
      ])

      const sharedInvalidPayload = {
        phaseId: 'discussion',
        stateVersion: 3,
        transitionId: 'missing-rationale',
        handoff: {
          summary: 'Discussion output was reviewed by the user.',
          artifacts: [],
          next: 'Advance to specify.',
        },
        evidence: [],
      }

      const agentRes = await fetch(`${baseUrl}/api/sessions/${agentSessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sharedInvalidPayload,
          action: 'ready',
        }),
      })
      const manualRes = await fetch(`${baseUrl}/api/sessions/${manualSessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sharedInvalidPayload,
          action: 'manual_complete',
        }),
      })
      const agentBody = (await agentRes.json()) as { error?: unknown; code?: unknown; message?: unknown }
      const manualBody = (await manualRes.json()) as { error?: unknown; code?: unknown; message?: unknown }

      expect(agentRes.status).toBe(400)
      expect(manualRes.status).toBe(agentRes.status)
      expect(manualBody.error ?? manualBody.code).toBe(agentBody.error ?? agentBody.code)
      expect(manualBody.message).toBe(agentBody.message)
      expectNoAbsolutePathLeak(manualBody)
    })

    it('POST /api/sessions/:id/workflow/transition manual_complete should create an accepted artifact and advance exactly one phase', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-161616161617'
      const workDir = path.join(tmpDir, 'api-workflow-manual-complete')
      await writeWorkflowSessionState(sessionId, makePendingWorkflowTransitionState(sessionId, {
        status: 'running',
        workflowStatus: 'running',
        activePhaseId: 'discussion',
        phases: [
          {
            id: 'discussion',
            index: 0,
            status: 'running',
            artifactPointers: [],
          },
          {
            id: 'specify',
            index: 1,
            status: 'created',
            artifactPointers: [],
          },
        ],
        transitionHistory: [],
        artifactIndex: [],
        pendingConfirmation: null,
        stateVersion: 3,
        revision: 3,
      }))
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          templateId: 'agent-development',
          templateSnapshotId: 'agent-development-v1',
          status: 'running',
          workflowStatus: 'running',
          activePhaseId: 'discussion',
          stateRevision: 3,
          reportPointer: undefined,
          reportRef: undefined,
        }),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          action: 'manual_complete',
          stateVersion: 3,
          transitionId: 'manual-complete-discussion',
          handoff: {
            summary: 'User reviewed the discussion output.',
            artifacts: [],
            next: 'Advance to specify.',
          },
          rationale: 'User manually confirmed this phase is complete.',
          evidence: [
            {
              kind: 'note',
              label: 'Manual review',
              ref: 'discussion accepted by user',
            },
          ],
        }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        state: {
          activePhaseId: string
          pendingConfirmation: unknown
          phases: Array<{
            id: string
            status: string
            artifactPointers: Array<{
              lifecycleStatus?: string
              submission?: {
                handoff?: { summary?: string }
                rationale?: string
                evidence?: unknown[]
              }
            }>
          }>
          artifactIndex: Array<{
            lifecycleStatus?: string
            submission?: {
              handoff?: { summary?: string }
              rationale?: string
              evidence?: unknown[]
            }
          }>
          transitionHistory: Array<{ transitionId: string; result?: string; toPhaseId?: string; stateVersion?: number }>
        }
        workflow: { status: string; activePhaseId: string; pendingConfirmation: boolean }
      }

      expect(body.workflow).toMatchObject({
        status: 'running',
        activePhaseId: 'specify',
        pendingConfirmation: false,
      })
      expect(body.state.activePhaseId).toBe('specify')
      expect(body.state.pendingConfirmation).toBeNull()
      expect(body.state.phases.find((phase) => phase.id === 'discussion')).toMatchObject({
        status: 'completed',
      })
      expect(body.state.phases.find((phase) => phase.id === 'specify')).toMatchObject({
        status: 'running',
      })
      expect(body.state.phases.find((phase) => phase.id === 'discussion')?.artifactPointers).toContainEqual(
        expect.objectContaining({
          lifecycleStatus: 'accepted',
          submission: expect.objectContaining({
            handoff: expect.objectContaining({ summary: 'User reviewed the discussion output.' }),
            rationale: 'User manually confirmed this phase is complete.',
            evidence: [
              expect.objectContaining({
                kind: 'note',
                label: 'Manual review',
                ref: 'discussion accepted by user',
              }),
            ],
          }),
        }),
      )
      expect(body.state.artifactIndex).toContainEqual(expect.objectContaining({
        lifecycleStatus: 'accepted',
        submission: expect.objectContaining({
          rationale: 'User manually confirmed this phase is complete.',
        }),
      }))
      expect(body.state.transitionHistory).toContainEqual(expect.objectContaining({
        transitionId: 'manual-complete-discussion',
        result: 'accepted',
        toPhaseId: 'specify',
        stateVersion: expect.any(Number),
      }))
      expectNoAbsolutePathLeak(body.workflow)
    })

    it('POST /api/sessions/:id/workflow/transition manual_complete should reject stale stateVersion without advancing', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-171717171717'
      const workDir = path.join(tmpDir, 'api-workflow-manual-stale')
      await writeWorkflowSessionState(sessionId, makePendingWorkflowTransitionState(sessionId, {
        status: 'running',
        workflowStatus: 'running',
        activePhaseId: 'discussion',
        phases: [
          {
            id: 'discussion',
            index: 0,
            status: 'running',
            artifactPointers: [],
          },
          {
            id: 'specify',
            index: 1,
            status: 'created',
            artifactPointers: [],
          },
        ],
        transitionHistory: [],
        artifactIndex: [],
        pendingConfirmation: null,
        stateVersion: 3,
        revision: 3,
      }))
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          templateId: 'agent-development',
          templateSnapshotId: 'agent-development-v1',
          status: 'running',
          workflowStatus: 'running',
          activePhaseId: 'discussion',
          stateRevision: 3,
          reportPointer: undefined,
          reportRef: undefined,
        }),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          action: 'manual_complete',
          stateVersion: 2,
          transitionId: 'manual-stale-discussion',
          handoff: {
            summary: 'User reviewed the discussion output.',
            artifacts: [],
          },
          rationale: 'User manually confirmed this phase is complete.',
          evidence: [],
        }),
      })
      const body = (await res.json()) as {
        error?: unknown
        code?: unknown
        message?: unknown
        state?: { activePhaseId: string; pendingConfirmation?: { confirmationId?: string } | null }
        workflow?: { activePhaseId: string; pendingConfirmation: boolean; pendingConfirmationId?: string }
      }
      expect(res.status).toBe(409)
      expectWorkflowErrorShape(body, 'WORKFLOW_STATE_STALE')
      expectNoAbsolutePathLeak(body)
      expect(body.state).toMatchObject({
        activePhaseId: 'discussion',
        pendingConfirmation: null,
      })
      expect(body.workflow).toMatchObject({
        activePhaseId: 'discussion',
        pendingConfirmation: false,
      })
      expect(body.workflow).not.toHaveProperty('pendingConfirmationId')

      const stateRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow`)
      const stateBody = (await stateRes.json()) as {
        state: { activePhaseId: string; pendingConfirmation: unknown }
        workflow: { activePhaseId: string; pendingConfirmation: boolean }
      }
      expect(stateBody.state.activePhaseId).toBe('discussion')
      expect(stateBody.workflow.pendingConfirmation).toBe(false)
    })

    it('POST /api/sessions/:id/workflow/transition manual_complete should reject unresolved pending confirmation conflicts', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-181818181817'
      const workDir = path.join(tmpDir, 'api-workflow-manual-pending-conflict')
      await writeWorkflowSessionState(sessionId, makePendingWorkflowTransitionState(sessionId))
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          templateId: 'agent-development',
          templateSnapshotId: 'agent-development-v1',
          status: 'pending-confirmation',
          workflowStatus: 'pending-confirmation',
          activePhaseId: 'discussion',
          stateRevision: 3,
          reportPointer: undefined,
          reportRef: undefined,
        }),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          action: 'manual_complete',
          stateVersion: 3,
          transitionId: 'manual-conflicts-with-pending',
          handoff: {
            summary: 'User tries to bypass a pending agent completion.',
            artifacts: [],
          },
          rationale: 'User manually confirmed this phase is complete.',
          evidence: [],
        }),
      })
      const body = (await res.json()) as { error?: unknown; code?: unknown; message?: unknown }

      expect(res.status).toBe(409)
      expectWorkflowErrorShape(body, 'WORKFLOW_PENDING_CONFLICT')
      expectNoAbsolutePathLeak(body)
    })

    it('POST /api/sessions/:id/workflow/transition confirm final phase should persist a readable final report artifact', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-191919191917'
      const workDir = path.join(tmpDir, 'api-workflow-final-confirm-report')
      await writeWorkflowSessionState(sessionId, makeFinalPendingWorkflowTransitionState(sessionId))
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          templateId: 'agent-development',
          templateSnapshotId: 'agent-development-v1',
          status: 'pending-confirmation',
          workflowStatus: 'pending-confirmation',
          activePhaseId: 'discussion',
          stateRevision: 3,
          reportPointer: undefined,
          reportRef: undefined,
        }),
        makeUserEntry('Confirm the final workflow phase'),
      ])

      const transitionRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          action: 'confirm',
          confirmationId: 'submit-discussion-final-ready',
          stateVersion: 3,
          transitionId: 'confirm-final-discussion-ready',
        }),
      })
      expect(transitionRes.status).toBe(200)
      const transitionBody = (await transitionRes.json()) as {
        workflow: { status: string; reportPointer?: Record<string, unknown> }
      }

      expect(transitionBody.workflow).toMatchObject({
        status: 'completed',
        reportPointer: {
          kind: 'final-report',
          sessionId,
          artifactId: 'final',
        },
      })

      const reportRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/report`)
      expect(reportRes.status).toBe(200)
      const reportBody = (await reportRes.json()) as {
        pointer: Record<string, unknown>
        report: {
          sessionId: string
          status?: string
          conversationSummary?: string
          phaseSummaries: Array<{ phaseId: string; status: string }>
        }
      }

      expect(reportBody.pointer).toEqual(transitionBody.workflow.reportPointer)
      expect(reportBody.report).toMatchObject({
        sessionId,
        status: 'completed',
        conversationSummary: 'Workflow completed.',
      })
      expect(reportBody.report.phaseSummaries).toContainEqual(expect.objectContaining({
        phaseId: 'discussion',
        status: 'completed',
      }))
      expectNoAbsolutePathLeak(reportBody)
    })

    it('POST /api/sessions should reject invalid workflow payloads without partial transcripts or artifacts', async () => {
      const workDir = await fs.mkdtemp(path.join(tmpDir, 'api-invalid-workflow-'))
      const cases: Array<{
        name: string
        workflow: unknown
        code: typeof WORKFLOW_ERROR_CODES[number]
      }> = [
        {
          name: 'missing templateId',
          workflow: {},
          code: 'WORKFLOW_TEMPLATE_INVALID',
        },
        {
          name: 'unknown templateId',
          workflow: { templateId: 'missing-template' },
          code: 'WORKFLOW_TEMPLATE_NOT_FOUND',
        },
        {
          name: 'initial phase is not the first phase',
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            initialPhaseId: 'specify',
          },
          code: 'WORKFLOW_TRANSITION_INVALID',
        },
        {
          name: 'unknown template source',
          workflow: {
            templateId: 'agent-development',
            templateSource: 'remote',
          },
          code: 'WORKFLOW_TEMPLATE_INVALID',
        },
        {
          name: 'unknown workflow field',
          workflow: {
            templateId: 'agent-development',
            templateSource: 'user',
            unexpected: true,
          },
          code: 'WORKFLOW_TEMPLATE_INVALID',
        },
      ]

      for (const testCase of cases) {
        const projectsBefore = await collectFiles(path.join(tmpDir, 'projects'))
        const workflowArtifactsBefore = await collectFiles(path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions'))

        const res = await fetch(`${baseUrl}/api/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workDir, workflow: testCase.workflow }),
        })
        const body = (await res.json()) as { error?: unknown; code?: unknown; message?: unknown }

        expect(res.status, testCase.name).toBe(400)
        expectWorkflowErrorShape(body, testCase.code)
        expectNoAbsolutePathLeak(body)
        expect(await collectFiles(path.join(tmpDir, 'projects')), testCase.name).toEqual(projectsBefore)
        expect(
          await collectFiles(path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions')),
          testCase.name,
        ).toEqual(workflowArtifactsBefore)
      }
    })

    it('GET /api/workflows/templates should return dynamic user templates and invalid user template issues', async () => {
      const workflowConfigPath = path.join(tmpDir, 'cc-jiangxia', 'workflows.json')
      await fs.mkdir(path.dirname(workflowConfigPath), { recursive: true })
      await fs.writeFile(
        workflowConfigPath,
        JSON.stringify({
          schemaVersion: 1,
          templates: [
            {
              id: 'invalid-user-template',
              version: '1',
              name: 'Invalid user template',
              phases: [],
            },
          ],
        }),
        'utf-8',
      )

      const res = await fetch(`${baseUrl}/api/workflows/templates`)
      expect(res.status).toBe(200)

      const body = (await res.json()) as {
        templates: Array<{
          id: string
          source: string
          version: string
          name: string
          description?: string
          phaseCount: number
          firstPhaseId: string
          phaseNames?: string[]
        }>
        invalidTemplates: Array<{
          source: string
          templateId?: string
          path: string
          code: string
          message: string
          severity: string
        }>
      }
      const userTemplates = body.templates.filter((template) => template.source === 'user')
      expect(userTemplates.length).toBeGreaterThan(0)
      expect(userTemplates.every((template) => template.phaseCount > 0 && template.firstPhaseId)).toBe(true)
      expect(userTemplates.some((template) => template.id === 'invalid-user-template')).toBe(false)
      expect(body.invalidTemplates).toContainEqual({
        source: 'user-config',
        templateId: 'invalid-user-template',
        path: '$.templates[0].phases',
        code: 'WORKFLOW_TEMPLATE_INVALID_PHASES',
        message: 'Template phases must be a non-empty ordered array.',
        severity: 'error',
      })
      expectNoAbsolutePathLeak(body)
    })

    it('GET /api/sessions/:id/workflow should be mode-gated and omit absolute artifact paths', async () => {
      const dialogueSessionId = 'aaaaaaaa-bbbb-cccc-dddd-010101010101'
      await writeSessionFile('-tmp-dialogue-workflow-api', dialogueSessionId, [
        makeSnapshotEntry(),
        makeSessionMetaEntry(path.join(tmpDir, 'dialogue-workflow-api')),
        makeUserEntry('Dialogue session should not expose workflow state'),
      ])

      const dialogueRes = await fetch(`${baseUrl}/api/sessions/${dialogueSessionId}/workflow`)
      const dialogueBody = (await dialogueRes.json()) as { error?: unknown; code?: unknown; message?: unknown }
      expect([404, 409]).toContain(dialogueRes.status)
      expectWorkflowErrorShape(dialogueBody, 'WORKFLOW_NOT_ENABLED')
      expectNoAbsolutePathLeak(dialogueBody)

      const missingRes = await fetch(
        `${baseUrl}/api/sessions/00000000-0000-0000-0000-000000000000/workflow`,
      )
      expect(missingRes.status).toBe(404)
      expectNoAbsolutePathLeak(await missingRes.json())
    })

    it('GET /api/sessions/:id/workflow/report should be mode-gated and hide artifact paths until ready', async () => {
      const dialogueSessionId = 'aaaaaaaa-bbbb-cccc-dddd-020202020202'
      await writeSessionFile('-tmp-dialogue-workflow-report-api', dialogueSessionId, [
        makeSnapshotEntry(),
        makeSessionMetaEntry(path.join(tmpDir, 'dialogue-workflow-report-api')),
        makeUserEntry('Dialogue session should not expose workflow report'),
      ])

      const dialogueRes = await fetch(`${baseUrl}/api/sessions/${dialogueSessionId}/workflow/report`)
      const dialogueBody = (await dialogueRes.json()) as { error?: unknown; code?: unknown; message?: unknown }
      expect([404, 409]).toContain(dialogueRes.status)
      expectWorkflowErrorShape(dialogueBody, 'WORKFLOW_NOT_ENABLED')
      expectNoAbsolutePathLeak(dialogueBody)

      const workflowSessionId = 'aaaaaaaa-bbbb-cccc-dddd-030303030303'
      const workDir = path.join(tmpDir, 'workflow-report-not-ready')
      await writeSessionFile(sanitizePath(workDir), workflowSessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(workflowSessionId, workDir, {
          reportPointer: undefined,
          reportRef: undefined,
        }),
        makeUserEntry('Workflow report is not ready yet'),
      ])

      const notReadyRes = await fetch(`${baseUrl}/api/sessions/${workflowSessionId}/workflow/report`)
      const notReadyBody = (await notReadyRes.json()) as { error?: unknown; code?: unknown; message?: unknown }
      expect(notReadyRes.status).toBe(404)
      expectWorkflowErrorShape(notReadyBody, 'WORKFLOW_REPORT_NOT_READY')
      expectNoAbsolutePathLeak(notReadyBody)
    })

    it('workflow resume recovery restores companion state and records a resume transition', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-050505050505'
      const workDir = path.join(tmpDir, 'workflow-resume-recovery')
      await writeWorkflowSessionStateFixture(sessionId, 'resume-stale-template-state.json')
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          status: 'running',
          workflowStatus: 'running',
          activePhaseId: 'requirements-clarification',
          sourceTemplateStatus: 'current',
          reportPointer: undefined,
          reportRef: undefined,
        }),
        makeUserEntry('Resume the workflow without starting over'),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        state: {
          status: string
          activePhaseId: string
          artifactIndex: unknown[]
          pendingConfirmation: { status: string; artifactRefs: unknown[] } | null
          phaseRuns: Array<{
            phaseId: string
            outputArtifactRefs: unknown[]
            modelResolution?: unknown
          }>
          transitionHistory: Array<{ authority?: string; decision?: string }>
        }
        workflow: { activePhaseId: string; pendingConfirmation: boolean }
      }

      expect(body.state.status).toBe('resumed')
      expect(body.state.activePhaseId).toBe('implementation')
      expect(body.workflow.activePhaseId).toBe('implementation')
      expect(body.workflow.pendingConfirmation).toBe(true)
      expect(body.state.artifactIndex).toHaveLength(2)
      expect(body.state.pendingConfirmation).toMatchObject({
        status: 'pending',
        artifactRefs: [expect.objectContaining({ artifactId: 'design-summary' })],
      })
      expect(body.state.phaseRuns.find((phase) => phase.phaseId === 'technical-design')).toMatchObject({
        outputArtifactRefs: [expect.objectContaining({ artifactId: 'design-summary' })],
        modelResolution: {
          requestedModel: 'claude-opus-4-7',
          actualModel: 'claude-sonnet-4-5',
          providerId: 'anthropic',
          fallbackApplied: true,
          fallbackReason: 'requested model unavailable',
        },
      })
      expect(body.state.transitionHistory).toContainEqual(expect.objectContaining({
        authority: 'resume',
        decision: 'resumed',
      }))
      expectNoAbsolutePathLeak(body.workflow)
    })

    it('workflow resume recovery exposes stale template and model fallback state in summary', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-060606060606'
      const workDir = path.join(tmpDir, 'workflow-stale-template-recovery')
      await writeWorkflowSessionStateFixture(sessionId, 'resume-stale-template-state.json')
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          activePhaseId: 'implementation',
          sourceTemplateStatus: 'current',
          reportPointer: undefined,
          reportRef: undefined,
        }),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        workflow: {
          sourceTemplateStatus?: string
          model?: {
            requestedModel: string
            actualModel: string
            fallbackApplied: boolean
            fallbackReason: string
          }
        }
      }

      expect(body.workflow).toMatchObject({
        sourceTemplateStatus: 'stale-template',
        model: {
          requestedModel: 'claude-opus-4-7',
          actualModel: 'claude-sonnet-4-5',
          fallbackApplied: true,
          fallbackReason: 'requested model unavailable',
        },
      })
      expectNoAbsolutePathLeak(body.workflow)
    })

    it('workflow resume recovery exposes missing template state without invalidating snapshot execution', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-070707070707'
      const workDir = path.join(tmpDir, 'workflow-missing-template-recovery')
      await writeWorkflowSessionStateFixture(sessionId, 'resume-missing-template-state.json')
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          templateSource: 'user',
          activePhaseId: 'implementation',
          sourceTemplateStatus: 'current',
          reportPointer: undefined,
          reportRef: undefined,
        }),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        state: {
          sourceTemplateStatus: string
          templateSnapshot: { id: string; source: string; phases: unknown[] }
        }
        workflow: { sourceTemplateStatus?: string; activePhaseId: string }
      }

      expect(body.state.sourceTemplateStatus).toBe('missing-template')
      expect(body.state.templateSnapshot).toMatchObject({
        id: 'user-delivery-plan',
        source: 'user',
        phases: expect.any(Array),
      })
      expect(body.workflow).toMatchObject({
        activePhaseId: 'implementation',
        sourceTemplateStatus: 'missing-template',
      })
    })

    it.each([
      ['stale-template', 'resume-stale-template-state.json'],
      ['missing-template', 'resume-missing-template-state.json'],
    ] as const)('POST /api/sessions/:id/workflow/transition should block unsafe advancement for %s resume state', async (
      _status,
      fixtureName,
    ) => {
      const sessionId = `aaaaaaaa-bbbb-cccc-dddd-${_status === 'stale-template' ? '071111111111' : '072222222222'}`
      const workDir = path.join(tmpDir, `workflow-${_status}-transition-blocked`)
      await writeWorkflowSessionStateFixture(sessionId, fixtureName)
      const stateBefore = rewriteWorkflowFixtureSessionIds(
        await loadWorkflowSessionFixture(fixtureName),
        sessionId,
      ) as Record<string, unknown>
      const phaseId = stateBefore.activePhaseId
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          activePhaseId: phaseId,
          sourceTemplateStatus: 'current',
          reportPointer: undefined,
          reportRef: undefined,
        }),
        makeUserEntry('Attempt unsafe workflow advancement after resume'),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId,
          action: 'manual_complete',
          stateVersion: stateBefore.stateVersion,
          transitionId: `unsafe-${_status}-advance`,
          handoff: {
            summary: 'This should not advance because the resume state is not fully trusted.',
            artifacts: [],
          },
          rationale: 'Attempting an unsafe transition from a recovery state.',
          evidence: [],
        }),
      })
      const body = (await res.json()) as { error?: unknown; code?: unknown; message?: unknown }

      expect(res.status).toBe(409)
      expectWorkflowErrorShape(body, 'WORKFLOW_STATE_CONFLICT')

      const persistedStatePath = path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions', sessionId, 'state.json')
      const stateAfter = JSON.parse(await fs.readFile(persistedStatePath, 'utf-8')) as Record<string, unknown>
      expect(stateAfter.activePhaseId).toBe(stateBefore.activePhaseId)
      expect(stateAfter.workflowStatus).toBe(stateBefore.workflowStatus)
      expect(stateAfter.stateVersion).toBe(stateBefore.stateVersion)
    })

    it('workflow report recovery returns the persisted final report pointer and body', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-080808080808'
      const workDir = path.join(tmpDir, 'workflow-final-report-recovery')
      const reportPointer = makeWorkflowPointer(sessionId, 'final-report', 'final')
      await writeWorkflowSessionStateFixture(sessionId, 'completed-final-report-state.json')
      const report = await writeWorkflowFinalReportFixture(sessionId, 'completed-final-report.json')
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          status: 'completed',
          workflowStatus: 'completed',
          activePhaseId: null,
          reportPointer,
          reportRef: reportPointer,
        }),
        makeAssistantEntry('Workflow completed. Final report is available.'),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/report`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        pointer: Record<string, unknown>
        report: Record<string, unknown>
      }

      expect(body.pointer).toEqual(reportPointer)
      expect(body.report).toMatchObject(report)
      expectNoAbsolutePathLeak(body)
    })

    it('workflow report recovery preserves unknown final report fields through the API', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-081111111111'
      const workDir = path.join(tmpDir, 'workflow-final-report-unknown-fields')
      const reportPointer = makeWorkflowPointer(sessionId, 'final-report', 'final')
      await writeWorkflowSessionStateFixture(sessionId, 'completed-final-report-state.json')
      await writeWorkflowFinalReportFixture(sessionId, 'final-report-with-unknown-fields.json')
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          status: 'completed',
          workflowStatus: 'completed',
          activePhaseId: null,
          reportPointer,
          reportRef: reportPointer,
        }),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/report`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        report: {
          futureReportField?: unknown
          phaseSummaries: Array<{ futurePhaseSummaryField?: unknown }>
        }
      }

      expect(body.report.futureReportField).toEqual({ preserved: true })
      expect(body.report.phaseSummaries[0]?.futurePhaseSummaryField).toBe('preserve me')
      expectNoAbsolutePathLeak(body)
    })

    it('workflow report recovery distinguishes unavailable report artifacts from report-not-ready', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-090909090909'
      const workDir = path.join(tmpDir, 'workflow-report-unavailable')
      const reportPointer = makeWorkflowPointer(sessionId, 'final-report', 'final')
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          status: 'completed',
          workflowStatus: 'completed',
          activePhaseId: null,
          reportPointer,
          reportRef: reportPointer,
        }),
        makeAssistantEntry('Workflow completed before report recovery was checked.'),
      ])
      const reportDir = path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions', sessionId, 'reports')
      await fs.mkdir(reportDir, { recursive: true })
      const filesBefore = await collectFiles(reportDir)

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/report`)
      const body = (await res.json()) as { error?: unknown; code?: unknown; message?: unknown }

      expect(await collectFiles(reportDir)).toEqual(filesBefore)
      expect(res.status).toBe(404)
      expectWorkflowErrorShape(body, 'WORKFLOW_REPORT_UNAVAILABLE')
      expectNoAbsolutePathLeak(body)
    })

    it('workflow report recovery treats corrupt reports as unavailable without regenerating them', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-091111111111'
      const workDir = path.join(tmpDir, 'workflow-corrupt-report-unavailable')
      const reportPointer = makeWorkflowPointer(sessionId, 'final-report', 'final')
      await writeWorkflowSessionStateFixture(sessionId, 'completed-final-report-state.json')
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          status: 'completed',
          workflowStatus: 'completed',
          activePhaseId: null,
          reportPointer,
          reportRef: reportPointer,
        }),
      ])
      const reportPath = path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions', sessionId, 'reports', 'final.json')
      await fs.mkdir(path.dirname(reportPath), { recursive: true })
      await fs.copyFile(
        path.join(process.cwd(), 'src/server/services/__fixtures__/workflow-sessions/corrupt-final-report.json'),
        reportPath,
      )
      const corruptReportBefore = await fs.readFile(reportPath, 'utf-8')

      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow/report`)
      const body = (await res.json()) as { error?: unknown; code?: unknown; message?: unknown }

      expect(res.status).toBe(404)
      expectWorkflowErrorShape(body, 'WORKFLOW_REPORT_UNAVAILABLE')
      expect(await fs.readFile(reportPath, 'utf-8')).toBe(corruptReportBefore)
      expectNoAbsolutePathLeak(body)
    })

    it('workflow resume recovery keeps old dialogue fixtures in dialogue mode', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-101010101010'
      const fixturePath = path.join(
        process.cwd(),
        'src/server/services/__fixtures__/workflow-sessions/old-dialogue-session.json',
      )
      const entries = JSON.parse(await fs.readFile(fixturePath, 'utf-8')) as Array<Record<string, unknown>>
      await writeSessionFile('-tmp-old-dialogue-fixture', sessionId, entries.map((entry) => ({
        ...entry,
        sessionId,
      })))

      const detailRes = await fetch(`${baseUrl}/api/sessions/${sessionId}`)
      expect(detailRes.status).toBe(200)
      const detail = (await detailRes.json()) as { workflow?: unknown; messages: unknown[] }
      expect('workflow' in detail).toBe(false)
      expect(detail.messages).toHaveLength(2)

      const workflowRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/workflow`)
      const workflowBody = (await workflowRes.json()) as { error?: unknown; code?: unknown; message?: unknown }
      expect(workflowRes.status).toBe(409)
      expectWorkflowErrorShape(workflowBody, 'WORKFLOW_NOT_ENABLED')
    })

    it('POST /api/sessions/:id/workflow/transition should reject dialogue sessions with a stable workflow error', async () => {
      const dialogueSessionId = 'aaaaaaaa-bbbb-cccc-dddd-040404040404'
      await writeSessionFile('-tmp-dialogue-workflow-transition-api', dialogueSessionId, [
        makeSnapshotEntry(),
        makeSessionMetaEntry(path.join(tmpDir, 'dialogue-workflow-transition-api')),
        makeUserEntry('Dialogue session should not transition workflow'),
      ])

      const res = await fetch(`${baseUrl}/api/sessions/${dialogueSessionId}/workflow/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'requirements-clarification',
          action: 'confirm',
          transitionId: 'transition-1',
        }),
      })
      const body = (await res.json()) as { error?: unknown; code?: unknown; message?: unknown }

      expect([404, 409]).toContain(res.status)
      expectWorkflowErrorShape(body, 'WORKFLOW_NOT_ENABLED')
      expectNoAbsolutePathLeak(body)
    })
  })

  it('GET /api/sessions/repository-context should return branch launch metadata', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    const res = await fetch(
      `${baseUrl}/api/sessions/repository-context?workDir=${encodeURIComponent(workDir)}`,
    )
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      state: string
      repoName: string
      currentBranch: string
      branches: Array<{ name: string; current: boolean; local: boolean }>
      worktrees: Array<{ path: string; branch: string | null; current: boolean }>
    }
    expect(body.state).toBe('ok')
    expect(body.repoName).toBe(path.basename(workDir))
    expect(body.currentBranch).toBe('main')
    expect(body.branches.some((branch) => branch.name === 'main' && branch.current)).toBe(true)
    expect(body.branches.some((branch) => branch.name === 'feature/rail' && branch.local)).toBe(true)
    const realWorkDir = await fs.realpath(workDir)
    expect(body.worktrees.some((worktree) => worktree.path === realWorkDir && worktree.current)).toBe(true)
  })

  it('GET /api/sessions/recent-projects should keep pending repository launches on the source project', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workDir,
        repository: { branch: 'feature/rail', worktree: true },
      }),
    })
    expect(createRes.status).toBe(201)

    const created = (await createRes.json()) as { workDir: string }
    const recentRes = await fetch(`${baseUrl}/api/sessions/recent-projects?limit=20`)
    expect(recentRes.status).toBe(200)

    const body = (await recentRes.json()) as {
      projects: Array<{ realPath: string; projectName: string; branch: string | null }>
    }
    const project = body.projects.find((candidate) => candidate.realPath === created.workDir)
    expect(project).toBeDefined()
    expect(project?.projectName).toBe(path.basename(workDir))
    expect(project?.branch).toBe('main')
    expect(project?.realPath).toBe(await fs.realpath(workDir))
  })

  it('GET /api/sessions/:id should return session detail', async () => {
    // Create a session file
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-api-test', sessionId, [
      makeSnapshotEntry(),
      makeUserEntry('API test message'),
      makeAssistantEntry('API test response'),
    ])

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as { id: string; title: string; messages: unknown[] }
    expect(body.id).toBe(sessionId)
    expect(body.title).toBe('API test message')
    expect(body.messages).toHaveLength(2)
  })

  it('GET /api/sessions/:id should 404 for unknown session', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/00000000-0000-0000-0000-000000000000`)
    expect(res.status).toBe(404)
  })

  it('GET /api/sessions/:id/messages should return messages', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-api-test', sessionId, [
      makeSnapshotEntry(),
      makeUserEntry('Hello'),
      makeAssistantEntry('World'),
      makeUserEntry(
        '<task-notification>\n<task-id>bg-1</task-id>\n<tool-use-id>toolu_bg</tool-use-id>\n<status>failed</status>\n<summary>Background command failed &amp; stopped</summary>\n<result>Stack trace &amp; failed assertion</result>\n<output-file>C:\\Temp\\bg.output</output-file>\n</task-notification>',
        crypto.randomUUID(),
      ),
      makeAssistantEntry('internal task response'),
    ])

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/messages`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      messages: unknown[]
      taskNotifications: unknown[]
    }
    expect(body.messages).toHaveLength(2)
    expect(JSON.stringify(body.messages)).not.toContain('<task-notification>')
    expect(body.taskNotifications).toEqual([
      {
        taskId: 'bg-1',
        toolUseId: 'toolu_bg',
        status: 'failed',
        summary: 'Background command failed & stopped',
        result: 'Stack trace & failed assertion',
        outputFile: 'C:\\Temp\\bg.output',
        timestamp: expect.any(String),
      },
    ])
  })

  it('GET /api/sessions/:id/git-info should prefer the active CLI workDir', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    const activeWorktree = path.join(tmpDir, `active-feature-rail-${Date.now()}`)
    git(workDir, 'worktree', 'add', activeWorktree, 'feature/rail')
    const { sessionId } = await sessionService.createSession(workDir)
    const sessionsMap = (conversationService as any).sessions as Map<string, { workDir: string }>

    sessionsMap.set(sessionId, { workDir: activeWorktree })
    try {
      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/git-info`)
      expect(res.status).toBe(200)

      const body = (await res.json()) as { branch: string | null; workDir: string }
      expect(body.workDir).toBe(activeWorktree)
      expect(body.branch).toBe('feature/rail')
    } finally {
      sessionsMap.delete(sessionId)
    }
  })

  it('GET /api/sessions/:id/git-info should keep the session launch branch stable', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    const { sessionId } = await sessionService.createSession(
      workDir,
      { branch: 'feature/rail', worktree: false },
    )
    const sessionsMap = (conversationService as any).sessions as Map<string, { workDir: string }>

    sessionsMap.set(sessionId, { workDir })
    git(workDir, 'switch', 'main')
    try {
      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/git-info`)
      expect(res.status).toBe(200)

      const body = (await res.json()) as { branch: string | null; workDir: string }
      expect(body.workDir).toBe(workDir)
      expect(body.branch).toBe('feature/rail')
    } finally {
      sessionsMap.delete(sessionId)
    }
  })

  it('GET /api/sessions/:id/git-info should include isolated worktree identity', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    const { sessionId } = await sessionService.createSession(
      workDir,
      { branch: 'main', worktree: true },
    )
    const launchInfo = await sessionService.getSessionLaunchInfo(sessionId)
    const repository = launchInfo?.repository
    expect(repository?.worktreePath).toBeTruthy()
    expect(repository?.worktreeBranch).toBeTruthy()

    const activeWorktree = repository!.worktreePath!
    git(workDir, 'worktree', 'add', '-b', repository!.worktreeBranch!, activeWorktree, 'main')
    const sessionsMap = (conversationService as any).sessions as Map<string, { workDir: string }>

    sessionsMap.set(sessionId, { workDir: activeWorktree })
    try {
      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/git-info`)
      expect(res.status).toBe(200)

      const body = (await res.json()) as {
        branch: string | null
        workDir: string
        worktree: {
          enabled: boolean
          path: string | null
          plannedPath: string | null
          sourceWorkDir: string | null
          slug: string | null
          branch: string | null
        } | null
      }
      expect(body.branch).toBe('main')
      expect(body.workDir).toBe(activeWorktree)
      expect(body.worktree).toEqual({
        enabled: true,
        path: activeWorktree,
        plannedPath: activeWorktree,
        sourceWorkDir: repository!.requestedWorkDir,
        slug: repository!.worktreeSlug,
        branch: repository!.worktreeBranch,
      })
    } finally {
      sessionsMap.delete(sessionId)
    }
  })

  it('GET /api/sessions/:id/git-info should use CLI worktree-state after reload', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const activeWorktree = path.join(workDir, '.claude', 'worktrees', 'desktop-main-12345678')
    git(workDir, 'worktree', 'add', '-b', 'worktree-desktop-main-12345678', activeWorktree, 'main')
    await writeSessionFile(sanitizePath(activeWorktree), sessionId, [
      makeSnapshotEntry(),
      makeSessionMetaEntry(activeWorktree),
      makeWorktreeStateEntry(sessionId, activeWorktree, {
        originalCwd: await fs.realpath(workDir),
      }),
      makeUserEntry('Hello from persisted worktree state'),
    ])

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/git-info`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      branch: string | null
      repoName: string | null
      workDir: string
      worktree: {
        enabled: boolean
        path: string | null
        plannedPath: string | null
        sourceWorkDir: string | null
        slug: string | null
        branch: string | null
      } | null
    }
    expect(body.branch).toBe('main')
    expect(body.workDir).toBe(activeWorktree)
    expect(body.worktree).toEqual({
      enabled: true,
      path: activeWorktree,
      plannedPath: activeWorktree,
      sourceWorkDir: await fs.realpath(workDir),
      slug: 'desktop-main-12345678',
      branch: 'worktree-desktop-main-12345678',
    })
  })

  it('GET /api/sessions/:id/git-info should prefer CLI worktree-state identity over desktop metadata', async () => {
    const workDir = await createCleanGitRepo(tmpDir)
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const activeWorktree = path.join(workDir, '.claude', 'worktrees', 'desktop-main-12345678')
    git(workDir, 'worktree', 'add', '-b', 'worktree-desktop-main-12345678', activeWorktree, 'main')
    await writeSessionFile(sanitizePath(activeWorktree), sessionId, [
      makeSnapshotEntry(),
      {
        type: 'session-meta',
        isMeta: true,
        workDir: activeWorktree,
        repository: {
          requestedWorkDir: '/stale/source',
          repoRoot: '/stale/source',
          branch: 'main',
          worktree: true,
          baseRef: 'main',
          worktreePath: '/stale/source/.claude/worktrees/stale',
          worktreeBranch: 'worktree-stale',
          worktreeSlug: 'stale',
        },
        timestamp: '2026-01-01T00:00:00.000Z',
      },
      makeWorktreeStateEntry(sessionId, activeWorktree, {
        originalCwd: await fs.realpath(workDir),
      }),
      makeUserEntry('Hello from persisted worktree state'),
    ])

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/git-info`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      branch: string | null
      worktree: {
        path: string | null
        plannedPath: string | null
        sourceWorkDir: string | null
        slug: string | null
        branch: string | null
      } | null
    }
    expect(body.branch).toBe('main')
    expect(body.worktree).toMatchObject({
      path: activeWorktree,
      plannedPath: activeWorktree,
      sourceWorkDir: await fs.realpath(workDir),
      slug: 'desktop-main-12345678',
      branch: 'worktree-desktop-main-12345678',
    })
  })

  it('DELETE /api/sessions/:id should delete the session', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-api-test', sessionId, [makeSnapshotEntry()])

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}`, { method: 'DELETE' })
    expect(res.status).toBe(200)

    // Verify it's gone
    const res2 = await fetch(`${baseUrl}/api/sessions/${sessionId}`)
    expect(res2.status).toBe(404)
  })

  it('DELETE /api/sessions/:id should remove matching IM adapter session mappings', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const otherSessionId = 'ffffffff-1111-2222-3333-ffffffffffff'
    await writeSessionFile('-tmp-api-test', sessionId, [makeSnapshotEntry()])
    await fs.writeFile(
      path.join(tmpDir, 'adapter-sessions.json'),
      JSON.stringify({
        'wechat-chat': {
          sessionId,
          workDir: '/tmp/project-a',
          updatedAt: 1,
        },
        'wechat-chat-2': {
          sessionId,
          workDir: '/tmp/project-b',
          updatedAt: 2,
        },
        'other-chat': {
          sessionId: otherSessionId,
          workDir: '/tmp/project-c',
          updatedAt: 3,
        },
      }, null, 2),
      'utf-8',
    )

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}`, { method: 'DELETE' })
    expect(res.status).toBe(200)

    const persisted = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'adapter-sessions.json'), 'utf-8'),
    )
    expect(persisted['wechat-chat']).toBeUndefined()
    expect(persisted['wechat-chat-2']).toBeUndefined()
    expect(persisted['other-chat'].sessionId).toBe(otherSessionId)
  })

  it('DELETE /api/sessions/:id should roll back the deleted marker when file deletion fails', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-api-test', sessionId, [makeSnapshotEntry()])

    const originalDeleteSession = sessionService.deleteSession.bind(sessionService)
    sessionService.deleteSession = (async (targetSessionId: string) => {
      if (targetSessionId === sessionId) {
        throw new Error('simulated unlink failure')
      }
      return originalDeleteSession(targetSessionId)
    }) as typeof sessionService.deleteSession

    try {
      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}`, { method: 'DELETE' })
      expect(res.status).toBe(500)
      expect((conversationService as any).deletedSessions.has(sessionId)).toBe(false)

      const detailRes = await fetch(`${baseUrl}/api/sessions/${sessionId}`)
      expect(detailRes.status).toBe(200)
    } finally {
      sessionService.deleteSession = originalDeleteSession as typeof sessionService.deleteSession
      conversationService.unmarkSessionDeleted(sessionId)
    }
  })

  it('POST /api/sessions/batch-delete should delete sessions and clean adapter mappings', async () => {
    const sessionIdA = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const sessionIdB = 'ffffffff-1111-2222-3333-ffffffffffff'
    const otherSessionId = '99999999-1111-2222-3333-999999999999'
    await writeSessionFile('-tmp-api-test', sessionIdA, [makeSnapshotEntry()])
    await writeSessionFile('-tmp-api-test', sessionIdB, [makeSnapshotEntry()])
    await fs.writeFile(
      path.join(tmpDir, 'adapter-sessions.json'),
      JSON.stringify({
        'wechat-chat-a': {
          sessionId: sessionIdA,
          workDir: '/tmp/project-a',
          updatedAt: 1,
        },
        'wechat-chat-b': {
          sessionId: sessionIdB,
          workDir: '/tmp/project-b',
          updatedAt: 2,
        },
        'other-chat': {
          sessionId: otherSessionId,
          workDir: '/tmp/project-c',
          updatedAt: 3,
        },
      }, null, 2),
      'utf-8',
    )

    const res = await fetch(`${baseUrl}/api/sessions/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionIds: [sessionIdA, sessionIdB] }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      successes: [sessionIdA, sessionIdB],
      failures: [],
    })

    expect((await fetch(`${baseUrl}/api/sessions/${sessionIdA}`)).status).toBe(404)
    expect((await fetch(`${baseUrl}/api/sessions/${sessionIdB}`)).status).toBe(404)
    const persisted = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'adapter-sessions.json'), 'utf-8'),
    )
    expect(persisted['wechat-chat-a']).toBeUndefined()
    expect(persisted['wechat-chat-b']).toBeUndefined()
    expect(persisted['other-chat'].sessionId).toBe(otherSessionId)
  })

  it('POST /api/sessions/batch-delete should report partial failures and roll back failed delete markers', async () => {
    const successSessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const failedSessionId = 'ffffffff-1111-2222-3333-ffffffffffff'
    await writeSessionFile('-tmp-api-test', successSessionId, [makeSnapshotEntry()])
    await writeSessionFile('-tmp-api-test', failedSessionId, [makeSnapshotEntry()])

    const originalDeleteSession = sessionService.deleteSession.bind(sessionService)
    sessionService.deleteSession = (async (targetSessionId: string) => {
      if (targetSessionId === failedSessionId) {
        throw new Error('simulated batch unlink failure')
      }
      return originalDeleteSession(targetSessionId)
    }) as typeof sessionService.deleteSession

    try {
      const res = await fetch(`${baseUrl}/api/sessions/batch-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds: [successSessionId, failedSessionId] }),
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        ok: false,
        successes: [successSessionId],
        failures: [{
          sessionId: failedSessionId,
          message: 'simulated batch unlink failure',
        }],
      })
      expect((conversationService as any).deletedSessions.has(failedSessionId)).toBe(false)
      expect((await fetch(`${baseUrl}/api/sessions/${successSessionId}`)).status).toBe(404)
      expect((await fetch(`${baseUrl}/api/sessions/${failedSessionId}`)).status).toBe(200)
    } finally {
      sessionService.deleteSession = originalDeleteSession as typeof sessionService.deleteSession
      conversationService.unmarkSessionDeleted(successSessionId)
      conversationService.unmarkSessionDeleted(failedSessionId)
    }
  })

  it('PATCH /api/sessions/:id should rename the session', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-api-test', sessionId, [
      makeSnapshotEntry(),
      makeUserEntry('Old title message'),
    ])

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Custom Title' }),
    })
    expect(res.status).toBe(200)

    // Verify new title
    const detailRes = await fetch(`${baseUrl}/api/sessions/${sessionId}`)
    const detail = (await detailRes.json()) as { title: string }
    expect(detail.title).toBe('New Custom Title')
  })

  it('GET /api/sessions/:id/slash-commands should include user and project skills before CLI init', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const workDir = path.join(tmpDir, 'workspace', 'app')

    await fs.mkdir(path.join(workDir, '.claude', 'skills'), { recursive: true })
    await fs.mkdir(path.join(tmpDir, 'skills'), { recursive: true })
    await writeSkill(path.join(tmpDir, 'skills'), 'user-skill', 'User skill description')
    await writeSkill(path.join(workDir, '.claude', 'skills'), 'project-skill', 'Project skill description')

    await writeSessionFile('-tmp-api-test', sessionId, [
      makeSnapshotEntry(),
      makeSessionMetaEntry(workDir),
    ])

    clearCommandsCache()

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/slash-commands`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      commands: Array<{ name: string; description: string }>
    }

    expect(body.commands).toContainEqual(
      expect.objectContaining({ name: 'user-skill', description: 'User skill description' }),
    )
    expect(body.commands).toContainEqual(
      expect.objectContaining({ name: 'project-skill', description: 'Project skill description' }),
    )
  })

  it('GET /api/sessions/:id/slash-commands should include legacy custom commands before CLI init', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeef'
    const workDir = path.join(tmpDir, 'workspace', 'app')

    await writeLegacySlashCommand(
      path.join(tmpDir, 'commands'),
      'user-probe',
      'User custom slash command',
    )
    await writeLegacySlashCommand(
      path.join(workDir, '.claude', 'commands'),
      'project-probe',
      'Project custom slash command',
    )

    await writeSessionFile('-tmp-api-test', sessionId, [
      makeSnapshotEntry(),
      makeSessionMetaEntry(workDir),
    ])

    clearCommandsCache()

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/slash-commands`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      commands: Array<{ name: string; description: string; argumentHint?: string }>
    }

    expect(body.commands).toContainEqual(
      expect.objectContaining({
        name: 'user-probe',
        description: 'User custom slash command',
        argumentHint: '<topic>',
      }),
    )
    expect(body.commands).toContainEqual(
      expect.objectContaining({
        name: 'project-probe',
        description: 'Project custom slash command',
        argumentHint: '<topic>',
      }),
    )
  })

  it('GET /api/sessions/:id/slash-commands should preserve cached command argument hints when merging custom commands', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeef001'
    const workDir = path.join(tmpDir, 'workspace', 'app')

    await writeLegacySlashCommand(
      path.join(workDir, '.claude', 'commands'),
      'project-probe',
      'Project custom slash command',
    )

    await writeSessionFile('-tmp-api-test', sessionId, [
      makeSnapshotEntry(),
      makeSessionMetaEntry(workDir),
    ])

    updateSessionSlashCommands(
      sessionId,
      [{ name: 'builtin-probe', description: 'Cached CLI command', argumentHint: '<value>' }],
      { notifyClient: false },
    )
    clearCommandsCache()

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/slash-commands`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      commands: Array<{ name: string; description: string; argumentHint?: string }>
    }

    expect(body.commands).toContainEqual({
      name: 'builtin-probe',
      description: 'Cached CLI command',
      argumentHint: '<value>',
    })
    expect(body.commands).toContainEqual(
      expect.objectContaining({
        name: 'project-probe',
        description: 'Project custom slash command',
      }),
    )
  })

  it('GET /api/sessions/:id/slash-commands should include enabled plugin skills before CLI init', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff'
    const workDir = path.join(tmpDir, 'workspace', 'app')
    const marketplaceRoot = path.join(tmpDir, 'marketplace-root')
    const pluginRoot = path.join(marketplaceRoot, 'plugins', 'superpowers')
    const pluginsDir = path.join(tmpDir, 'plugins')
    const marketplaceFile = path.join(
      marketplaceRoot,
      '.claude-plugin',
      'marketplace.json',
    )

    await fs.mkdir(path.join(pluginRoot, '.claude-plugin'), { recursive: true })
    await fs.mkdir(path.dirname(marketplaceFile), { recursive: true })
    await fs.mkdir(pluginsDir, { recursive: true })
    await fs.mkdir(workDir, { recursive: true })
    await writeSkill(
      path.join(pluginRoot, 'skills'),
      'brainstorming',
      'Superpowers brainstorming skill',
    )
    await fs.writeFile(
      path.join(pluginRoot, '.claude-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'superpowers',
        version: '5.0.7',
        description: 'Core skills library',
      }),
      'utf-8',
    )
    await fs.writeFile(
      marketplaceFile,
      JSON.stringify({
        name: 'claude-plugins-official',
        owner: { name: 'Test' },
        plugins: [
          {
            name: 'superpowers',
            source: './plugins/superpowers',
            version: '5.0.7',
          },
        ],
      }),
      'utf-8',
    )
    await fs.writeFile(
      path.join(pluginsDir, 'known_marketplaces.json'),
      JSON.stringify({
        'claude-plugins-official': {
          source: { source: 'directory', path: marketplaceRoot },
          installLocation: marketplaceRoot,
          lastUpdated: new Date(0).toISOString(),
        },
      }),
      'utf-8',
    )
    await fs.writeFile(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({
        enabledPlugins: {
          'superpowers@claude-plugins-official': true,
        },
      }),
      'utf-8',
    )

    resetSettingsCache()
    clearPluginCache('sessions-api-plugin-skills')
    clearCommandsCache()
    await writeSessionFile('-tmp-api-test', sessionId, [
      makeSnapshotEntry(),
      makeSessionMetaEntry(workDir),
    ])

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/slash-commands`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      commands: Array<{ name: string; description: string }>
    }

    expect(body.commands).toContainEqual(
      expect.objectContaining({
        name: 'superpowers:brainstorming',
        description: 'Superpowers brainstorming skill',
      }),
    )
  })

  it('GET /api/sessions/:id/workspace/status|tree|file|diff should return workspace data', async () => {
    const workDir = await createWorkspaceApiGitRepo(tmpDir)
    const { sessionId } = await service.createSession(workDir)

    const statusRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/workspace/status`)
    expect(statusRes.status).toBe(200)
    const statusBody = await statusRes.json() as {
      state: string
      workDir: string
      changedFiles: Array<{ path: string; status: string }>
      isGitRepo: boolean
    }
    expect(statusBody.state).toBe('ok')
    expect(statusBody.workDir).toBe(await fs.realpath(workDir))
    expect(statusBody.isGitRepo).toBe(true)
    expect(statusBody.changedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'tracked.txt', status: 'modified' }),
      ]),
    )

    const treeRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/workspace/tree`)
    expect(treeRes.status).toBe(200)
    const treeBody = await treeRes.json() as {
      state: string
      path: string
      entries: Array<{ name: string; path: string; isDirectory: boolean }>
    }
    expect(treeBody).toMatchObject({
      state: 'ok',
      path: '',
    })
    expect(treeBody.entries).toEqual([
      { name: 'src', path: 'src', isDirectory: true },
      { name: 'tracked.txt', path: 'tracked.txt', isDirectory: false },
    ])

    const fileRes = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/workspace/file?path=${encodeURIComponent('src/app.ts')}`,
    )
    expect(fileRes.status).toBe(200)
    const fileBody = await fileRes.json() as {
      state: string
      path: string
      content?: string
      language: string
      size: number
    }
    expect(fileBody).toMatchObject({
      state: 'ok',
      path: 'src/app.ts',
      language: 'typescript',
      size: 25,
      content: 'export const answer = 42\n',
    })

    const diffRes = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/workspace/diff?path=${encodeURIComponent('tracked.txt')}`,
    )
    expect(diffRes.status).toBe(200)
    const diffBody = await diffRes.json() as {
      state: string
      path: string
      diff?: string
    }
    expect(diffBody.state).toBe('ok')
    expect(diffBody.path).toBe('tracked.txt')
    expect(diffBody.diff).toContain('tracked.txt')
  })

  it('GET /api/sessions/:id/workspace/* should surface transcript changes for a non-git tmp session', async () => {
    const sessionId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'
    const workDir = await fs.mkdtemp(path.join(tmpDir, 'workspace-api-non-git-'))
    const srcDir = path.join(workDir, 'src')
    const notesDir = path.join(workDir, 'notes')
    const assetsDir = path.join(workDir, 'assets')

    await fs.mkdir(srcDir, { recursive: true })
    await fs.mkdir(notesDir, { recursive: true })
    await fs.mkdir(assetsDir, { recursive: true })
    await fs.writeFile(path.join(workDir, 'README.md'), '# Temporary project\n')
    await fs.writeFile(path.join(srcDir, 'app.ts'), 'export const answer = 2\n')
    await fs.writeFile(path.join(notesDir, 'todo.md'), '- ship workspace panel\n')
    await fs.writeFile(
      path.join(assetsDir, 'pixel.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
        'base64',
      ),
    )

    await writeSessionFile(sanitizePath(workDir), sessionId, [
      makeSnapshotEntry(),
      makeSessionMetaEntry(workDir),
      makeUserEntry('Update this temporary project'),
      makeAssistantToolUseEntry([
        {
          id: 'toolu-edit-app',
          name: 'Edit',
          input: {
            file_path: path.join(workDir, 'src', 'app.ts'),
            old_string: 'export const answer = 1\n',
            new_string: 'export const answer = 2\n',
          },
        },
        {
          id: 'toolu-write-todo',
          name: 'Write',
          input: {
            file_path: path.join(workDir, 'notes', 'todo.md'),
            content: '- ship workspace panel\n',
          },
        },
      ]),
    ])

    const statusRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/workspace/status`)
    expect(statusRes.status).toBe(200)
    const statusBody = await statusRes.json() as {
      state: string
      workDir: string
      repoName: string | null
      branch: string | null
      isGitRepo: boolean
      changedFiles: Array<{
        path: string
        status: string
        additions: number
        deletions: number
      }>
    }
    expect(statusBody).toMatchObject({
      state: 'ok',
      workDir,
      repoName: path.basename(workDir),
      branch: null,
      isGitRepo: false,
    })
    expect(statusBody.changedFiles).toEqual([
      expect.objectContaining({
        path: 'notes/todo.md',
        status: 'added',
        additions: 1,
        deletions: 0,
      }),
      expect.objectContaining({
        path: 'src/app.ts',
        status: 'modified',
        additions: 1,
        deletions: 1,
      }),
    ])

    const treeRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/workspace/tree`)
    expect(treeRes.status).toBe(200)
    const treeBody = await treeRes.json() as {
      state: string
      path: string
      entries: Array<{ name: string; path: string; isDirectory: boolean }>
    }
    expect(treeBody).toMatchObject({ state: 'ok', path: '' })
    expect(treeBody.entries).toEqual([
      { name: 'assets', path: 'assets', isDirectory: true },
      { name: 'notes', path: 'notes', isDirectory: true },
      { name: 'src', path: 'src', isDirectory: true },
      { name: 'README.md', path: 'README.md', isDirectory: false },
    ])

    const srcTreeRes = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/workspace/tree?path=${encodeURIComponent('src')}`,
    )
    expect(srcTreeRes.status).toBe(200)
    expect(await srcTreeRes.json()).toMatchObject({
      state: 'ok',
      path: 'src',
      entries: [{ name: 'app.ts', path: 'src/app.ts', isDirectory: false }],
    })

    const fileRes = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/workspace/file?path=${encodeURIComponent('src/app.ts')}`,
    )
    expect(fileRes.status).toBe(200)
    expect(await fileRes.json()).toMatchObject({
      state: 'ok',
      path: 'src/app.ts',
      previewType: 'text',
      language: 'typescript',
      content: 'export const answer = 2\n',
    })

    const imageRes = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/workspace/file?path=${encodeURIComponent('assets/pixel.png')}`,
    )
    expect(imageRes.status).toBe(200)
    const imageBody = await imageRes.json() as {
      state: string
      path: string
      previewType: string
      mimeType: string
      dataUrl: string
    }
    expect(imageBody).toMatchObject({
      state: 'ok',
      path: 'assets/pixel.png',
      previewType: 'image',
      mimeType: 'image/png',
    })
    expect(imageBody.dataUrl).toStartWith('data:image/png;base64,')

    const appDiffRes = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/workspace/diff?path=${encodeURIComponent('src/app.ts')}`,
    )
    expect(appDiffRes.status).toBe(200)
    const appDiffBody = await appDiffRes.json() as { state: string; path: string; diff?: string }
    expect(appDiffBody).toMatchObject({ state: 'ok', path: 'src/app.ts' })
    expect(appDiffBody.diff).toContain('diff --session a/src/app.ts b/src/app.ts')
    expect(appDiffBody.diff).toContain('-export const answer = 1')
    expect(appDiffBody.diff).toContain('+export const answer = 2')

    const todoDiffRes = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/workspace/diff?path=${encodeURIComponent('notes/todo.md')}`,
    )
    expect(todoDiffRes.status).toBe(200)
    const todoDiffBody = await todoDiffRes.json() as { state: string; path: string; diff?: string }
    expect(todoDiffBody).toMatchObject({ state: 'ok', path: 'notes/todo.md' })
    expect(todoDiffBody.diff).toContain('--- /dev/null')
    expect(todoDiffBody.diff).toContain('+++ b/notes/todo.md')
    expect(todoDiffBody.diff).toContain('+- ship workspace panel')
  })

  it('GET /api/sessions/:id/workspace/* should surface file-history changes for a non-git generated subdirectory', async () => {
    const sessionId = crypto.randomUUID()
    const workDir = path.join(tmpDir, 'workspace-file-history-generated')
    const generatedFile = path.join(workDir, 'aacc', 'src', 'App.tsx')
    const userId = crypto.randomUUID()

    await fs.mkdir(path.dirname(generatedFile), { recursive: true })
    await fs.writeFile(
      generatedFile,
      'export default function App() { return <main>Tetris</main> }\n',
      'utf-8',
    )

    await writeSessionFile(sanitizePath(workDir), sessionId, [
      makeSessionMetaEntry(workDir),
      makeFileHistorySnapshotEntry(userId, {
        'aacc/src/App.tsx': {
          backupFileName: null,
          version: 1,
          backupTime: '2026-01-01T00:00:00.000Z',
        },
      }),
      {
        ...makeUserEntry('create aacc project', userId),
        cwd: workDir,
        sessionId,
      },
      makeAssistantEntry('DONE', userId),
      makeUserEntry(
        '<task-notification>\n<task-id>bg-1</task-id>\n<tool-use-id>toolu_bg</tool-use-id>\n<status>completed</status>\n<summary>Background command completed</summary>\n</task-notification>',
        crypto.randomUUID(),
      ),
      makeAssistantEntry('Background task completed again, no action needed'),
    ])

    const statusRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/workspace/status`)
    expect(statusRes.status).toBe(200)
    const statusBody = await statusRes.json() as {
      state: string
      workDir: string
      isGitRepo: boolean
      changedFiles: Array<{
        path: string
        status: string
        additions: number
        deletions: number
      }>
    }
    expect(statusBody).toMatchObject({
      state: 'ok',
      workDir,
      isGitRepo: false,
    })
    expect(statusBody.changedFiles).toEqual([
      expect.objectContaining({
        path: 'aacc/src/App.tsx',
        status: 'added',
        additions: 1,
        deletions: 0,
      }),
    ])

    const diffRes = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/workspace/diff?path=${encodeURIComponent('aacc/src/App.tsx')}`,
    )
    expect(diffRes.status).toBe(200)
    const diffBody = await diffRes.json() as {
      state: string
      path: string
      diff: string
    }
    expect(diffBody).toMatchObject({
      state: 'ok',
      path: 'aacc/src/App.tsx',
    })
    expect(diffBody.diff).toContain('diff --session /dev/null b/aacc/src/App.tsx')
    expect(diffBody.diff).toContain('+export default function App() { return <main>Tetris</main> }')

    const checkpointsRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/turn-checkpoints`)
    expect(checkpointsRes.status).toBe(200)
    const checkpointsBody = await checkpointsRes.json() as {
      checkpoints: Array<{
        target: {
          targetUserMessageId: string
          userMessageIndex: number
          userMessageCount: number
        }
        code: {
          filesChanged: string[]
        }
      }>
    }
    expect(checkpointsBody.checkpoints).toHaveLength(1)
    expect(checkpointsBody.checkpoints[0]?.target).toMatchObject({
      targetUserMessageId: userId,
      userMessageIndex: 0,
      userMessageCount: 1,
    })
    expect(checkpointsBody.checkpoints[0]?.code.filesChanged).toEqual([generatedFile])
  })

  it('GET /api/sessions/:id/workspace/file and diff should require a path query', async () => {
    const workDir = await createWorkspaceApiGitRepo(tmpDir)
    const { sessionId } = await service.createSession(workDir)

    for (const route of ['file', 'diff']) {
      const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workspace/${route}`)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({
        error: 'BAD_REQUEST',
      })
    }
  })

  it('GET /api/sessions/:id/workspace/file and tree should reject traversal with 403', async () => {
    const workDir = await createWorkspaceApiGitRepo(tmpDir)
    const { sessionId } = await service.createSession(workDir)

    for (const route of ['file', 'tree']) {
      const res = await fetch(
        `${baseUrl}/api/sessions/${sessionId}/workspace/${route}?path=${encodeURIComponent('../outside.txt')}`,
      )
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({
        error: 'FORBIDDEN',
      })
    }
  })

  it('GET /api/sessions/:id/workspace/diff should reject traversal with 403', async () => {
    const workDir = await createWorkspaceApiGitRepo(tmpDir)
    const { sessionId } = await service.createSession(workDir)

    const res = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/workspace/diff?path=${encodeURIComponent('../outside.txt')}`,
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({
      error: 'FORBIDDEN',
    })
  })

  it('GET /api/sessions/:id/workspace/status should 404 for unknown sessions', async () => {
    const res = await fetch(
      `${baseUrl}/api/sessions/00000000-0000-0000-0000-000000000000/workspace/status`,
    )
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({
      error: 'NOT_FOUND',
    })
  })

  it('non-GET workspace routes should return 405', async () => {
    const workDir = await createWorkspaceApiGitRepo(tmpDir)
    const { sessionId } = await service.createSession(workDir)

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/workspace/status`, {
      method: 'POST',
    })

    expect(res.status).toBe(405)
    expect(await res.json()).toMatchObject({
      error: 'METHOD_NOT_ALLOWED',
    })
  })

  it('POST /api/sessions/:id/rewind should preview and trim the active conversation chain', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const firstUserId = crypto.randomUUID()
    const firstAssistantId = crypto.randomUUID()
    const secondUserId = crypto.randomUUID()
    const secondAssistantId = crypto.randomUUID()

    await writeSessionFile('-tmp-api-test', sessionId, [
      makeSnapshotEntry(),
      {
        parentUuid: null,
        isSidechain: false,
        type: 'user',
        message: { role: 'user', content: 'first prompt' },
        uuid: firstUserId,
        timestamp: '2026-01-01T00:01:00.000Z',
        userType: 'external',
        cwd: '/tmp/test',
        sessionId,
      },
      {
        parentUuid: firstUserId,
        isSidechain: false,
        type: 'assistant',
        message: {
          model: 'claude-opus-4-7',
          id: `msg_${crypto.randomUUID().slice(0, 20)}`,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'first reply' }],
        },
        uuid: firstAssistantId,
        timestamp: '2026-01-01T00:02:00.000Z',
      },
      {
        parentUuid: firstAssistantId,
        isSidechain: false,
        type: 'user',
        message: { role: 'user', content: 'second prompt' },
        uuid: secondUserId,
        timestamp: '2026-01-01T00:03:00.000Z',
        userType: 'external',
        cwd: '/tmp/test',
        sessionId,
      },
      {
        parentUuid: secondUserId,
        isSidechain: false,
        type: 'assistant',
        message: {
          model: 'claude-opus-4-7',
          id: `msg_${crypto.randomUUID().slice(0, 20)}`,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'second reply' }],
        },
        uuid: secondAssistantId,
        timestamp: '2026-01-01T00:04:00.000Z',
      },
    ])

    const previewRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 1, dryRun: true }),
    })
    expect(previewRes.status).toBe(200)

    const previewBody = await previewRes.json() as {
      conversation: { messagesRemoved: number }
      code: { available: boolean }
    }
    expect(previewBody.conversation.messagesRemoved).toBe(2)
    expect(previewBody.code.available).toBe(false)

    const executeRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 1 }),
    })
    expect(executeRes.status).toBe(200)

    const executeBody = await executeRes.json() as {
      conversation: { messagesRemoved: number; removedMessageIds: string[] }
    }
    expect(executeBody.conversation.messagesRemoved).toBe(2)
    expect(executeBody.conversation.removedMessageIds).toEqual([
      secondUserId,
      secondAssistantId,
    ])

    const remainingMessages = await service.getSessionMessages(sessionId)
    expect(remainingMessages.map((message) => message.id)).toEqual([
      firstUserId,
      firstAssistantId,
    ])
  })

  it('trimSessionMessagesFrom should remove orphan transcript entries beyond the rewind point', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const firstUserId = crypto.randomUUID()
    const firstAssistantId = crypto.randomUUID()
    const secondUserId = crypto.randomUUID()
    const secondAssistantId = crypto.randomUUID()

    const filePath = await writeSessionFile('-tmp-api-rewind-orphans', sessionId, [
      makeSnapshotEntry(),
      makeSessionMetaEntry('/tmp/project-with-hyphen'),
      {
        ...makeUserEntry('first prompt', firstUserId),
        sessionId,
      },
      {
        ...makeAssistantEntry('first reply', firstUserId),
        uuid: firstAssistantId,
      },
      {
        ...makeUserEntry('second prompt', secondUserId),
        parentUuid: firstAssistantId,
        sessionId,
      },
      {
        ...makeAssistantEntry('second reply', secondUserId),
        uuid: secondAssistantId,
      },
      {
        ...makeAssistantEntry('late stale reply', secondUserId),
        uuid: crypto.randomUUID(),
      },
    ])

    const result = await service.trimSessionMessagesFrom(sessionId, firstUserId)
    expect(result.removedMessageIds).toContain(firstUserId)
    expect(result.removedMessageIds).toContain(secondUserId)

    const raw = await fs.readFile(filePath, 'utf-8')
    expect(raw).toContain('"type":"session-meta"')
    expect(raw).not.toContain('late stale reply')
    expect(await service.getSessionMessages(sessionId)).toEqual([])

    const launchInfo = await service.getSessionLaunchInfo(sessionId)
    expect(launchInfo).not.toBeNull()
    expect(launchInfo!.workDir).toBe('/tmp/project-with-hyphen')
    expect(launchInfo!.transcriptMessageCount).toBe(0)
  })

  it('POST /api/sessions/:id/rewind should target the selected message id instead of a shifted visible index', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff'
    const firstUserId = crypto.randomUUID()
    const firstAssistantId = crypto.randomUUID()
    const hiddenUserId = crypto.randomUUID()
    const targetUserId = crypto.randomUUID()
    const targetAssistantId = crypto.randomUUID()

    await writeSessionFile('-tmp-api-rewind-id-target', sessionId, [
      makeSnapshotEntry(),
      makeUserEntry('first prompt', firstUserId),
      {
        ...makeAssistantEntry('first reply', firstUserId),
        uuid: firstAssistantId,
      },
      makeUserEntry(
        '<teammate-message teammate_id="reviewer">internal status that the main chat hides</teammate-message>',
        hiddenUserId,
      ),
      makeUserEntry('second visible prompt', targetUserId),
      {
        ...makeAssistantEntry('second reply', targetUserId),
        uuid: targetAssistantId,
      },
    ])

    const executeRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessageIndex: 1,
        targetUserMessageId: targetUserId,
        expectedContent: 'second visible prompt',
      }),
    })
    expect(executeRes.status).toBe(200)

    const executeBody = await executeRes.json() as {
      target: { targetUserMessageId: string; userMessageIndex: number }
      conversation: { messagesRemoved: number; removedMessageIds: string[] }
    }
    expect(executeBody.target.targetUserMessageId).toBe(targetUserId)
    expect(executeBody.target.userMessageIndex).toBe(2)
    expect(executeBody.conversation.messagesRemoved).toBe(2)
    expect(executeBody.conversation.removedMessageIds).toEqual([
      targetUserId,
      targetAssistantId,
    ])

    const remainingMessages = await service.getSessionMessages(sessionId)
    expect(remainingMessages.map((message) => message.id)).toEqual([
      firstUserId,
      firstAssistantId,
      hiddenUserId,
    ])
  })

  it('POST /api/sessions/:id/rewind should reject an index fallback when the selected prompt no longer matches', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-000000000000'
    const firstUserId = crypto.randomUUID()
    const hiddenUserId = crypto.randomUUID()
    const targetUserId = crypto.randomUUID()

    await writeSessionFile('-tmp-api-rewind-index-guard', sessionId, [
      makeSnapshotEntry(),
      makeUserEntry('first prompt', firstUserId),
      makeUserEntry(
        '<teammate-message teammate_id="reviewer">internal status that the main chat hides</teammate-message>',
        hiddenUserId,
      ),
      makeUserEntry('second visible prompt', targetUserId),
    ])

    const executeRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessageIndex: 1,
        expectedContent: 'second visible prompt',
      }),
    })
    expect(executeRes.status).toBe(400)

    const body = await executeRes.json() as { message: string }
    expect(body.message).toContain('does not match the selected prompt')

    const remainingMessages = await service.getSessionMessages(sessionId)
    expect(remainingMessages.map((message) => message.id)).toEqual([
      firstUserId,
      hiddenUserId,
      targetUserId,
    ])
  })

  it('POST /api/sessions/:id/rewind should restore a single edited file', async () => {
    const sessionId = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'
    const workDir = path.join(tmpDir, 'single-file-fixture')
    const targetFile = path.join(workDir, 'src', 'app.js')
    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    const backupName = 'single-file@v1'

    await fs.mkdir(path.dirname(targetFile), { recursive: true })
    await fs.writeFile(
      targetFile,
      "export const ORIGINAL_VALUE = 'after-rewind'\n",
      'utf-8',
    )
    await writeFileHistoryBackup(
      sessionId,
      backupName,
      "export const ORIGINAL_VALUE = 'before-rewind'\n",
    )

    await writeSessionFile('-tmp-api-single-file', sessionId, [
      makeSessionMetaEntry(workDir),
      makeFileHistorySnapshotEntry(userId, {
        'src/app.js': {
          backupFileName: backupName,
          version: 1,
          backupTime: '2026-01-01T00:00:00.000Z',
        },
      }),
      {
        ...makeUserEntry('edit app.js', userId),
        cwd: workDir,
        sessionId,
      },
      {
        ...makeAssistantEntry('DONE', userId),
        uuid: assistantId,
      },
    ])

    const previewRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 0, dryRun: true }),
    })
    expect(previewRes.status).toBe(200)
    const preview = await previewRes.json() as {
      code: { available: boolean; filesChanged: string[] }
    }
    expect(preview.code.available).toBe(true)
    expect(preview.code.filesChanged).toEqual([targetFile])

    const executeRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 0 }),
    })
    expect(executeRes.status).toBe(200)
    expect(await fs.readFile(targetFile, 'utf-8')).toBe(
      "export const ORIGINAL_VALUE = 'before-rewind'\n",
    )

    const remainingMessages = await service.getSessionMessages(sessionId)
    expect(remainingMessages).toHaveLength(0)
  })

  it('POST /api/sessions/:id/rewind should resolve checkpoint paths from the target prompt cwd', async () => {
    const sessionId = 'bbbbbbbb-bbbb-cccc-dddd-ffffffffffff'
    const parentDir = path.join(tmpDir, 'nested-cwd-parent')
    const workDir = path.join(parentDir, 'testbb')
    const targetFile = path.join(workDir, 'vite.config.js')
    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    const laterUserId = crypto.randomUUID()
    const backupName = 'nested-cwd@v1'

    await fs.mkdir(workDir, { recursive: true })
    await fs.writeFile(targetFile, "export default 'after'\n", 'utf-8')
    await writeFileHistoryBackup(sessionId, backupName, "export default 'before'\n")

    await writeSessionFile(sanitizePath(parentDir), sessionId, [
      makeFileHistorySnapshotEntry(userId, {
        'testbb/vite.config.js': {
          backupFileName: backupName,
          version: 1,
          backupTime: '2026-01-01T00:00:00.000Z',
        },
      }),
      {
        ...makeUserEntry('create a nested project', userId),
        cwd: parentDir,
        sessionId,
      },
      {
        ...makeAssistantEntry('DONE', userId),
        uuid: assistantId,
      },
      {
        ...makeUserEntry('latest tool result after cd', laterUserId),
        cwd: workDir,
        sessionId,
      },
    ])

    const previewRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 0, dryRun: true }),
    })
    expect(previewRes.status).toBe(200)
    const preview = await previewRes.json() as {
      code: { available: boolean; filesChanged: string[] }
    }
    expect(preview.code.available).toBe(true)
    expect(preview.code.filesChanged).toEqual([targetFile])

    const executeRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 0 }),
    })
    expect(executeRes.status).toBe(200)
    expect(await fs.readFile(targetFile, 'utf-8')).toBe("export default 'before'\n")
  })

  it('POST /api/sessions/:id/rewind should restore multiple files and remove created files', async () => {
    const sessionId = 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee'
    const workDir = path.join(tmpDir, 'multi-file-fixture')
    const appFile = path.join(workDir, 'src', 'app.js')
    const readmeFile = path.join(workDir, 'README.md')
    const createdFile = path.join(workDir, 'notes', 'generated.txt')
    const userId = crypto.randomUUID()
    const backupApp = 'multi-app@v1'
    const backupReadme = 'multi-readme@v1'

    await fs.mkdir(path.dirname(appFile), { recursive: true })
    await fs.mkdir(path.dirname(createdFile), { recursive: true })
    await fs.writeFile(appFile, "export const VALUE = 'edited'\n", 'utf-8')
    await fs.writeFile(readmeFile, '# changed\n', 'utf-8')
    await fs.writeFile(createdFile, 'new file\n', 'utf-8')
    await writeFileHistoryBackup(sessionId, backupApp, "export const VALUE = 'original'\n")
    await writeFileHistoryBackup(sessionId, backupReadme, '# original\n')

    await writeSessionFile('-tmp-api-multi-file', sessionId, [
      makeSessionMetaEntry(workDir),
      makeFileHistorySnapshotEntry(userId, {
        'src/app.js': {
          backupFileName: backupApp,
          version: 1,
          backupTime: '2026-01-01T00:00:00.000Z',
        },
        'README.md': {
          backupFileName: backupReadme,
          version: 1,
          backupTime: '2026-01-01T00:00:00.000Z',
        },
        'notes/generated.txt': {
          backupFileName: null,
          version: 1,
          backupTime: '2026-01-01T00:00:00.000Z',
        },
      }),
      {
        ...makeUserEntry('edit multiple files', userId),
        cwd: workDir,
        sessionId,
      },
      makeAssistantEntry('DONE', userId),
    ])

    const previewRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 0, dryRun: true }),
    })
    expect(previewRes.status).toBe(200)
    const preview = await previewRes.json() as {
      code: { available: boolean; filesChanged: string[] }
    }
    expect(preview.code.available).toBe(true)
    expect(preview.code.filesChanged.sort()).toEqual([
      appFile,
      createdFile,
      readmeFile,
    ].sort())

    const executeRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 0 }),
    })
    expect(executeRes.status).toBe(200)

    expect(await fs.readFile(appFile, 'utf-8')).toBe("export const VALUE = 'original'\n")
    expect(await fs.readFile(readmeFile, 'utf-8')).toBe('# original\n')
    await expect(fs.stat(createdFile)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('POST /api/sessions/:id/rewind should restore the previous version when rewinding the second edit of the same file', async () => {
    const sessionId = 'dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee'
    const workDir = path.join(tmpDir, 'same-file-two-turns')
    const targetFile = path.join(workDir, 'src', 'app.js')
    const firstUserId = crypto.randomUUID()
    const secondUserId = crypto.randomUUID()
    const backupV1 = 'same-file@v1'
    const backupV2 = 'same-file@v2'

    await fs.mkdir(path.dirname(targetFile), { recursive: true })
    await fs.writeFile(targetFile, "export const STEP = 'v2'\n", 'utf-8')
    await writeFileHistoryBackup(sessionId, backupV1, "export const STEP = 'base'\n")
    await writeFileHistoryBackup(sessionId, backupV2, "export const STEP = 'v1'\n")

    await writeSessionFile('-tmp-api-two-turns', sessionId, [
      makeSessionMetaEntry(workDir),
      makeFileHistorySnapshotEntry(firstUserId, {
        'src/app.js': {
          backupFileName: backupV1,
          version: 1,
          backupTime: '2026-01-01T00:00:00.000Z',
        },
      }),
      {
        ...makeUserEntry('make v1', firstUserId),
        cwd: workDir,
        sessionId,
      },
      makeAssistantEntry('DONE', firstUserId),
      makeFileHistorySnapshotEntry(secondUserId, {
        'src/app.js': {
          backupFileName: backupV2,
          version: 2,
          backupTime: '2026-01-01T00:00:00.000Z',
        },
      }),
      {
        ...makeUserEntry('make v2', secondUserId),
        cwd: workDir,
        sessionId,
      },
      makeAssistantEntry('DONE', secondUserId),
    ])

    const executeRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 1 }),
    })
    expect(executeRes.status).toBe(200)
    expect(await fs.readFile(targetFile, 'utf-8')).toBe("export const STEP = 'v1'\n")

    const remainingMessages = await service.getSessionMessages(sessionId)
    expect(remainingMessages.map((message) => message.id)).toHaveLength(2)
    expect(remainingMessages[0]?.id).toBe(firstUserId)
  })

  it('POST /api/sessions/:id/rewind should keep first-turn file state when undoing only the latest turn', async () => {
    const sessionId = 'dddddddd-bbbb-cccc-dddd-ffffffffffff'
    const workDir = path.join(tmpDir, 'two-turns-separate-files')
    const firstTurnFile = path.join(workDir, 'src', 'first.js')
    const secondTurnFile = path.join(workDir, 'src', 'second.js')
    const firstUserId = crypto.randomUUID()
    const secondUserId = crypto.randomUUID()
    const firstBaseBackup = 'separate-first@v1'
    const firstAfterTurnBackup = 'separate-first@v2'
    const secondBaseBackup = 'separate-second@v1'

    await fs.mkdir(path.dirname(firstTurnFile), { recursive: true })
    await fs.writeFile(firstTurnFile, "export const FIRST = 'v1'\n", 'utf-8')
    await fs.writeFile(secondTurnFile, "export const SECOND = 'v2'\n", 'utf-8')
    await writeFileHistoryBackup(sessionId, firstBaseBackup, "export const FIRST = 'base'\n")
    await writeFileHistoryBackup(sessionId, firstAfterTurnBackup, "export const FIRST = 'v1'\n")
    await writeFileHistoryBackup(sessionId, secondBaseBackup, "export const SECOND = 'base'\n")

    await writeSessionFile('-tmp-api-two-turns-separate-files', sessionId, [
      makeSessionMetaEntry(workDir),
      makeFileHistorySnapshotEntry(firstUserId, {
        'src/first.js': {
          backupFileName: firstBaseBackup,
          version: 1,
          backupTime: '2026-01-01T00:00:00.000Z',
        },
      }),
      {
        ...makeUserEntry('make first file v1', firstUserId),
        cwd: workDir,
        sessionId,
      },
      makeAssistantEntry('DONE first', firstUserId),
      makeFileHistorySnapshotEntry(secondUserId, {
        'src/first.js': {
          backupFileName: firstAfterTurnBackup,
          version: 2,
          backupTime: '2026-01-01T00:00:00.000Z',
        },
        'src/second.js': {
          backupFileName: secondBaseBackup,
          version: 1,
          backupTime: '2026-01-01T00:00:00.000Z',
        },
      }),
      {
        ...makeUserEntry('make second file v2', secondUserId),
        cwd: workDir,
        sessionId,
      },
      makeAssistantEntry('DONE second', secondUserId),
    ])

    const previewRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 1, dryRun: true }),
    })
    expect(previewRes.status).toBe(200)
    const preview = await previewRes.json() as {
      code: { available: boolean; filesChanged: string[] }
    }
    expect(preview.code.available).toBe(true)
    expect(preview.code.filesChanged).toEqual([secondTurnFile])

    const executeRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 1 }),
    })
    expect(executeRes.status).toBe(200)

    expect(await fs.readFile(firstTurnFile, 'utf-8')).toBe("export const FIRST = 'v1'\n")
    expect(await fs.readFile(secondTurnFile, 'utf-8')).toBe("export const SECOND = 'base'\n")

    const remainingMessages = await service.getSessionMessages(sessionId)
    expect(remainingMessages).toHaveLength(2)
    expect(remainingMessages[0]?.id).toBe(firstUserId)
  })

  it('POST /api/sessions/:id/rewind should include files created after the first turn', async () => {
    const sessionId = 'eeeeeeee-bbbb-cccc-dddd-eeeeeeeeeeee'
    const workDir = path.join(tmpDir, 'created-on-second-turn')
    const firstFile = path.join(workDir, 'src', 'step.js')
    const createdFile = path.join(workDir, 'notes', 'generated.txt')
    const firstUserId = crypto.randomUUID()
    const secondUserId = crypto.randomUUID()
    const backupV1 = 'second-created-step@v1'
    const backupV2 = 'second-created-step@v2'

    await fs.mkdir(path.dirname(firstFile), { recursive: true })
    await fs.mkdir(path.dirname(createdFile), { recursive: true })
    await fs.writeFile(firstFile, "export const STEP = 'v2'\n", 'utf-8')
    await fs.writeFile(createdFile, 'generated\n', 'utf-8')
    await writeFileHistoryBackup(sessionId, backupV1, "export const STEP = 'base'\n")
    await writeFileHistoryBackup(sessionId, backupV2, "export const STEP = 'v1'\n")

    await writeSessionFile('-tmp-api-second-turn-created', sessionId, [
      makeSessionMetaEntry(workDir),
      makeFileHistorySnapshotEntry(firstUserId, {
        'src/step.js': {
          backupFileName: backupV1,
          version: 1,
          backupTime: '2026-01-01T00:00:00.000Z',
        },
      }),
      {
        ...makeUserEntry('make v1', firstUserId),
        cwd: workDir,
        sessionId,
      },
      makeAssistantEntry('DONE', firstUserId),
      makeFileHistorySnapshotEntry(secondUserId, {
        'src/step.js': {
          backupFileName: backupV2,
          version: 2,
          backupTime: '2026-01-01T00:00:00.000Z',
        },
        'notes/generated.txt': {
          backupFileName: null,
          version: 2,
          backupTime: '2026-01-01T00:00:00.000Z',
        },
      }),
      {
        ...makeUserEntry('make v2 and create file', secondUserId),
        cwd: workDir,
        sessionId,
      },
      makeAssistantEntry('DONE', secondUserId),
    ])

    const previewRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 1, dryRun: true }),
    })
    expect(previewRes.status).toBe(200)
    const preview = await previewRes.json() as {
      code: { available: boolean; filesChanged: string[]; insertions: number }
    }
    expect(preview.code.filesChanged.sort()).toEqual([
      createdFile,
      firstFile,
    ].sort())
    expect(preview.code.insertions).toBe(2)

    const executeRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 1 }),
    })
    expect(executeRes.status).toBe(200)
    expect(await fs.readFile(firstFile, 'utf-8')).toBe("export const STEP = 'v1'\n")
    await expect(fs.stat(createdFile)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('GET /api/sessions/:id/turn-checkpoints should list completed turn previews with turn-bound diff stats', async () => {
    const fixture = await createThreeTurnCheckpointFixture(
      '99999999-bbbb-cccc-dddd-eeeeeeeeeeee',
    )

    const res = await fetch(`${baseUrl}/api/sessions/${fixture.sessionId}/turn-checkpoints`)
    expect(res.status).toBe(200)

    const body = await res.json() as {
      checkpoints: Array<{
        target: {
          targetUserMessageId: string
          userMessageIndex: number
          userMessageCount: number
        }
        conversation: { messagesRemoved: number }
        code: {
          available: boolean
          filesChanged: string[]
          insertions: number
          deletions: number
        }
        workDir: string
      }>
    }

    expect(body.checkpoints).toHaveLength(3)
    expect(body.checkpoints).toEqual([
      {
        target: {
          targetUserMessageId: fixture.firstUserId,
          userMessageIndex: 0,
          userMessageCount: 3,
        },
        conversation: { messagesRemoved: 6 },
        code: {
          available: true,
          filesChanged: [fixture.stepFile],
          insertions: 1,
          deletions: 1,
        },
        workDir: fixture.workDir,
      },
      {
        target: {
          targetUserMessageId: fixture.secondUserId,
          userMessageIndex: 1,
          userMessageCount: 3,
        },
        conversation: { messagesRemoved: 4 },
        code: {
          available: true,
          filesChanged: [fixture.stepFile],
          insertions: 1,
          deletions: 1,
        },
        workDir: fixture.workDir,
      },
      {
        target: {
          targetUserMessageId: fixture.thirdUserId,
          userMessageIndex: 2,
          userMessageCount: 3,
        },
        conversation: { messagesRemoved: 2 },
        code: {
          available: true,
          filesChanged: [fixture.stepFile, fixture.createdFile],
          insertions: 2,
          deletions: 1,
        },
        workDir: fixture.workDir,
      },
    ])
  })

  it('GET /api/sessions/:id/turn-checkpoints/diff should return target-bound checkpoint diffs', async () => {
    const fixture = await createThreeTurnCheckpointFixture(
      '99999999-bbbb-cccc-dddd-ffffffffffff',
    )

    const secondTurnRes = await fetch(
      `${baseUrl}/api/sessions/${fixture.sessionId}/turn-checkpoints/diff?targetUserMessageId=${fixture.secondUserId}&path=src/step.js`,
    )
    expect(secondTurnRes.status).toBe(200)
    const secondTurnBody = await secondTurnRes.json() as {
      state: string
      path: string
      diff?: string
      target: { targetUserMessageId: string }
    }
    expect(secondTurnBody.target.targetUserMessageId).toBe(fixture.secondUserId)
    expect(secondTurnBody.state).toBe('ok')
    expect(secondTurnBody.path).toBe('src/step.js')
    expect(secondTurnBody.diff).toContain("export const STEP = 'v2'")
    expect(secondTurnBody.diff).toContain("export const STEP = 'v1'")
    expect(secondTurnBody.diff).not.toContain("export const STEP = 'v3'")

    const thirdTurnRes = await fetch(
      `${baseUrl}/api/sessions/${fixture.sessionId}/turn-checkpoints/diff?targetUserMessageId=${fixture.thirdUserId}&path=src/step.js`,
    )
    expect(thirdTurnRes.status).toBe(200)
    const thirdTurnBody = await thirdTurnRes.json() as {
      state: string
      diff?: string
      target: { targetUserMessageId: string }
    }
    expect(thirdTurnBody.target.targetUserMessageId).toBe(fixture.thirdUserId)
    expect(thirdTurnBody.state).toBe('ok')
    expect(thirdTurnBody.diff).toContain("export const STEP = 'v3'")
    expect(thirdTurnBody.diff).toContain("export const STEP = 'v2'")
    expect(thirdTurnBody.diff).not.toContain("export const STEP = 'v1'")

    const createdFileRes = await fetch(
      `${baseUrl}/api/sessions/${fixture.sessionId}/turn-checkpoints/diff?targetUserMessageId=${fixture.thirdUserId}&path=notes/generated.txt`,
    )
    expect(createdFileRes.status).toBe(200)
    const createdFileBody = await createdFileRes.json() as {
      state: string
      diff?: string
    }
    expect(createdFileBody.state).toBe('ok')
    expect(createdFileBody.diff).toContain('generated third turn')
    expect(createdFileBody.diff).toContain('/dev/null')
  })

  it('GET /api/sessions/:id/turn-checkpoints should fall back to transcript tool changes when file snapshots are missing', async () => {
    const sessionId = '99999999-bbbb-cccc-dddd-000000000001'
    const workDir = path.join(tmpDir, 'transcript-only-session')
    const userId = crypto.randomUUID()
    await fs.mkdir(path.join(workDir, 'todo-app', 'src'), { recursive: true })

    await writeSessionFile('-tmp-transcript-only-session', sessionId, [
      makeSessionMetaEntry(workDir),
      {
        ...makeUserEntry('build a todo app', userId),
        cwd: workDir,
        sessionId,
      },
      makeAssistantToolUseEntry([
        {
          id: 'Write:1',
          name: 'Write',
          input: {
            file_path: path.join(workDir, 'todo-app', 'src', 'App.tsx'),
            content: 'export function App() {\n  return <main>Todo</main>\n}\n',
          },
        },
        {
          id: 'Write:2',
          name: 'Write',
          input: {
            file_path: 'todo-app/vite.config.ts',
            content: 'import { defineConfig } from "vite"\nexport default defineConfig({})\n',
          },
        },
      ], userId),
      makeAssistantEntry('Todo app created', userId),
    ])

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/turn-checkpoints`)
    expect(res.status).toBe(200)
    const body = await res.json() as {
      checkpoints: Array<{
        target: { targetUserMessageId: string }
        code: {
          available: boolean
          filesChanged: string[]
          insertions: number
          deletions: number
        }
        workDir: string
      }>
    }

    expect(body.checkpoints).toHaveLength(1)
    expect(body.checkpoints[0]!.target.targetUserMessageId).toBe(userId)
    expect(body.checkpoints[0]!.workDir).toBe(workDir)
    expect(body.checkpoints[0]!.code.available).toBe(true)
    expect(body.checkpoints[0]!.code.filesChanged.sort()).toEqual([
      path.join(workDir, 'todo-app', 'src', 'App.tsx'),
      path.join(workDir, 'todo-app', 'vite.config.ts'),
    ].sort())
    expect(body.checkpoints[0]!.code.insertions).toBe(5)
    expect(body.checkpoints[0]!.code.deletions).toBe(0)
  })

  it('GET /api/sessions/:id/turn-checkpoints/diff should return transcript tool diffs when file snapshots are missing', async () => {
    const sessionId = '99999999-bbbb-cccc-dddd-000000000002'
    const workDir = path.join(tmpDir, 'transcript-only-diff-session')
    const userId = crypto.randomUUID()

    await writeSessionFile('-tmp-transcript-only-diff-session', sessionId, [
      makeSessionMetaEntry(workDir),
      {
        ...makeUserEntry('edit config', userId),
        cwd: workDir,
        sessionId,
      },
      makeAssistantToolUseEntry([
        {
          id: 'Edit:1',
          name: 'Edit',
          input: {
            file_path: path.join(workDir, 'todo-app', 'vite.config.ts'),
            old_string: 'plugins: [react()]',
            new_string: 'plugins: [react(), tailwindcss()]',
          },
        },
      ], userId),
      makeAssistantEntry('Config updated', userId),
    ])

    const res = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/turn-checkpoints/diff?targetUserMessageId=${userId}&path=${encodeURIComponent('todo-app/vite.config.ts')}`,
    )
    expect(res.status).toBe(200)
    const body = await res.json() as {
      state: string
      path: string
      diff?: string
      target: { targetUserMessageId: string }
    }

    expect(body.target.targetUserMessageId).toBe(userId)
    expect(body.state).toBe('ok')
    expect(body.path).toBe('todo-app/vite.config.ts')
    expect(body.diff).toContain('diff --session a/todo-app/vite.config.ts b/todo-app/vite.config.ts')
    expect(body.diff).toContain('-plugins: [react()]')
    expect(body.diff).toContain('+plugins: [react(), tailwindcss()]')
  })

  it('GET /api/sessions/:id/turn-checkpoints should include subagent transcript file changes for the parent turn', async () => {
    const sessionId = '99999999-bbbb-cccc-dddd-000000000003'
    const workDir = path.join(tmpDir, 'transcript-subagent-session')
    const firstUserId = crypto.randomUUID()
    const secondUserId = crypto.randomUUID()
    const agentMessageId = crypto.randomUUID()
    await fs.mkdir(path.join(workDir, 'todo-app', 'src'), { recursive: true })

    await writeSessionFile('-tmp-transcript-subagent-session', sessionId, [
      makeSessionMetaEntry(workDir),
      {
        ...makeUserEntry('build a todo app', firstUserId),
        cwd: workDir,
        sessionId,
      },
      {
        parentUuid: firstUserId,
        isSidechain: false,
        type: 'assistant',
        message: {
          model: 'claude-opus-4-7',
          id: `msg_${crypto.randomUUID().slice(0, 20)}`,
          type: 'message',
          role: 'assistant',
          content: [{
            type: 'tool_use',
            id: 'Agent:todo',
            name: 'Agent',
            input: { description: 'Create todo app files' },
          }],
        },
        uuid: agentMessageId,
        timestamp: '2026-01-01T00:02:00.000Z',
      },
      {
        ...makeUserEntry('now explain it', secondUserId),
        parentUuid: agentMessageId,
        cwd: workDir,
        sessionId,
      },
      {
        parentUuid: agentMessageId,
        isSidechain: true,
        type: 'assistant',
        message: {
          model: 'claude-opus-4-7',
          id: `msg_${crypto.randomUUID().slice(0, 20)}`,
          type: 'message',
          role: 'assistant',
          content: [{
            type: 'tool_use',
            id: 'Write:child',
            name: 'Write',
            input: {
              file_path: path.join(workDir, 'todo-app', 'src', 'Board.tsx'),
              content: 'export function Board() {\n  return null\n}\n',
            },
          }],
        },
        uuid: crypto.randomUUID(),
        timestamp: '2026-01-01T00:03:00.000Z',
      },
    ])

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/turn-checkpoints`)
    expect(res.status).toBe(200)
    const body = await res.json() as {
      checkpoints: Array<{
        target: { targetUserMessageId: string }
        code: { filesChanged: string[]; insertions: number; deletions: number }
      }>
    }

    expect(body.checkpoints).toHaveLength(1)
    expect(body.checkpoints[0]!.target.targetUserMessageId).toBe(firstUserId)
    expect(body.checkpoints[0]!.code.filesChanged).toEqual([
      path.join(workDir, 'todo-app', 'src', 'Board.tsx'),
    ])
    expect(body.checkpoints[0]!.code.insertions).toBe(3)
    expect(body.checkpoints[0]!.code.deletions).toBe(0)
  })

  it('POST /api/sessions/:id/rewind should restore the base state when rewinding the first turn of a three-turn file history', async () => {
    const fixture = await createThreeTurnCheckpointFixture(
      'aaaaaaaa-1111-2222-3333-444444444444',
    )

    const executeRes = await fetch(`${baseUrl}/api/sessions/${fixture.sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 0 }),
    })
    expect(executeRes.status).toBe(200)

    expect(await fs.readFile(fixture.stepFile, 'utf-8')).toBe("export const STEP = 'base'\n")
    await expect(fs.stat(fixture.createdFile)).rejects.toMatchObject({ code: 'ENOENT' })

    const remainingMessages = await service.getSessionMessages(fixture.sessionId)
    expect(remainingMessages).toHaveLength(0)
  })

  it('POST /api/sessions/:id/rewind should keep the first turn and remove later file changes when rewinding the second turn of a three-turn history', async () => {
    const fixture = await createThreeTurnCheckpointFixture(
      'aaaaaaaa-5555-6666-7777-888888888888',
    )

    const executeRes = await fetch(`${baseUrl}/api/sessions/${fixture.sessionId}/rewind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessageIndex: 1 }),
    })
    expect(executeRes.status).toBe(200)

    expect(await fs.readFile(fixture.stepFile, 'utf-8')).toBe("export const STEP = 'v1'\n")
    await expect(fs.stat(fixture.createdFile)).rejects.toMatchObject({ code: 'ENOENT' })

    const remainingMessages = await service.getSessionMessages(fixture.sessionId)
    expect(remainingMessages).toHaveLength(2)
    expect(remainingMessages[0]?.id).toBe(fixture.firstUserId)
    expect(remainingMessages[1]?.type).toBe('assistant')
  })

  // --------------------------------------------------------------------------
  // Conversations API via /api/sessions/:id/chat
  // --------------------------------------------------------------------------

  it('GET /api/sessions/:id/chat/status should return idle by default', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/chat/status`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as { state: string }
    expect(body.state).toBe('idle')
  })

  it('POST /api/sessions/:id/chat should queue a message', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await writeSessionFile('-tmp-api-test', sessionId, [
      makeSnapshotEntry(),
      makeUserEntry('Previous'),
    ])

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'New question' }),
    })
    expect(res.status).toBe(202)

    const body = (await res.json()) as { messageId: string; status: string }
    expect(body.status).toBe('queued')
    expect(body.messageId).toBeTruthy()
  })

  it('POST /api/sessions/:id/chat/stop should reset state to idle', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/chat/stop`, {
      method: 'POST',
    })
    expect(res.status).toBe(200)

    // Verify state is idle
    const statusRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/chat/status`)
    const status = (await statusRes.json()) as { state: string }
    expect(status.state).toBe('idle')

  })

    it('persists explicit user artifact evidence before verifying a completion requirement', async () => {
      const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      const workDir = path.join(tmpDir, 'api-workflow-artifact-evidence')
      const state = withCompletionEligibleRuntimeContract(makePendingWorkflowTransitionState(sessionId)) as any
      const phaseState = state.runtimeContract.phaseStates.discussion
      phaseState.artifactRequirements = [{
        id: 'review-evidence',
        required: true,
        status: 'pending',
        artifactIds: [],
        updatedAt: state.updatedAt,
      }]
      phaseState.eligibility = 'ineligible'
      phaseState.blockerReasons = ['Required artifact is not verified: review-evidence']
      await writeWorkflowSessionState(sessionId, state)
      await writeSessionFile(sanitizePath(workDir), sessionId, [
        makeSnapshotEntry(),
        makeWorkflowSessionMetaEntry(sessionId, workDir, {
          templateId: 'agent-development',
          templateSnapshotId: 'agent-development-v1',
          activePhaseId: 'discussion',
          stateRevision: state.stateVersion,
          reportPointer: undefined,
          reportRef: undefined,
        }),
        makeUserEntry('Record explicit artifact evidence before completion.'),
      ])

      const response = await fetch(baseUrl + '/api/sessions/' + sessionId + '/workflow/completion-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          stateVersion: state.stateVersion,
          update: {
            type: 'artifact-satisfied',
            actor: 'user',
            artifactRequirementId: 'review-evidence',
            artifactIds: ['review-evidence-v1'],
            rationale: 'Recorded the review output as session-scoped evidence before verification.',
          },
        }),
      })

      expect(response.status).toBe(200)
      const body = await response.json() as { state: Record<string, any> }
      expect(body.state.runtimeContract.phaseStates.discussion.artifactRequirements).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'review-evidence',
          status: 'satisfied',
          artifactIds: ['review-evidence-v1'],
        }),
      ]))
      expect(body.state.artifactIndex).toEqual(expect.arrayContaining([
        expect.objectContaining({ artifactId: 'review-evidence-v1' }),
      ]))

      const artifactPath = path.join(tmpDir, 'cc-jiangxia', 'workflow-sessions', sessionId, 'artifacts', 'review-evidence-v1.json')
      const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf-8')) as Record<string, any>
      expect(artifact).toMatchObject({
        sessionId,
        phaseId: 'discussion',
        artifactId: 'review-evidence-v1',
        lifecycleStatus: 'pending',
        content: expect.objectContaining({
          requirementId: 'review-evidence',
          recordedBy: 'user',
        }),
      })
    })

    it('serializes a concurrent HTTP progress update and WebSocket transition for one session', async () => {
    const sessionId = 'aaaaaaaa-bbbb-cccc-dddd-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    const workDir = path.join(tmpDir, 'api-workflow-http-ws-cas')
    await writeWorkflowSessionState(sessionId, makePendingWorkflowTransitionState(sessionId))
    await writeSessionFile(sanitizePath(workDir), sessionId, [
      makeSnapshotEntry(),
      makeWorkflowSessionMetaEntry(sessionId, workDir, {
        templateId: 'agent-development',
        templateSnapshotId: 'agent-development-v1',
        status: 'pending-confirmation',
        workflowStatus: 'pending-confirmation',
        activePhaseId: 'discussion',
        stateRevision: 3,
        reportPointer: undefined,
        reportRef: undefined,
      }),
      makeUserEntry('Concurrent workflow mutation fixture'),
    ])

    const sent: string[] = []
    const ws = {
      data: {
        sessionId,
        connectedAt: Date.now(),
        channel: 'client',
        sdkToken: null,
        serverPort: 0,
        serverHost: '127.0.0.1',
      },
      send(payload: string) {
        sent.push(payload)
        return 1
      },
      close() {},
    } as any

    try {
      setWorkflowRuntimeTemplateLoaderForTests(async (state) => state.templateSnapshot ?? null)
      handleWebSocket.open(ws)
      handleWebSocket.message(ws, JSON.stringify({
        type: 'workflow_transition',
        phaseId: 'discussion',
        action: 'pause',
        stateVersion: 3,
        transitionId: 'ws-pause-racing-progress',
      }))
      const httpResponse = await fetch(baseUrl + '/api/sessions/' + sessionId + '/workflow/completion-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phaseId: 'discussion',
          stateVersion: 3,
          update: {
            type: 'rebuild',
            actor: 'user',
            rationale: 'Rebuild the legacy completion contract before review.',
          },
        }),
      })
      const httpBody = await httpResponse.json() as { error?: string; code?: string }

      const deadline = Date.now() + 2_000
      while (Date.now() < deadline) {
        const messages = sent.map((payload) => JSON.parse(payload) as { type?: string; code?: string; subtype?: string })
        if (messages.some((message) => message.code === 'WORKFLOW_STATE_STALE' || message.subtype === 'workflow_state')) break
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      const wsMessages = sent.map((payload) => JSON.parse(payload) as { type?: string; code?: string; subtype?: string })
      const wsStale = wsMessages.some((message) => message.type === 'error' && message.code === 'WORKFLOW_STATE_STALE')
      const wsApplied = wsMessages.some((message) => message.type === 'system_notification' && message.subtype === 'workflow_state')

      expect(
        (httpResponse.status === 200 && wsStale)
        || (httpResponse.status === 409 && (httpBody.error ?? httpBody.code) === 'WORKFLOW_STATE_STALE' && wsApplied),
      ).toBe(true)

      const persisted = await new WorkflowSessionStateService().readState(sessionId)
      expect(persisted.state?.stateVersion).toBe(4)
    } finally {
      setWorkflowRuntimeTemplateLoaderForTests(null)
      __resetWebSocketHandlerStateForTests()
    }
  })

})
