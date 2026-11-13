import { expect, test } from 'bun:test'
import { SnipBoundaryMessage } from './SnipBoundaryMessage.js'
import { UserGitHubWebhookMessage } from './UserGitHubWebhookMessage.js'
import { UserForkBoilerplateMessage } from './UserForkBoilerplateMessage.js'
import { UserCrossSessionMessage } from './UserCrossSessionMessage.js'
import { UnsupportedFeatureError } from '../../utils/unsupportedFeature.js'

test('unavailable private message renderers fail explicitly', () => {
  for (const render of [SnipBoundaryMessage, UserGitHubWebhookMessage, UserForkBoilerplateMessage, UserCrossSessionMessage]) expect(render).toThrow(UnsupportedFeatureError)
})
