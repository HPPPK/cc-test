import { getRuntimeEnvValue } from '../runtimeEnv.js'

export const MODEL_CONTEXT_WINDOWS_ENV_KEY = 'CLAUDE_CODE_MODEL_CONTEXT_WINDOWS'
export const MODEL_CONTEXT_WINDOW_MIN = 16_000
export const MODEL_CONTEXT_WINDOW_MAX = 10_000_000

export function normalizeModelContextKey(model: string): string {
  return model
    .trim()
    .replace(/\[1m\]$/i, '')
    .replace(/:1m$/i, '')
    .toLowerCase()
}

function normalizeWindow(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return undefined
  }
  if (value < MODEL_CONTEXT_WINDOW_MIN || value > MODEL_CONTEXT_WINDOW_MAX) {
    return undefined
  }
  return value
}

function parseConfiguredContextWindows(): Record<string, number> {
  const raw = getRuntimeEnvValue(MODEL_CONTEXT_WINDOWS_ENV_KEY)
  if (!raw?.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const windows: Record<string, number> = {}
    for (const [model, value] of Object.entries(parsed)) {
      const normalized = normalizeWindow(value)
      if (normalized !== undefined) {
        windows[normalizeModelContextKey(model)] = normalized
      }
    }
    return windows
  } catch {
    return {}
  }
}

function getConfiguredModelContextWindow(model: string): number | undefined {
  const configured = parseConfiguredContextWindows()
  const normalizedModel = normalizeModelContextKey(model)
  const exact = configured[normalizedModel]
  if (exact !== undefined) {
    return exact
  }

  for (const [configuredModel, window] of Object.entries(configured)) {
    if (
      normalizedModel.endsWith(`/${configuredModel}`) ||
      normalizedModel.endsWith(`:${configuredModel}`)
    ) {
      return window
    }
  }
  return undefined
}

function getBuiltInModelContextWindow(model: string): number | undefined {
  return 1_000_000
}

export function getConfiguredOrBuiltInModelContextWindow(
  model: string,
): number | undefined {
  return (
    getConfiguredModelContextWindow(model) ??
    getBuiltInModelContextWindow(model)
  )
}
