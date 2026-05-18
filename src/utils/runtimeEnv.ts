import { AsyncLocalStorage } from 'async_hooks'

export type RuntimeEnvOverlay = Record<string, string | undefined>

const runtimeEnvStorage = new AsyncLocalStorage<RuntimeEnvOverlay>()

export function runWithRuntimeEnv<T>(
  env: RuntimeEnvOverlay | undefined,
  fn: () => T,
): T {
  if (!env || Object.keys(env).length === 0) {
    return fn()
  }
  return runtimeEnvStorage.run(env, fn)
}

export function getRuntimeEnvValue(key: string): string | undefined {
  const env = runtimeEnvStorage.getStore()
  if (env && Object.prototype.hasOwnProperty.call(env, key)) {
    return env[key]
  }
  return process.env[key]
}

export function getRuntimeEnvSnapshot(): RuntimeEnvOverlay | undefined {
  return runtimeEnvStorage.getStore()
}
