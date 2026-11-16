import { expect, test } from 'bun:test'
import { ReviewArtifactPermissionRequest } from './ReviewArtifactPermissionRequest/ReviewArtifactPermissionRequest.js'
import { MonitorPermissionRequest } from './MonitorPermissionRequest/MonitorPermissionRequest.js'
import { WorkflowPermissionRequest } from '../../tools/WorkflowTool/WorkflowPermissionRequest.js'
import { UnsupportedFeatureError } from '../../utils/unsupportedFeature.js'

test('private tool permission surfaces refuse unsupported features', () => {
  for (const render of [ReviewArtifactPermissionRequest, MonitorPermissionRequest, WorkflowPermissionRequest]) expect(render).toThrow(UnsupportedFeatureError)
})
