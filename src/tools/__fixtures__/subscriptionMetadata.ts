import { afterEach, beforeEach, spyOn } from 'bun:test'
import * as auth from '../../utils/auth.js'

/** Local tool fixtures exercise tools, not the developer's login/subscription.
 * No credential is supplied and no provider call is replaced by this fixture. */
export function installNonLiveSubscriptionMetadataFixture(): void {
  let restore: Array<() => void> = []
  beforeEach(() => {
    const metadata = [
      spyOn(auth, 'isAnthropicAuthEnabled').mockReturnValue(false),
      spyOn(auth, 'isOpenAIAuthActive').mockReturnValue(false),
      spyOn(auth, 'isClaudeAISubscriber').mockReturnValue(false),
      spyOn(auth, 'isMaxSubscriber').mockReturnValue(false),
      spyOn(auth, 'isTeamPremiumSubscriber').mockReturnValue(false),
      spyOn(auth, 'isProSubscriber').mockReturnValue(false),
      spyOn(auth, 'getSubscriptionType').mockReturnValue(null),
    ]
    restore = metadata.map(spy => () => spy.mockRestore())
  })
  afterEach(() => {
    for (const undo of restore.reverse()) undo()
    restore = []
  })
}
