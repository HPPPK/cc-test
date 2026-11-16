import type { OAuthTokens, OAuthTokenExchangeResponse, OAuthProfileResponse, ReferralEligibilityResponse, ReferralRedemptionsResponse } from './types.js'
const response: OAuthTokenExchangeResponse = { access_token: 'example', refresh_token: 'refresh', expires_in: 3600, scope: 'user:profile' }
const profile: OAuthProfileResponse = { account: { uuid: 'account', email: 'user@example.test' }, organization: { uuid: 'org', organization_type: 'claude_pro' } }
const token: OAuthTokens = { accessToken: response.access_token, refreshToken: response.refresh_token, expiresAt: 123, scopes: ['user:profile'], subscriptionType: 'pro', rateLimitTier: null, profile }
// @ts-expect-error expiration is milliseconds, never a timestamp string
const invalid: OAuthTokens = { ...token, expiresAt: 'tomorrow' }
const eligibility: ReferralEligibilityResponse = { eligible: true, referral_code_details: { referral_link: 'https://example.test/pass', campaign: 'claude_code_guest_pass' } }
const redemptions: ReferralRedemptionsResponse = { redemptions: [], limit: 3 }
void [response, profile, token, invalid, eligibility, redemptions]
