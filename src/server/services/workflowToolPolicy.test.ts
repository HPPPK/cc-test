import { describe, expect, test } from 'bun:test'
import type { WorkflowPhaseIssue, WorkflowSessionState } from './workflowTypes.js'
import * as workflowToolPolicy from './workflowToolPolicy.js'
import {
  WORKFLOW_TEMPLATE_AUTHORING_MUTATING_OPERATIONS,
  WORKFLOW_TEMPLATE_AUTHORING_READ_ONLY_OPERATIONS,
  concreteToolNamesForWorkflowCapability,
  getWorkflowQuestionCardContractViolation,
  getWorkflowTemplateAuthoringOperationPolicy,
  getWorkflowUnavailableSearchToolNames,
  getWorkflowPhaseActionPolicy,
  getWorkflowPhaseDisallowedTools,
  isWorkflowTemplateAuthoringMutationDenied,
  isWorkflowTemplateAuthoringMutatingOperation,
  isWorkflowTemplateAuthoringReadOnlyOperation,
  isWorkflowPhaseToolDenied,
  isWorkflowComputerUseDenied,
} from './workflowToolPolicy.js'

const SUBMIT_PHASE_COMPLETION_TOOL_NAME = 'submit_phase_completion'

const WORKING_RIPGREP_STATUS = {
  mode: 'system' as const,
  path: '/usr/local/bin/rg',
  working: true,
}

function getWorkflowPhaseDisallowedToolsWithWorkingSearch(state: WorkflowSessionState | null | undefined): string[] {
  return getWorkflowPhaseDisallowedTools(state, WORKING_RIPGREP_STATUS)
}

const getWorkflowScopedToolNames = (
  workflowToolPolicy as typeof workflowToolPolicy & {
    getWorkflowScopedToolNames?: (state: WorkflowSessionState | null | undefined) => string[]
  }
).getWorkflowScopedToolNames

const getWorkflowPromptToolGuidance = (
  workflowToolPolicy as typeof workflowToolPolicy & {
    getWorkflowPromptToolGuidance?: (state: WorkflowSessionState | null | undefined, template?: WorkflowSessionState['templateSnapshot']) => string | null
  }
).getWorkflowPromptToolGuidance

function requireWorkflowScopedToolNames() {
  expect(typeof getWorkflowScopedToolNames).toBe('function')
  if (!getWorkflowScopedToolNames) {
    throw new Error('getWorkflowScopedToolNames export is required')
  }
  return getWorkflowScopedToolNames
}

function requireWorkflowPromptToolGuidance() {
  expect(typeof getWorkflowPromptToolGuidance).toBe('function')
  if (!getWorkflowPromptToolGuidance) {
    throw new Error('getWorkflowPromptToolGuidance export is required')
  }
  return getWorkflowPromptToolGuidance
}

function stateFor(activePhaseId: string | null): WorkflowSessionState {
  return {
    mode: 'workflow',
    activePhaseId,
    workflowStatus: activePhaseId ? 'running' : 'completed',
    status: activePhaseId ? 'running' : 'completed',
  } as WorkflowSessionState
}

const ACTION_POLICY_BY_PHASE_ID = {
  'requirements-clarification': {
    allowedActions: [
      'Ask clarifying questions',
      'Summarize confirmed requirements',
      'Record constraints, acceptance criteria, and open questions',
    ],
    forbiddenActions: [
      'Create, edit, or delete implementation files',
      'Start implementation coding',
      'Skip user confirmation before design',
    ],
  },
  'technical-design': {
    allowedActions: [
      'Design the technical approach and affected code surfaces',
      'Identify risks, dependencies, and validation strategy',
      'Explain tradeoffs before implementation planning',
    ],
    forbiddenActions: [
      'Create, edit, or delete implementation files',
      'Run implementation commands',
      'Skip user confirmation before task planning',
    ],
  },
  'implementation-planning': {
    allowedActions: [
      'Break the approved design into ordered implementation tasks',
      'Name files and tests that will be changed',
      'Define validation commands and handoff checkpoints',
    ],
    forbiddenActions: [
      'Create, edit, or delete implementation files',
      'Start implementation coding before the plan is accepted',
      'Expand scope beyond the approved design',
    ],
  },
  implementation: {
    allowedActions: [
      'Create and edit scoped production, test, and documentation files',
      'Run focused checks while implementing',
      'Fix defects found inside the approved implementation scope',
    ],
    forbiddenActions: [
      'Change requirements without returning to an earlier phase',
      'Skip required validation evidence',
      'Make unrelated refactors or scope expansions',
    ],
  },
  verification: {
    allowedActions: [
      'Run verification commands and inspect their output',
      'Record pass, fail, skipped checks, and residual risk',
      'Apply narrow fixes only for validation failures inside the implemented scope',
    ],
    forbiddenActions: [
      'Add new product scope without returning to requirements or design',
      'Start a new implementation batch without a failed validation reason',
      'Claim completion without fresh evidence',
    ],
  },
}

function workflowStateWithActionPolicy(activePhaseId: string, policyPhaseId = activePhaseId): WorkflowSessionState {
  const actionPolicy = ACTION_POLICY_BY_PHASE_ID[policyPhaseId as keyof typeof ACTION_POLICY_BY_PHASE_ID]
  return {
    ...stateFor(activePhaseId),
    templateSnapshot: {
      schemaVersion: 2,
      id: 'zip-action-policy-fixture',
      source: 'user',
      version: '1',
      displayName: 'ZIP action policy fixture',
      description: 'Workflow policy fixture loaded from ZIP content',
      phases: [
        {
          id: activePhaseId,
          label: activePhaseId,
          instructions: 'Run with explicit ZIP-packaged action policy.',
          requestedModel: null,
          actionPolicy,
          skillDeclarations: [],
          requiredArtifacts: [],
          completionCriteria: ['phase handoff is ready'],
          transitionAuthority: 'user-confirmation',
        },
      ],
    },
  } as WorkflowSessionState
}

function workflowStateWithSkills(): WorkflowSessionState {
  return {
    ...stateFor('requirements-clarification'),
    templateSnapshot: {
      schemaVersion: 1,
      id: 'agent-development',
      source: 'builtin',
      version: '1',
      displayName: 'Agent Development',
      description: 'Workflow policy fixture',
      phases: [
        {
          id: 'requirements-clarification',
          label: 'Requirements',
          instructions: 'Clarify the requested behavior.',
          requestedModel: null,
          skillDeclarations: [
            {
              id: 'requirements-review',
              source: 'template',
              guidance: 'Use requirements-review as prompt-level guidance only.',
            },
          ],
          requiredArtifacts: [],
          completionCriteria: ['requirements handoff is ready'],
          transitionAuthority: 'user-confirmation',
        },
      ],
    },
  } as WorkflowSessionState
}

function workflowStateWithRecommendedPhaseSkills(): WorkflowSessionState {
  return {
    ...stateFor('requirements-clarification'),
    templateSnapshot: {
      schemaVersion: 1,
      id: 'agent-development',
      source: 'builtin',
      version: '1',
      displayName: 'Agent Development',
      description: 'Workflow policy fixture',
      phases: [
        {
          id: 'requirements-clarification',
          label: 'Requirements',
          instructions: 'Clarify the requested behavior.',
          requestedModel: null,
          skills: [
            { name: 'requirements-review', mode: 'recommended', source: 'project' },
            { name: 'missing-audit', mode: 'recommended', source: 'user' },
          ],
          skillDeclarations: [],
          requiredArtifacts: [],
          completionCriteria: ['requirements handoff is ready'],
          transitionAuthority: 'user-confirmation',
        },
      ],
    },
    phaseSkillSnapshots: [
      {
        phaseId: 'requirements-clarification',
        references: [
          { name: 'requirements-review', mode: 'recommended', source: 'project' },
          { name: 'missing-audit', mode: 'recommended', source: 'user' },
        ],
        resolutions: [
          {
            reference: { name: 'requirements-review', mode: 'recommended', source: 'project' },
            status: 'available',
            checkedAt: '2026-05-20T00:00:00.000Z',
            resolvedSkill: {
              name: 'requirements-review',
              source: 'project',
            },
          },
          {
            reference: { name: 'missing-audit', mode: 'recommended', source: 'user' },
            status: 'missing',
            checkedAt: '2026-05-20T00:00:00.000Z',
          },
        ],
        snapshottedAt: '2026-05-20T00:00:00.000Z',
      },
    ],
  } as unknown as WorkflowSessionState
}

function workflowStateWithCustomAuthoringPolicy(activePhaseId: string): WorkflowSessionState {
  return {
    ...stateFor(activePhaseId),
    templateSnapshot: {
      schemaVersion: 1,
      id: 'custom-authoring',
      source: 'user',
      version: '1',
      displayName: 'Custom Authoring',
      description: 'Custom policy fixture',
      phases: [
        {
          id: activePhaseId,
          label: 'Custom phase',
          instructions: 'Run custom authoring policy.',
          requestedModel: null,
          actionPolicy: {
            allowedActions: [
              'Workflow template authoring',
              'Record validation diagnostics',
            ],
            forbiddenActions: ['Edit unrelated files'],
          },
          requiredArtifacts: [],
          completionCriteria: ['custom policy satisfied'],
          transitionAuthority: 'user-confirmation',
        },
      ],
    },
  } as WorkflowSessionState
}

function workflowStateWithToolPolicy(
  activePhaseId: string,
  allowedTools: string[],
): WorkflowSessionState {
  return {
    ...stateFor(activePhaseId),
    templateSnapshot: {
      schemaVersion: 1,
      id: 'custom-tools',
      source: 'user',
      version: '1',
      displayName: 'Custom Tools',
      description: 'Custom tool policy fixture',
      phases: [
        {
          id: activePhaseId,
          label: 'Custom tools phase',
          instructions: 'Run with custom tool access.',
          requestedModel: null,
          toolPolicy: {
            allowedTools,
          },
          skillDeclarations: [],
          requiredArtifacts: [],
          completionCriteria: ['custom policy satisfied'],
          transitionAuthority: 'user-confirmation',
        },
      ],
    },
  } as WorkflowSessionState
}

function workflowStateWithRuntimeContractToolAccess(
  activePhaseId: string,
  allowed: string[],
): WorkflowSessionState {
  return {
    ...stateFor(activePhaseId),
    templateSnapshot: {
      schemaVersion: 2,
      id: 'runtime-contract-tools',
      source: 'user',
      version: '1',
      displayName: 'Runtime Contract Tools',
      description: 'Runtime contract tool access fixture',
      phases: [
        {
          id: activePhaseId,
          label: 'Runtime contract phase',
          instructions: 'Run with runtimeContract.toolAccess.',
          requestedModel: null,
          runtimeContract: {
            allowedActions: ['read', 'artifact', 'question'],
            forbiddenActions: ['production edits'],
            toolAccess: { allowed },
          },
          skillDeclarations: [],
          requiredArtifacts: [],
          completionCriteria: ['contract satisfied'],
          transitionAuthority: 'user-confirmation',
        },
      ],
    },
  } as WorkflowSessionState
}

describe('workflowToolPolicy', () => {
  test('reads explicit allowed and forbidden actions from the ZIP-packaged workflow template snapshot', () => {
    const requirements = getWorkflowPhaseActionPolicy((state => state)(workflowStateWithActionPolicy('requirements-clarification')), workflowStateWithActionPolicy('requirements-clarification').templateSnapshot)
    const design = getWorkflowPhaseActionPolicy((state => state)(workflowStateWithActionPolicy('technical-design')), workflowStateWithActionPolicy('technical-design').templateSnapshot)
    const planning = getWorkflowPhaseActionPolicy((state => state)(workflowStateWithActionPolicy('implementation-planning')), workflowStateWithActionPolicy('implementation-planning').templateSnapshot)
    const implementation = getWorkflowPhaseActionPolicy((state => state)(workflowStateWithActionPolicy('implementation')), workflowStateWithActionPolicy('implementation').templateSnapshot)
    const verification = getWorkflowPhaseActionPolicy((state => state)(workflowStateWithActionPolicy('verification')), workflowStateWithActionPolicy('verification').templateSnapshot)

    expect(requirements).toMatchObject({
      phaseId: 'requirements-clarification',
      allowedActions: expect.arrayContaining([
        'Ask clarifying questions',
        'Summarize confirmed requirements',
        'Record constraints, acceptance criteria, and open questions',
      ]),
      forbiddenActions: expect.arrayContaining([
        'Create, edit, or delete implementation files',
        'Start implementation coding',
        'Skip user confirmation before design',
      ]),
    })
    expect(design?.forbiddenActions).toContain('Create, edit, or delete implementation files')
    expect(planning?.allowedActions).toContain('Break the approved design into ordered implementation tasks')
    expect(implementation?.allowedActions).toContain('Create and edit scoped production, test, and documentation files')
    expect(verification?.forbiddenActions).toContain('Add new product scope without returning to requirements or design')
  })

  test('hard-denies write tools during a phase whose ZIP action policy forbids implementation changes', () => {
    const state = workflowStateWithActionPolicy('requirements-clarification')

    for (const toolName of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
      expect(isWorkflowPhaseToolDenied(toolName, state), toolName).toBe(true)
    }
    expect(isWorkflowPhaseToolDenied(SUBMIT_PHASE_COMPLETION_TOOL_NAME, state)).toBe(false)
    expect(isWorkflowPhaseToolDenied('AskUserQuestion', state)).toBe(false)
  })

  test('keeps explicit tool names exact instead of expanding NotebookEdit into all edit tools', () => {
    expect(concreteToolNamesForWorkflowCapability('NotebookEdit')).toEqual(['NotebookEdit'])
    expect(concreteToolNamesForWorkflowCapability('Write')).toEqual(['Write'])
    expect(concreteToolNamesForWorkflowCapability('Edit')).toEqual(['Edit'])
    expect(concreteToolNamesForWorkflowCapability('read')).toEqual([
      'Read',
      'Glob',
      'Grep',
      'LS',
    ])
    expect(concreteToolNamesForWorkflowCapability('edit-within-plan')).toEqual([
      'Write',
      'Edit',
      'MultiEdit',
      'NotebookEdit',
    ])
    expect(concreteToolNamesForWorkflowCapability('   ')).toEqual([])
    expect(concreteToolNamesForWorkflowCapability('not-a-workflow-tool')).toEqual([])
  })

  test('identifies ripgrep-backed tools when search is unavailable', () => {
    expect(getWorkflowUnavailableSearchToolNames({
      mode: 'unavailable',
      path: '',
      working: false,
    })).toEqual(['Glob', 'Grep'])

    expect(getWorkflowUnavailableSearchToolNames({
      mode: 'system',
      path: '/usr/local/bin/rg',
      working: null,
    })).toEqual([])
  })

  test('allows implementation tools only after the workflow formally advances into an implementation phase', () => {
    const implementation = workflowStateWithActionPolicy('implementation')
    expect(isWorkflowPhaseToolDenied('Write', implementation)).toBe(false)
    expect(isWorkflowPhaseToolDenied('Edit', implementation)).toBe(false)
    expect(isWorkflowPhaseToolDenied('Bash', implementation)).toBe(false)
    expect(getWorkflowPhaseDisallowedToolsWithWorkingSearch(stateFor(null))).toEqual([])
  })

  test('applies legacy command and subagent restrictions when no structured tool access exists', () => {
    const state = workflowStateWithActionPolicy('legacy-research')
    state.templateSnapshot.phases[0] = {
      ...state.templateSnapshot.phases[0],
      actionPolicy: {
        allowedActions: ['inspect evidence'],
        forbiddenActions: [
          'Run implementation command, test, build, or lint.',
          'General autonomous agent and subagent dispatch are not permitted.',
        ],
      },
    }

    const denied = getWorkflowPhaseDisallowedToolsWithWorkingSearch(state)

    expect(denied).toEqual(expect.arrayContaining(['Bash', 'PowerShell', 'Agent']))
  })

  test('does not treat Stage 4 prerequisite wording as a ban on explicitly allowed source-edit tools', () => {
    const state: WorkflowSessionState = {
      ...stateFor('delegate-implement'),
      templateSnapshot: {
        schemaVersion: 2,
        id: 'stage-four-implementation-prerequisites',
        source: 'user',
        version: '1',
        displayName: 'Stage 4 implementation prerequisites',
        description: 'Regression fixture for implementation prerequisites.',
        phases: [
          {
            id: 'delegate-implement',
            label: 'Implementation',
            instructions: 'Implement the approved task packet.',
            requestedModel: null,
            actionPolicy: {
              allowedActions: ['edit-within-plan'],
              forbiddenActions: [
                'Create implementation-task-packets.md before any production code change.',
                'Write implementation-log.md and update run-report.md before leaving Stage 4.',
              ],
            },
            toolPolicy: {
              allowedTools: ['Read', 'Write', 'Edit', 'MultiEdit', 'Bash'],
              disallowedTools: ['NotebookEdit'],
            },
            skillDeclarations: [],
            requiredArtifacts: [],
            completionCriteria: ['implementation evidence is ready'],
            transitionAuthority: 'user-confirmation',
          },
        ],
      },
    } as WorkflowSessionState

    const denied = getWorkflowPhaseDisallowedToolsWithWorkingSearch(state)

    expect(denied).not.toContain('Write')
    expect(denied).not.toContain('Edit')
    expect(denied).not.toContain('MultiEdit')
    expect(denied).toContain('NotebookEdit')
  })
  test('keeps SuperSpec action guidance while leaving template authoring unrestricted', () => {
    const phaseState = workflowStateWithActionPolicy('sp-implement', 'implementation')

    expect(getWorkflowPhaseActionPolicy(phaseState, phaseState.templateSnapshot)).toMatchObject({
      phaseId: 'sp-implement',
      allowedActions: expect.arrayContaining([
        'Create and edit scoped production, test, and documentation files',
      ]),
    })
    expect(getWorkflowTemplateAuthoringOperationPolicy('create', phaseState)).toMatchObject({
      allowed: true,
      denied: false,
      reason: 'workflow-tool-access-unrestricted',
      phaseId: 'sp-implement',
    })
  })
  test('enforces an explicit phase tool allow-list while retaining completion and structured-question tools', () => {
    const getToolNames = requireWorkflowScopedToolNames()
    const state = workflowStateWithToolPolicy('requirements-clarification', [
      'read',
      'AskUserQuestion',
    ])

    expect(isWorkflowPhaseToolDenied('Read', state)).toBe(false)
    expect(isWorkflowPhaseToolDenied('AskUserQuestion', state)).toBe(false)
    expect(isWorkflowPhaseToolDenied(SUBMIT_PHASE_COMPLETION_TOOL_NAME, state)).toBe(false)
    expect(isWorkflowPhaseToolDenied('Write', state)).toBe(true)
    expect(isWorkflowPhaseToolDenied('Bash', state)).toBe(true)
    expect(getToolNames(state)).toEqual([SUBMIT_PHASE_COMPLETION_TOOL_NAME, 'request_workflow_route'])
  })
  test('enforces runtimeContract toolAccess aliases as a concrete allow-list', () => {
    const state = workflowStateWithRuntimeContractToolAccess('route-context', [
      'read',
      'artifact',
      'AskUserQuestion',
    ])

    expect(isWorkflowPhaseToolDenied('Read', state)).toBe(false)
    expect(isWorkflowPhaseToolDenied('AskUserQuestion', state)).toBe(false)
    expect(isWorkflowPhaseToolDenied('Write', state)).toBe(true)
    expect(isWorkflowPhaseToolDenied('Bash', state)).toBe(true)
  })
  test('hard-denies implementation, terminal, and agent tools for all shipped workflow stage-one contracts', () => {
    const stageOneContracts = [
      {
        phaseId: 'route-context',
        toolPolicy: {
          allowedTools: [
            'Read',
            'Glob',
            'Grep',
            'LS',
            'AskUserQuestion',
            'workflow_template_authoring',
            'submit_phase_completion',
            'request_workflow_route',
          ],
          disallowedTools: ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent'],
        },
        runtimeContract: {
          allowedActions: ['read', 'artifact', 'question', 'route-request', 'request_workflow_route'],
        },
      },
      {
        // Match the shipped Debug ZIP: Stage 1 permits read/artifact/question through
        // its runtime contract; it does not declare a request_workflow_route-only tool policy.
        phaseId: 'debug-memory-intake',
        runtimeContract: {
          allowedActions: ['read', 'artifact', 'question'],
          forbiddenActions: ['production edits', 'dependency installs', 'migrations', 'deletes', 'deploy'],
        },
      },
      {
        // Match the shipped Feature Extension ZIP: Stage 1 permits read/search/artifact/question.
        phaseId: 'feature-memory-plan',
        runtimeContract: {
          allowedActions: ['read', 'search', 'artifact', 'question'],
          forbiddenActions: ['production edits', 'dependency installs', 'migrations', 'deletes', 'deploy'],
        },
      },
    ]

    for (const contract of stageOneContracts) {
      const state = {
        ...stateFor(contract.phaseId),
        templateSnapshot: {
          schemaVersion: 2,
          id: `${contract.phaseId}-fixture`,
          source: 'user',
          version: '1',
          displayName: contract.phaseId,
          description: 'Shipped stage-one workflow contract fixture.',
          phases: [{
            id: contract.phaseId,
            label: contract.phaseId,
            instructions: 'Run only the active stage-one workflow contract.',
            requestedModel: null,
            toolPolicy: contract.toolPolicy,
            runtimeContract: contract.runtimeContract,
            skillDeclarations: [],
            requiredArtifacts: [],
            completionCriteria: ['stage-one handoff is ready'],
            transitionAuthority: 'user-confirmation',
          }],
        },
      } as WorkflowSessionState

      expect(isWorkflowPhaseToolDenied('Read', state), `${contract.phaseId}: Read`).toBe(false)
      expect(isWorkflowPhaseToolDenied('AskUserQuestion', state), `${contract.phaseId}: AskUserQuestion`).toBe(false)
      expect(isWorkflowPhaseToolDenied(SUBMIT_PHASE_COMPLETION_TOOL_NAME, state), `${contract.phaseId}: completion`).toBe(false)
      expect(isWorkflowPhaseToolDenied('request_workflow_route', state), `${contract.phaseId}: route`).toBe(false)
      for (const toolName of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Agent']) {
        expect(isWorkflowPhaseToolDenied(toolName, state), `${contract.phaseId}: ${toolName}`).toBe(true)
      }
    }
  })

  test('does not expose workflow restrictions after exit', () => {
    const getToolNames = requireWorkflowScopedToolNames()
    const state = {
      ...stateFor('requirements-clarification'),
      workflowStatus: 'cancelled',
      status: 'cancelled',
    } as WorkflowSessionState

    expect(getWorkflowPhaseDisallowedToolsWithWorkingSearch(state)).toEqual([])
    expect(getToolNames(state)).toEqual([])
    expect(getWorkflowPromptToolGuidance(state)).toBeNull()
  })

  test('does not use user text or a legacy policy omission to re-enable denied tools', () => {
    const state = workflowStateWithToolPolicy('requirements-clarification', ['Bash'])

    expect(isWorkflowPhaseToolDenied('Bash', state)).toBe(false)
    expect(isWorkflowPhaseToolDenied('Write', state)).toBe(true)
  })
  test('allows only the declarative scoped artifact-write capability before implementation', () => {
    const capability = workflowToolPolicy.WORKFLOW_ARTIFACT_WRITE_CAPABILITY
    const state = workflowStateWithToolPolicy('scope-plan', ['Read', capability])

    expect(concreteToolNamesForWorkflowCapability(capability)).toEqual(['Write'])
    expect(workflowToolPolicy.hasWorkflowArtifactWriteCapability(state)).toBe(true)
    expect(isWorkflowPhaseToolDenied('Write', state)).toBe(false)
    expect(isWorkflowPhaseToolDenied('Edit', state)).toBe(true)
    expect(workflowToolPolicy.isWorkflowArtifactWritePath('/workspace/project', '.workflow/project-context.md')).toBe(true)
    expect(workflowToolPolicy.isWorkflowArtifactWritePath('/workspace/project', '.workflow/../src/app.ts')).toBe(false)
    expect(workflowToolPolicy.isWorkflowArtifactWritePath('/workspace/project', 'src/app.ts')).toBe(false)
  })

  test('classifies workflow template authoring operations by read-only and mutating behavior', () => {
    expect(WORKFLOW_TEMPLATE_AUTHORING_READ_ONLY_OPERATIONS).toEqual([
      'guide',
      'skill_catalog',
      'list',
      'inspect',
      'validate',
    ])
    expect(WORKFLOW_TEMPLATE_AUTHORING_MUTATING_OPERATIONS).toEqual([
      'skill_create',
      'create',
      'update',
      'duplicate',
      'delete',
    ])

    for (const operation of WORKFLOW_TEMPLATE_AUTHORING_READ_ONLY_OPERATIONS) {
      expect(isWorkflowTemplateAuthoringReadOnlyOperation(operation)).toBe(true)
      expect(isWorkflowTemplateAuthoringMutatingOperation(operation)).toBe(false)
    }

    for (const operation of WORKFLOW_TEMPLATE_AUTHORING_MUTATING_OPERATIONS) {
      expect(isWorkflowTemplateAuthoringReadOnlyOperation(operation)).toBe(false)
      expect(isWorkflowTemplateAuthoringMutatingOperation(operation)).toBe(true)
    }
  })

  test('keeps read-only workflow template authoring operations available in non-implementation phases', () => {
    for (const phaseId of ['requirements-clarification', 'technical-design', 'implementation-planning', 'verification']) {
      for (const operation of WORKFLOW_TEMPLATE_AUTHORING_READ_ONLY_OPERATIONS) {
        const result = getWorkflowTemplateAuthoringOperationPolicy(operation, stateFor(phaseId))

        expect(result).toMatchObject({
          operation,
          allowed: true,
          denied: false,
          readOnly: true,
          mutating: false,
          reason: 'read-only-operation',
        })
      }
    }

    expect(getWorkflowPhaseDisallowedTools(stateFor('requirements-clarification'))).not.toContain(
      'workflow_template_authoring',
    )
  })

  test('keeps workflow template authoring mutations available in every active phase', () => {
    for (const phaseId of ['requirements-clarification', 'technical-design', 'implementation-planning', 'verification']) {
      for (const operation of WORKFLOW_TEMPLATE_AUTHORING_MUTATING_OPERATIONS) {
        const result = getWorkflowTemplateAuthoringOperationPolicy(operation, stateFor(phaseId))

        expect(result).toMatchObject({
          operation,
          allowed: true,
          denied: false,
          readOnly: false,
          mutating: true,
          phaseId,
          reason: 'workflow-tool-access-unrestricted',
        })
        expect(result.message).toContain('follow the active phase guidance')
        expect(isWorkflowTemplateAuthoringMutationDenied(operation, stateFor(phaseId))).toBe(false)
      }
    }
  })
  test('keeps workflow template authoring mutations available outside and inside active workflows', () => {
    const nonWorkflowState = {
      mode: 'dialogue',
    } as unknown as WorkflowSessionState

    for (const operation of WORKFLOW_TEMPLATE_AUTHORING_MUTATING_OPERATIONS) {
      for (const state of [undefined, stateFor(null), nonWorkflowState]) {
        expect(getWorkflowTemplateAuthoringOperationPolicy(operation, state)).toMatchObject({
          operation,
          allowed: true,
          denied: false,
          reason: 'outside-active-workflow',
        })
      }
      for (const phaseId of ['implementation', 'implement']) {
        expect(getWorkflowTemplateAuthoringOperationPolicy(operation, stateFor(phaseId))).toMatchObject({
          operation,
          allowed: true,
          denied: false,
          phaseId,
          reason: 'workflow-tool-access-unrestricted',
        })
      }
    }
  })
  test('ignores custom phase policy for template authoring availability', () => {
    const state = workflowStateWithCustomAuthoringPolicy('workflow-maintenance')

    for (const operation of WORKFLOW_TEMPLATE_AUTHORING_MUTATING_OPERATIONS) {
      expect(getWorkflowTemplateAuthoringOperationPolicy(operation, state)).toMatchObject({
        operation,
        allowed: true,
        denied: false,
        phaseId: 'workflow-maintenance',
        reason: 'workflow-tool-access-unrestricted',
      })
      expect(isWorkflowTemplateAuthoringMutationDenied(operation, state)).toBe(false)
    }
  })
  test('fails closed for unknown workflow template authoring operations', () => {
    expect(getWorkflowTemplateAuthoringOperationPolicy('publish', stateFor('implementation'))).toMatchObject({
      operation: 'publish',
      allowed: false,
      denied: true,
      readOnly: false,
      mutating: false,
      reason: 'unknown-operation',
    })
  })

  test('exposes submit_phase_completion only for active workflow sessions', () => {
    const getToolNames = requireWorkflowScopedToolNames()

    const workflowTools = getToolNames(stateFor('requirements-clarification'))
    const completedTools = getToolNames(stateFor(null))

    expect(workflowTools).toContain(SUBMIT_PHASE_COMPLETION_TOOL_NAME)
    expect(completedTools).not.toContain(SUBMIT_PHASE_COMPLETION_TOOL_NAME)
  })

  test('keeps direct completion submission and structured recovery routing visible while a phase is ineligible', () => {
    const getToolNames = requireWorkflowScopedToolNames()
    const getPromptGuidance = requireWorkflowPromptToolGuidance()
    const state = {
      ...stateFor('requirements-clarification'),
      runtimeContract: {
        migrationStatus: 'current',
        phaseStates: {
          'requirements-clarification': {
            eligibility: 'ineligible',
            blockerReasons: ['A required phase issue is still open.'],
          },
        },
      },
    } as WorkflowSessionState

    expect(getToolNames(state)).toEqual([SUBMIT_PHASE_COMPLETION_TOOL_NAME, 'request_workflow_route'])
    expect(isWorkflowPhaseToolDenied(SUBMIT_PHASE_COMPLETION_TOOL_NAME, state)).toBe(false)
    expect(isWorkflowPhaseToolDenied('request_workflow_route', state)).toBe(false)

    const guidance = getPromptGuidance(state)
    expect(guidance).toContain('direct API tool, never a Skill')
    expect(guidance).toContain('workflow:submit_phase_completion')
    expect(guidance).toContain('not yet eligible')
    expect(guidance).toContain('Do not submit ready/completed')
    expect(guidance).toContain('submit_phase_completion with status blocked or needs_user')
    expect(guidance).toContain('request_workflow_route with rework_current_phase or jump_to_phase')
  })

  test('fails closed for dialogue sessions instead of leaking workflow tools', () => {
    const getToolNames = requireWorkflowScopedToolNames()
    const getPromptGuidance = requireWorkflowPromptToolGuidance()

    const dialogueState = {
      mode: 'dialogue',
    } as unknown as WorkflowSessionState

    expect(getToolNames(dialogueState)).toEqual([])
    expect(getPromptGuidance(dialogueState)).toBeNull()
  })

  test('adds workflow prompt guidance for skills and completion tool without enabling SkillTool globally', () => {
    const getPromptGuidance = requireWorkflowPromptToolGuidance()

    const skillsState = workflowStateWithSkills()
    const guidance = getPromptGuidance(skillsState, skillsState.templateSnapshot)

    expect(guidance).toContain(SUBMIT_PHASE_COMPLETION_TOOL_NAME)
    expect(guidance).toContain('phaseId')
    expect(guidance).toContain('stateVersion')
    expect(guidance).toContain('status')
    expect(guidance).toContain('handoff')
    expect(guidance).toContain('rationale')
    expect(guidance).toContain('evidence')
    expect(guidance).toContain('requires status, handoff, rationale, and evidence')
    expect(guidance).toContain('phaseId and stateVersion may be omitted')
    expect(guidance).toContain('handoff must be an object')
    expect(guidance).toContain('rationale must be a non-empty string')
    expect(guidance).toContain('evidence must be an array')
    expect(guidance).toContain('The persisted completion gate is not yet eligible')
    expect(guidance).toContain('Do not submit ready/completed')
    expect(guidance).toContain('Do not ask the user to type continue before calling the completion tool')
    expect(guidance).toContain('requirements-review')
    expect(guidance).toContain('prompt-level guidance only')

    const dialogueState = {
      mode: 'dialogue',
    } as unknown as WorkflowSessionState
    expect(getPromptGuidance(dialogueState)).toBeNull()
  })

  test('recommended phase skills do not create hard tool restrictions or enable SkillTool globally', () => {
    const getToolNames = requireWorkflowScopedToolNames()
    const getPromptGuidance = requireWorkflowPromptToolGuidance()
    const state = workflowStateWithRecommendedPhaseSkills()

    expect(getToolNames(state)).toEqual([SUBMIT_PHASE_COMPLETION_TOOL_NAME, 'request_workflow_route'])
    expect(getToolNames(state)).not.toContain('SkillTool')
    expect(getToolNames(state)).not.toContain('skill')
    const disallowedTools = getWorkflowPhaseDisallowedTools(state)
    for (const toolName of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
      expect(disallowedTools).toContain(toolName)
    }
    for (const toolName of ['Bash', 'PowerShell', 'Agent', 'workflow_template_authoring']) {
      expect(disallowedTools).not.toContain(toolName)
    }
    expect(isWorkflowPhaseToolDenied('Write', state)).toBe(true)
    expect(getWorkflowTemplateAuthoringOperationPolicy('update', state)).toMatchObject({
      allowed: true,
      denied: false,
      reason: 'workflow-tool-access-unrestricted',
    })

    const guidance = getPromptGuidance(state)
    expect(guidance).toContain('recommended phase skills do not grant tool permissions')
    expect(guidance).not.toContain('set effort')
    expect(guidance).not.toContain('change model')
    expect(guidance).not.toContain('fork')
    expect(guidance).not.toContain('shell')
    expect(guidance).not.toContain('hook')
  })
  test('priority recommendations are described as attention metadata without granting SkillTool access', () => {
    const getToolNames = requireWorkflowScopedToolNames()
    const getPromptGuidance = requireWorkflowPromptToolGuidance()
    const state = workflowStateWithRecommendedPhaseSkills()
    const phase = state.templateSnapshot.phases[0]
    phase.skills = [
      {
        name: 'requirements-review',
        mode: 'recommended',
        source: 'project',
        priority: 'high',
        reason: 'Treat this as especially relevant to requirements ambiguity.',
      },
    ]

    const guidance = getPromptGuidance(state)

    expect(guidance).toContain('higher priority')
    expect(guidance).toContain('attention')
    expect(guidance).toContain('not a safety override')
    expect(getToolNames(state)).not.toContain('SkillTool')
  })
})


describe('skills-development scope-plan question-card contract', () => {
  function stateWithScopePlanQuestionPolicy(
    templateId = 'skills-development',
    phaseId = 'scope-plan',
  ): WorkflowSessionState {
    const state = stateFor(phaseId)
    state.templateIdentity = {
      id: templateId,
      source: 'user',
      version: '13',
    }
    state.templateSnapshot = {
      schemaVersion: 1,
      id: templateId,
      source: 'user',
      version: '13',
      displayName: 'Skills development',
      description: 'Question card contract fixture',
      phases: [{
        id: phaseId,
        label: phaseId,
        instructions: 'Ask structured decision cards.',
        requestedModel: null,
        skillDeclarations: [],
        requiredArtifacts: [],
        completionCriteria: [],
        transitionAuthority: 'user-confirmation',
        runtimeContract: {
          questionPolicy: {
            exactQuestionCount: 1,
            minChoices: 2,
            maxChoices: 3,
            firstChoiceLabelIncludes: '(Recommended)',
            requireChoiceDescriptions: true,
            disallowComputerUse: true,
          },
        },
      }],
    }
    return state
  }

  const validQuestionCard = {
    questions: [{
      prompt: 'Which scope should the MVP include first?',
      choices: [
        { label: 'Focused MVP (Recommended)', description: 'Deliver the smallest validated user path first.' },
        { label: 'Broader MVP', description: 'Include the requested secondary flow in the first release.' },
      ],
    }],
  }

  test('rejects invalid scope-plan decision-card shapes before a permission card can be emitted', () => {
    const state = stateWithScopePlanQuestionPolicy()

    expect(getWorkflowQuestionCardContractViolation('AskUserQuestion', {
      questions: [{ prompt: 'What should we build?' }],
    }, state)).toContain('decision cards require exactly 2–3 choices')

    expect(getWorkflowQuestionCardContractViolation('AskUserQuestion', {
      questions: [{
        ...validQuestionCard.questions[0],
        choices: [
          ...validQuestionCard.questions[0].choices,
          { label: 'Everything now', description: 'Include all requested ideas immediately.' },
          { label: 'Custom', description: 'Let the user define a separate scope.' },
        ],
      }],
    }, state)).toContain('decision cards require exactly 2–3 choices')

    expect(getWorkflowQuestionCardContractViolation('AskUserQuestion', {
      questions: [{
        ...validQuestionCard.questions[0],
        choices: validQuestionCard.questions[0].choices.map((choice) => ({
          ...choice,
          label: choice.label.replace(' (Recommended)', ''),
        })),
      }],
    }, state)).toContain('first choice label must include')

    expect(getWorkflowQuestionCardContractViolation('AskUserQuestion', {
      questions: [{
        ...validQuestionCard.questions[0],
        choices: [
          { label: 'Focused MVP (Recommended)', description: '' },
          validQuestionCard.questions[0].choices[1],
        ],
      }],
    }, state)).toContain('every choice needs a non-empty')
  })

  test('applies the same hard contract during v15 route-context intake', () => {
    const state = stateWithScopePlanQuestionPolicy('skills-development', 'route-context')

    expect(getWorkflowQuestionCardContractViolation('AskUserQuestion', {
      questions: [{ prompt: 'What evidence should guide this request?' }],
    }, state)).toContain('skills-development/route-context')
    expect(isWorkflowComputerUseDenied(state)).toBe(true)
  })

  test('allows a compliant card and leaves other templates untouched', () => {
    expect(getWorkflowQuestionCardContractViolation(
      'AskUserQuestion',
      validQuestionCard,
      stateWithScopePlanQuestionPolicy(),
    )).toBeNull()
    expect(getWorkflowQuestionCardContractViolation(
      'AskUserQuestion',
      { questions: [{ prompt: 'Free form legacy card?' }] },
      stateWithScopePlanQuestionPolicy('efficient-constrained-dev-debug-workflow-v5'),
    )).toBeNull()
  })

  test('denies Computer Use only for the contracted skills-development scope-plan', () => {
    expect(isWorkflowComputerUseDenied(stateWithScopePlanQuestionPolicy())).toBe(true)
    expect(isWorkflowComputerUseDenied(
      stateWithScopePlanQuestionPolicy('efficient-constrained-dev-debug-workflow-v5'),
    )).toBe(false)
  })
})

describe('Workflow question card contract', () => {
  function stateWithNecessaryQuestionPolicy(
    templateId = 'strict-custom-workflow',
    phaseId = 'feature-implement',
    issues: WorkflowPhaseIssue[] = [],
    requireAnswerProcessingBeforeNextQuestion = true,
  ): WorkflowSessionState {
    const state = stateFor(phaseId)
    state.templateIdentity = {
      id: templateId,
      source: 'user',
      version: '8',
    }
    state.templateSnapshot = {
      schemaVersion: 1,
      id: templateId,
      source: 'user',
      version: '8',
      displayName: templateId,
      description: 'Question policy fixture',
      phases: [{
        id: phaseId,
        label: phaseId,
        instructions: 'Ask only when the answer is necessary for current-phase work.',
        requestedModel: null,
        skillDeclarations: [],
        requiredArtifacts: [],
        completionCriteria: [],
        transitionAuthority: 'user-confirmation',
        runtimeContract: {
          questionPolicy: {
            requireNecessaryQuestion: true,
            requireAnswerProcessingBeforeNextQuestion,
          },
        },
      }],
    }
    state.runtimeContract = {
      schemaVersion: 1,
      migrationStatus: 'current',
      phaseStates: {
        [phaseId]: {
          phaseId,
          workStatus: 'not-started',
          eligibility: 'not-ready',
          blockerReasons: [],
          issues,
          artifactRequirements: [],
          checks: [],
          taskSnapshots: [],
          evaluatedAt: '2026-07-31T00:00:00.000Z',
        },
      },
      audit: [],
    }
    return state
  }

  const necessaryQuestionCard = {
    questions: [{
      prompt: 'Which production integration must the fix preserve?',
      blocksCompletion: true,
      blockingReason: 'Neither the request, workspace, logs, nor current artifacts identify the integration in production.',
      answerImpact: 'The answer selects the compatibility branch and regression scenario for the current fix.',
      choices: [
        { label: 'Integration A', description: 'Keep the currently deployed A contract compatible.' },
        { label: 'Integration B', description: 'Keep the currently deployed B contract compatible.' },
      ],
    }],
  }

  const optionalQuestionCard = {
    questions: [{
      prompt: 'Which distribution format should the first preview use?',
      choices: [
        { label: 'Portable package', description: 'Offer a self-contained download for a fast evaluation.' },
        { label: 'Installer', description: 'Offer the standard installation experience.' },
      ],
    }],
  }

  test('keeps explicit reason and impact requirements for legacy strict workflows', () => {
    const state = stateWithNecessaryQuestionPolicy()

    expect(getWorkflowQuestionCardContractViolation('AskUserQuestion', {
      questions: [{ ...necessaryQuestionCard.questions[0], blockingReason: '' }],
    }, state)).toContain('blockingReason')

    expect(getWorkflowQuestionCardContractViolation('AskUserQuestion', {
      questions: [{ ...necessaryQuestionCard.questions[0], answerImpact: '' }],
    }, state)).toContain('answerImpact')

    expect(getWorkflowQuestionCardContractViolation('AskUserQuestion', {
      questions: [{ ...necessaryQuestionCard.questions[0], blocksCompletion: false }],
    }, state)).toContain('blocksCompletion')

    expect(getWorkflowQuestionCardContractViolation(
      'AskUserQuestion',
      necessaryQuestionCard,
      state,
    )).toBeNull()
  })

  test.each([
    ['efficient-constrained-dev-debug-workflow-v5', 'route-context'],
    ['feature-extension-workflow-v8', 'feature-memory-plan'],
    ['debug-repair-workflow-v8', 'debug-memory-intake'],
  ])('allows optional single-question cards without blocking metadata for %s', (templateId, phaseId) => {
    const state = stateWithNecessaryQuestionPolicy(templateId, phaseId)

    expect(getWorkflowQuestionCardContractViolation('AskUserQuestion', optionalQuestionCard, state)).toBeNull()
    expect(getWorkflowQuestionCardContractViolation('AskUserQuestion', {
      questions: [{ ...optionalQuestionCard.questions[0], blocksCompletion: false }],
    }, state)).toBeNull()
  })

  test('requires reason and impact only when a shipped workflow question explicitly blocks completion', () => {
    const state = stateWithNecessaryQuestionPolicy('feature-extension-workflow-v8', 'feature-memory-plan')

    expect(getWorkflowQuestionCardContractViolation('AskUserQuestion', {
      questions: [{ ...necessaryQuestionCard.questions[0], blockingReason: '' }],
    }, state)).toContain('blockingReason')
    expect(getWorkflowQuestionCardContractViolation('AskUserQuestion', {
      questions: [{ ...necessaryQuestionCard.questions[0], answerImpact: '' }],
    }, state)).toContain('answerImpact')
    expect(getWorkflowQuestionCardContractViolation('AskUserQuestion', necessaryQuestionCard, state)).toBeNull()
  })

  test('rejects a second question while an earlier optional question is still open', () => {
    const state = stateWithNecessaryQuestionPolicy('feature-extension-workflow-v8', 'feature-memory-plan', [{
      id: 'open-question',
      phaseId: 'feature-memory-plan',
      sessionId: 'session-1',
      createdAt: '2026-08-06T00:00:00.000Z',
      updatedAt: '2026-08-06T00:00:00.000Z',
      source: 'ask-user-question',
      status: 'open',
      blocksCompletion: false,
      blockingReason: 'The user has not answered the existing optional question.',
      questionRequestId: 'open-request',
      questionId: 'distribution-format',
      createdStateVersion: 1,
    }])

    expect(getWorkflowQuestionCardContractViolation(
      'AskUserQuestion',
      optionalQuestionCard,
      state,
    )).toContain('unanswered question')
  })

  test('requires the current answer to be processed before the next question card for a legacy hard-stop workflow', () => {
    const state = stateWithNecessaryQuestionPolicy('strict-custom-workflow', 'feature-implement', [{
      id: 'previous-question',
      phaseId: 'feature-implement',
      sessionId: 'session-1',
      createdAt: '2026-07-31T00:00:00.000Z',
      updatedAt: '2026-07-31T00:01:00.000Z',
      source: 'ask-user-question',
      status: 'answered-pending-processing',
      blocksCompletion: true,
      blockingReason: 'Previous necessary question.',
      answer: { selected: 'Integration A' },
      answerReceivedAt: '2026-07-31T00:01:00.000Z',
      createdStateVersion: 1,
    }])

    expect(getWorkflowQuestionCardContractViolation(
      'AskUserQuestion',
      necessaryQuestionCard,
      state,
    )).toContain('answered question pending processing')
  })

  test.each([
    ['feature-extension-workflow-v8', 'feature-memory-plan'],
    ['debug-repair-workflow-v8', 'debug-investigate'],
  ])('allows another optional card after the earlier %s answer is delivered', (templateId, phaseId) => {
    const pendingIssue: WorkflowPhaseIssue = {
      id: 'previous-question',
      phaseId,
      sessionId: 'session-1',
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:01:00.000Z',
      source: 'ask-user-question',
      status: 'answered-pending-processing',
      blocksCompletion: false,
      blockingReason: 'Previous optional question.',
      answer: { selected: 'Portable package' },
      answerReceivedAt: '2026-08-02T00:01:00.000Z',
      createdStateVersion: 1,
    }

    expect(getWorkflowQuestionCardContractViolation(
      'AskUserQuestion',
      optionalQuestionCard,
      stateWithNecessaryQuestionPolicy(templateId, phaseId, [pendingIssue], true),
    )).toBeNull()
  })

  test.each([
    ['efficient-constrained-dev-debug-workflow-v5', 'route-context'],
    ['feature-extension-workflow-v8', 'feature-memory-plan'],
    ['debug-repair-workflow-v8', 'debug-memory-intake'],
  ])('allows only one AskUserQuestion card at a time for %s', (templateId, phaseId) => {
    const state = stateFor(phaseId)
    state.templateIdentity = { id: templateId, source: 'user', version: 'current' }

    expect(getWorkflowQuestionCardContractViolation('AskUserQuestion', {
      questions: [
        { prompt: 'First decision?' },
        { prompt: 'Second decision?' },
      ],
    }, state)).toContain('allows exactly one question per AskUserQuestion call')
  })

  test('leaves workflows without the necessary-question policy unchanged', () => {
    expect(getWorkflowQuestionCardContractViolation(
      'AskUserQuestion',
      { questions: [{ prompt: 'Ordinary workflow question?' }] },
      stateFor('implementation'),
    )).toBeNull()
  })
})
