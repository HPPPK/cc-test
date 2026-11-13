import { expect, test } from 'bun:test'
import { AssistantSessionChooser } from './AssistantSessionChooser.js'
import { UnsupportedFeatureError } from '../utils/unsupportedFeature.js'
test('unavailable assistant chooser cannot claim a selected session', () => { expect(AssistantSessionChooser).toThrow(UnsupportedFeatureError) })
