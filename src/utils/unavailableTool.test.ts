import { expect, test } from 'bun:test'
import { unavailableTool } from './unavailableTool.js'
import { UnsupportedFeatureError } from './unsupportedFeature.js'

test('unavailable tool denies permissions, schema access and execution', () => {
  const tool = unavailableTool('Example', 'private-example')
  expect(tool.isEnabled()).toBe(false)
  expect(() => tool.inputSchema).toThrow(UnsupportedFeatureError)
  for (const operation of [tool.call, tool.description, tool.prompt, tool.checkPermissions, tool.userFacingName, tool.toAutoClassifierInput, tool.mapToolResultToToolResultBlockParam, tool.renderToolUseMessage]) expect(operation).toThrow(UnsupportedFeatureError)
})
