import { beforeEach, describe, expect, it, vi } from 'vitest'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
    post: postMock,
    put: vi.fn(),
    delete: vi.fn(),
  },
  getApiUrl: vi.fn((path: string) => path),
}))

import { expertsApi } from './experts'

describe('expertsApi browser start contract', () => {
  beforeEach(() => {
    postMock.mockReset()
    postMock.mockResolvedValue({ expert: { status: 'active' } })
  })

  it('sends the brand-neutral local CDP selection to the session start endpoint', async () => {
    await expertsApi.enterSessionExpertMode('session/id', 'commercialization-research-report', {
      researchBrowserConnection: {
        kind: 'cdp',
        endpoint: 'http://127.0.0.1:9222',
        userAuthorized: true,
      },
    })

    expect(postMock).toHaveBeenCalledWith('/api/sessions/session%2Fid/expert/start', {
      expertId: 'commercialization-research-report',
      researchBrowserConnection: {
        kind: 'cdp',
        endpoint: 'http://127.0.0.1:9222',
        userAuthorized: true,
      },
    })
  })
})
