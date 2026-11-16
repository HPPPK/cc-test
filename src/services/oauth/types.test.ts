import { expect, test } from 'bun:test'
import type { OAuthTokenExchangeResponse, OAuthTokens } from './types.js'
import { parseScopes, isOAuthTokenExpired } from './client.js'

test('token exchange fields convert to the local persisted-token contract', () => {
  const response: OAuthTokenExchangeResponse = { access_token: 'example-only', refresh_token: 'example-only', expires_in: 3600, scope: 'user:profile user:inference' }
  const tokens: OAuthTokens = { accessToken: response.access_token, refreshToken: response.refresh_token, expiresAt: Date.now() + response.expires_in * 1000, scopes: parseScopes(response.scope), subscriptionType: 'pro', rateLimitTier: null }
  expect(tokens.scopes).toEqual(['user:profile', 'user:inference'])
  expect(isOAuthTokenExpired(tokens.expiresAt)).toBe(false)
  expect(isOAuthTokenExpired(null)).toBe(false)
})
