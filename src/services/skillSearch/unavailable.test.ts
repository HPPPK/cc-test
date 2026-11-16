import { expect, test } from 'bun:test'
import { isSkillSearchEnabled } from './featureCheck.js'
import { stripCanonicalPrefix, getDiscoveredRemoteSkill } from './remoteSkillState.js'
import { loadRemoteSkill } from './remoteSkillLoader.js'
import { logRemoteSkillLoaded } from './telemetry.js'
import { UnsupportedFeatureError } from '../../utils/unsupportedFeature.js'

test('remote skill operations cannot advertise invented discoveries or loads', () => {
  expect(isSkillSearchEnabled()).toBe(false)
  for (const operation of [() => stripCanonicalPrefix('example'), () => getDiscoveredRemoteSkill('example'), () => loadRemoteSkill('example', 'https://example.test'), () => logRemoteSkillLoaded({ slug: 'example', cacheHit: false, latencyMs: 0, urlScheme: 'https' })]) expect(operation).toThrow(UnsupportedFeatureError)
})
