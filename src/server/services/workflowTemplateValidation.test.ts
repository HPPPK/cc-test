import { describe, expect, test } from 'bun:test'
import {
  validateAndNormalizeWorkflowTemplate,
} from './workflowTemplateValidation.js'

function validPhase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'route',
    name: 'Route',
    instructions: 'Classify the request and choose the next workflow path.',
    requiredIntake: ['Use the user request and selected files.'],
    handoffRules: ['Summarize labels, effort, and the next phase.'],
    executionRules: ['Stay inside the workflow scope.'],
    outputArtifact: {
      id: 'routing-decision',
      name: 'Routing Decision',
      kind: 'markdown',
      description: 'The chosen labels, effort, and phase path.',
      required: true,
      sections: ['Labels', '', 'Effort'],
    },
    completionCriteria: {
      type: 'manual-checklist',
      description: 'Routing output is ready for confirmation.',
    },
    transition: { authority: 'user-confirmation' },
    skills: [],
    requiredArtifacts: [],
    ...overrides,
  }
}

function validTemplate(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    id: 'guided-validation',
    version: '1',
    name: 'Guided Validation',
    description: 'A workflow template used by validation tests.',
    phases: [validPhase()],
    ...overrides,
  }
}

function v7LeaderSubagentTemplate() {
  return {
    schemaVersion: 1,
    id: 'adaptive-development-subagents-v7',
    version: '7.0.0',
    name: '开发工作流 v7：Leader + Coder/Reviewer 子代理',
    description: 'Leader-led development workflow with subagent fallback contracts.',
    editable: true,
    copyable: true,
    source: 'user',
    labels: ['new-product', 'enhancement', 'bug'],
    subagentPolicy: {
      useAgentToolWhenAvailable: true,
      fallbackWhenUnavailable: 'inline-role-contract',
      roles: ['leader', 'coder', 'reviewer', 'qa'],
    },
    contextPolicy: { inheritProjectContext: true },
    templatePolicy: { immutableBuiltin: false },
    phases: [
      validPhase({
        id: 'route-memory',
        name: '识别任务 + 项目记忆',
        instructions: 'Leader routes the task and writes workflow memory artifacts.',
        outputArtifact: {
          id: 'project-context',
          name: '项目记忆 (project-context.md)',
          kind: 'document',
          description: 'Concise project memory for follow-up workflows.',
          required: true,
        },
        skills: ['workflow:task-router', 'workflow:project-memory', 'workflow:follow-up-router'],
        skillBindings: [
          { id: 'workflow:task-router', mode: 'native-if-installed-else-fallback-contract' },
        ],
        toolPolicy: {
          mode: 'allowlist',
          allowedTools: ['Read', 'Glob', 'Grep', 'LS', 'AskUserQuestion'],
          disallowedTools: ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Agent', 'Bash', 'PowerShell'],
        },
        runtimeContract: {
          allowedTools: ['Read', 'Glob', 'Grep', 'LS', 'AskUserQuestion'],
          disallowedTools: ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Agent', 'Bash', 'PowerShell'],
          mustProduce: ['project-context', 'routing-decision'],
          questionPolicy: {
            tool: 'AskUserQuestion',
            oneQuestionAtATime: true,
            minOptions: 3,
            recommendedOptionFirst: true,
            recommendedLabelSuffix: '(Recommended)',
          },
        },
        additionalOutputArtifacts: [
          {
            id: 'routing-decision',
            name: '任务判断 (routing-decision.md)',
            kind: 'document',
            description: 'label, effort, confidence, path, inheritance, next phase.',
            required: true,
          },
        ],
      }),
      validPhase({
        id: 'delegate-implement',
        name: '子代理批次实现',
        instructions: 'Leader dispatches one coder batch at a time or records fallback-contract.',
        outputArtifact: {
          id: 'implementation-log',
          name: '实现日志 (implementation-log.md)',
          kind: 'document',
          description: 'Changed files, checks, blockers, and leader summary.',
          required: true,
        },
        requiredIntake: ['work-order.md'],
        handoffRules: ['Return changedFiles, testsRun, result, blockers, and summaryForLeader.'],
        skills: ['workflow:subagent-orchestrator', 'workflow:coder-subagent'],
        subagentPolicy: {
          leaderMaySpawn: ['coder'],
          preferredRole: 'coder',
          fallback: 'leader executes same batch inline if Agent tool unavailable',
        },
        toolPolicy: {
          mode: 'allowlist',
          allowedTools: ['Read', 'Glob', 'Grep', 'LS', 'Edit', 'MultiEdit', 'Write', 'Bash', 'PowerShell', 'TodoWrite', 'AskUserQuestion', 'Agent'],
          disallowedTools: ['NotebookEdit'],
        },
      }),
    ],
  }
}

describe('workflow template validation v2 routing fields', () => {
  test('imports v7 leader/subagent schemaVersion 1 templates and preserves custom workflow fields', () => {
    const result = validateAndNormalizeWorkflowTemplate(v7LeaderSubagentTemplate(), {
      basePath: '$.templates[0]',
      source: 'import',
    })

    expect(result.issues).toEqual([])
    expect(result.template).toMatchObject({
      schemaVersion: 1,
      id: 'adaptive-development-subagents-v7',
      editable: true,
      copyable: true,
      subagentPolicy: expect.objectContaining({
        useAgentToolWhenAvailable: true,
        fallbackWhenUnavailable: 'inline-role-contract',
      }),
      contextPolicy: expect.any(Object),
      templatePolicy: expect.any(Object),
    })
    const routeMemory = result.template?.phases.find((phase) => phase.id === 'route-memory')
    const delegateImplement = result.template?.phases.find((phase) => phase.id === 'delegate-implement')

    expect(routeMemory).toMatchObject({
      skills: [
        { name: 'workflow:task-router', mode: 'recommended', source: 'fallback' },
        { name: 'workflow:project-memory', mode: 'recommended', source: 'fallback' },
        { name: 'workflow:follow-up-router', mode: 'recommended', source: 'fallback' },
      ],
      additionalOutputArtifacts: [
        expect.objectContaining({ id: 'routing-decision' }),
      ],
      runtimeContract: expect.objectContaining({
        mustProduce: ['project-context', 'routing-decision'],
      }),
    })
    expect(delegateImplement).toMatchObject({
      subagentPolicy: expect.objectContaining({
        preferredRole: 'coder',
      }),
      toolPolicy: expect.objectContaining({
        allowedTools: expect.arrayContaining(['Agent', 'Edit', 'MultiEdit']),
      }),
    })
  })

  test('normalizes schemaVersion 2 labels, routing policy, stop conditions, and phase applicability', () => {
    const result = validateAndNormalizeWorkflowTemplate(validTemplate({
      labels: ['new-product', 'bug', 'bug', 'documentation'],
      routingPolicy: {
        defaultEffort: 'standard',
        terminalLabels: ['duplicate', 'invalid', 'wontfix'],
      },
      stopConditions: ['duplicate confirmed', '', 'wontfix confirmed'],
      phases: [
        validPhase({
          appliesTo: ['new-product', 'bug', 'bug'],
          skipWhen: {
            labels: ['documentation'],
            efforts: ['light', 'light'],
          },
          modePolicy: {
            light: 'Capture a short routing note.',
            standard: 'Capture route and acceptance checkpoints.',
            heavy: 'Capture route, risks, and rollback checkpoints.',
            ignored: '',
          },
          phasePrompt: {
            objective: 'Route the request.',
            handoffInput: ['User request'],
            executionRules: ['Ask one structured question when blocked.'],
            outputArtifact: {
              name: 'Routing Decision',
              sections: ['Recommendation', '', 'Rationale'],
            },
            completionRules: ['User confirmed route.'],
          },
          skillBindings: [
            'superpowers:writing-plans',
            { id: 'superpowers:test-driven-development', mode: 'native-if-installed-else-fallback-contract' },
          ],
          runtimeContract: {
            allowedActions: ['read', 'artifact', 'question'],
            forbiddenActions: ['production edits'],
            toolAccess: {
              allowed: ['read', 'AskUserQuestion'],
              forbidden: ['apply_patch'],
              requiresExplicitUserConfirmation: ['deploy'],
              maxRepairLoops: 2,
              repairLoopAllowedTo: 'fix verification failures only',
            },
            completionRequires: ['project-context.md exists'],
          },
          outputArtifacts: [
            {
              id: 'project-context',
              filename: 'project-context.md',
              kind: 'markdown',
              required: true,
              requiredWhen: ['new-product', 'ux-copy'],
              description: 'Project context',
            },
          ],
        }),
      ],
    }))

    expect(result.issues).toEqual([])
    expect(result.template).toMatchObject({
      schemaVersion: 2,
      id: 'guided-validation',
      source: 'user',
      labels: ['new-product', 'bug', 'documentation'],
      routingPolicy: {
        defaultEffort: 'standard',
        terminalLabels: ['duplicate', 'invalid', 'wontfix'],
      },
      stopConditions: ['duplicate confirmed', 'wontfix confirmed'],
      phases: [
        expect.objectContaining({
          id: 'route',
          appliesTo: ['new-product', 'bug'],
          skipWhen: {
            labels: ['documentation'],
            efforts: ['light'],
          },
          modePolicy: {
            light: 'Capture a short routing note.',
            standard: 'Capture route and acceptance checkpoints.',
            heavy: 'Capture route, risks, and rollback checkpoints.',
          },
          phasePrompt: {
            objective: 'Route the request.',
            handoffInput: ['User request'],
            executionRules: ['Ask one structured question when blocked.'],
            outputArtifact: {
              name: 'Routing Decision',
              sections: ['Recommendation', 'Rationale'],
            },
            completionRules: ['User confirmed route.'],
          },
          skillBindings: [
            'superpowers:writing-plans',
            { id: 'superpowers:test-driven-development', mode: 'native-if-installed-else-fallback-contract' },
          ],
          runtimeContract: {
            allowedActions: ['read', 'artifact', 'question'],
            forbiddenActions: ['production edits'],
            toolAccess: {
              allowed: ['read', 'AskUserQuestion'],
              forbidden: ['apply_patch'],
              requiresExplicitUserConfirmation: ['deploy'],
              maxRepairLoops: 2,
              repairLoopAllowedTo: 'fix verification failures only',
            },
            completionRequires: ['project-context.md exists'],
          },
          outputArtifacts: [
            {
              id: 'project-context',
              filename: 'project-context.md',
              kind: 'markdown',
              required: true,
              requiredWhen: ['new-product', 'ux-copy'],
              description: 'Project context',
            },
          ],
        }),
      ],
    })
  })

  test('reports invalid workflow labels, efforts, mode policy shape, and unsupported schema versions', () => {
    const result = validateAndNormalizeWorkflowTemplate(validTemplate({
      schemaVersion: 99,
      labels: ['bug', 'triage-later'],
      phases: [
        validPhase({
          appliesTo: ['bug', 'unsupported-label'],
          skipWhen: {
            labels: ['documentation', 'later'],
            efforts: ['light', 'medium'],
          },
          modePolicy: 'light',
        }),
      ],
    }), {
      basePath: '$.templates[0]',
      source: 'import',
    })

    expect(result.template).toBeNull()
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'import',
        path: '$.templates[0].schemaVersion',
        code: 'WORKFLOW_TEMPLATE_SCHEMA_VERSION_UNSUPPORTED',
      }),
      expect.objectContaining({
        path: '$.templates[0].labels[1]',
        code: 'WORKFLOW_LABEL_INVALID',
      }),
      expect.objectContaining({
        path: '$.templates[0].phases[0].appliesTo[1]',
        code: 'WORKFLOW_LABEL_INVALID',
      }),
      expect.objectContaining({
        path: '$.templates[0].phases[0].skipWhen.labels[1]',
        code: 'WORKFLOW_LABEL_INVALID',
      }),
      expect.objectContaining({
        path: '$.templates[0].phases[0].skipWhen.efforts[1]',
        code: 'WORKFLOW_EFFORT_INVALID',
      }),
      expect.objectContaining({
        path: '$.templates[0].phases[0].modePolicy',
        code: 'WORKFLOW_PHASE_MODE_POLICY_INVALID',
      }),
    ]))
  })
})
