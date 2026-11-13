/** Local OAuth response and persisted-token contracts consumed by the auth client. */
export type SubscriptionType = 'pro' | 'max' | 'team' | 'enterprise'
// These service-assigned identifiers are open strings, not locally validated enums.
export type RateLimitTier = string
export type BillingType = string
export type OAuthProfileResponse = {
  account: { uuid: string, email: string, display_name?: string | null, created_at?: string }
  organization: {
    uuid: string
    organization_type?: string
    rate_limit_tier?: RateLimitTier | null
    billing_type?: BillingType | null
    has_extra_usage_enabled?: boolean | null
    subscription_created_at?: string | null
  }
}
export type OAuthTokenExchangeResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type?: string
  account?: { uuid: string, email_address: string }
  organization?: { uuid: string }
}
export type OAuthTokens = {
  accessToken: string
  refreshToken: string | null | undefined
  expiresAt: number | null
  scopes: string[]
  subscriptionType: SubscriptionType | null
  rateLimitTier: RateLimitTier | null
  profile?: OAuthProfileResponse
  tokenAccount?: { uuid: string, emailAddress: string, organizationUuid?: string }
}
export type UserRolesResponse = { organization_role: string, workspace_role: string, organization_name: string }
export type ReferralCampaign = string
export type ReferrerRewardInfo = { currency: string, amount_minor_units: number }
export type ReferralEligibilityResponse = {
  eligible: boolean
  referral_code_details?: { referral_link: string, campaign?: ReferralCampaign } | null
  referrer_reward?: ReferrerRewardInfo | null
  remaining_passes?: number | null
}
export type ReferralRedemptionsResponse = {
  // The UI consumes redemption presence only, it does not decode entry fields.
  redemptions?: Record<string, unknown>[]
  limit?: number
}
