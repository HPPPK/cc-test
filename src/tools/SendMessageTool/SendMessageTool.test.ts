import { expect, spyOn, test } from 'bun:test'
import { SendMessageTool } from './SendMessageTool.js'
import * as swarms from '../../utils/agentSwarmsEnabled.js'
import * as resume from '../AgentTool/resumeAgent.js'
import { getToolsForDefaultPreset } from '../../tools.js'
import { installNonLiveSubscriptionMetadataFixture } from '../__fixtures__/subscriptionMetadata.js'

installNonLiveSubscriptionMetadataFixture()

test('ordinary agent continuation remains available with teams disabled without enabling team protocols', async () => {
  const gate = spyOn(swarms, 'isAgentSwarmsEnabled').mockReturnValue(false)
  const context = { getAppState: () => ({ agentNameRegistry: new Map() }) } as any
  const message = { to: 'af6c71c025ebb5612', summary: '恢复原研究保存', message: 'Save existing evidence only.' }
  try {
    expect(SendMessageTool.isEnabled()).toBe(true)
    expect(getToolsForDefaultPreset()).toContain('SendMessage')
    expect(getToolsForDefaultPreset()).not.toContain('TeamCreate')
    expect(SendMessageTool.inputSchema.safeParse(message).success).toBe(true)
    expect(await SendMessageTool.prompt({} as any)).toContain('original transcript')
    expect(await SendMessageTool.validateInput!(message, context)).toEqual({ result: true })
    for (const input of [
      { ...message, to: '*' }, { ...message, to: 'unknown-teammate' },
      { ...message, message: { type: 'shutdown_request' as const } },
    ]) expect((await SendMessageTool.validateInput!(input, context)).result).toBe(false)
    expect((await SendMessageTool.validateInput!({ ...message, summary: undefined }, context)).result).toBe(false)
  } finally { gate.mockRestore() }
})

test('teams-disabled SendMessage resumes the same failed agent rather than creating a new worker', async () => {
  const gate = spyOn(swarms, 'isAgentSwarmsEnabled').mockReturnValue(false)
  const resumed = spyOn(resume, 'resumeAgentBackground').mockResolvedValue({ outputFile: 'original-worker-output' } as any)
  const agentId = 'af6c71c025ebb5612'
  const context = { getAppState: () => ({ agentNameRegistry: new Map(), tasks: { [agentId]: { type: 'local_agent', status: 'failed' } } }) } as any
  const canUseTool = (() => {}) as any
  const assistant = { requestId: 'recovery-request' } as any
  try {
    const input = { to: agentId, summary: '恢复已失败研究员', message: 'Preserve prior browser results and save only.' }
    expect((await SendMessageTool.validateInput!(input, context)).result).toBe(true)
    const output = await SendMessageTool.call(input, context, canUseTool, assistant)
    expect(output.data.success).toBe(true)
    expect(resumed).toHaveBeenCalledTimes(1)
    expect(resumed.mock.calls[0]![0]).toMatchObject({ agentId, prompt: input.message, toolUseContext: context, invokingRequestId: 'recovery-request' })
  } finally { gate.mockRestore(); resumed.mockRestore() }
})
