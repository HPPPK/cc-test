import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  WorkflowTemplateRegistryService,
  resetWorkflowTemplateRegistryForTests,
} from './workflowTemplateRegistryService.js'
import { WorkflowSessionCreateService } from './workflowSessionCreateService.js'
import { WorkflowSessionStateService } from './workflowSessionStateService.js'

let tempConfigDir: string
let originalConfigDir: string | undefined
let originalPacksDir: string | undefined

describe('workflow session creation routing', () => {
  beforeEach(async () => {
    tempConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-workflow-create-'))
    originalConfigDir = process.env.CLAUDE_CONFIG_DIR
    originalPacksDir = process.env.CLAUDE_PACKS_DIR
    process.env.CLAUDE_CONFIG_DIR = tempConfigDir
    // Point to bundled packs directory so tests can find builtin workflows
    process.env.CLAUDE_PACKS_DIR = path.join(process.cwd(), 'src', 'server', 'packs')
    resetWorkflowTemplateRegistryForTests()
  })

  afterEach(async () => {
    resetWorkflowTemplateRegistryForTests()
    if (originalConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalConfigDir
    }
    if (originalPacksDir === undefined) {
      delete process.env.CLAUDE_PACKS_DIR
    } else {
      process.env.CLAUDE_PACKS_DIR = originalPacksDir
    }
    await fs.rm(tempConfigDir, { recursive: true, force: true })
  })

  test('preserves phase toolPolicy in the runtime template snapshot', () => {
    const createService = new WorkflowSessionCreateService()
    const template = {
      schemaVersion: 2,
      id: 'tool-policy-snapshot-fixture',
      source: 'user' as const,
      version: '1',
      name: 'Tool policy snapshot fixture',
      description: 'Preserves runtime permissions from the selected workflow.',
      phases: [{
        id: 'intake',
        name: 'Intake',
        instructions: 'Collect context without implementation access.',
        skills: [],
        requiredArtifacts: [],
        completionCriteria: ['intake is complete'],
        transition: { authority: 'user-confirmation' as const },
        toolPolicy: {
          allowedTools: ['Read', 'AskUserQuestion', 'request_workflow_route'],
          disallowedTools: ['Write', 'Edit', 'Bash', 'Agent'],
        },
      }],
    }

    const runtimeTemplate = (createService as any).toWorkflowTemplate(template)

    expect(runtimeTemplate.phases[0]?.toolPolicy).toEqual(template.phases[0]?.toolPolicy)
  })

  test('bug route uses debug workflow with investigation and regression validation metadata', async () => {
    const registry = new WorkflowTemplateRegistryService()
    const createService = new WorkflowSessionCreateService({
      registryService: registry,
      stateService: new WorkflowSessionStateService(),
    })
    const workflow = {
      templateId: 'debug-repair-workflow-v8',
      templateSource: 'builtin' as const,
      request: '鐧诲綍椤电偣鍑绘病鍙嶅簲锛屾帶鍒跺彴鏈?500',
    }
    const template = await createService.resolveTemplate(workflow)

    const summary = await createService.createWorkflowSessionMetadata(
      'session-bug',
      '/tmp/workflow-bug',
      template,
      workflow,
    )
    const state = await new WorkflowSessionStateService().readState('session-bug')

    expect(summary.labels).toContain('bug')
    expect(summary.effort).toBe('standard')
    expect(summary.phaseNames).toContain('Root-Cause Investigation / 根因调查')
    expect(summary.phaseNames).toContain('Quality Validation + Preview Decision / 质量验证与预览决策')
    expect(state.state?.phases.map((phase) => phase.id)).toContain('debug-investigate')
    expect(state.state?.phases.find((phase) => phase.id === 'debug-quality-preview')?.label)
      .toBe('Quality Validation + Preview Decision / 质量验证与预览决策')
  })

  test('documentation light route skips implementation-heavy phases', async () => {
    const createService = new WorkflowSessionCreateService()
    const workflow = {
      templateId: 'efficient-constrained-dev-debug-workflow-v5',
      templateSource: 'builtin' as const,
      request: '甯垜鍐?README',
    }
    const template = await createService.resolveTemplate(workflow)

    const summary = await createService.createWorkflowSessionMetadata(
      'session-docs',
      '/tmp/workflow-docs',
      template,
      workflow,
    )
    const state = await new WorkflowSessionStateService().readState('session-docs')
    const phaseIds = state.state?.phases.map((phase) => phase.id) ?? []

    expect(summary.labels).toContain('documentation')
    expect(['light', 'standard']).toContain(summary.effort)
    expect(phaseIds).toContain('scope-plan')
    expect(phaseIds).toContain('scenario-review')
    expect(phaseIds).not.toContain('delegate-implement')
    expect(phaseIds).not.toContain('local-preview')
  })

  test('preserves selected brainstorming mode in workflow metadata and state', async () => {
    const createService = new WorkflowSessionCreateService()
    const workflow = {
      templateId: 'efficient-constrained-dev-debug-workflow-v5',
      templateSource: 'builtin' as const,
      request: '鎴戞湁瀹屾暣闇€姹傛枃妗ｏ紝涓ユ牸鎸夋枃妗ｅ垱寤?MVP',
      brainstormingMode: 'off' as const,
    }
    const template = await createService.resolveTemplate(workflow)

    const summary = await createService.createWorkflowSessionMetadata(
      'session-brainstorming-off',
      '/tmp/workflow-brainstorming-off',
      template,
      workflow,
    )
    const state = await new WorkflowSessionStateService().readState('session-brainstorming-off')

    expect(summary.brainstormingMode).toBe('off')
    expect(state.state?.brainstormingMode).toBe('off')
  })

  test('efficient v5 development route creates a workflow run and project context artifact', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-workflow-students-'))
    const createService = new WorkflowSessionCreateService()
    const workflow = {
      templateId: 'efficient-constrained-dev-debug-workflow-v5',
      templateSource: 'builtin' as const,
      request: '做一个学生管理系统',
      repoMetadata: {
        language: 'TypeScript',
        framework: 'React',
        packageManager: 'bun',
      },
    }
    const template = await createService.resolveTemplate(workflow)

    const summary = await createService.createWorkflowSessionMetadata(
      'session-efficient-dev',
      workspaceRoot,
      template,
      workflow,
    )
    const state = await new WorkflowSessionStateService().readState('session-efficient-dev')
    const phaseIds = state.state?.phases.map((phase) => phase.id) ?? []
    const artifact = state.state?.workflowRuns?.[0]?.artifacts.find((item) => item.filename === 'project-context.md')

    expect(summary.templateId).toBe('efficient-constrained-dev-debug-workflow-v5')
    expect(summary.activeWorkflowRunId).toBe('session-efficient-dev-run-1')
    expect(summary.artifactList?.map((item) => item.filename)).toContain('project-context.md')
    expect(summary.artifactList?.find((item) => item.filename === 'project-context.md')).not.toHaveProperty('content')
    expect(state.state?.workspaceRoot).toBe(workspaceRoot)
    expect(state.state?.workflowRuns?.[0]?.workspaceRoot).toBe(workspaceRoot)
    expect(phaseIds).toEqual([
      'route-context',
      'scope-plan',
      'delivery-plan',
      'delegate-implement',
      'scenario-review',
      'local-preview',
      'finish-memory',
    ])
    expect(artifact?.content).toContain(`workspaceRoot: ${workspaceRoot}`)
    await expect(fs.readFile(path.join(workspaceRoot, '.workflow', 'project-context.md'), 'utf-8'))
      .resolves.toContain(`workspaceRoot: ${workspaceRoot}`)
    await expect(fs.readFile(path.join(workspaceRoot, '.workflow', 'work-order.md'), 'utf-8'))
      .resolves.toContain('session-efficient-dev-run-1')
    await expect(fs.readFile(path.join(workspaceRoot, '.workflow', 'run-report.md'), 'utf-8'))
      .resolves.toContain('Workflow run created.')
    await expect(fs.stat(path.join(workspaceRoot, 'project-context.md'))).rejects.toThrow()
  })



  test('seeds missing pack skill bindings as disabled instead of fallback contracts', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-workflow-pack-strict-'))
    const createService = new WorkflowSessionCreateService()
    const template = {
      schemaVersion: 1 as const,
      id: 'pack-strict-workflow',
      source: 'pack' as const,
      version: '1',
      name: 'Pack Strict Workflow',
      description: 'Imported workflow fixture.',
      phases: [
        {
          id: 'draft',
          name: 'Draft',
          instructions: 'Run the imported pack phase.',
          skills: [],
          skillBindings: ['missing-provider:missing-skill'],
          requiredArtifacts: [],
          completionCriteria: ['pack phase completed'],
          transition: { authority: 'auto' as const },
        },
      ],
    }

    try {
      await createService.createWorkflowSessionMetadata(
        'session-pack-strict',
        workspaceRoot,
        template,
        { templateId: 'pack-strict-workflow', templateSource: 'pack' as const, request: 'Run pack workflow.' },
      )
      const state = await new WorkflowSessionStateService().readState('session-pack-strict')

      expect(state.state?.skillBindingStatus).toEqual([
        {
          id: 'missing-provider:missing-skill',
          mode: 'native-if-installed-else-fallback-contract',
          availability: 'disabled',
        },
      ])
      expect(JSON.stringify(state.state?.skillBindingStatus)).not.toContain('fallbackContract')
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true })
    }
  })

  test('rejects unsafe home directory workflow workspace before writing state', async () => {
    const createService = new WorkflowSessionCreateService()
    const workflow = {
      templateId: 'efficient-constrained-dev-debug-workflow-v5',
      templateSource: 'builtin' as const,
      request: '鍒涘缓涓€涓?SaaS 璁拌处 MVP',
    }
    const template = await createService.resolveTemplate(workflow)

    await expect(createService.createWorkflowSessionMetadata(
      'session-home-workflow',
      os.homedir(),
      template,
      workflow,
    )).rejects.toMatchObject({
      statusCode: 400,
      code: 'WORKFLOW_WORKSPACE_INVALID',
    })
    await expect(new WorkflowSessionStateService().readState('session-home-workflow'))
      .resolves.toMatchObject({ state: null, recoveryStatus: 'state-missing' })
  })

  test('debug workflow route keeps investigation before fix and validation', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-jiangxia-workflow-debug-'))
    const createService = new WorkflowSessionCreateService()
    const workflow = {
      templateId: 'debug-repair-workflow-v8',
      templateSource: 'builtin' as const,
      request: '鐧诲綍椤电偣鍑绘病鍙嶅簲锛屾帶鍒跺彴鏈?500',
      errors: 'POST /login returned 500',
    }
    const template = await createService.resolveTemplate(workflow)

    const summary = await createService.createWorkflowSessionMetadata(
      'session-efficient-debug',
      workspaceRoot,
      template,
      workflow,
    )
    const state = await new WorkflowSessionStateService().readState('session-efficient-debug')
    const phaseIds = state.state?.phases.map((phase) => phase.id) ?? []

    expect(summary.labels).toContain('bug')
    expect(phaseIds).toEqual([
      'debug-memory-intake',
      'debug-investigate',
      'debug-fix',
      'debug-quality-preview',
      'debug-finish-memory',
    ])
    expect(state.state?.workflowRuns?.[0]?.artifacts.map((item) => item.filename)).toEqual(
      expect.arrayContaining(['project-context.md', 'debug-context.md']),
    )
  })
})
