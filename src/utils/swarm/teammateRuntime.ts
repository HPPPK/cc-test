import { ProviderService } from '../../server/services/providerService.js'
import { quote } from '../bash/shellQuote.js'
import { getClaudeConfigHomeDir } from '../envUtils.js'
import { getProviderManagedEnvVarNames } from '../managedEnvConstants.js'
import type { RuntimeEnvOverlay } from '../runtimeEnv.js'

export type TeammateRuntimeSelection = {
  providerId?: string | null
  modelId: string
}

export type ResolvedTeammateRuntime = {
  model: string
  runtime?: TeammateRuntimeSelection
  env?: RuntimeEnvOverlay
  clearInheritedProviderEnv: boolean
}

const providerService = new ProviderService()

export function normalizeProviderId(
  providerId: string | null | undefined,
): string | null | undefined {
  if (providerId === null) return null
  if (typeof providerId !== 'string') return undefined
  const trimmed = providerId.trim()
  if (trimmed.toLowerCase() === 'null') return null
  return trimmed ? trimmed : undefined
}

export function normalizeModelId(modelId: string | undefined): string | undefined {
  const trimmed = modelId?.trim()
  return trimmed ? trimmed : undefined
}

export function buildTeammateRuntimeSelection(input: {
  providerId?: string | null
  modelId?: string
  model: string
}): TeammateRuntimeSelection | undefined {
  const providerId = normalizeProviderId(input.providerId)
  const modelId = normalizeModelId(input.modelId)

  if (providerId === undefined && modelId === undefined) {
    return undefined
  }

  return {
    ...(providerId !== undefined ? { providerId } : {}),
    modelId: modelId ?? input.model,
  }
}

export async function resolveTeammateRuntime(input: {
  providerId?: string | null
  modelId?: string
  model: string
}): Promise<ResolvedTeammateRuntime> {
  const runtime = buildTeammateRuntimeSelection(input)
  const model = runtime?.modelId ?? input.model
  const providerId = runtime?.providerId
  const clearInheritedProviderEnv = runtime?.providerId !== undefined

  if (!runtime || providerId === undefined) {
    return {
      model,
      runtime,
      clearInheritedProviderEnv,
    }
  }

  if (providerId === null) {
    return {
      model,
      runtime,
      env: await buildOfficialRuntimeEnv(),
      clearInheritedProviderEnv,
    }
  }

  const env = await providerService.getProviderRuntimeEnv(providerId)
  env.ANTHROPIC_MODEL = model
  return {
    model,
    runtime,
    env: {
      CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
      ...env,
    },
    clearInheritedProviderEnv,
  }
}

export function buildProviderRuntimeEnvPrefix(options?: {
  env?: RuntimeEnvOverlay
  clearInheritedProviderEnv?: boolean
}): string {
  const parts: string[] = []

  if (options?.clearInheritedProviderEnv) {
    for (const key of getProviderManagedEnvVarNames()) {
      parts.push(`-u ${quote([key])}`)
    }
    for (const key of Object.keys(process.env)) {
      if (key.toUpperCase().startsWith('VERTEX_REGION_CLAUDE_')) {
        parts.push(`-u ${quote([key])}`)
      }
    }
  }

  for (const [key, value] of Object.entries(options?.env ?? {})) {
    if (!key || value === undefined) continue
    parts.push(`${key}=${quote([value])}`)
  }

  return parts.join(' ')
}

export function buildRuntimeEnvOverlay(options: {
  env?: RuntimeEnvOverlay
  clearInheritedProviderEnv?: boolean
}): RuntimeEnvOverlay | undefined {
  const overlay: RuntimeEnvOverlay = {}

  if (options.clearInheritedProviderEnv) {
    for (const key of getProviderManagedEnvVarNames()) {
      overlay[key] = undefined
    }
    for (const key of Object.keys(process.env)) {
      if (key.toUpperCase().startsWith('VERTEX_REGION_CLAUDE_')) {
        overlay[key] = undefined
      }
    }
  }

  Object.assign(overlay, options.env)
  return Object.keys(overlay).length > 0 ? overlay : undefined
}

async function buildOfficialRuntimeEnv(): Promise<Record<string, string>> {
  const env: Record<string, string> = {
    CLAUDE_CODE_ENTRYPOINT: 'claude-desktop',
  }

  try {
    const { jiangxiaOAuthService } = await import(
      '../../server/services/jiangxiaOAuthService.js'
    )
    const token = await jiangxiaOAuthService.ensureFreshAccessToken()
    if (token) {
      env.CLAUDE_CODE_OAUTH_TOKEN = token
    }
  } catch {
    // Official runtime may still work from normal login state.
  }

  env.CLAUDE_CONFIG_DIR = getClaudeConfigHomeDir()
  return env
}
