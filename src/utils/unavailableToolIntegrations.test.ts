import { expect, test } from 'bun:test'
import { getCoordinatorAgents } from '../coordinator/workerAgent.js'
import { killMonitorMcp, killMonitorMcpTasksForAgent } from '../tasks/MonitorMcpTask/MonitorMcpTask.js'
import { postInterClaudeMessage } from '../bridge/peerSessions.js'
import { sendToUdsSocket, listAllLiveSessions } from './udsClient.js'
import { UnsupportedFeatureError } from './unsupportedFeature.js'

test('unavailable tool integrations reject actions without returning delivery or task success', () => {
  for (const operation of [listAllLiveSessions, getCoordinatorAgents, killMonitorMcp, killMonitorMcpTasksForAgent, () => postInterClaudeMessage('session', 'example'), () => sendToUdsSocket('fixture', 'example')]) expect(operation).toThrow(UnsupportedFeatureError)
})
