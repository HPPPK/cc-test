import { HUMAN_VERIFICATION_WAIT_MS } from '../../tools/PlaywrightTool/verificationSessionPolicy.js'
import {
  EXPERT_HUMAN_VERIFICATION_RESOLUTIONS,
  isExpertBrowserVerificationContext,
  type ExpertBrowserVerificationContext,
  type ExpertHumanVerificationResolution,
} from '../../utils/expertHumanVerification.js'

type PendingFollower = {
  timeout?: ReturnType<typeof setTimeout>
  resolve: (response: ExpertHumanVerificationResponse) => void
  reject: (error: Error) => void
}

type PendingVerification = {
  requestId: string
  sessionId: string
  verificationGateId?: string
  verification: ExpertBrowserVerificationContext
  toolUseId?: string
  browserSessionKey?: string
  delivered: boolean
  deliveryInFlight: boolean
  resolve: (response: ExpertHumanVerificationResponse) => void
  reject: (error: Error) => void
  followers: PendingFollower[]
  timeout?: ReturnType<typeof setTimeout>
}

export type ExpertHumanVerificationResponse = {
  resolution: ExpertHumanVerificationResolution | 'verification_deferred'
  verificationGateId?: string
  verification: ExpertBrowserVerificationContext
}

export type ExpertHumanVerificationRequest = {
  sessionId: string
  verificationGateId?: string
  agentId?: string
  toolUseId?: string
  browserSessionKey?: string
  verification: ExpertBrowserVerificationContext
}

const RESOLVED_GATE_TTL_MS = 2 * 60_000

type ResolvedGate = {
  response: ExpertHumanVerificationResponse
  expiresAt: number
}

export type ExpertHumanVerificationDelivery = (
  sessionId: string,
  message:
    | {
        type: 'permission_request'
        requestId: string
        toolName: 'Playwright'
        toolUseId?: string
        input: {
          kind: 'expert-playwright-verification'
          verification: ExpertBrowserVerificationContext
          queue: { remaining: number }
        }
        description: string
      }
    | {
        type: 'permission_response_ack'
        requestId: string
        status: 'accepted'
      },
) => boolean

function resolutionFromUpdatedInput(
  allowed: boolean,
  updatedInput: Record<string, unknown> | undefined,
): ExpertHumanVerificationResolution {
  if (!allowed) return 'record_evidence_gap'
  const resolution = updatedInput?.verificationResolution
  return typeof resolution === 'string'
    && EXPERT_HUMAN_VERIFICATION_RESOLUTIONS.includes(resolution as ExpertHumanVerificationResolution)
    ? resolution as ExpertHumanVerificationResolution
    : 'record_evidence_gap'
}

/**
 * Desktop can show only one visible CAPTCHA modal per session. The agent that
 * owns the page creates it; workers that encounter the same shared gate join
 * that pending decision instead of producing a second modal or a chat card.
 */
export class ExpertHumanVerificationService {
  private pendingByRequestId = new Map<string, PendingVerification>()
  private pendingRequestIdsBySession = new Map<string, string[]>()
  private joinWaitersBySession = new Map<string, PendingFollower[]>()
  private joinWaitersByGate = new Map<string, PendingFollower[]>()
  private resolvedByGate = new Map<string, ResolvedGate>()
  constructor(
    private deliver: ExpertHumanVerificationDelivery = () => false,
    private readonly waitTimeoutMs = HUMAN_VERIFICATION_WAIT_MS,
  ) {}

  setDelivery(deliver: ExpertHumanVerificationDelivery): void { this.deliver = deliver }

  private deferVerification(requestId: string): void {
    const pending = this.pendingByRequestId.get(requestId)
    if (!pending) return
    const response: ExpertHumanVerificationResponse = {
      resolution: 'verification_deferred',
      ...(pending.verificationGateId ? { verificationGateId: pending.verificationGateId } : {}),
      verification: pending.verification,
    }
    this.rememberResolvedGate(pending, response)
    this.remove(requestId)
    if (pending.delivered) this.deliver(pending.sessionId, { type: 'permission_response_ack', requestId, status: 'accepted' })
    pending.resolve(response)
    for (const follower of pending.followers) follower.resolve(response)
    pending.followers.length = 0
    queueMicrotask(() => { void this.deliverNext(pending.sessionId) })
  }

  async requestVerification(request: ExpertHumanVerificationRequest): Promise<ExpertHumanVerificationResponse> {
    if (!isExpertBrowserVerificationContext(request.verification)) {
      throw new Error('The Expert human-verification request does not contain a valid visible-page context.')
    }

    if (request.verificationGateId) {
      const resolved = this.resolvedGate(request.sessionId, request.verificationGateId)
      if (resolved) return resolved
      const existing = this.pendingForGateId(request.sessionId, request.verificationGateId)
      if (existing) return await this.follow(existing)
    }
    const requestId = 'expert-human-verification:' + crypto.randomUUID()
    return await new Promise<ExpertHumanVerificationResponse>((resolve, reject) => {
      this.pendingByRequestId.set(requestId, {
        requestId,
        sessionId: request.sessionId,
        ...(request.verificationGateId ? { verificationGateId: request.verificationGateId } : {}),
        verification: request.verification,
        ...(request.toolUseId ? { toolUseId: request.toolUseId } : {}),
        ...(request.browserSessionKey ? { browserSessionKey: request.browserSessionKey } : {}),
        delivered: false,
        deliveryInFlight: false,
        resolve,
        reject,
        followers: [],
      })
      const pending = this.pendingByRequestId.get(requestId)!
      pending.timeout = setTimeout(() => this.deferVerification(requestId), this.waitTimeoutMs)
      pending.timeout.unref?.()
      const queue = this.pendingRequestIdsBySession.get(request.sessionId) ?? []
      queue.push(requestId)
      this.pendingRequestIdsBySession.set(request.sessionId, queue)
      void this.deliverNext(request.sessionId)
      this.attachWaitingJoiners(request.sessionId, request.verificationGateId)
    })
  }

  /**
   * Joins the currently visible verification for this session. A short race is
   * handled too: if the owner tool result is still entering the runtime, wait
   * until it creates the dedicated Desktop request rather than exposing a
   * PENDING error to the model.
   */
  async waitForActiveVerification(
    sessionId: string,
    options: { verificationGateId?: string } = {},
  ): Promise<ExpertHumanVerificationResponse> {
    const verificationGateId = options.verificationGateId?.trim()
    if (verificationGateId) {
      const resolved = this.resolvedGate(sessionId, verificationGateId)
      if (resolved) return resolved
      const pending = this.pendingForGateId(sessionId, verificationGateId)
      if (pending) return await this.follow(pending)

      return await this.waitForOwner(this.joinWaitersByGate, this.gateKey(sessionId, verificationGateId))
    }

    const active = this.activePending(sessionId)
    if (active) return await this.follow(active)
    return await this.waitForOwner(this.joinWaitersBySession, sessionId)
  }

  resolveVerification(
    requestId: string,
    allowed: boolean,
    updatedInput?: Record<string, unknown>,
  ): boolean {
    const pending = this.pendingByRequestId.get(requestId)
    if (!pending || !pending.delivered) return false

    const resolution = resolutionFromUpdatedInput(allowed, updatedInput)
    const response: ExpertHumanVerificationResponse = {
      resolution,
      ...(pending.verificationGateId ? { verificationGateId: pending.verificationGateId } : {}),
      verification: pending.verification,
    }
    this.rememberResolvedGate(pending, response)
    this.remove(requestId)
    pending.resolve(response)
    for (const follower of pending.followers) follower.resolve(response)
    pending.followers.length = 0
    // Let Desktop acknowledge and clear the current dialog before showing the next distinct page.
    queueMicrotask(() => { void this.deliverNext(pending.sessionId) })
    return true
  }


  /**
   * Only the local Node Playwright runner may call this after observing the
   * already-preserved page become healthy twice. A later verification can still
   * be queued behind another browser page: match its exact browser session in
   * the whole session queue so a normal page never later receives a stale modal.
   */
  resolveAutoDetectedVerification(sessionId: string, browserSessionKey: string): boolean {
    const pending = this.pendingForBrowserSessionKey(sessionId, browserSessionKey)
    if (!pending) return false

    const response: ExpertHumanVerificationResponse = {
      resolution: 'verification_completed',
      ...(pending.verificationGateId ? { verificationGateId: pending.verificationGateId } : {}),
      verification: pending.verification,
    }
    this.rememberResolvedGate(pending, response)
    const wasDelivered = pending.delivered
    this.remove(pending.requestId)
    // A delivered request owns the visible Desktop modal and needs its matching
    // acknowledgement. Queued requests were never shown, so resolving them must
    // not create or update a modal for another browser page.
    if (wasDelivered) {
      this.deliver(sessionId, {
        type: 'permission_response_ack',
        requestId: pending.requestId,
        status: 'accepted',
      })
    }
    pending.resolve(response)
    for (const follower of pending.followers) follower.resolve(response)
    pending.followers.length = 0
    queueMicrotask(() => { void this.deliverNext(sessionId) })
    return true
  }

  cancelSession(sessionId: string, reason = 'Desktop session closed before browser verification was resolved.'): void {
    const requestIds = [...(this.pendingRequestIdsBySession.get(sessionId) ?? [])]
    for (const requestId of requestIds) {
      const pending = this.pendingByRequestId.get(requestId)
      this.remove(requestId)
      const error = new Error(reason)
      pending?.reject(error)
      for (const follower of pending?.followers ?? []) follower.reject(error)
    }
    const waiters = this.joinWaitersBySession.get(sessionId) ?? []
    this.joinWaitersBySession.delete(sessionId)
    for (const waiter of waiters) { clearTimeout(waiter.timeout); waiter.reject(new Error(reason)) }
    for (const [key, gateWaiters] of [...this.joinWaitersByGate]) {
      if (!key.startsWith(sessionId + '\0')) continue
      this.joinWaitersByGate.delete(key)
      for (const waiter of gateWaiters) { clearTimeout(waiter.timeout); waiter.reject(new Error(reason)) }
    }
    for (const key of [...this.resolvedByGate.keys()]) {
      if (key.startsWith(sessionId + '\0')) this.resolvedByGate.delete(key)
    }
  }

  getPendingRequest(sessionId: string): { requestId: string; verification: ExpertBrowserVerificationContext } | null {
    const pending = this.activePending(sessionId)
    return pending ? { requestId: pending.requestId, verification: pending.verification } : null
  }

  /** Internal-only routing data for a passive "check now" request. The Desktop UI
   * deliberately never receives the browser session key. */
  getActiveBrowserSessionKey(sessionId: string): string | null {
    const browserSessionKey = this.activePending(sessionId)?.browserSessionKey?.trim()
    return browserSessionKey || null
  }

  resetForTests(): void {
    this.pendingByRequestId.clear()
    this.pendingRequestIdsBySession.clear()
    this.joinWaitersBySession.clear()
    this.joinWaitersByGate.clear()
    this.resolvedByGate.clear()
  }

  private activePending(sessionId: string): PendingVerification | null {
    const queue = this.pendingRequestIdsBySession.get(sessionId) ?? []
    for (const requestId of queue) {
      const pending = this.pendingByRequestId.get(requestId)
      if (pending?.delivered) return pending
    }
    return null
  }

  private pendingForGateId(sessionId: string, verificationGateId: string): PendingVerification | null {
    const queue = this.pendingRequestIdsBySession.get(sessionId) ?? []
    for (const requestId of queue) {
      const pending = this.pendingByRequestId.get(requestId)
      if (pending?.verificationGateId === verificationGateId) return pending
    }
    return null
  }

  private pendingForBrowserSessionKey(sessionId: string, browserSessionKey: string): PendingVerification | null {
    const queue = this.pendingRequestIdsBySession.get(sessionId) ?? []
    for (const requestId of queue) {
      const pending = this.pendingByRequestId.get(requestId)
      if (pending?.browserSessionKey === browserSessionKey) return pending
    }
    return null
  }

  private waitForOwner(waitersByKey: Map<string, PendingFollower[]>, key: string): Promise<ExpertHumanVerificationResponse> {
    return new Promise((resolve, reject) => {
      const waiter: PendingFollower = { resolve, reject }
      waiter.timeout = setTimeout(() => {
        const remaining = (waitersByKey.get(key) ?? []).filter((item) => item !== waiter)
        if (remaining.length) waitersByKey.set(key, remaining)
        else waitersByKey.delete(key)
        reject(new Error('Expert verification owner did not arrive within the shared wait budget.'))
      }, this.waitTimeoutMs)
      waiter.timeout.unref?.()
      waitersByKey.set(key, [...(waitersByKey.get(key) ?? []), waiter])
    })
  }

  private follow(pending: PendingVerification): Promise<ExpertHumanVerificationResponse> {
    return new Promise<ExpertHumanVerificationResponse>((resolve, reject) => {
      pending.followers.push({ resolve, reject })
    })
  }

  private attachWaitingJoiners(sessionId: string, verificationGateId?: string): void {
    const exactGateId = verificationGateId?.trim()
    if (exactGateId) {
      const pending = this.pendingForGateId(sessionId, exactGateId)
      const key = this.gateKey(sessionId, exactGateId)
      const waiters = this.joinWaitersByGate.get(key)
      if (pending && waiters?.length) {
        this.joinWaitersByGate.delete(key)
        for (const waiter of waiters) clearTimeout(waiter.timeout)
        pending.followers.push(...waiters)
      }
    }

    const pending = this.activePending(sessionId)
    const waiters = this.joinWaitersBySession.get(sessionId)
    if (!pending || !waiters?.length) return
    this.joinWaitersBySession.delete(sessionId)
    for (const waiter of waiters) clearTimeout(waiter.timeout)
    pending.followers.push(...waiters)
  }

  private gateKey(sessionId: string, verificationGateId: string): string {
    return sessionId + '\0' + verificationGateId
  }

  private rememberResolvedGate(
    pending: PendingVerification,
    response: ExpertHumanVerificationResponse,
  ): void {
    const verificationGateId = pending.verificationGateId?.trim()
    if (!verificationGateId) return
    this.resolvedByGate.set(this.gateKey(pending.sessionId, verificationGateId), {
      response,
      expiresAt: Date.now() + RESOLVED_GATE_TTL_MS,
    })
  }

  private resolvedGate(sessionId: string, verificationGateId: string): ExpertHumanVerificationResponse | null {
    const key = this.gateKey(sessionId, verificationGateId)
    const resolved = this.resolvedByGate.get(key)
    if (!resolved) return null
    if (resolved.expiresAt <= Date.now()) {
      this.resolvedByGate.delete(key)
      return null
    }
    return resolved.response
  }

  private rejectWaitingJoiners(sessionId: string, reason: string): void {
    const waiters = this.joinWaitersBySession.get(sessionId) ?? []
    this.joinWaitersBySession.delete(sessionId)
    for (const waiter of waiters) waiter.reject(new Error(reason))
  }

  private prepareVerificationForDelivery(pending: PendingVerification): ExpertBrowserVerificationContext {
    // The initial background launch is the only automatic window operation.
    // Deliver the reminder immediately; neither this service nor the runner
    // later foregrounds, moves, or minimizes the user's Chromium window.
    return pending.verification
  }

  private async deliverNext(sessionId: string): Promise<void> {
    const queue = this.pendingRequestIdsBySession.get(sessionId)
    if (!queue) return

    while (queue.length > 0) {
      const requestId = queue[0]!
      const pending = this.pendingByRequestId.get(requestId)
      if (!pending) {
        queue.shift()
        continue
      }
      if (pending.delivered || pending.deliveryInFlight) {
        this.attachWaitingJoiners(sessionId)
        return
      }

      pending.deliveryInFlight = true
      const prepared = this.prepareVerificationForDelivery(pending)
      const verification = prepared instanceof Promise ? await prepared : prepared
      // The page may have recovered automatically while the runner was
      // acknowledging presentation. Never send a stale verification modal.
      if (this.pendingByRequestId.get(requestId) !== pending) return
      pending.verification = verification
      const sent = this.deliver(sessionId, {
        type: 'permission_request',
        requestId,
        toolName: 'Playwright',
        ...(pending.toolUseId ? { toolUseId: pending.toolUseId } : {}),
        input: {
          kind: 'expert-playwright-verification',
          verification,
          queue: { remaining: Math.max(0, queue.length - 1) },
        },
        description: 'Expert browser verification requires the user to resolve the visible page before research can continue.',
      })
      pending.deliveryInFlight = false
      if (sent) {
        pending.delivered = true
        this.attachWaitingJoiners(sessionId)
        return
      }

      this.remove(requestId)
      const error = new Error('The Desktop session is not connected, so the browser verification request could not be shown to the user.')
      pending.reject(error)
      this.rejectWaitingJoiners(sessionId, error.message)
    }

    this.pendingRequestIdsBySession.delete(sessionId)
  }

  private remove(requestId: string): void {
    const pending = this.pendingByRequestId.get(requestId)
    if (!pending) return
    if (pending.timeout) clearTimeout(pending.timeout)
    this.pendingByRequestId.delete(requestId)
    const queue = this.pendingRequestIdsBySession.get(pending.sessionId)
    if (!queue) return
    const index = queue.indexOf(requestId)
    if (index >= 0) queue.splice(index, 1)
    if (queue.length === 0) this.pendingRequestIdsBySession.delete(pending.sessionId)
  }
}

export const expertHumanVerificationService = new ExpertHumanVerificationService()
