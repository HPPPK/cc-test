import { expect, it, vi, afterEach } from 'vitest'
import { api } from './client'
import { getWorkflowTimeline } from './workflowTimeline'
afterEach(() => vi.restoreAllMocks())
it('uses the session scoped endpoint and encodes pagination cursors', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ events: [] })
  await getWorkflowTimeline('session-1', 'tool:abc:start')
  expect(get).toHaveBeenCalledWith('/api/sessions/session-1/workflow/timeline?limit=100&before=tool%3Aabc%3Astart', { timeout: 15_000 })
})
