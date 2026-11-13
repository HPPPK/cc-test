import { expect, test } from 'bun:test'
import { killWorkflowTask, skipWorkflowAgent, retryWorkflowAgent } from '../../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import { WorkflowDetailDialog } from './WorkflowDetailDialog.js'
import { MonitorMcpDetailDialog } from './MonitorMcpDetailDialog.js'
import { WebBrowserPanel } from '../../tools/WebBrowserTool/WebBrowserPanel.js'
import { UnsupportedFeatureError } from '../../utils/unsupportedFeature.js'

test('private task and browser operations cannot pretend to succeed', () => {
  for (const operation of [killWorkflowTask, skipWorkflowAgent, retryWorkflowAgent, WorkflowDetailDialog, MonitorMcpDetailDialog, WebBrowserPanel]) expect(operation).toThrow(UnsupportedFeatureError)
})
