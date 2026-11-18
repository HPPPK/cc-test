/** Wait for a local test service without imposing a cold-start deadline by default. */
export async function waitForHttp(url: string, options: {
  timeoutMs?: number
  pollIntervalMs?: number
  process?: { readonly exitCode: number | null }
} = {}) {
  const deadline = options.timeoutMs ? Date.now() + options.timeoutMs : Infinity
  let lastError = ''
  while (Date.now() < deadline) {
    if (options.process && options.process.exitCode !== null) {
      throw new Error(`Service exited with code ${options.process.exitCode} while waiting for ${url}`)
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      await response.body?.cancel()
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await Bun.sleep(options.pollIntervalMs ?? 500)
  }
  throw new Error(`Timed out waiting for ${url}${lastError ? ` (${lastError})` : ''}`)
}
