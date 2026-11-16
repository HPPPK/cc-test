type LocalRequestInit = RequestInit & { proxy?: string }
type Dependencies = { fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>; timeoutMs?: number; retry?: boolean }

/** Only for idempotent Expert control acknowledgements, never model/browser requests. */
export async function expertLocalRequest(url: string, init: RequestInit, deps: Dependencies = {}): Promise<Response> {
  const host = new URL(url).hostname
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(host)
  const request: LocalRequestInit = { ...init, ...(local ? { proxy: '' } : {}) }
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 10_000)
    try {
      // The caller serializes the payload once. Lost acknowledgements reuse the
      // same request/worker ID so the server cannot charge a second browser call.
      return await (deps.fetchImpl ?? fetch)(url, { ...request, signal: init.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal })
    } catch (error) {
      if (!local || deps.retry === false || attempt === 1 || init.signal?.aborted || (init.body != null && typeof init.body !== 'string')) throw error
    } finally {
      clearTimeout(timer)
    }
  }
}
