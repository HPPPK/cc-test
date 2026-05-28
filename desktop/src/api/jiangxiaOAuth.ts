// desktop/src/api/jiangxiaOAuth.ts

import { api, getBaseUrl } from './client'

export type JiangxiaOAuthStatus =
  | { loggedIn: false }
  | {
      loggedIn: true
      expiresAt: number | null
      scopes: string[]
      subscriptionType: 'pro' | 'max' | 'team' | 'enterprise' | null
    }

function currentServerPort(): number {
  const port = new URL(getBaseUrl()).port
  const parsed = Number.parseInt(port, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Cannot determine server port from baseUrl: ${getBaseUrl()}`)
  }
  return parsed
}

export const jiangxiaOAuthApi = {
  start() {
    return api.post<{ authorizeUrl: string; state: string }>(
      '/api/jiangxia-oauth/start',
      { serverPort: currentServerPort() },
    )
  },

  status() {
    return api.get<JiangxiaOAuthStatus>('/api/jiangxia-oauth')
  },

  logout() {
    return api.delete<{ ok: true }>('/api/jiangxia-oauth')
  },
}
