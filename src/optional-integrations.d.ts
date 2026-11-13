/** Optional adapters, not bundled implementations. Installed SDK: @anthropic-ai/sdk 0.80.
 * Contracts: https://github.com/anthropics/anthropic-sdk-typescript/tree/sdk-v0.80.0/packages
 * Only the constructor options and supported resources used locally are declared.
 */
declare module '@anthropic-ai/bedrock-sdk' {
  import { BaseAnthropic, type ClientOptions as CoreOptions } from '@anthropic-ai/sdk/client'
  import type Anthropic from '@anthropic-ai/sdk'
  export type ClientOptions = Omit<CoreOptions, 'apiKey' | 'authToken'> & { awsRegion?: string, awsAccessKey?: string | null, awsSecretKey?: string | null, awsSessionToken?: string | null, skipAuth?: boolean }
  export class AnthropicBedrock extends BaseAnthropic {
    constructor(options?: ClientOptions)
    messages: Omit<Anthropic['messages'], 'batches' | 'countTokens'>
    beta: Omit<Anthropic['beta'], 'messages' | 'promptCaching'> & { messages: Omit<Anthropic['beta']['messages'], 'batches' | 'countTokens'> }
  }
}
declare module '@anthropic-ai/vertex-sdk' {
  import { BaseAnthropic, type ClientOptions as CoreOptions } from '@anthropic-ai/sdk/client'
  import type Anthropic from '@anthropic-ai/sdk'
  import type { GoogleAuth, AuthClient } from 'google-auth-library'
  export type ClientOptions = Omit<CoreOptions, 'apiKey' | 'authToken'> & { region?: string | null, projectId?: string | null, accessToken?: string | null, googleAuth?: GoogleAuth | null, authClient?: AuthClient | null }
  export class AnthropicVertex extends BaseAnthropic {
    constructor(options?: ClientOptions)
    messages: Omit<Anthropic['messages'], 'batches'>
    beta: Omit<Anthropic['beta'], 'messages'> & { messages: Omit<Anthropic['beta']['messages'], 'batches'> }
  }
}
declare module '@anthropic-ai/foundry-sdk' {
  import { BaseAnthropic, type ClientOptions as CoreOptions } from '@anthropic-ai/sdk/client'
  import type Anthropic from '@anthropic-ai/sdk'
  export type FoundryClientOptions = Omit<CoreOptions, 'apiKey'> & { apiKey?: string, resource?: string, azureADTokenProvider?: () => Promise<string> }
  export class AnthropicFoundry extends BaseAnthropic {
    constructor(options?: FoundryClientOptions)
    messages: Omit<Anthropic['messages'], 'batches'>
    beta: Omit<Anthropic['beta'], 'messages'> & { messages: Omit<Anthropic['beta']['messages'], 'batches'> }
  }
}
/** Minimal Azure token credential surface used by the Foundry adapter.
 * https://github.com/Azure/azure-sdk-for-js/blob/@azure/identity_4.13.0/sdk/identity/identity/src/tokenProvider.ts
 */
declare module '@azure/identity' {
  export class DefaultAzureCredential {
    constructor()
    getToken(scopes: string | string[], options?: { abortSignal?: AbortSignal }): Promise<{ token: string, expiresOnTimestamp: number } | null>
  }
  export function getBearerTokenProvider(credential: DefaultAzureCredential, scopes: string | string[]): () => Promise<string>
}

/** OTLP HTTP options consumed by instrumentation; no exporter is installed by this declaration. */
type OptionalOTLPHTTPOptions = {
  url?: string
  headers?: Record<string, string> | (() => Promise<Record<string, string>>)
  httpAgentOptions?: import('https').AgentOptions | ((protocol: string) => import('http').Agent)
}

declare module '@opentelemetry/exporter-metrics-otlp-grpc' {
  import type { PushMetricExporter } from '@opentelemetry/sdk-metrics'
  export interface OTLPMetricExporter extends PushMetricExporter {}
  export class OTLPMetricExporter { constructor() }
}

declare module '@opentelemetry/exporter-metrics-otlp-http' {
  import type { PushMetricExporter } from '@opentelemetry/sdk-metrics'
  export interface OTLPMetricExporter extends PushMetricExporter {}
  export class OTLPMetricExporter { constructor(options?: OptionalOTLPHTTPOptions) }
}

declare module '@opentelemetry/exporter-metrics-otlp-proto' {
  import type { PushMetricExporter } from '@opentelemetry/sdk-metrics'
  export interface OTLPMetricExporter extends PushMetricExporter {}
  export class OTLPMetricExporter { constructor(options?: OptionalOTLPHTTPOptions) }
}

declare module '@opentelemetry/exporter-logs-otlp-grpc' {
  import type { LogRecordExporter } from '@opentelemetry/sdk-logs'
  export interface OTLPLogExporter extends LogRecordExporter {}
  export class OTLPLogExporter { constructor() }
}

declare module '@opentelemetry/exporter-logs-otlp-http' {
  import type { LogRecordExporter } from '@opentelemetry/sdk-logs'
  export interface OTLPLogExporter extends LogRecordExporter {}
  export class OTLPLogExporter { constructor(options?: OptionalOTLPHTTPOptions) }
}

declare module '@opentelemetry/exporter-logs-otlp-proto' {
  import type { LogRecordExporter } from '@opentelemetry/sdk-logs'
  export interface OTLPLogExporter extends LogRecordExporter {}
  export class OTLPLogExporter { constructor(options?: OptionalOTLPHTTPOptions) }
}

declare module '@opentelemetry/exporter-trace-otlp-grpc' {
  import type { SpanExporter } from '@opentelemetry/sdk-trace-base'
  export interface OTLPTraceExporter extends SpanExporter {}
  export class OTLPTraceExporter { constructor() }
}

declare module '@opentelemetry/exporter-trace-otlp-http' {
  import type { SpanExporter } from '@opentelemetry/sdk-trace-base'
  export interface OTLPTraceExporter extends SpanExporter {}
  export class OTLPTraceExporter { constructor(options?: OptionalOTLPHTTPOptions) }
}

declare module '@opentelemetry/exporter-trace-otlp-proto' {
  import type { SpanExporter } from '@opentelemetry/sdk-trace-base'
  export interface OTLPTraceExporter extends SpanExporter {}
  export class OTLPTraceExporter { constructor(options?: OptionalOTLPHTTPOptions) }
}

declare module '@opentelemetry/exporter-prometheus' {
  import { MetricReader } from '@opentelemetry/sdk-metrics'
  export class PrometheusExporter extends MetricReader { constructor() }
}
