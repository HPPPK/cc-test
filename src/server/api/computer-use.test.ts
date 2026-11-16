import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { handleComputerUseApi } from './computer-use.js'
import { WorkflowSessionStateService } from '../services/workflowSessionStateService.js'
import type { WorkflowSessionState } from '../services/workflowTypes.js'

let tempConfigDir = ''
let previousConfigDir: string | undefined

beforeEach(async () => {
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'computer-use-api-'))
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
})

afterEach(async () => {
  if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  await fs.rm(tempConfigDir, { recursive: true, force: true })
})

function skillsDevelopmentScopePlanState(sessionId: string): WorkflowSessionState {
  return {
    schemaVersion: 1,
    sessionId,
    mode: 'workflow',
    template: { id: 'skills-development', source: 'user', version: '13', snapshotId: 'fixture', sourceState: 'current' },
    stateVersion: 1,
    phases: [{ id: 'scope-plan', index: 0, status: 'running', artifactPointers: [] }],
    templateSnapshot: {
      schemaVersion: 1,
      id: 'skills-development',
      source: 'user',
      version: '13',
      displayName: 'Skills development',
      description: 'Computer Use policy test',
      phases: [{
        id: 'scope-plan',
        label: 'Scope plan',
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
    },
    templateIdentity: { id: 'skills-development', source: 'user', version: '13' },
    sourceTemplateStatus: 'current',
    status: 'running',
    workflowStatus: 'running',
    activePhaseId: 'scope-plan',
    phaseRuns: [],
    transitionHistory: [],
    artifactIndex: [],
    finalReportRef: null,
    revision: 1,
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
  }
}

describe('computer-use API workflow enforcement', () => {
  test('rejects scope-plan Computer Use before the desktop approval bridge can emit a card', async () => {
    const sessionId = 'skills-development-scope-plan'
    await new WorkflowSessionStateService().writeState(
      sessionId,
      skillsDevelopmentScopePlanState(sessionId),
    )

    const response = await handleComputerUseApi(
      new Request('http://localhost/api/computer-use/request-access', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          request: { requestId: 'computer-use-request-1' },
        }),
      }),
      new URL('http://localhost/api/computer-use/request-access'),
      ['api', 'computer-use', 'request-access'],
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'WORKFLOW_TOOL_FORBIDDEN',
      message: 'Computer Use is not allowed during skills-development scope-plan. Use the phase-approved tools or reissue a structured AskUserQuestion decision card.',
    })
  })
})
