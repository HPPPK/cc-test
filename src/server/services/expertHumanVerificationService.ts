import { sendToSession } from '../ws/handler.js'
import { expertBrowserActivityService } from './expertBrowserActivityService.js'

import {
  EXPERT_HUMAN_VERIFICATION_RESOLUTIONS,
  isExpertBrowserVerificationContext,
  type ExpertBrowserVerificationContext,
  type ExpertHumanVerificationResolution,
} from '../../utils/expertHumanVerification.js'

type PendingFollower = {
  resolve: (response: ExpertHumanVerificationResponse) => void
  reject: (error: Error) => void
}

type PendingVerification = {
  requestId: string
  sessionId: string
  verification: ExpertBrowserVerificationContext
  toolUseId?: string
  browserSessionKey?: string
  delivered: boolean
  resolve: (response: ExpertHumanVerificationResponse) => void
  reject: (error: Error) => void
  followers: PendingFollower[]
}

export type ExpertHumanVerificationResponse = {
  resolution: ExpertHumanVerificationResolution
  verification: ExpertBrowserVerificationContext
}

export type ExpertHumanVerificationRequest = {
  sessionId: string
  agentId?: string
  toolUseId?: string
  browserSessionKey?: string
  verification: ExpertBrowserVerificationContext
}

export type ExpertHumanVerificationDelivery = (
  sessionId: string,
  message: {
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
  },
) => boolean

type ExpertBrowserPresentation = {
  requestShow(sessionId: string, browserKey?: string): unknown
}

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
  private readonly browserPresentation: ExpertBrowserPresentation

  constructor(
    private readonly deliver: ExpertHumanVerificationDelivery = sendToSession,
    browserPresentation?: ExpertBrowserPresentation,
  ) {
    // Keep the module cycle lazy: activity service may import this service for
    // session cleanup, but presentation is only needed once a CAPTCHA is queued.
    this.browserPresentation = browserPresentation ?? {
      requestShow: (sessionId, browserKey) => expertBrowserActivityService.requestShow(sessionId, browserKey),
    }
  }

  async requestVerification(request: ExpertHumanVerificationRequest): Promise<ExpertHumanVerificationResponse> {
    if (!isExpertBrowserVerificationContext(request.verification)) {
      throw new Error('The Expert human-verification request does not contain a valid visible-page context.')
    }

    const requestId = 'expert-human-verification:' + crypto.randomUUID()
    return await new Promise<ExpertHumanVerificationResponse>((resolve, reject) => {
      this.pendingByRequestId.set(requestId, {
        requestId,
        sessionId: request.sessionId,
        verification: request.verification,
        ...(request.toolUseId ? { toolUseId: request.toolUseId } : {}),
        ...(request.browserSessionKey ? { browserSessionKey: request.browserSessionKey } : {}),
        delivered: false,
        resolve,
        reject,
        followers: [],
      })
      const queue = this.pendingRequestIdsBySession.get(request.sessionId) ?? []
      queue.push(requestId)
      this.pendingRequestIdsBySession.set(request.sessionId, queue)
      this.deliverNext(request.sessionId)
      this.attachWaitingJoiners(request.sessionId)
    })
  }

  /**
   * Joins the currently visible verification for this session. A short race is
   * handled too: if the owner tool result is still entering the runtime, wait
   * until it creates the dedicated Desktop request rather than exposing a
   * PENDING error to the model.
   */
  async waitForActiveVerification(sessionId: string): Promise<ExpertHumanVerificationResponse> {
    const active = this.activePending(sessionId)
    if (active) return await this.follow(active)

    return await new Promise<ExpertHumanVerificationResponse>((resolve, reject) => {
      const waiters = this.joinWaitersBySession.get(sessionId) ?? []
      waiters.push({ resolve, reject })
      this.joinWaitersBySession.set(sessionId, waiters)
    })
  }

  resolveVerification(
    requestId: string,
    allowed: boolean,
    updatedInput?: Record<string, unknown>,
  ): boolean {
    const pending = this.pendingByRequestId.get(requestId)
    if (!pending || !pending.delivered) return false

    const resolution = resolutionFromUpdatedInput(allowed, updatedInput)
    const response = { resolution, verification: pending.verification }
    this.remove(requestId)
    pending.resolve(response)
    for (const follower of pending.followers) follower.resolve(response)
    pending.followers.length = 0
    // Let Desktop acknowledge and clear the current dialog before showing the next distinct page.
    queueMicrotask(() => this.deliverNext(pending.sessionId))
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
    for (const waiter of waiters) waiter.reject(new Error(reason))
  }

  getPendingRequest(sessionId: string): { requestId: string; verification: ExpertBrowserVerificationContext } | null {
    const pending = this.activePending(sessionId)
    return pending ? { requestId: pending.requestId, verification: pending.verification } : null
  }

  resetForTests(): void {
    this.pendingByRequestId.clear()
    this.pendingRequestIdsBySession.clear()
    this.joinWaitersBySession.clear()
  }

  private activePending(sessionId: string): PendingVerification | null {
    const queue = this.pendingRequestIdsBySession.get(sessionId) ?? []
    for (const requestId of queue) {
      const pending = this.pendingByRequestId.get(requestId)
      if (pending?.delivered) return pending
    }
    return null
  }

  private follow(pending: PendingVerification): Promise<ExpertHumanVerificationResponse> {
    return new Promise<ExpertHumanVerificationResponse>((resolve, reject) => {
      pending.followers.push({ resolve, reject })
    })
  }

  private attachWaitingJoiners(sessionId: string): void {
    const pending = this.activePending(sessionId)
    const waiters = this.joinWaitersBySession.get(sessionId)
    if (!pending || !waiters?.length) return
    this.joinWaitersBySession.delete(sessionId)
    pending.followers.push(...waiters)
  }

  private rejectWaitingJoiners(sessionId: string, reason: string): void {
    const waiters = this.joinWaitersBySession.get(sessionId) ?? []
    this.joinWaitersBySession.delete(sessionId)
    for (const waiter of waiters) waiter.reject(new Error(reason))
  }

  private deliverNext(sessionId: string): void {
    const queue = this.pendingRequestIdsBySession.get(sessionId)
    if (!queue) return

    while (queue.length > 0) {
      const requestId = queue[0]!
      const pending = this.pendingByRequestId.get(requestId)
      if (!pending) {
        queue.shift()
        continue
      }
      if (pending.delivered) {
        this.attachWaitingJoiners(sessionId)
        return
      }

      const sent = this.deliver(sessionId, {
        type: 'permission_request',
        requestId,
        toolName: 'Playwright',
        ...(pending.toolUseId ? { toolUseId: pending.toolUseId } : {}),
        input: {
          kind: 'expert-playwright-verification',
          verification: pending.verification,
          queue: { remaining: Math.max(0, queue.length - 1) },
        },
        description: 'Expert browser verification requires the user to resolve the visible page before research can continue.',
      })
      if (sent) {
        pending.delivered = true
        if (pending.browserSessionKey) this.browserPresentation.requestShow(sessionId, pending.browserSessionKey)
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
    this.pendingByRequestId.delete(requestId)
    const queue = this.pendingRequestIdsBySession.get(pending.sessionId)
    if (!queue) return
    const index = queue.indexOf(requestId)
    if (index >= 0) queue.splice(index, 1)
    if (queue.length === 0) this.pendingRequestIdsBySession.delete(pending.sessionId)
  }
}

export const expertHumanVerificationService = new ExpertHumanVerificationService()
