import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LaneResult } from './types'

type JsonRecord = Record<string, unknown>

type WorkflowSummary = {
  mode: 'workflow'
  templateId: string
  templateVersion: string
  templateSource: string
  activePhaseId: string | null
  status: string
  phaseCount: number
  pendingConfirmation: boolean
  reportPointer?: JsonRecord
}

export type WorkflowSessionModeSmokeResult = {
  configDir: string
  workflowSessionId: string
  dialogueSessionId: string
  workflowSummary: WorkflowSummary
  resumeSummary: WorkflowSummary
  websocketNotifications: string[]
  dialogueHasWorkflowMetadata: boolean
  finalReportReady: boolean
}

type SmokeOptions = {
  rootDir: string
  artifactDir?: string
  keepProfile?: boolean
}

type StartedServer = {
  server: ReturnType<typeof Bun.serve>
  baseUrl: string
  wsUrl: string
}

async function getPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a local port')))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} failed with HTTP ${response.status}: ${await response.text()}`)
  }
  return response.json() as Promise<T>
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError = 'not attempted'

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await Bun.sleep(100)
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError}`)
}

async function startSmokeServer(port: number): Promise<StartedServer> {
  process.env.SERVER_AUTH_REQUIRED = '0'
  const { startServer } = await import('../../src/server/index.js')
  const server = startServer(port, '127.0.0.1') as ReturnType<typeof Bun.serve>
  const baseUrl = `http://127.0.0.1:${port}`
  await waitForHttp(`${baseUrl}/health`, 10_000)
  return {
    server,
    baseUrl,
    wsUrl: `ws://127.0.0.1:${port}`,
  }
}

function stopSmokeServer(started: StartedServer | null): void {
  started?.server.stop(true)
}

async function createSession(baseUrl: string, workDir: string, workflow?: JsonRecord): Promise<{ sessionId: string; workflow?: WorkflowSummary }> {
  return fetchJson(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workDir,
      ...(workflow ? { workflow } : {}),
    }),
  })
}

async function readWorkflow(baseUrl: string, sessionId: string): Promise<{ state: JsonRecord; workflow: WorkflowSummary }> {
  return fetchJson(`${baseUrl}/api/sessions/${sessionId}/workflow`)
}

type WorkflowTransitionAction = 'confirm' | 'retry' | 'manual_complete' | 'ready' | 'blocked' | 'unable'

async function transitionWorkflow(
  baseUrl: string,
  sessionId: string,
  body: JsonRecord,
): Promise<{ state: JsonRecord; workflow: WorkflowSummary }> {
  return fetchJson(`${baseUrl}/api/sessions/${sessionId}/workflow/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function completionTransition(
  phaseId: string,
  stateVersion: number,
  action: WorkflowTransitionAction,
  transitionId: string,
): JsonRecord {
  return {
    phaseId,
    action,
    stateVersion,
    transitionId,
    handoff: {
      summary: `${phaseId} ${action} smoke handoff`,
      changedFiles: [],
      validation: ['non-live workflow session mode smoke'],
    },
    rationale: `${phaseId} ${action} smoke rationale`,
    evidence: [
      {
        ref: `smoke:${phaseId}:${action}`,
        summary: 'Synthetic non-live completion evidence',
      },
    ],
  }
}

function smokeWorkflowTemplate(): JsonRecord {
  const phase = (
    id: string,
    name: string,
    authority: 'auto' | 'user-confirmation',
  ): JsonRecord => ({
    id,
    name,
    instructions: `Complete the ${name} smoke phase.`,
    objective: `Exercise ${name} workflow runtime behavior.`,
    requiredIntake: ['Synthetic smoke input.'],
    handoffRules: ['Return synthetic smoke evidence.'],
    executionRules: ['Stay within the non-live smoke workflow.'],
    outputArtifact: {
      id: `${id}-artifact`,
      name: `${name} Artifact`,
      kind: 'markdown',
      description: `Synthetic ${name} artifact.`,
      required: true,
    },
    completionCriteria: {
      type: 'artifact-required',
      description: `${name} smoke artifact is complete.`,
    },
    transition: { authority },
  })

  return {
    schemaVersion: 1,
    id: 'quality-smoke-workflow',
    version: '1',
    name: 'Quality Smoke Workflow',
    description: 'User workflow template created by the non-live quality smoke.',
    phases: [
      phase('discussion', 'Discussion', 'user-confirmation'),
      phase('specify', 'Specify', 'auto'),
      phase('plan', 'Plan', 'auto'),
      phase('tasks', 'Tasks', 'auto'),
      phase('implement', 'Implement', 'auto'),
    ],
  }
}

function stateVersion(value: JsonRecord): number {
  const version = value.stateVersion
  if (typeof version !== 'number') {
    throw new Error('Workflow state did not include numeric stateVersion')
  }
  return version
}

function pendingConfirmationId(workflow: WorkflowSummary): string {
  if (typeof workflow.pendingConfirmationId !== 'string' || workflow.pendingConfirmationId.length === 0) {
    throw new Error('Workflow pending confirmation did not include a confirmation ID')
  }
  return workflow.pendingConfirmationId
}

async function websocketTransition(
  wsUrl: string,
  sessionId: string,
  body: JsonRecord,
  expectedNotifications: string[],
): Promise<string[]> {
  const ws = new WebSocket(`${wsUrl}/ws/${sessionId}`)
  const notifications: string[] = []

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('Timed out waiting for workflow WebSocket observations'))
    }, 10_000)

    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as JsonRecord
      if (message.type === 'connected') {
        ws.send(JSON.stringify({ type: 'workflow_transition', ...body }))
        return
      }
      if (message.type !== 'system_notification') return
      const subtype = typeof message.subtype === 'string' ? message.subtype : ''
      if (subtype.startsWith('workflow_')) {
        notifications.push(subtype)
      }
      if (expectedNotifications.every((expected) => notifications.includes(expected))) {
        clearTimeout(timeout)
        ws.close()
        resolve()
      }
    }
    ws.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('Workflow WebSocket connection failed'))
    }
  })

  return notifications
}

async function runWithIsolatedConfig<T>(
  keepProfile: boolean,
  task: (configDir: string) => Promise<T>,
): Promise<T> {
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY
  const configDir = await mkdtemp(join(tmpdir(), 'cc-jiangxia-workflow-session-smoke-'))

  try {
    process.env.CLAUDE_CONFIG_DIR = configDir
    delete process.env.ANTHROPIC_API_KEY
    return await task(configDir)
  } finally {
    if (originalConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalConfigDir
    }
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey
    }
    if (!keepProfile) {
      await rm(configDir, { recursive: true, force: true })
    }
  }
}

export async function runWorkflowSessionModeSmoke(options: SmokeOptions): Promise<WorkflowSessionModeSmokeResult> {
  return runWithIsolatedConfig(Boolean(options.keepProfile), async (configDir) => {
    const workDir = await mkdtemp(join(tmpdir(), 'cc-jiangxia-workflow-session-workdir-'))
    let started: StartedServer | null = null

    try {
      const port = await getPort()
      started = await startSmokeServer(port)

      await fetchJson(`${started.baseUrl}/api/workflows/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: smokeWorkflowTemplate() }),
      })
      const templates = await fetchJson<{
        templates: Array<{ id: string; source: string; phaseCount: number; firstPhaseId: string }>
      }>(`${started.baseUrl}/api/workflows/templates`)
      const smokeTemplate = templates.templates.find((template) =>
        template.id === 'quality-smoke-workflow' &&
        template.source === 'user'
      )
      if (!smokeTemplate || smokeTemplate.phaseCount !== 5 || smokeTemplate.firstPhaseId !== 'discussion') {
        throw new Error('Quality smoke workflow template is not startable with the expected five-phase shape')
      }

      const workflowCreated = await createSession(
        started.baseUrl,
        workDir,
        { templateId: 'quality-smoke-workflow', templateSource: 'user' },
      )
      if (!workflowCreated.workflow || workflowCreated.workflow.mode !== 'workflow') {
        throw new Error('Workflow session did not include workflow metadata')
      }

      const initialWorkflow = await readWorkflow(started.baseUrl, workflowCreated.sessionId)
      if (initialWorkflow.workflow.activePhaseId !== 'discussion') {
        throw new Error('Workflow session did not start in discussion')
      }

      const readyTransition = completionTransition(
        'discussion',
        stateVersion(initialWorkflow.state),
        'ready',
        `smoke-ready-${Date.now()}`,
      )
      const websocketNotifications = await websocketTransition(
        started.wsUrl,
        workflowCreated.sessionId,
        readyTransition,
        ['workflow_transition', 'workflow_state'],
      )
      const transitionedWorkflow = await readWorkflow(started.baseUrl, workflowCreated.sessionId)
      if (!transitionedWorkflow.workflow.pendingConfirmation) {
        throw new Error('Workflow ready completion did not enter pending confirmation')
      }
      if (transitionedWorkflow.workflow.activePhaseId !== 'discussion') {
        throw new Error('Workflow ready completion auto-advanced before confirmation')
      }

      let current = await transitionWorkflow(started.baseUrl, workflowCreated.sessionId, {
        phaseId: 'discussion',
        action: 'confirm',
        confirmationId: pendingConfirmationId(transitionedWorkflow.workflow),
        stateVersion: stateVersion(transitionedWorkflow.state),
        transitionId: `smoke-confirm-discussion-${Date.now()}`,
      })

      for (const phaseId of ['specify', 'plan', 'tasks']) {
        current = await transitionWorkflow(
          started.baseUrl,
          workflowCreated.sessionId,
          completionTransition(
            phaseId,
            stateVersion(current.state),
            'manual_complete',
            `smoke-manual-${phaseId}-${Date.now()}`,
          ),
        )
      }

      if (current.workflow.activePhaseId !== 'implement') {
        throw new Error(`Workflow did not advance to implement before final report check: ${current.workflow.activePhaseId}`)
      }

      const finalNotifications = await websocketTransition(
        started.wsUrl,
        workflowCreated.sessionId,
        completionTransition(
          'implement',
          stateVersion(current.state),
          'manual_complete',
          `smoke-final-${Date.now()}`,
        ),
        ['workflow_transition', 'workflow_state', 'workflow_report_ready'],
      )
      websocketNotifications.push(...finalNotifications)

      const finalWorkflow = await readWorkflow(started.baseUrl, workflowCreated.sessionId)
      if (finalWorkflow.workflow.status !== 'completed' || !finalWorkflow.workflow.reportPointer) {
        throw new Error('Workflow final report pointer was not ready after final completion')
      }

      const dialogueCreated = await createSession(started.baseUrl, workDir)
      const dialogueDetail = await fetchJson<JsonRecord>(`${started.baseUrl}/api/sessions/${dialogueCreated.sessionId}`)
      const dialogueHasWorkflowMetadata = 'workflow' in dialogueDetail
      if (dialogueHasWorkflowMetadata) {
        throw new Error('Dialogue session unexpectedly contains workflow metadata')
      }

      stopSmokeServer(started)
      started = null

      started = await startSmokeServer(port)
      const resumedWorkflow = await readWorkflow(started.baseUrl, workflowCreated.sessionId)
      if (resumedWorkflow.workflow.status !== finalWorkflow.workflow.status || !resumedWorkflow.workflow.reportPointer) {
        throw new Error('Workflow session reset during server resume')
      }

      return {
        configDir,
        workflowSessionId: workflowCreated.sessionId,
        dialogueSessionId: dialogueCreated.sessionId,
        workflowSummary: finalWorkflow.workflow,
        resumeSummary: resumedWorkflow.workflow,
        websocketNotifications,
        dialogueHasWorkflowMetadata,
        finalReportReady: Boolean(finalWorkflow.workflow.reportPointer),
      }
    } finally {
      stopSmokeServer(started)
      await rm(workDir, { recursive: true, force: true })
    }
  })
}

export async function executeWorkflowSessionModeSmoke(
  rootDir: string,
  artifactDir: string,
  resultId = 'workflow-session-mode-smoke',
  resultTitle = 'Workflow session mode smoke',
): Promise<LaneResult> {
  const started = Date.now()
  mkdirSync(artifactDir, { recursive: true })

  try {
    const result = await runWorkflowSessionModeSmoke({ rootDir, artifactDir })
    writeFileSync(join(artifactDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
    return {
      id: resultId,
      title: resultTitle,
      status: 'passed',
      durationMs: Date.now() - started,
      artifactDir,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    appendFileSync(join(artifactDir, 'error.log'), `${message}\n`)
    return {
      id: resultId,
      title: resultTitle,
      status: 'failed',
      durationMs: Date.now() - started,
      error: message,
      artifactDir,
    }
  }
}

if (import.meta.main) {
  const artifactArgIndex = process.argv.indexOf('--artifact-dir')
  const artifactDir = artifactArgIndex >= 0 && process.argv[artifactArgIndex + 1]
    ? process.argv[artifactArgIndex + 1]!
    : await mkdtemp(join(tmpdir(), 'cc-jiangxia-workflow-session-artifacts-'))
  const result = await executeWorkflowSessionModeSmoke(
    process.cwd(),
    artifactDir,
  )
  console.log(`Workflow session mode smoke: ${result.status}`)
  console.log(`Artifact dir: ${artifactDir}`)
  if (result.error) {
    console.error(result.error)
  }
  process.exit(result.status === 'passed' ? 0 : 1)
}
