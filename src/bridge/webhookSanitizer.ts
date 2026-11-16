import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { unsupportedFeature } from '../utils/unsupportedFeature.js'
export function sanitizeInboundWebhookContent(_content: string | ContentBlockParam[]): string | ContentBlockParam[] { return unsupportedFeature('github-webhook-inbox') }
