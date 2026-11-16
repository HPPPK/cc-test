import { expect, test } from 'bun:test'
import { getWorkflowCommands } from './createWorkflowCommand.js'
import { UnsupportedFeatureError } from '../../utils/unsupportedFeature.js'

test('workflow discovery refuses unavailable workflow scripts', () => {
  expect(() => getWorkflowCommands('/workspace')).toThrow(UnsupportedFeatureError)
})
