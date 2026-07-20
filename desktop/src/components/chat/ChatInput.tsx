import { forwardRef, useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { useTranslation } from '../../i18n'
import { useChatStore } from '../../stores/chatStore'
import { SETTINGS_TAB_ID, useTabStore } from '../../stores/tabStore'
import { useUIStore } from '../../stores/uiStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useSessionRuntimeStore } from '../../stores/sessionRuntimeStore'
import { useTeamStore } from '../../stores/teamStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useExpertStore } from '../../stores/expertStore'
import {
  formatWorkspaceReferencePrompt,
  useWorkspaceChatContextStore,
  type WorkspaceChatReference,
} from '../../stores/workspaceChatContextStore'
import {
  sessionsApi,
  type SessionGitInfo,
  type WorkflowSessionCreateOptions,
  type WorkflowTemplatesResponse,
} from '../../api/sessions'
import { ApiError } from '../../api/client'
import { PermissionModeSelector } from '../controls/PermissionModeSelector'
import { ModelSelector } from '../controls/ModelSelector'
import type { AttachmentRef, UIMessage } from '../../types/chat'
import { AttachmentGallery } from './AttachmentGallery'
import { ComposerDropOverlay } from './ComposerDropOverlay'
import { ProjectContextChip } from '../shared/ProjectContextChip'
import { ExpertSelectionDialog } from '../experts/ExpertSelectionDialog'
import type { ExpertDefinition } from '../../api/experts'
import { modelCapabilitiesApi } from '../../api/modelCapabilities'
import { RepositoryLaunchControls } from '../shared/RepositoryLaunchControls'
import {
  WorkflowStartDialog,
  type WorkflowStartDialogSelection,
} from '../workflow/WorkflowStartDialog'
import { FileSearchMenu, type FileSearchMenuHandle } from './FileSearchMenu'
import { LocalSlashCommandPanel, type LocalSlashCommandName } from './LocalSlashCommandPanel'
import { ContextUsageIndicator } from './ContextUsageIndicator'
import {
  FALLBACK_SLASH_COMMANDS,
  filterSlashCommands,
  findLeadingSlashInvocation,
  findSlashTrigger,
  mergeSlashCommands,
  replaceSlashToken,
  resolveSlashUiAction,
} from './composerUtils'
import { useMobileViewport } from '../../hooks/useMobileViewport'
import { isTauriRuntime } from '../../lib/desktopRuntime'
import {
  filesToComposerAttachments,
  selectNativeFileAttachments,
  type ComposerAttachment,
} from '../../lib/composerAttachments'
import { useComposerFileDrop } from './useComposerFileDrop'
import {
  UNSUPPORTED_IMAGE_INPUT_MESSAGE,
  evaluateDesktopModelRequirements,
  getDesktopModelCapability,
  isImageLikeAttachment,
  type DesktopModelCapabilityDefinition,
} from '../../lib/modelCapabilities'
import type {
  LinkedWorkflowContextStrategy,
  LinkedWorkflowSessionStartErrorCode,
  WorkflowTemplateSource,
} from '../../types/session'

type GitInfo = SessionGitInfo

type Attachment = ComposerAttachment

type ChatInputProps = {
  variant?: 'default' | 'hero'
  compact?: boolean
}

type WorkflowTemplateSelection = {
  templateId: string
  templateSource: WorkflowTemplateSource
}

type EmptySessionReplacementOptions = {
  repository?: {
    branch?: string | null
    worktree?: boolean
  }
  workflow?: WorkflowSessionCreateOptions
}

type SlashCommand = {
  name: string
  description: string
  argumentHint?: string
}

type ComposerSlashInvocation = {
  token: string
  name: string
  label: string
  prefix: string
  rest: string
}

const EMPTY_SLASH_COMMANDS: SlashCommand[] = []
const EMPTY_WORKSPACE_REFERENCES: WorkspaceChatReference[] = []
const EMPTY_MESSAGES: UIMessage[] = []
const TERMINAL_WORKFLOW_STATUSES = new Set(['completed', 'failed', 'cancelled'])
const COMPOSER_TEXTAREA_MAX_HEIGHT = 200

function isTerminalWorkflowStatus(status: string | undefined): boolean {
  return typeof status === 'string' && TERMINAL_WORKFLOW_STATUSES.has(status)
}

function workspaceReferenceToAttachment(reference: WorkspaceChatReference): Attachment {
  return {
    id: reference.id,
    name: reference.name,
    type: 'file',
    path: reference.kind === 'chat-selection' ? undefined : reference.path,
    isDirectory: reference.isDirectory,
    lineStart: reference.lineStart,
    lineEnd: reference.lineEnd,
    note: reference.note,
    quote: reference.quote,
  }
}

const ComposerInlineSkillInvocation = forwardRef<
  HTMLDivElement,
  {
    invocation: ComposerSlashInvocation
    className: string
  }
>(({ invocation, className }, ref) => (
  <div
    ref={ref}
    aria-hidden="true"
    data-testid="chat-input-inline-highlight-layer"
    className={`pointer-events-none absolute left-0 right-0 top-0 z-0 overflow-hidden whitespace-pre-wrap break-words text-[var(--color-text-primary)] ${className}`}
  >
    <span>{invocation.prefix}</span>
    <span
      data-testid="chat-input-inline-skill-invocation"
      className="mr-1 inline-flex max-w-full align-baseline rounded-[6px] border border-[var(--color-brand)]/35 bg-[var(--color-brand)]/10 px-1.5 py-0.5 font-mono text-[12px] font-semibold leading-none text-[var(--color-brand)]"
      title={`${invocation.label}: ${invocation.token}`}
    >
      {invocation.token}
    </span>
    <span>{invocation.rest || '\u200b'}</span>
  </div>
))

ComposerInlineSkillInvocation.displayName = 'ComposerInlineSkillInvocation'

export function ChatInput({ variant = 'default', compact = false }: ChatInputProps) {
  const t = useTranslation()
  const isMobileComposer = useMobileViewport() && !isTauriRuntime()
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const [slashMenuOpen, setSlashMenuOpen] = useState(false)
  const [fileSearchOpen, setFileSearchOpen] = useState(false)
  const [localSlashPanel, setLocalSlashPanel] = useState<LocalSlashCommandName | null>(null)
  const [atFilter, setAtFilter] = useState('')
  const [atCursorPos, setAtCursorPos] = useState(-1)
  const [slashFilter, setSlashFilter] = useState('')
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0)
  const [launchWorkDir, setLaunchWorkDir] = useState('')
  const [launchBranch, setLaunchBranch] = useState<string | null>(null)
  const [launchUseWorktree, setLaunchUseWorktree] = useState(false)
  const [launchReady, setLaunchReady] = useState(true)
  const [launchTransitioning, setLaunchTransitioning] = useState(false)
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplatesResponse['templates']>([])
  const [invalidWorkflowTemplates, setInvalidWorkflowTemplates] = useState<WorkflowTemplatesResponse['invalidTemplates']>([])
  const [workflowTemplatesLoading, setWorkflowTemplatesLoading] = useState(false)
  const [workflowTemplatesLoadFailed, setWorkflowTemplatesLoadFailed] = useState(false)
  const [selectedWorkflowTemplate, setSelectedWorkflowTemplate] = useState<WorkflowTemplateSelection | null>(null)
  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false)
  const [expertDialogOpen, setExpertDialogOpen] = useState(false)
  const [workflowContextDialogOpen, setWorkflowContextDialogOpen] = useState(false)
  const [pendingLinkedWorkflowSelection, setPendingLinkedWorkflowSelection] =
    useState<WorkflowStartDialogSelection | null>(null)
  const [linkedWorkflowStarting, setLinkedWorkflowStarting] = useState(false)
  const [linkedWorkflowRecoveryError, setLinkedWorkflowRecoveryError] =
    useState<'context-too-large' | null>(null)
  const [summaryInstructions, setSummaryInstructions] = useState('')
  const [summaryPreview, setSummaryPreview] = useState<string | null>(null)
  const [summaryPreviewing, setSummaryPreviewing] = useState(false)
  const composingRef = useRef(false)
  const workflowTemplateRequestIdRef = useRef(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerOverlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const slashMenuRef = useRef<HTMLDivElement>(null)
  const fileSearchRef = useRef<FileSearchMenuHandle>(null)
  const slashItemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const previousActiveTabIdRef = useRef<string | null>(null)
  const inputRef = useRef(input)
  const attachmentsRef = useRef(attachments)
  const setComposerInput = useCallback((value: string) => {
    inputRef.current = value
    setInput(value)
  }, [])
  const setComposerAttachments = useCallback((value: Attachment[] | ((previous: Attachment[]) => Attachment[])) => {
    setAttachments((previous) => {
      const next = typeof value === 'function' ? value(previous) : value
      attachmentsRef.current = next
      return next
    })
  }, [])

  const sendMessage = useChatStore((s) => s.sendMessage)
  const stopGeneration = useChatStore((s) => s.stopGeneration)
  const guideQueuedMessage = useChatStore((s) => s.guideQueuedMessage)
  const deleteQueuedMessage = useChatStore((s) => s.deleteQueuedMessage)
  const settleSessionIdle = useChatStore((s) => s.settleSessionIdle)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const chatState = useChatStore((s) => activeTabId ? s.sessions[activeTabId]?.chatState ?? 'idle' : 'idle')
  const sessionMessages = useChatStore((s) => activeTabId ? s.sessions[activeTabId]?.messages ?? EMPTY_MESSAGES : EMPTY_MESSAGES)
  const slashCommands = useChatStore((s) => activeTabId ? s.sessions[activeTabId]?.slashCommands ?? EMPTY_SLASH_COMMANDS : EMPTY_SLASH_COMMANDS)
  const composerPrefill = useChatStore((s) => activeTabId ? s.sessions[activeTabId]?.composerPrefill ?? null : null)
  const connectionState = useChatStore((s) => activeTabId ? s.sessions[activeTabId]?.connectionState : undefined)
  const loadedMessageCount = sessionMessages.length
  const runtimeSelection = useSessionRuntimeStore((state) =>
    activeTabId ? state.selections[activeTabId] : undefined,
  )
  const currentModel = useSettingsStore((state) => state.currentModel)
  const runtimeSelectionKey = runtimeSelection
    ? `${runtimeSelection.providerId ?? 'official'}:${runtimeSelection.modelId}`
    : undefined
  const runtimeModelLabel = runtimeSelection?.modelId ?? currentModel?.name ?? currentModel?.id
  const capabilityProvider = runtimeSelection?.providerId ?? null
  const capabilityModelId = runtimeSelection?.modelId ?? currentModel?.id ?? currentModel?.name ?? null
  const localModelCapability = useMemo(() => getDesktopModelCapability(
    capabilityProvider ?? 'official',
    capabilityModelId,
  ), [capabilityModelId, capabilityProvider])
  const [remoteModelCapability, setRemoteModelCapability] = useState<{
    key: string
    capability: DesktopModelCapabilityDefinition
  } | null>(null)
  const capabilityLookupKey = `${capabilityProvider ?? 'active'}:${capabilityModelId ?? ''}`
  const currentModelCapability = remoteModelCapability?.key === capabilityLookupKey
    ? remoteModelCapability.capability
    : localModelCapability
  const supportsImageInput = currentModelCapability.capabilities.imageInput === true
  const resolveCurrentModelCapability = useCallback(async () => {
    if (!capabilityModelId) return localModelCapability
    if (remoteModelCapability?.key === capabilityLookupKey) return remoteModelCapability.capability

    try {
      const response = await modelCapabilitiesApi.get(capabilityProvider, capabilityModelId)
      setRemoteModelCapability({ key: capabilityLookupKey, capability: response.capability })
      return response.capability
    } catch {
      setRemoteModelCapability((current) => current?.key === capabilityLookupKey ? null : current)
      return localModelCapability
    }
  }, [capabilityLookupKey, capabilityModelId, capabilityProvider, localModelCapability, remoteModelCapability])

  useEffect(() => {
    if (!capabilityModelId) {
      setRemoteModelCapability(null)
      return
    }

    let cancelled = false
    void modelCapabilitiesApi.get(capabilityProvider, capabilityModelId)
      .then((response) => {
        if (cancelled) return
        setRemoteModelCapability({ key: capabilityLookupKey, capability: response.capability })
      })
      .catch(() => {
        if (cancelled) return
        setRemoteModelCapability((current) => current?.key === capabilityLookupKey ? null : current)
      })

    return () => {
      cancelled = true
    }
  }, [capabilityLookupKey, capabilityModelId, capabilityProvider])

  const showUnsupportedImageInputToast = useCallback(() => {
    useUIStore.getState().addToast({
      type: 'warning',
      message: UNSUPPORTED_IMAGE_INPUT_MESSAGE,
    })
  }, [])

  const filterImageAttachmentsForCurrentModel = useCallback(async (nextAttachments: Attachment[]) => {
    const hasImageAttachment = nextAttachments.some((attachment) => isImageLikeAttachment(attachment))
    if (!hasImageAttachment) return nextAttachments

    const resolvedCapability = supportsImageInput
      ? currentModelCapability
      : await resolveCurrentModelCapability()
    if (resolvedCapability.capabilities.imageInput === true) return nextAttachments

    showUnsupportedImageInputToast()
    return nextAttachments.filter((attachment) => !isImageLikeAttachment(attachment))
  }, [currentModelCapability, resolveCurrentModelCapability, showUnsupportedImageInputToast, supportsImageInput])
  const activeSession = useSessionStore((state) => activeTabId ? state.sessions.find((session) => session.id === activeTabId) ?? null : null)
  const messageCount = Math.max(loadedMessageCount, activeSession?.messageCount ?? 0)
  const memberInfo = useTeamStore((s) => activeTabId ? s.getMemberBySessionId(activeTabId) : null)
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null)
  const workspaceReferences = useWorkspaceChatContextStore(
    (s) => activeTabId ? s.referencesBySession[activeTabId] ?? EMPTY_WORKSPACE_REFERENCES : EMPTY_WORKSPACE_REFERENCES,
  )
  const addWorkspaceReference = useWorkspaceChatContextStore((s) => s.addReference)
  const removeWorkspaceReference = useWorkspaceChatContextStore((s) => s.removeReference)
  const clearWorkspaceReferences = useWorkspaceChatContextStore((s) => s.clearReferences)
  const saveComposerDraft = useCallback((sessionId: string) => {
    const draft = {
      input: inputRef.current,
      attachments: attachmentsRef.current,
    }
    const chatStore = useChatStore.getState()
    if (draft.input.length === 0 && draft.attachments.length === 0) {
      chatStore.clearComposerDraft(sessionId)
      return
    }
    chatStore.setComposerDraft(sessionId, draft)
  }, [])

  const isMemberSession = !!memberInfo
  const queuedMessages = useMemo(
    () => isMemberSession
      ? []
      : sessionMessages.filter(
          (message): message is Extract<UIMessage, { type: 'user_text' }> =>
            message.type === 'user_text' && Boolean(message.queued),
        ),
    [isMemberSession, sessionMessages],
  )
  const isDisconnectedMemberSession =
    isMemberSession && connectionState === 'disconnected'
  const isActive = chatState !== 'idle'
  const isWorkspaceMissing = activeSession?.workDirExists === false
  const hasTerminalWorkflow = isTerminalWorkflowStatus(activeSession?.workflow?.status)
  const mustStartFreshWorkflow = activeSession?.workflow?.mode === 'workflow' && activeSession.workflow.status !== 'completed' && activeSession.workflow.status !== 'cancelled'
  const canOpenWorkflowDialog = !isMemberSession && !!activeTabId
  const canAttemptWorkflowDialog = canOpenWorkflowDialog && (!isActive || hasTerminalWorkflow)
  const hasWorkspaceReferences = !isMemberSession && workspaceReferences.length > 0
  const hasComposerPayload =
    input.trim().length > 0 ||
    (!isMemberSession && (attachments.length > 0 || hasWorkspaceReferences))
  const showStopAction = !isMemberSession && isActive && !hasComposerPayload
  const isHeroComposer = variant === 'hero' && !isMemberSession && !compact
  const resolvedWorkDir = activeSession?.workDir || activeSession?.projectRoot || gitInfo?.workDir || undefined
  const showLaunchControls = !isMemberSession && messageCount === 0
  const useCompactControls = compact || isMobileComposer
  const iconOnlyAction = compact || isMobileComposer
  const activeLaunchWorkDir = showLaunchControls ? (launchWorkDir || resolvedWorkDir || '') : (resolvedWorkDir || '')
  const embedLaunchControlsInHero = isHeroComposer && !useCompactControls && showLaunchControls
  const pendingSlashUiAction = !isMemberSession && input.trim().startsWith('/')
    ? resolveSlashUiAction(input.trim().slice(1))
    : null
  const canSubmit = !isWorkspaceMissing &&
    !isDisconnectedMemberSession &&
    !launchTransitioning &&
    (!showLaunchControls || launchReady || !!pendingSlashUiAction) &&
    hasComposerPayload
  const precheckWorkflowModelRequirements = useCallback((selection: { templateId: string; templateSource: WorkflowTemplateSource }) => {
    const template = workflowTemplates.find((candidate) =>
      candidate.id === selection.templateId && candidate.source === selection.templateSource
    )
    if (!template) return true
    const requirements = {
      ...(template.modelRequirements ?? {}),
      ...(template.requiredModelCapabilities ? { required: template.requiredModelCapabilities } : {}),
    }
    const result = evaluateDesktopModelRequirements(currentModelCapability.capabilities, requirements)
    if (result.blockers.length > 0) {
      useUIStore.getState().addToast({
        type: 'error',
        message: `当前模型不满足该流程的必需能力：${result.blockers.join(', ')}。请切换模型后再启动。`,
      })
      return false
    }
    if (result.warnings.length > 0) {
      useUIStore.getState().addToast({
        type: 'warning',
        message: `当前模型缺少该流程的可选能力：${result.warnings.join(', ')}，流程仍可启动但可能降级。`,
      })
    }
    return true
  }, [currentModelCapability.capabilities, workflowTemplates])
  const composerAttachments = useMemo(
    () => [
      ...attachments,
      ...workspaceReferences.map(workspaceReferenceToAttachment),
    ],
    [attachments, workspaceReferences],
  )
  const slashCommandCount = slashCommands.length

  useEffect(() => {
    inputRef.current = input
  }, [input])

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    const previousActiveTabId = previousActiveTabIdRef.current

    if (previousActiveTabId === activeTabId) return

    if (previousActiveTabId) {
      saveComposerDraft(previousActiveTabId)
    }

    const nextDraft = activeTabId ? useChatStore.getState().sessions[activeTabId]?.composerDraft : undefined
    setComposerInput(nextDraft?.input ?? '')
    setComposerAttachments(nextDraft?.attachments ?? [])
    setPlusMenuOpen(false)
    setSlashMenuOpen(false)
    setFileSearchOpen(false)
    setLocalSlashPanel(null)
    setExpertDialogOpen(false)
    setSlashFilter('')
    setAtFilter('')
    setAtCursorPos(-1)
    previousActiveTabIdRef.current = activeTabId
  }, [activeTabId, saveComposerDraft, setComposerAttachments, setComposerInput])

  useEffect(() => {
    return () => {
      const currentActiveTabId = previousActiveTabIdRef.current
      if (currentActiveTabId) saveComposerDraft(currentActiveTabId)
    }
  }, [saveComposerDraft])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [isActive])

  useEffect(() => {
    if (!composerPrefill) return

    setComposerInput(composerPrefill.text)
    setComposerAttachments(
      (composerPrefill.attachments ?? [])
        .filter((attachment) => attachment.type === 'image' || attachment.data)
        .map((attachment, index) => ({
          id: `rewind-prefill-${composerPrefill.nonce}-${index}`,
          name: attachment.name,
          type: attachment.type,
          mimeType: attachment.mimeType,
          previewUrl: attachment.type === 'image' ? attachment.data : undefined,
          data: attachment.data,
        })),
    )
    setPlusMenuOpen(false)
    setSlashMenuOpen(false)
    setFileSearchOpen(false)
    setSlashFilter('')
    setAtFilter('')
    setAtCursorPos(-1)

    requestAnimationFrame(() => {
      const el = textareaRef.current
      el?.focus()
      const cursor = composerPrefill.text.length
      el?.setSelectionRange(cursor, cursor)
    })
  }, [composerPrefill, setComposerAttachments, setComposerInput])

  const refreshGitInfo = useCallback(() => {
    if (!activeTabId) {
      setGitInfo(null)
      return
    }
    if (isMemberSession) {
      setGitInfo(null)
      return
    }
    sessionsApi.getGitInfo(activeTabId).then(setGitInfo).catch(() => setGitInfo(null))
  }, [activeTabId, isMemberSession])

  useEffect(() => {
    refreshGitInfo()
  }, [refreshGitInfo])

  useEffect(() => {
    if (!activeTabId || isMemberSession || messageCount === 0) return
    const timeout = setTimeout(refreshGitInfo, chatState === 'idle' ? 0 : 500)
    return () => clearTimeout(timeout)
  }, [activeTabId, chatState, isMemberSession, messageCount, refreshGitInfo, slashCommandCount])

  useEffect(() => {
    if (!isMemberSession) return
    setComposerAttachments([])
    setPlusMenuOpen(false)
    setSlashMenuOpen(false)
    setFileSearchOpen(false)
  }, [isMemberSession, activeTabId])

  useEffect(() => {
    if (!showLaunchControls) return
    const nextWorkDir = activeSession?.workDir || gitInfo?.workDir || ''
    setLaunchWorkDir((current) => {
      if (current === nextWorkDir) return current
      setLaunchBranch(null)
      setLaunchUseWorktree(false)
      setLaunchReady(!nextWorkDir)
      return nextWorkDir
    })
  }, [activeSession?.workDir, activeTabId, gitInfo?.workDir, showLaunchControls])

  const refreshWorkflowTemplates = useCallback(async () => {
    const requestId = ++workflowTemplateRequestIdRef.current
    setWorkflowTemplatesLoading(true)
    setWorkflowTemplatesLoadFailed(false)

    try {
      const { templates, invalidTemplates } = await sessionsApi.listWorkflowTemplates()
      if (requestId !== workflowTemplateRequestIdRef.current) return
      setWorkflowTemplates(templates)
      setInvalidWorkflowTemplates(invalidTemplates)
    } catch {
      if (requestId !== workflowTemplateRequestIdRef.current) return
      setWorkflowTemplatesLoadFailed(true)
    } finally {
      if (requestId === workflowTemplateRequestIdRef.current) {
        setWorkflowTemplatesLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!canOpenWorkflowDialog) {
      workflowTemplateRequestIdRef.current += 1
      setWorkflowTemplates([])
      setInvalidWorkflowTemplates([])
      setWorkflowTemplatesLoading(false)
      setWorkflowTemplatesLoadFailed(false)
      setSelectedWorkflowTemplate(null)
      setWorkflowDialogOpen(false)
      setWorkflowContextDialogOpen(false)
      setPendingLinkedWorkflowSelection(null)
      setLinkedWorkflowRecoveryError(null)
      return
    }

    setSelectedWorkflowTemplate(null)
    void refreshWorkflowTemplates()
  }, [activeTabId, canOpenWorkflowDialog, refreshWorkflowTemplates])

  const resizeComposerTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const nextHeight = Math.min(el.scrollHeight, COMPOSER_TEXTAREA_MAX_HEIGHT)
    el.style.height = `${nextHeight}px`
    el.style.overflowY = el.scrollHeight > COMPOSER_TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden'
  }, [])

  useLayoutEffect(() => {
    resizeComposerTextarea()
  }, [input, resizeComposerTextarea])

  useEffect(() => {
    if (!plusMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target as Node)) {
        setPlusMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [plusMenuOpen])

  useEffect(() => {
    if (!slashMenuOpen) return
    const handleClick = (event: MouseEvent) => {
      if (
        slashMenuRef.current &&
        !slashMenuRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setSlashMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [slashMenuOpen])

  useEffect(() => {
    if (!localSlashPanel) return
    const handleClick = (event: MouseEvent) => {
      if (
        slashMenuRef.current &&
        !slashMenuRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setLocalSlashPanel(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [localSlashPanel])

  useEffect(() => {
    if (!fileSearchOpen) return
    const handleClick = (event: MouseEvent) => {
      const menu = document.getElementById('file-search-menu')
      if (
        menu &&
        !menu.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setFileSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [fileSearchOpen])

  const allSlashCommands = useMemo(
    () => mergeSlashCommands(slashCommands, FALLBACK_SLASH_COMMANDS),
    [slashCommands],
  )

  const leadingSlashInvocation = useMemo(() => {
    const prefixLength = input.length - input.trimStart().length
    const invocation = findLeadingSlashInvocation(input.slice(prefixLength))
    if (!invocation) return null

    return {
      ...invocation,
      prefix: input.slice(0, prefixLength),
      rest: input.slice(prefixLength + invocation.token.length),
    }
  }, [input])

  const activeSlashInvocation = useMemo<ComposerSlashInvocation | null>(() => {
    if (!leadingSlashInvocation) return null
    const normalizedName = leadingSlashInvocation.name.toLowerCase()
    const knownCommand = allSlashCommands.find((command) => command.name.toLowerCase() === normalizedName)
    if (!knownCommand) return null

    const isSessionSkill = slashCommands.some((command) => command.name.toLowerCase() === normalizedName)
    return {
      token: leadingSlashInvocation.token,
      name: leadingSlashInvocation.name,
      label: isSessionSkill ? t('settings.tab.skills') : t('chat.slashCommands'),
      prefix: leadingSlashInvocation.prefix,
      rest: leadingSlashInvocation.rest,
    }
  }, [allSlashCommands, leadingSlashInvocation, slashCommands, t])

  const filteredCommands = useMemo(() => {
    return filterSlashCommands(allSlashCommands, slashFilter)
  }, [allSlashCommands, slashFilter])

  const exactSlashCommand = useMemo(() => {
    const normalized = slashFilter.trim().toLowerCase()
    if (!normalized) return null
    return filteredCommands.find((command) => command.name.toLowerCase() === normalized) ?? null
  }, [filteredCommands, slashFilter])

  useEffect(() => {
    setSlashSelectedIndex(0)
  }, [slashFilter])

  useEffect(() => {
    const activeItem = slashMenuOpen ? slashItemRefs.current[slashSelectedIndex] : null
    if (activeItem && typeof activeItem.scrollIntoView === 'function') {
      activeItem.scrollIntoView({ block: 'nearest' })
    }
  }, [slashMenuOpen, slashSelectedIndex])

  const detectSlashTrigger = useCallback((value: string, cursorPos: number) => {
    const token = findSlashTrigger(value, cursorPos)
    if (!token) {
      setSlashMenuOpen(false)
      return
    }

    setFileSearchOpen(false)
    setSlashFilter(token.filter)
    setSlashMenuOpen(true)
  }, [])

  // Detect @ trigger (file search)
  const detectAtTrigger = useCallback((value: string, cursorPos: number) => {
    const textBeforeCursor = value.slice(0, cursorPos)
    let pos = -1

    for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
      const ch = textBeforeCursor[i]!
      if (ch === '@') {
        if (i === 0 || /\s/.test(textBeforeCursor[i - 1]!)) {
          pos = i
          break
        }
        break
      }
      if (/\s/.test(ch)) {
        break
      }
    }

    if (pos < 0) {
      setFileSearchOpen(false)
      setAtFilter('')
      setAtCursorPos(-1)
      return
    }

    // Extract filter text after @
    const filter = textBeforeCursor.slice(pos + 1)
    setAtFilter(filter)
    setAtCursorPos(pos)
    setSlashMenuOpen(false)
    setFileSearchOpen(true)
  }, [])

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value
    if (isMemberSession) {
      setComposerInput(value)
      return
    }
    const cursorPos = event.target.selectionStart ?? value.length
    setComposerInput(value)
    detectSlashTrigger(value, cursorPos)
    detectAtTrigger(value, cursorPos)
  }

  const syncComposerOverlayScroll = useCallback((event: React.UIEvent<HTMLTextAreaElement>) => {
    const overlay = composerOverlayRef.current
    if (!overlay) return
    overlay.scrollTop = event.currentTarget.scrollTop
    overlay.scrollLeft = event.currentTarget.scrollLeft
  }, [])

  const selectSlashCommand = useCallback((command: string) => {
    const el = textareaRef.current
    if (!el) return
    const cursorPos = el.selectionStart ?? input.length
    const replacement = replaceSlashToken(input, cursorPos, command)
    setComposerInput(replacement.value)
    setSlashMenuOpen(false)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(replacement.cursorPos, replacement.cursorPos)
    })
  }, [input])

  const replaceEmptySession = useCallback(async (
    workDir: string,
    options?: EmptySessionReplacementOptions,
  ) => {
    if (!activeTabId) return null
    const oldId = activeTabId
    const { createSession, deleteSession } = useSessionStore.getState()
    const { replaceTabSession } = useTabStore.getState()
    const { disconnectSession, connectToSession } = useChatStore.getState()
    const newId = await createSession(
      workDir || undefined,
      options,
    )
    useSessionRuntimeStore.getState().moveSelection(oldId, newId)
    disconnectSession(oldId)
    replaceTabSession(oldId, newId)
    connectToSession(newId)
    deleteSession(oldId).catch(() => {})
    return newId
  }, [activeTabId])

  const handleLaunchWorkDirChange = useCallback(async (newWorkDir: string) => {
    setLaunchWorkDir(newWorkDir)
    setLaunchBranch(null)
    setLaunchUseWorktree(false)
    setLaunchReady(!newWorkDir)
    if (!activeTabId) return

    setLaunchTransitioning(true)
    try {
      await replaceEmptySession(newWorkDir)
    } catch (error) {
      useUIStore.getState().addToast({
        type: 'error',
        message: error instanceof Error ? error.message : t('empty.failedToCreate'),
      })
    } finally {
      setLaunchTransitioning(false)
    }
  }, [activeTabId, replaceEmptySession, t])

  const handleWorkflowWorkspaceChange = useCallback((newWorkDir: string) => {
    setLaunchWorkDir(newWorkDir)
    setLaunchBranch(null)
    setLaunchUseWorktree(false)
    setLaunchReady(true)
  }, [])

  const handleSubmit = async () => {
    const text = input.trim()
    if ((!text && ((!attachments.length && !hasWorkspaceReferences) || isMemberSession)) || isWorkspaceMissing) return

    if (pendingSlashUiAction?.type === 'panel') {
      setLocalSlashPanel(pendingSlashUiAction.command as LocalSlashCommandName)
      setComposerInput('')
      setSlashMenuOpen(false)
      setFileSearchOpen(false)
      setPlusMenuOpen(false)
      return
    }

    if (pendingSlashUiAction?.type === 'settings') {
      useUIStore.getState().setPendingSettingsTab(pendingSlashUiAction.tab)
      useTabStore.getState().openTab(SETTINGS_TAB_ID, 'Settings', 'settings')
      setComposerInput('')
      setSlashMenuOpen(false)
      setFileSearchOpen(false)
      setPlusMenuOpen(false)
      return
    }

    if (showLaunchControls && (!launchReady || launchTransitioning)) return

    const workspaceReferencePrompt = !isMemberSession
      ? formatWorkspaceReferencePrompt(workspaceReferences)
      : ''
    const contentForModel = [workspaceReferencePrompt, text].filter(Boolean).join('\n\n')
    const displayContent = text || (
      workspaceReferences.length > 0
        ? t('chat.contextReferencesOnly', { count: workspaceReferences.length })
        : ''
    )
    const uploadAttachmentPayload: AttachmentRef[] = attachments.map((attachment) => ({
      type: attachment.type,
      name: attachment.name,
      path: attachment.path,
      data: attachment.data,
      mimeType: attachment.mimeType,
      lineStart: attachment.lineStart,
      lineEnd: attachment.lineEnd,
      note: attachment.note,
      quote: attachment.quote,
    }))
    const workspaceAttachmentPayload: AttachmentRef[] = workspaceReferences
      .filter((reference) => reference.kind !== 'chat-selection')
      .map((reference) => ({
        type: 'file' as const,
        name: reference.name,
        path: reference.absolutePath ?? reference.path,
        isDirectory: reference.isDirectory,
        lineStart: reference.lineStart,
        lineEnd: reference.lineEnd,
        note: reference.note,
        quote: reference.quote,
      }))
    const visibleAttachmentPayload: AttachmentRef[] = [
      ...uploadAttachmentPayload,
      ...workspaceReferences.map((reference) => ({
        type: 'file' as const,
        name: reference.name,
        path: reference.kind === 'chat-selection' ? undefined : reference.path,
        isDirectory: reference.isDirectory,
        lineStart: reference.lineStart,
        lineEnd: reference.lineEnd,
        note: reference.note,
        quote: reference.quote,
      })),
    ]

    let targetSessionId = activeTabId!
    if (showLaunchControls) {
      const shouldReplaceForRepositoryLaunch =
        !!activeLaunchWorkDir &&
        !!launchBranch &&
        (launchUseWorktree || (gitInfo?.branch ? launchBranch !== gitInfo.branch : true))
      const repository = shouldReplaceForRepositoryLaunch
        ? {
            branch: launchBranch,
            worktree: launchUseWorktree,
          }
        : undefined

      if (repository) {
        setLaunchTransitioning(true)
        try {
          const newSessionId = await replaceEmptySession(activeLaunchWorkDir, {
            ...(repository ? { repository } : {}),
          })
          if (!newSessionId) return
          targetSessionId = newSessionId
        } catch (error) {
          useUIStore.getState().addToast({
            type: 'error',
            message: error instanceof Error ? error.message : t('empty.failedToCreate'),
          })
          return
        } finally {
          setLaunchTransitioning(false)
        }
      }
    }

    sendMessage(targetSessionId, contentForModel, [...uploadAttachmentPayload, ...workspaceAttachmentPayload], {
      displayContent,
      displayAttachments: visibleAttachmentPayload,
    })
    setComposerInput('')
    setComposerAttachments([])
    useChatStore.getState().clearComposerDraft(activeTabId!)
    if (targetSessionId !== activeTabId) useChatStore.getState().clearComposerDraft(targetSessionId)
    if (!isMemberSession) {
      clearWorkspaceReferences(activeTabId!)
      if (targetSessionId !== activeTabId) clearWorkspaceReferences(targetSessionId)
    }
    setPlusMenuOpen(false)
    setSlashMenuOpen(false)
    setFileSearchOpen(false)
    setLocalSlashPanel(null)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Ignore key events during IME composition (e.g. Chinese input method)
    if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return

    // Route file search navigation keys to FileSearchMenu
    if (fileSearchOpen) {
      const key = event.key
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'ArrowRight' || key === 'Enter' || key === 'Tab' || key === 'Escape') {
        event.preventDefault()
        if (key === 'Escape') {
          setFileSearchOpen(false)
          setAtFilter('')
          setAtCursorPos(-1)
          return
        }
        fileSearchRef.current?.handleKeyDown(event.nativeEvent)
        return
      }
      // Other keys (typing) should go to the textarea - let it propagate
      return
    }

    if (localSlashPanel) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setLocalSlashPanel(null)
        return
      }
    }

    if (slashMenuOpen && filteredCommands.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashSelectedIndex((prev) => (prev + 1) % filteredCommands.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
        return
      }
      if (event.key === 'Enter') {
        if (exactSlashCommand && slashFilter.trim().toLowerCase() === exactSlashCommand.name.toLowerCase()) {
          event.preventDefault()
          handleSubmit()
          return
        }
        event.preventDefault()
        const selected = filteredCommands[slashSelectedIndex]
        if (selected) selectSlashCommand(selected.name)
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        const selected = filteredCommands[slashSelectedIndex]
        if (selected) selectSlashCommand(selected.name)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setSlashMenuOpen(false)
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isMemberSession) return
    const items = event.clipboardData?.items

    const imageFiles: File[] = []
    if (items) {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i]
        if (!item || !item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }

    if (imageFiles.length > 0) {
      event.preventDefault()
      void resolveCurrentModelCapability().then((resolvedCapability) => {
        if (resolvedCapability.capabilities.imageInput !== true) {
          showUnsupportedImageInputToast()
          return
        }

        for (const file of imageFiles) {
          const id = `att-${Date.now()}-${Math.random().toString(36).slice(2)}`
          const reader = new FileReader()
          reader.onload = () => {
            setComposerAttachments((prev) => [
              ...prev,
              {
                id,
                name: `pasted-image-${Date.now()}.png`,
                type: 'image',
                mimeType: file.type || 'image/png',
                previewUrl: reader.result as string,
                data: reader.result as string,
              },
            ])
          }
          reader.readAsDataURL(file)
        }
      })
      return
    }

    const text = event.clipboardData?.getData('text/plain') || event.clipboardData?.getData('text') || ''
    if (!text) return

    event.preventDefault()
    const target = event.currentTarget
    const selectionStart = target.selectionStart ?? target.value.length
    const selectionEnd = target.selectionEnd ?? selectionStart
    const nextValue = `${target.value.slice(0, selectionStart)}${text}${target.value.slice(selectionEnd)}`
    const nextCursor = selectionStart + text.length

    setComposerInput(nextValue)
    detectSlashTrigger(nextValue, nextCursor)
    detectAtTrigger(nextValue, nextCursor)

    requestAnimationFrame(() => {
      target.focus()
      target.setSelectionRange(nextCursor, nextCursor)
      resizeComposerTextarea()
    })
  }

  const appendFiles = useCallback((files: FileList | File[]) => {
    void filesToComposerAttachments(files)
      .then((nextAttachments) => filterImageAttachmentsForCurrentModel(nextAttachments))
      .then((allowedAttachments) => {
        if (allowedAttachments.length === 0) return
        setComposerAttachments((prev) => [...prev, ...allowedAttachments])
      })
      .catch((error) => {
        console.warn('[attachments] Failed to read selected files', error)
      })
  }, [filterImageAttachmentsForCurrentModel, setComposerAttachments])

  const appendAttachments = useCallback((nextAttachments: Attachment[]) => {
    void filterImageAttachmentsForCurrentModel(nextAttachments)
      .then((allowedAttachments) => {
        if (allowedAttachments.length === 0) return
        setComposerAttachments((prev) => [...prev, ...allowedAttachments])
      })
  }, [filterImageAttachmentsForCurrentModel, setComposerAttachments])

  const { isDragActive, dragHandlers } = useComposerFileDrop({
    disabled: isMemberSession || isWorkspaceMissing,
    panelRef,
    onAttachments: appendAttachments,
    onError: (error) => {
      console.warn('[attachments] Failed to read dropped files', error)
    },
  })

  const openAttachmentPicker = useCallback(() => {
    if (!isTauriRuntime()) {
      fileInputRef.current?.click()
      setPlusMenuOpen(false)
      return
    }

    void selectNativeFileAttachments()
      .then(async (nativeAttachments) => {
        if (nativeAttachments) {
          if (nativeAttachments.length > 0) {
            const allowedAttachments = await filterImageAttachmentsForCurrentModel(nativeAttachments)
            if (allowedAttachments.length > 0) {
              setComposerAttachments((prev) => [...prev, ...allowedAttachments])
            }
          }
          return
        }
        fileInputRef.current?.click()
      })
      .finally(() => setPlusMenuOpen(false))
  }, [filterImageAttachmentsForCurrentModel, setComposerAttachments])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isMemberSession) return
    const files = event.target.files
    if (!files) return

    appendFiles(files)
    event.target.value = ''
  }

  const removeAttachment = (id: string) => {
    setComposerAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
    if (activeTabId) removeWorkspaceReference(activeTabId, id)
  }

  const insertSlashCommand = () => {
    if (isMemberSession) return
    const el = textareaRef.current
    const cursorPos = el?.selectionStart ?? input.length
    const replacement = replaceSlashToken(input, cursorPos, '', { trailingSpace: false })
    setComposerInput(replacement.value)
    setPlusMenuOpen(false)
    setSlashFilter('')
    setSlashMenuOpen(true)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(replacement.cursorPos, replacement.cursorPos)
    })
  }

  const openExpertDialog = () => {
    if (isMemberSession) return
    setPlusMenuOpen(false)
    setSlashMenuOpen(false)
    setFileSearchOpen(false)
    setExpertDialogOpen(true)
  }

  const handleEnterExpertMode = async (expert: ExpertDefinition) => {
    if (!activeTabId) throw new Error('请先打开或创建一个聊天会话。')
    const expertMetadata = await useExpertStore.getState().enterExpertMode(activeTabId, expert.id)
    useSessionStore.setState((state) => ({
      sessions: state.sessions.map((session) => session.id === activeTabId
        ? { ...session, expert: expertMetadata, modifiedAt: new Date().toISOString() }
        : session),
    }))

    // 构造专家激活消息，发送给 Claude 开始对话式引导
    const skillContent = expert.skillContents
      ? Object.values(expert.skillContents).join('\n\n---\n\n')
      : ''
    const activationMsg = [
      `[系统指令] 你现在作为「${expert.name}」专家角色工作。`,
      expert.systemPromptContent ? `\n## 专家 System Prompt\n${expert.systemPromptContent}` : '',
      skillContent ? `\n## 专家技能指令\n${skillContent}` : '',
      `\n## 交互规则（必须遵守）`,
      `- 所有用户交互使用 AskUserQuestion tool，不要让用户在聊天框打字`,
      `- 需要项目路径时用 AskUserQuestion（type: 'path'），让用户选择文件夹`,
      `- 需要确认分析重点时用 AskUserQuestion，提供选项让用户选择`,
      `- 需要文件时用 AskUserQuestion（type: 'file'），让用户选择文件`,
      `- 永远不要让用户直接在聊天框输入回复`,
      `\n## 工作规则`,
      `- 材料足够后自动整理分析，流式输出结果`,
      `- 使用 ExpertMaterialWriter tool 保存材料包`,
      `- 不使用 ExpertIntakeForm tool`,
      `\n请现在开始：用 AskUserQuestion tool 向用户打招呼，询问需要什么帮助，并提供选项。`,
    ].filter(Boolean).join('\n')

    useChatStore.getState().sendMessage(activeTabId, activationMsg)
    useUIStore.getState().addToast({
      type: 'success',
      message: `已进入「${expert.name}」专家 Mode`,
    })
  }

  const showWorkflowSourceActiveToast = () => {
    if (messageCount === 0) return
    useUIStore.getState().addToast({
      type: 'warning',
      message: t('workflows.linkedStart.error.sourceActive'),
    })
  }

  const ensureWorkflowSourceIdle = async () => {
    if (!activeTabId) return false
    if (!isActive) return true
    if (!hasTerminalWorkflow) return false

    try {
      const status = await sessionsApi.getChatStatus(activeTabId)
      if (status.state !== 'idle') return false
      settleSessionIdle(activeTabId)
      return true
    } catch {
      return false
    }
  }

  const openWorkflowDialog = async () => {
    if (!canOpenWorkflowDialog || linkedWorkflowStarting) return
    const sourceIdle = await ensureWorkflowSourceIdle()
    if (!sourceIdle) {
      if (isActive) showWorkflowSourceActiveToast()
      return
    }
    setPlusMenuOpen(false)
    setSlashMenuOpen(false)
    setFileSearchOpen(false)
    setWorkflowDialogOpen(true)
    void refreshWorkflowTemplates()
  }

  const handleStartWorkflow = async (selection: WorkflowStartDialogSelection) => {
    if (!precheckWorkflowModelRequirements(selection)) return
    if (mustStartFreshWorkflow) {
      if (!activeTabId || linkedWorkflowStarting) return
      const sourceIdle = await ensureWorkflowSourceIdle()
      if (!sourceIdle) {
        if (isActive) showWorkflowSourceActiveToast()
        return
      }

      setLaunchTransitioning(true)
      try {
        const workflowWorkDir = selection.workspaceRoot || resolvedWorkDir || activeLaunchWorkDir
        const newSessionId = await useSessionStore.getState().createSession(workflowWorkDir || undefined, {
          workflow: {
            templateId: selection.templateId,
            templateSource: selection.templateSource,
            initialPhaseId: selection.initialPhaseId,
            request: selection.request || input,
            labels: selection.labels,
            effort: selection.effort,
            routingMode: selection.routingMode,
            brainstormingMode: selection.brainstormingMode,
            ...(selection.expertMaterialRefs?.length
              ? { repoMetadata: { expertMaterials: selection.expertMaterialRefs } }
              : {}),
          },
        })
        useTabStore.getState().openTab(newSessionId, 'New Session', 'session')
        useChatStore.getState().connectToSession(newSessionId)
        setWorkflowDialogOpen(false)
      } catch (error) {
        useUIStore.getState().addToast({
          type: 'error',
          message: error instanceof Error ? error.message : t('empty.failedToCreate'),
        })
      } finally {
        setLaunchTransitioning(false)
      }
      return
    }

    if (!showLaunchControls) {
      if (!activeTabId || !canOpenWorkflowDialog || messageCount === 0 || linkedWorkflowStarting) return
      const sourceIdle = await ensureWorkflowSourceIdle()
      if (!sourceIdle) {
        if (isActive) showWorkflowSourceActiveToast()
        return
      }
      setPendingLinkedWorkflowSelection(selection)
      setSummaryInstructions('')
      setLinkedWorkflowRecoveryError(null)
      setWorkflowDialogOpen(false)
      setWorkflowContextDialogOpen(true)
      return
    }

    if (launchTransitioning || !launchReady) return

    const shouldReplaceForRepositoryLaunch =
      !!activeLaunchWorkDir &&
      !!launchBranch &&
      (launchUseWorktree || (gitInfo?.branch ? launchBranch !== gitInfo.branch : true))
    const repository = shouldReplaceForRepositoryLaunch
      ? {
          branch: launchBranch,
          worktree: launchUseWorktree,
        }
      : undefined

    setLaunchTransitioning(true)
    try {
      const workflowWorkDir = selection.workspaceRoot || activeLaunchWorkDir
      await replaceEmptySession(workflowWorkDir, {
        ...(repository ? { repository } : {}),
        workflow: {
          templateId: selection.templateId,
          templateSource: selection.templateSource,
          initialPhaseId: selection.initialPhaseId,
          request: selection.request || input,
          labels: selection.labels,
          effort: selection.effort,
          routingMode: selection.routingMode,
          brainstormingMode: selection.brainstormingMode,
          ...(selection.expertMaterialRefs?.length
            ? { repoMetadata: { expertMaterials: selection.expertMaterialRefs } }
            : {}),
        },
      })
      setWorkflowDialogOpen(false)
    } catch (error) {
      useUIStore.getState().addToast({
        type: 'error',
        message: error instanceof Error ? error.message : t('empty.failedToCreate'),
      })
    } finally {
      setLaunchTransitioning(false)
    }
  }

  const handlePreviewLinkedWorkflowSummary = async () => {
    if (!activeTabId || !pendingLinkedWorkflowSelection || linkedWorkflowStarting || summaryPreviewing) return
    const sourceIdle = await ensureWorkflowSourceIdle()
    if (!sourceIdle) {
      if (isActive) showWorkflowSourceActiveToast()
      return
    }

    setSummaryPreviewing(true)
    try {
      const response = await sessionsApi.previewLinkedWorkflowContext(activeTabId, {
        ...(summaryInstructions.trim() ? { summaryInstructions: summaryInstructions.trim() } : {}),
      })
      setSummaryPreview(response.content)
    } catch (error) {
      useUIStore.getState().addToast({
        type: 'error',
        message: getLinkedWorkflowStartErrorMessage(error, t),
      })
    } finally {
      setSummaryPreviewing(false)
    }
  }

  const handleStartLinkedWorkflow = async (
    contextStrategy: LinkedWorkflowContextStrategy,
    summaryContent?: string,
  ) => {
    if (!activeTabId || !pendingLinkedWorkflowSelection || linkedWorkflowStarting) return
    if (!precheckWorkflowModelRequirements(pendingLinkedWorkflowSelection)) return
    const sourceIdle = await ensureWorkflowSourceIdle()
    if (!sourceIdle) {
      if (isActive) showWorkflowSourceActiveToast()
      return
    }

    setLinkedWorkflowStarting(true)
    setLinkedWorkflowRecoveryError(null)
    try {
      const response = await sessionsApi.startLinkedWorkflowSession(activeTabId, {
        workflow: {
          templateId: pendingLinkedWorkflowSelection.templateId,
          templateSource: pendingLinkedWorkflowSelection.templateSource,
          initialPhaseId: pendingLinkedWorkflowSelection.initialPhaseId,
          request: pendingLinkedWorkflowSelection.request || input,
          labels: pendingLinkedWorkflowSelection.labels,
          effort: pendingLinkedWorkflowSelection.effort,
          routingMode: pendingLinkedWorkflowSelection.routingMode,
          brainstormingMode: pendingLinkedWorkflowSelection.brainstormingMode,
          ...(pendingLinkedWorkflowSelection.expertMaterialRefs?.length
            ? { repoMetadata: { expertMaterials: pendingLinkedWorkflowSelection.expertMaterialRefs } }
            : {}),
        },
        contextStrategy,
        ...(contextStrategy === 'summarize' && summaryInstructions.trim()
          ? { summaryInstructions: summaryInstructions.trim() }
          : {}),
        ...(contextStrategy === 'summarize' && summaryContent
          ? { summaryContent }
          : {}),
        clientRequestId: `desktop-linked-workflow-${activeTabId}-${Date.now()}`,
      })

      const now = new Date().toISOString()
      useSessionStore.setState((state) => {
        const existing = state.sessions.find((session) => session.id === response.sessionId)
        const nextSession = {
          id: response.sessionId,
          title: existing?.title ?? 'New Session',
          createdAt: existing?.createdAt ?? now,
          modifiedAt: now,
          messageCount: existing?.messageCount ?? 0,
          projectPath: existing?.projectPath ?? '',
          workDir: response.workDir ?? existing?.workDir ?? activeSession?.workDir ?? null,
          projectRoot: response.workDir ?? existing?.projectRoot ?? activeSession?.projectRoot ?? null,
          workDirExists: existing?.workDirExists ?? true,
          workflow: response.workflow,
        }
        return {
          sessions: [
            nextSession,
            ...state.sessions.filter((session) => session.id !== response.sessionId),
          ],
          activeSessionId: response.sessionId,
        }
      })
      const openedSeparateSession = response.sessionId !== activeTabId
      if (openedSeparateSession) {
        useTabStore.getState().openTab(response.sessionId, 'New Session', 'session')
        useChatStore.getState().connectToSession(response.sessionId)
      }
      if (openedSeparateSession && contextStrategy === 'summarize' && summaryContent) {
        useChatStore.getState().sendMessage(
          response.sessionId,
          [
            '[Workflow context summary]',
            summaryContent,
            'Use this source-chat summary as context and begin the selected workflow.',
          ].join('\n\n'),
        )
      }
      setWorkflowContextDialogOpen(false)
      setPendingLinkedWorkflowSelection(null)
      setSummaryInstructions('')
      setSummaryPreview(null)
    } catch (error) {
      if (getLinkedWorkflowStartErrorCode(error) === 'WORKFLOW_CONTEXT_TOO_LARGE') {
        setLinkedWorkflowRecoveryError('context-too-large')
      }
      useUIStore.getState().addToast({
        type: 'error',
        message: getLinkedWorkflowStartErrorMessage(error, t),
      })
    } finally {
      setLinkedWorkflowStarting(false)
    }
  }

  const composerPlaceholder =
    isHeroComposer
      ? t('empty.placeholder')
      : isDisconnectedMemberSession
        ? t('teams.memberSessionDisconnectedPlaceholder')
        : isWorkspaceMissing
          ? t('chat.placeholderMissing')
          : isMemberSession
            ? t('teams.memberPlaceholder')
            : t('chat.placeholder')

  const addFilesLabel = isHeroComposer ? t('empty.addFiles') : t('chat.addFiles')
  const slashCommandsLabel = isHeroComposer ? t('empty.slashCommands') : t('chat.slashCommands')

  return (
    <div
      data-testid="chat-input-shell"
      className={
        isHeroComposer
          ? `bg-[var(--color-surface)] ${isMobileComposer ? 'px-4 pb-3' : 'px-8 pb-4'}`
          : compact
            ? `border-t border-[var(--color-border)]/70 bg-[var(--color-surface)] ${isMobileComposer ? 'px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2' : 'px-3 py-3'}`
            : `bg-[var(--color-surface)] ${isMobileComposer ? 'px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2' : 'px-4 py-4'}`
      }
    >
      <ExpertSelectionDialog
        open={expertDialogOpen}
        onClose={() => setExpertDialogOpen(false)}
        projectRoot={activeLaunchWorkDir || resolvedWorkDir || ''}
        sessionId={activeTabId}
        onEnterExpert={handleEnterExpertMode}
      />
      <WorkflowStartDialog
        open={workflowDialogOpen}
        templates={workflowTemplates}
        invalidTemplates={invalidWorkflowTemplates}
        templatesLoading={workflowTemplatesLoading}
        templatesLoadFailed={workflowTemplatesLoadFailed}
        onRetryTemplates={() => void refreshWorkflowTemplates()}
        selectedTemplateId={selectedWorkflowTemplate?.templateId ?? null}
        selectedTemplateSource={selectedWorkflowTemplate?.templateSource ?? null}
        onSelect={setSelectedWorkflowTemplate}
        onStart={handleStartWorkflow}
        onClose={() => setWorkflowDialogOpen(false)}
        starting={launchTransitioning || linkedWorkflowStarting}
        requestText={input}
        workspaceRoot={showLaunchControls ? activeLaunchWorkDir : (resolvedWorkDir || '')}
        onWorkspaceRootChange={showLaunchControls ? handleWorkflowWorkspaceChange : undefined}
        expertMaterialRefs={activeSession?.expert?.materialRefs ?? []}
      />
      <WorkflowContextStrategyDialog
        open={workflowContextDialogOpen}
        starting={linkedWorkflowStarting}
        summaryInstructions={summaryInstructions}
        summaryPreview={summaryPreview}
        summaryPreviewing={summaryPreviewing}
        recoveryError={linkedWorkflowRecoveryError}
        onSummaryInstructionsChange={(value) => {
          setSummaryInstructions(value)
          setSummaryPreview(null)
        }}
        onPreviewSummary={handlePreviewLinkedWorkflowSummary}
        onStart={handleStartLinkedWorkflow}
        onOpenSummary={(content) => handleStartLinkedWorkflow('summarize', content)}
        onBack={() => {
          if (linkedWorkflowStarting) return
          setWorkflowContextDialogOpen(false)
          setLinkedWorkflowRecoveryError(null)
          setWorkflowDialogOpen(true)
        }}
        onClose={() => {
          if (linkedWorkflowStarting) return
          setWorkflowContextDialogOpen(false)
          setPendingLinkedWorkflowSelection(null)
          setSummaryInstructions('')
          setLinkedWorkflowRecoveryError(null)
        }}
      />
      <div
        className={
          isHeroComposer
            ? 'mx-auto flex w-full max-w-3xl flex-col'
          : compact
              ? 'mx-auto max-w-full'
              : `${isMobileComposer ? 'mx-0 max-w-none' : 'mx-auto max-w-[860px]'}`
        }
      >
        <div
          ref={panelRef}
          data-testid="chat-input-panel"
          className={isHeroComposer
            ? `glass-panel relative flex flex-col gap-3 overflow-visible ${embedLaunchControlsInHero ? 'rounded-xl' : 'rounded-t-xl rounded-b-none'} p-4 transition-colors ${isDragActive ? 'composer-drop-target-active' : ''}`
            : compact
              ? `glass-panel relative overflow-visible p-3 transition-colors ${isMobileComposer ? 'rounded-2xl shadow-[0_-12px_36px_rgba(54,35,28,0.12)]' : 'rounded-xl'} ${isDragActive ? 'composer-drop-target-active' : ''}`
              : `glass-panel relative overflow-visible transition-colors ${isMobileComposer ? 'rounded-2xl p-3 shadow-[0_-12px_36px_rgba(54,35,28,0.12)]' : 'rounded-xl p-4'} ${isDragActive ? 'composer-drop-target-active' : ''}`}
          {...dragHandlers}
        >
          {isDragActive && (
            <ComposerDropOverlay
              testId="chat-input-drop-overlay"
              title={t('chat.dropFilesTitle')}
              description={t('chat.dropFilesHint')}
            />
          )}

          {!isMemberSession && fileSearchOpen && (
            <FileSearchMenu
              ref={fileSearchRef}
              cwd={activeLaunchWorkDir || resolvedWorkDir || ''}
              filter={atFilter}
              compact={isMobileComposer}
              onNavigate={(relativePath) => {
                if (atCursorPos < 0) return
                const replacement = `@${relativePath}`
                const tokenEnd = atCursorPos + 1 + atFilter.length
                const newValue = `${input.slice(0, atCursorPos)}${replacement}${input.slice(tokenEnd)}`
                const newCursorPos = atCursorPos + replacement.length
                setComposerInput(newValue)
                setAtFilter(relativePath)
                requestAnimationFrame(() => {
                  textareaRef.current?.focus()
                  textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos)
                })
              }}
              onSelect={(path, name, isDirectory) => {
                if (atCursorPos >= 0) {
                  const referenceName = name.split('/').filter(Boolean).pop() ?? name
                  const tokenEnd = atCursorPos + 1 + atFilter.length
                  const beforeToken = input.slice(0, atCursorPos)
                  const afterToken = beforeToken ? input.slice(tokenEnd) : input.slice(tokenEnd).replace(/^\s+/, '')
                  const spacer = beforeToken && afterToken && !/\s$/.test(beforeToken) && !/^\s/.test(afterToken) ? ' ' : ''
                  const newValue = `${beforeToken}${spacer}${afterToken}`
                  const newCursorPos = atCursorPos + spacer.length
                  if (activeTabId) {
                    addWorkspaceReference(activeTabId, {
                      kind: 'file',
                      path,
                      absolutePath: path,
                      name: isDirectory ? `${referenceName}/` : referenceName,
                      isDirectory,
                    })
                  }
                  setComposerInput(newValue)
                  setFileSearchOpen(false)
                  setAtFilter('')
                  setAtCursorPos(-1)
                  void textareaRef.current?.focus()
                  requestAnimationFrame(() => {
                    textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos)
                  })
                }
              }}
            />
          )}

          {!isMemberSession && localSlashPanel && (
            <div ref={slashMenuRef}>
              <LocalSlashCommandPanel
                command={localSlashPanel}
                sessionId={activeTabId ?? undefined}
                cwd={activeLaunchWorkDir || resolvedWorkDir}
                commands={allSlashCommands}
                onClose={() => setLocalSlashPanel(null)}
              />
            </div>
          )}

          {!isMemberSession && slashMenuOpen && filteredCommands.length > 0 && (
            <div
              ref={slashMenuRef}
              className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] shadow-[var(--shadow-dropdown)]"
            >
              <div className="max-h-[300px] overflow-y-auto py-1">
                {filteredCommands.map((command, index) => (
                  <button
                    key={command.name}
                    ref={(el) => { slashItemRefs.current[index] = el }}
                    onClick={() => selectSlashCommand(command.name)}
                    onMouseEnter={() => setSlashSelectedIndex(index)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      index === slashSelectedIndex
                        ? 'bg-[var(--color-surface-hover)]'
                        : 'hover:bg-[var(--color-surface-hover)]'
                    }`}
                  >
                    <span className="flex min-w-0 max-w-[52%] shrink-0 items-baseline gap-1.5">
                      <span className="shrink-0 text-sm font-semibold text-[var(--color-text-primary)]">
                        /{command.name}
                      </span>
                      {command.argumentHint ? (
                        <span className="min-w-0 truncate font-mono text-[11px] text-[var(--color-text-tertiary)]">
                          {command.argumentHint}
                        </span>
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-text-tertiary)]">
                      {command.description}
                    </span>
                  </button>
                ))}
              </div>
              {!isMobileComposer ? (
                <div className="flex items-center gap-1.5 border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-text-tertiary)]">
                  <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-1.5 py-0.5 font-mono text-[10px]">Up/Down</kbd>
                  <span>{t('chat.navigate')}</span>
                  <kbd className="ml-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
                  <span>{t('chat.select')}</span>
                  <kbd className="ml-2 rounded border border-[var(--color-border)] bg-[var(--color-surface-container-low)] px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd>
                  <span>{t('chat.dismiss')}</span>
                </div>
              ) : null}
            </div>
          )}

          {composerAttachments.length > 0 && (
            isHeroComposer ? (
              <AttachmentGallery attachments={composerAttachments} variant="composer" onRemove={removeAttachment} />
            ) : (
              <div className="px-3 pt-3">
                <AttachmentGallery attachments={composerAttachments} variant="composer" onRemove={removeAttachment} />
              </div>
            )
          )}

          {!isMemberSession && queuedMessages.length > 0 && (
            <div
              data-testid="queued-composer-messages"
              className={`max-h-32 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)]/70 ${
                isHeroComposer ? '' : 'mb-2'
              }`}
            >
              {queuedMessages.map((message) => {
                const preview =
                  message.content.trim() ||
                  message.attachments?.map((attachment) => attachment.name).filter(Boolean).join(', ') ||
                  'Queued message'

                return (
                  <div
                    key={message.id}
                    className="flex min-h-9 items-center gap-2 border-b border-[var(--color-border-separator)] px-3 py-1.5 last:border-b-0"
                  >
                    <span
                      className="material-symbols-outlined shrink-0 text-[15px] text-[var(--color-text-tertiary)]"
                      aria-hidden="true"
                    >
                      subdirectory_arrow_right
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-text-secondary)]">
                      {preview}
                    </span>
                    <button
                      type="button"
                      aria-label={t('chat.queue.guideLabel')}
                      onClick={() => {
                        if (activeTabId) guideQueuedMessage(activeTabId, message.id)
                      }}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[7px] px-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
                    >
                      <span className="material-symbols-outlined text-[14px]" aria-hidden="true">quick_reference_all</span>
                      {t('chat.queue.guide')}
                    </button>
                    <button
                      type="button"
                      aria-label={t('chat.queue.deleteLabel')}
                      onClick={() => {
                        if (activeTabId) deleteQueuedMessage(activeTabId, message.id)
                      }}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[7px] px-2 text-xs font-medium text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
                    >
                      <span className="material-symbols-outlined text-[14px]" aria-hidden="true">delete</span>
                      {t('chat.queue.delete')}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {isHeroComposer ? (
            <div className="flex items-start gap-3">
              <div data-testid="chat-input-editor" className="relative flex-1">
                {activeSlashInvocation && (
                  <ComposerInlineSkillInvocation
                    ref={composerOverlayRef}
                    invocation={activeSlashInvocation}
                    className="py-2 leading-relaxed"
                  />
                )}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onScroll={syncComposerOverlayScroll}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={() => { composingRef.current = true }}
                  onCompositionEnd={() => { composingRef.current = false }}
                  onPaste={handlePaste}
                  placeholder={composerPlaceholder}
                  disabled={isWorkspaceMissing || isDisconnectedMemberSession}
                  rows={2}
                  className={`relative z-10 w-full resize-none border-none bg-transparent py-2 leading-relaxed outline-none placeholder:text-[var(--color-text-tertiary)] disabled:opacity-50 ${
                    activeSlashInvocation
                      ? 'text-transparent caret-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-primary)]'
                  }`}
                />
              </div>
            </div>
          ) : (
            <div data-testid="chat-input-editor" className="relative">
              {activeSlashInvocation && (
                <ComposerInlineSkillInvocation
                  ref={composerOverlayRef}
                  invocation={activeSlashInvocation}
                  className={`text-sm leading-relaxed ${
                    isMobileComposer ? 'py-1.5' : useCompactControls ? 'py-1.5' : 'py-2'
                  }`}
                />
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onScroll={syncComposerOverlayScroll}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={() => { composingRef.current = false }}
                onPaste={handlePaste}
                placeholder={composerPlaceholder}
                disabled={isWorkspaceMissing || isDisconnectedMemberSession}
                rows={1}
                className={`relative z-10 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-[var(--color-text-tertiary)] disabled:opacity-50 ${
                  activeSlashInvocation
                    ? 'text-transparent caret-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-primary)]'
                } ${
                  isMobileComposer ? 'mb-16 py-1.5' : useCompactControls ? 'mb-14 py-1.5' : 'mb-14 py-2'
                }`}
              />
            </div>
          )}

          <div className={isHeroComposer
            ? 'flex items-center justify-between border-t border-[var(--color-border-separator)] pt-3'
            : `absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-[var(--color-border-separator)] ${
              useCompactControls ? 'gap-2 px-2.5 py-2' : 'px-3 py-3'
            }`}>
            <div className="flex min-w-0 items-center gap-2">
              {!isMemberSession && (
                <>
                  <div ref={plusMenuRef} className="relative">
                    <button
                      onClick={() => setPlusMenuOpen((value) => !value)}
                      aria-label="Open composer tools"
                      className={`text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] ${isMobileComposer ? 'inline-flex h-11 w-11 items-center justify-center rounded-xl' : 'rounded-[var(--radius-md)] p-1.5'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                    </button>

                    {plusMenuOpen && (
                      <div className={`absolute bottom-full left-0 z-50 mb-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] py-1 shadow-[var(--shadow-dropdown)] ${isMobileComposer ? 'w-[min(240px,calc(100vw-32px))]' : 'w-[240px]'}`}>
                        <button
                          onClick={openAttachmentPicker}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-hover)]"
                        >
                          <span className="material-symbols-outlined text-[18px] text-[var(--color-text-secondary)]">attach_file</span>
                          <span className="text-sm text-[var(--color-text-primary)]">{addFilesLabel}</span>
                        </button>
                        <button
                          onClick={insertSlashCommand}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-hover)]"
                        >
                          <span className="w-[24px] text-center text-[18px] font-bold text-[var(--color-text-secondary)]">/</span>
                          <span className="text-sm text-[var(--color-text-primary)]">{slashCommandsLabel}</span>
                        </button>
                        <button
                          onClick={openExpertDialog}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-hover)]"
                        >
                          <span className="material-symbols-outlined text-[18px] text-[var(--color-text-secondary)]">support_agent</span>
                          <span className="text-sm text-[var(--color-text-primary)]">专家</span>
                        </button>
                        {canOpenWorkflowDialog ? (
                          <button
                            onClick={openWorkflowDialog}
                            disabled={!canAttemptWorkflowDialog || linkedWorkflowStarting}
                            title={isActive && !hasTerminalWorkflow && messageCount > 0 ? t('workflows.linkedStart.error.sourceActive') : undefined}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-hover)]"
                          >
                            <span className="material-symbols-outlined text-[18px] text-[var(--color-text-secondary)]">account_tree</span>
                            <span className="text-sm text-[var(--color-text-primary)]">{t('settings.workflows.title')}</span>
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <PermissionModeSelector compact={useCompactControls} />

                </>
              )}
            </div>

            <div className="flex min-w-0 items-center gap-2">
              {!isMemberSession && activeTabId && (
                <ContextUsageIndicator
                  sessionId={activeTabId}
                  chatState={chatState}
                  messageCount={messageCount}
                  runtimeSelectionKey={runtimeSelectionKey}
                  fallbackModelLabel={runtimeModelLabel}
                  compact={useCompactControls}
                />
              )}
              {!isMemberSession && activeTabId && (
                <ModelSelector runtimeKey={activeTabId} disabled={isActive} compact={useCompactControls} />
              )}
              <button
                onClick={showStopAction ? () => stopGeneration(activeTabId!) : handleSubmit}
                disabled={showStopAction ? false : !canSubmit}
                aria-label={showStopAction ? t('common.stop') : isMemberSession ? t('common.send') : t('common.run')}
                title={
                  showStopAction
                    ? t('chat.stopTitle')
                    : iconOnlyAction
                      ? isMemberSession
                        ? t('common.send')
                        : t('common.run')
                      : undefined
                }
                className={`relative flex shrink-0 items-center justify-center gap-1 rounded-lg text-xs font-semibold transition-all hover:brightness-105 disabled:opacity-30 ${
                  iconOnlyAction ? `${isMobileComposer ? 'h-11 w-11 rounded-xl px-0 py-0' : 'h-8 w-8 px-0 py-0'}` : 'w-[112px] px-3 py-1.5'
                } ${
                  showStopAction
                    ? 'chat-input-stop-running bg-[var(--color-error-container)] text-[var(--color-on-error-container)]'
                    : 'bg-[image:var(--gradient-btn-primary)] text-[var(--color-btn-primary-fg)] shadow-[var(--shadow-button-primary)]'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {showStopAction ? 'stop' : 'arrow_forward'}
                </span>
                {!iconOnlyAction && (showStopAction ? t('common.stop') : isMemberSession ? t('common.send') : t('common.run'))}
              </button>
            </div>
          </div>

          {embedLaunchControlsInHero && (
            <div className="-mx-4 -mb-4 mt-3">
              <RepositoryLaunchControls
                workDir={activeLaunchWorkDir}
                onWorkDirChange={handleLaunchWorkDirChange}
                branch={launchBranch}
                onBranchChange={setLaunchBranch}
                useWorktree={launchUseWorktree}
                onUseWorktreeChange={setLaunchUseWorktree}
                onLaunchReadyChange={setLaunchReady}
                disabled={isActive || launchTransitioning}
                placement="composer"
              />
            </div>
          )}
        </div>

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />

        {!isMemberSession && !embedLaunchControlsInHero && (
          <div className={useCompactControls ? 'mt-2 flex min-w-0 px-1' : 'mt-3 px-1'}>
            {messageCount > 0 ? (
              <ProjectContextChip
                workDir={resolvedWorkDir}
                repoName={gitInfo?.repoName || null}
                branch={gitInfo?.branch || null}
                sourceWorkDir={gitInfo?.worktree?.sourceWorkDir || null}
                isWorktree={!!gitInfo?.worktree?.enabled}
                worktreeSlug={gitInfo?.worktree?.slug || null}
                worktreePath={gitInfo?.worktree?.path || gitInfo?.worktree?.plannedPath || null}
                compact={useCompactControls}
              />
            ) : (
              <RepositoryLaunchControls
                workDir={activeLaunchWorkDir}
                onWorkDirChange={handleLaunchWorkDirChange}
                branch={launchBranch}
                onBranchChange={setLaunchBranch}
                useWorktree={launchUseWorktree}
                onUseWorktreeChange={setLaunchUseWorktree}
                onLaunchReadyChange={setLaunchReady}
                disabled={isActive || launchTransitioning}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function WorkflowContextStrategyDialog({
  open,
  starting,
  summaryInstructions,
  summaryPreview,
  summaryPreviewing,
  recoveryError,
  onSummaryInstructionsChange,
  onPreviewSummary,
  onStart,
  onOpenSummary,
  onBack,
  onClose,
}: {
  open: boolean
  starting: boolean
  summaryInstructions: string
  summaryPreview: string | null
  summaryPreviewing: boolean
  recoveryError: 'context-too-large' | null
  onSummaryInstructionsChange: (value: string) => void
  onPreviewSummary: () => void
  onStart: (strategy: LinkedWorkflowContextStrategy) => void
  onOpenSummary: (content: string) => void
  onBack: () => void
  onClose: () => void
}) {
  const t = useTranslation()
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    dialogRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div
      className="workflow-content-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/35 py-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !starting) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-context-strategy-title"
        aria-describedby="workflow-context-strategy-description"
        tabIndex={-1}
        data-testid="workflow-context-strategy-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !starting) onClose()
        }}
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl focus-visible:outline-none"
      >
        <header className="flex min-w-0 items-start justify-between gap-4 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0">
            <h2
              id="workflow-context-strategy-title"
              className="text-base font-semibold text-[var(--color-text-primary)]"
            >
              {t('workflows.linkedStart.title')}
            </h2>
            <p
              id="workflow-context-strategy-description"
              className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]"
            >
              {t('workflows.linkedStart.description')}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('workflows.startDialog.close')}
            disabled={starting}
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
          </button>
        </header>

        <div className="space-y-3 p-4">
          <ContextStrategyButton
            icon="backspace"
            title={t('workflows.linkedStart.clear.title')}
            description={t('workflows.linkedStart.clear.description')}
            disabled={starting}
            onClick={() => onStart('clear')}
          />
          <ContextStrategyButton
            icon="content_copy"
            title={t('workflows.linkedStart.inherit.title')}
            description={t('workflows.linkedStart.inherit.description')}
            disabled={starting}
            onClick={() => onStart('inherit')}
          />
          <div className={`rounded-[8px] border bg-[var(--color-surface-container-lowest)] p-3 ${
            recoveryError === 'context-too-large'
              ? 'border-[var(--color-warning)]/35'
              : 'border-[var(--color-border)]'
          }`}
          >
            {recoveryError === 'context-too-large' && (
              <div
                role="alert"
                className="mb-3 flex items-start gap-2 rounded-[7px] border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/8 px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]"
              >
                <span className="material-symbols-outlined mt-0.5 text-[15px] text-[var(--color-warning)]" aria-hidden="true">warning</span>
                <span>{t('workflows.linkedStart.error.contextTooLarge')}</span>
              </div>
            )}
            <ContextStrategyButton
              icon="summarize"
              title={t('workflows.linkedStart.summarize.title')}
              description={t('workflows.linkedStart.summarize.description')}
              disabled={starting || summaryPreviewing}
              onClick={onPreviewSummary}
              embedded
            />
            <label className="mt-3 block text-xs font-medium text-[var(--color-text-secondary)]">
              {t('workflows.linkedStart.summaryInstructions')}
              <textarea
                value={summaryInstructions}
                onChange={(event) => onSummaryInstructionsChange(event.target.value)}
                disabled={starting || summaryPreviewing}
                rows={3}
                placeholder={t('workflows.linkedStart.summaryInstructionsPlaceholder')}
                className="mt-1 w-full resize-none rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-5 text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-brand)] disabled:opacity-60"
              />
            </label>
            {summaryPreviewing && (
              <p className="mt-3 text-xs text-[var(--color-text-secondary)]" role="status">
                {t('workflows.linkedStart.summaryGenerating')}
              </p>
            )}
            {summaryPreview && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
                  {t('workflows.linkedStart.summaryPreview')}
                  <textarea
                    aria-label={t('workflows.linkedStart.summaryPreview')}
                    readOnly
                    value={summaryPreview}
                    rows={8}
                    className="mt-1 w-full resize-y rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-5 text-[var(--color-text-primary)] outline-none"
                  />
                </label>
                <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
                  {t('workflows.linkedStart.summaryPreviewHint')}
                </p>
                <button
                  type="button"
                  disabled={starting}
                  onClick={() => onOpenSummary(summaryPreview)}
                  className="inline-flex h-9 items-center justify-center rounded-[7px] bg-[var(--color-brand)] px-3 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {t('workflows.linkedStart.openSummarySession')}
                </button>
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <button
            type="button"
            disabled={starting}
            onClick={onBack}
            className="inline-flex h-9 items-center gap-1.5 rounded-[7px] border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span className="material-symbols-outlined text-[17px]" aria-hidden="true">arrow_back</span>
            {t('workflows.linkedStart.back')}
          </button>
          <span className="text-xs text-[var(--color-text-tertiary)]" aria-live="polite">
            {starting ? t('workflows.startDialog.starting') : t('workflows.linkedStart.footerHint')}
          </span>
        </footer>
      </div>
    </div>
  )
}

function ContextStrategyButton({
  icon,
  title,
  description,
  disabled,
  embedded = false,
  onClick,
}: {
  icon: string
  title: string
  description: string
  disabled: boolean
  embedded?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-[8px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/35 disabled:cursor-not-allowed disabled:opacity-55 ${
        embedded
          ? 'p-0 hover:bg-transparent'
          : 'border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] p-3 hover:bg-[var(--color-surface-hover)]'
      }`}
    >
      <span className="material-symbols-outlined mt-0.5 text-[18px] text-[var(--color-text-secondary)]" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--color-text-primary)]">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-[var(--color-text-secondary)]">{description}</span>
      </span>
    </button>
  )
}

function getLinkedWorkflowStartErrorCode(error: unknown): LinkedWorkflowSessionStartErrorCode | null {
  if (error instanceof ApiError) {
    const body = error.body
    return body && typeof body === 'object'
      ? ('code' in body && typeof body.code === 'string'
          ? body.code as LinkedWorkflowSessionStartErrorCode
          : 'error' in body && typeof body.error === 'string'
            ? body.error as LinkedWorkflowSessionStartErrorCode
            : null)
      : null
  }

  return null
}

function getLinkedWorkflowStartErrorMessage(error: unknown, t: ReturnType<typeof useTranslation>) {
  if (error instanceof ApiError) {
    const code = getLinkedWorkflowStartErrorCode(error)

    if (code === 'WORKFLOW_SOURCE_ACTIVE') return t('workflows.linkedStart.error.sourceActive')
    if (code === 'WORKFLOW_CONTEXT_TOO_LARGE') return t('workflows.linkedStart.error.contextTooLarge')
    if (code === 'WORKFLOW_CONTEXT_SUMMARY_UNAVAILABLE') return t('workflows.linkedStart.error.summaryUnavailable')
    if (error.message) return t('workflows.linkedStart.error.withDetail', { detail: error.message })
  }

  if (error instanceof Error && error.message) {
    return t('workflows.linkedStart.error.withDetail', { detail: error.message })
  }

  return t('workflows.linkedStart.error.generic')
}
