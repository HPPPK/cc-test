import { describe, expect, test } from 'bun:test'
import type { WorkflowSessionState } from './workflowTypes.js'
import * as workflowToolPolicy from './workflowToolPolicy.js'
import {
  getWorkflowPhaseActionPolicy,
  getWorkflowPhaseDisallowedTools,
  isWorkflowPhaseToolDenied,
} from './workflowToolPolicy.js'

const SUBMIT_PHASE_COMPLETION_TOOL_NAME = 'submit_phase_completion'

const getWorkflowScopedToolNames = (
  workflowToolPolicy as typeof workflowToolPolicy & {
    getWorkflowScopedToolNames?: (state: WorkflowSessionState | null | undefined) => string[]
  }
).getWorkflowScopedToolNames

const getWorkflowPromptToolGuidance = (
  workflowToolPolicy as typeof workflowToolPolicy & {
    getWorkflowPromptToolGuidance?: (state: WorkflowSessionState | null | undefined) => string | null
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

describe('workflowToolPolicy', () => {
  test('defines explicit allowed and forbidden actions for the builtin five-phase workflow', () => {
    const requirements = getWorkflowPhaseActionPolicy(stateFor('requirements-clarification'))
    const design = getWorkflowPhaseActionPolicy(stateFor('technical-design'))
    const planning = getWorkflowPhaseActionPolicy(stateFor('implementation-planning'))
    const implementation = getWorkflowPhaseActionPolicy(stateFor('implementation'))
    const verification = getWorkflowPhaseActionPolicy(stateFor('verification'))

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

  test('blocks mutating tools while requirements are still being clarified', () => {
    const state = stateFor('requirements-clarification')

    expect(getWorkflowPhaseDisallowedTools(state)).toEqual([
      'Write',
      'Edit',
      'MultiEdit',
      'NotebookEdit',
      'Bash',
      'PowerShell',
      'Agent',
    ])
    expect(isWorkflowPhaseToolDenied('Write', state)).toBe(true)
    expect(isWorkflowPhaseToolDenied('Bash', state)).toBe(true)
    expect(isWorkflowPhaseToolDenied('Read', state)).toBe(false)
  })

  test('allows implementation tools only in implementation and keeps verification test-only', () => {
    expect(getWorkflowPhaseDisallowedTools(stateFor('implementation'))).toEqual([])
    expect(getWorkflowPhaseDisallowedTools(stateFor('implement'))).toEqual([])
    expect(getWorkflowPhaseDisallowedTools(stateFor('verification'))).toEqual([
      'Write',
      'Edit',
      'MultiEdit',
      'NotebookEdit',
      'Agent',
    ])
    expect(isWorkflowPhaseToolDenied('Bash', stateFor('verification'))).toBe(false)
    expect(isWorkflowPhaseToolDenied('Write', stateFor('verification'))).toBe(true)
    expect(getWorkflowPhaseDisallowedTools(stateFor(null))).toEqual([])
  })

  test('exposes submit_phase_completion only for active workflow sessions', () => {
    const getToolNames = requireWorkflowScopedToolNames()

    const workflowTools = getToolNames(stateFor('requirements-clarification'))
    const completedTools = getToolNames(stateFor(null))

    expect(workflowTools).toContain(SUBMIT_PHASE_COMPLETION_TOOL_NAME)
    expect(completedTools).not.toContain(SUBMIT_PHASE_COMPLETION_TOOL_NAME)
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

    const guidance = getPromptGuidance(workflowStateWithSkills())

    expect(guidance).toContain(SUBMIT_PHASE_COMPLETION_TOOL_NAME)
    expect(guidance).toContain('phaseId')
    expect(guidance).toContain('stateVersion')
    expect(guidance).toContain('status')
    expect(guidance).toContain('handoff')
    expect(guidance).toContain('rationale')
    expect(guidance).toContain('evidence')
    expect(guidance).toContain('call submit_phase_completion with status ready in the same assistant turn')
    expect(guidance).toContain('Do not ask the user to type continue before calling the completion tool')
    expect(guidance).toContain('requirements-review')
    expect(guidance).toContain('prompt-level guidance only')

    const dialogueState = {
      mode: 'dialogue',
    } as unknown as WorkflowSessionState
    expect(getPromptGuidance(dialogueState)).toBeNull()
  })
})
