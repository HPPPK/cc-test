import { expect, test } from 'bun:test'
import { WorkflowTool } from './WorkflowTool.js'
import { MonitorTool } from '../MonitorTool/MonitorTool.js'
import { ReviewArtifactTool } from '../ReviewArtifactTool/ReviewArtifactTool.js'
import { UnsupportedFeatureError } from '../../utils/unsupportedFeature.js'

test('private tools are disabled and cannot execute', () => {
  for (const tool of [WorkflowTool, MonitorTool, ReviewArtifactTool]) {
    expect(tool.isEnabled()).toBe(false)
    expect(tool.call).toThrow(UnsupportedFeatureError)
    expect(() => tool.inputSchema).toThrow(UnsupportedFeatureError)
    expect(tool.checkPermissions).toThrow(UnsupportedFeatureError)
  }
})
