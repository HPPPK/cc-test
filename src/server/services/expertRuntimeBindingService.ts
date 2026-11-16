import { parseResearchSourceLibrary } from './expertResearchSourceLibraryService.js'
import { renderResearchSourceSelectionCatalog } from './expertResearchSourceSelection.js'
import { resolveResearchQualityCheckpointPolicy } from './expertResearchQualityCheckpoint.js'
import { createHash } from 'node:crypto'
import { getToolsForDefaultPreset } from '../../tools.js'
import { deriveExpertTemplateFillSchema } from '../../utils/expertTemplateFill.js'
import { isUiuxImageOnlyBinding, UIUX_IMAGE_ONLY_TOOLS, UIUX_IMAGE_ONLY_RUNTIME_INSTRUCTION } from './uiuxImageDeliveryPolicyService.js'
import { UIUX_IMAGE_PACK_VERSION } from '../../services/tools/uiuxImageContract.js'
import type { ExpertRuntimeContext } from './expertRuntimeService.js'
import { resolveExpertResearchDeliveryPolicy } from './expertResearchDeliveryService.js'
import { resolveExpertResearchBrowserPolicy } from './expertResearchBrowserPolicyService.js'
import { resolveExpertResearchCompletionPolicy } from './expertResearchCompletionService.js'
import { resolveExpertResearchEvidenceReviewPolicy } from './expertResearchEvidenceReviewService.js'
import { buildExpertPostReviewEvidenceAbsorptionInstruction, resolveExpertResearchEvidenceAbsorptionPolicy } from './expertResearchEvidenceAbsorptionService.js'
import { resolveExpertTemplateFillOutputPolicy } from './expertTemplateOutputPolicyService.js'
import { resolveExpertResearchArtifactPolicy } from './expertResearchArtifactPolicyService.js'
import type { ExpertHostTool, ExpertRuntimeBinding, ExpertSessionMetadata, ExpertToolManifest } from './expertPackRegistryService.js'

const MAX_OUTPUT_TEMPLATE_CHARACTERS = 12_000
const MAX_STRICT_VISUAL_RUNTIME_SKILL_CHARACTERS = 40_000
const MAX_STRICT_VISUAL_RUNTIME_SKILL_CHARACTERS_PER_SKILL = 2_400

// Ordinary Experts inherit the Desktop host tool pool. A ZIP that declares the
// prototype visual workflow is different: its allowedToolNames are a real
// session-start boundary, so a global Skill such as brainstorming cannot replace
// confirmed prototype delivery with a second planning workflow.

export class ExpertRuntimeBindingError extends Error {
  readonly code = 'EXPERT_RUNTIME_BINDING_MISSING'

  constructor(message = 'Expert Mode is active but its server runtime binding is missing. Exit and re-enter this expert before sending a message.') {
    super(message)
    this.name = 'ExpertRuntimeBindingError'
  }
}

export type ExpertRuntimeTurnOptions = {
  enabledToolNames?: Iterable<string>
  modelId?: string
}

type ExpertRuntimeToolAvailability = {
  hostTools: ExpertHostTool[]
  toolNames: string[]
}

function bounded(value: string | undefined, limit: number): string {
  const normalized = value?.trim() ?? ''
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 32)).trimEnd()}\n[truncated by expert runtime]`
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

// BrowserResearch was the pre-migration name of the desktop-managed public-web
// browser. Retain this one-way alias so previously installed Expert ZIPs keep
// their browser capability while their manifests are upgraded to Playwright.
const LEGACY_EXPERT_TOOL_ALIASES: Readonly<Record<string, string>> = {
  BrowserResearch: 'Playwright',
}

function resolveExpertRuntimeToolName(toolName: string): string {
  return LEGACY_EXPERT_TOOL_ALIASES[toolName] ?? toolName
}

function adaptLegacyExpertToolReferences(content: string): string {
  return content.replace(/\bBrowserResearch\b/g, 'Playwright').replace(/cc-jiangxia expert-template-fill/g, 'claude expert-template-fill')
}

function isStrictVisualWorkflow(binding: ExpertRuntimeBinding): boolean {
  return binding.runtimePolicy?.mode === 'strict-visual-workflow'
}

function isPrototypeVisualWorkflow(binding: ExpertRuntimeBinding): binding is ExpertRuntimeBinding & { runtimePolicy: NonNullable<ExpertRuntimeBinding['runtimePolicy']> } {
  return binding.runtimePolicy?.mode === 'prototype-visual-workflow'
}

function usesPackageLocalSkillsOnly(binding: ExpertRuntimeBinding): boolean {
  return binding.runtimePolicy?.mode === 'package-local-skills'
    || isStrictVisualWorkflow(binding)
    || isPrototypeVisualWorkflow(binding)
}

function resolveBindingToolNames(
  binding: ExpertRuntimeBinding,
  enabledToolNames: Iterable<string>,
): string[] {
  const enabled = unique([...enabledToolNames])
  if (isUiuxImageOnlyBinding(binding)) return enabled.filter(name => UIUX_IMAGE_ONLY_TOOLS.some(allowed => allowed === name))
  if (!isPrototypeVisualWorkflow(binding)) return enabled

  const allowed = new Set(
    (binding.runtimePolicy?.allowedToolNames ?? []).map(resolveExpertRuntimeToolName),
  )
  return enabled.filter((toolName) => allowed.has(resolveExpertRuntimeToolName(toolName)))
}

function isDeclaredHostToolAvailable(
  tool: ExpertToolManifest,
  hostToolsById: Map<string, ExpertHostTool>,
  enabledToolNames: Set<string>,
): boolean {
  if (tool.type !== 'hostBuiltinRef' || !tool.hostToolId || !enabledToolNames.has(tool.hostToolId)) return false
  return hostToolsById.get(tool.hostToolId)?.supported !== false
}

export function resolveCurrentExpertRuntimeToolNames(
  _modelId?: string,
  baseToolNames: Iterable<string> = getToolsForDefaultPreset(),
): string[] {
  return unique([...baseToolNames])
}

export function resolveExpertRuntimeToolAvailability(
  binding: ExpertRuntimeBinding,
  enabledToolNames: Iterable<string> = getToolsForDefaultPreset(),
): ExpertRuntimeToolAvailability {
  const toolNames = resolveBindingToolNames(binding, enabledToolNames)
  const enabled = new Set(toolNames)
  const hostTools = binding.hostTools
    .filter((tool) => tool.supported !== false && enabled.has(resolveExpertRuntimeToolName(tool.id)))
    .map((tool) => {
      const id = resolveExpertRuntimeToolName(tool.id)
      return id === tool.id
        ? tool
        : {
            ...tool,
            id,
            name: tool.name === 'BrowserResearch' ? 'Playwright' : tool.name,
          }
    })
  return {
    hostTools,
    toolNames,
  }
}


export type ExpertRuntimeToolPolicy = {
  allowedTools: string[]
  disallowedTools: string[]
}

/**
 * Ordinary Experts inherit the host pool. Image-only UIUX and the prototype
 * workflow enforce their declared subset at CLI launch as well as in prompts.
 */
export function resolveExpertRuntimeToolPolicy(
  expert: ExpertSessionMetadata | undefined,
  options: ExpertRuntimeTurnOptions = {},
): ExpertRuntimeToolPolicy {
  const declaredEnabledTools = [...(options.enabledToolNames ?? getToolsForDefaultPreset())]
  const allowedTools = hasActiveExpertRuntime(expert)
    ? resolveExpertRuntimeToolAvailability(expert.runtimeBinding, declaredEnabledTools).toolNames
    : resolveCurrentExpertRuntimeToolNames(options.modelId, declaredEnabledTools)
  return {
    allowedTools,
    disallowedTools: hasActiveExpertRuntime(expert) && (isUiuxImageOnlyBinding(expert.runtimeBinding) || isPrototypeVisualWorkflow(expert.runtimeBinding))
      ? declaredEnabledTools.filter(name => !allowedTools.includes(name))
      : [],
  }
}

function adaptSkillContentForRuntime(content: string): string {
  // Existing imported packs may still contain BrowserResearch. Keep its one-way
  // Playwright alias without rewriting other enabled search tools away.
  return adaptLegacyExpertToolReferences(content)
}

function renderRuntimeSkills(binding: ExpertRuntimeBinding): string {
  const orderedSkills = isStrictVisualWorkflow(binding)
    ? [...binding.skills].sort((left, right) => {
        const leftRequired = binding.runtimePolicy?.requiredSkillIds.includes(left.skillId) ? 0 : 1
        const rightRequired = binding.runtimePolicy?.requiredSkillIds.includes(right.skillId) ? 0 : 1
        return leftRequired - rightRequired
      })
    : binding.skills
  const sections: string[] = []
  const omittedSkillIds: string[] = []
  let totalCharacters = 0

  for (const skill of orderedSkills) {
    const header = [
      `## Skill: ${skill.title || skill.skillId}`,
      `Source: ${skill.path} (sha256:${skill.sha256})`,
    ].join('\n')
    const content = isStrictVisualWorkflow(binding)
      ? bounded(adaptSkillContentForRuntime(skill.content), MAX_STRICT_VISUAL_RUNTIME_SKILL_CHARACTERS_PER_SKILL)
      : adaptSkillContentForRuntime(skill.content)
    const catalog = binding.expertId === 'commercialization-research-report' && skill.skillId === 'research-source-library'
      ? renderResearchSourceSelectionCatalog(parseResearchSourceLibrary(skill.content)) : ''
    const section = [header, content, catalog].filter(Boolean).join('\n')

    if (
      isStrictVisualWorkflow(binding)
      && totalCharacters + section.length > MAX_STRICT_VISUAL_RUNTIME_SKILL_CHARACTERS
    ) {
      omittedSkillIds.push(skill.skillId)
      continue
    }

    sections.push(section)
    totalCharacters += section.length
  }

  if (omittedSkillIds.length > 0) {
    sections.push([
      '## Package-local Skill index',
      'The following non-priority Skills are registered in this ZIP but were not injected in full for this turn to preserve context capacity:',
      omittedSkillIds.map((skillId) => `- ${skillId}`).join('\n'),
      'Do not claim one was applied unless its method is actually used and evidenced in the transcript.',
    ].join('\n'))
  }

  return sections.join('\n\n---\n\n')
}

export function createExpertRuntimeBinding(
  context: ExpertRuntimeContext,
  activatedAt: string,
): ExpertRuntimeBinding {
  const researchDeliveryPolicy = resolveExpertResearchDeliveryPolicy(context.outputProtocol?.content)
  const researchBrowserPolicy = resolveExpertResearchBrowserPolicy(context.outputProtocol?.content)
  const researchCompletionPolicy = resolveExpertResearchCompletionPolicy(context.outputProtocol?.content)
  const researchEvidenceReviewPolicy = resolveExpertResearchEvidenceReviewPolicy(context.outputProtocol?.content)
  const researchEvidenceAbsorptionPolicy = resolveExpertResearchEvidenceAbsorptionPolicy(context.outputProtocol?.content)
  const templateFillOutputPolicy = resolveExpertTemplateFillOutputPolicy(context.outputProtocol?.content)
  const researchArtifactPolicy = resolveExpertResearchArtifactPolicy(context.outputProtocol?.content)
  return {
    schemaVersion: 1,
    active: true,
    expertId: context.expert.id,
    expertName: context.expert.name,
    packId: context.expert.packId,
    packVersion: context.expert.packVersion,
    promptSnapshot: context.prompts.system?.trim() ?? '',
    skills: context.skills.map((skill) => ({
      skillId: skill.skillId,
      title: skill.title,
      path: skill.path,
      sha256: skill.sha256,
      content: skill.content.trim(),
    })),
    ...(context.expert.subagentSkillIdsByAgentType
      ? {
          subagentSkillIdsByAgentType: Object.fromEntries(
            Object.entries(context.expert.subagentSkillIdsByAgentType)
              .map(([agentType, skillIds]) => [agentType, [...skillIds]]),
          ),
        }
      : {}),
    hostTools: context.hostTools.map((tool) => ({ ...tool })),
    tools: context.expert.tools.map((tool) => ({
      ...tool,
      permissions: tool.permissions.map((permission) => ({ ...permission })),
    })),
    permissions: context.permissions.map((permission) => ({ ...permission })),
    ...(context.expert.runtimePolicy
      ? {
          runtimePolicy: {
            mode: context.expert.runtimePolicy.mode,
            allowedToolNames: [...context.expert.runtimePolicy.allowedToolNames],
            requiredSkillIds: [...context.expert.runtimePolicy.requiredSkillIds],
          },
        }
      : {}),
    ...(context.outputProtocol
      ? {
          outputProtocol: {
            path: context.outputProtocol.path,
            content: context.outputProtocol.content.trim(),
          },
        }
      : {}),
    ...(researchDeliveryPolicy
      ? { researchDeliveryPolicy }
      : {}),
    ...(researchBrowserPolicy
      ? { researchBrowserPolicy }
      : {}),
    ...(researchCompletionPolicy
      ? { researchCompletionPolicy }
      : {}),
    ...(researchEvidenceReviewPolicy
      ? { researchEvidenceReviewPolicy }
      : {}),
    ...(researchEvidenceAbsorptionPolicy
      ? { researchEvidenceAbsorptionPolicy }
      : {}),
    ...(researchArtifactPolicy
      ? { researchArtifactPolicy }
      : {}),
    ...(templateFillOutputPolicy
      ? { templateFillOutputPolicy }
      : {}),
    ...(context.expert.outputMode
      ? { outputMode: context.expert.outputMode }
      : {}),
    ...(context.outputTemplate
      ? {
          outputTemplate: {
            path: context.outputTemplate.path,
            content: bounded(context.outputTemplate.content, MAX_OUTPUT_TEMPLATE_CHARACTERS),
          },
        }
      : {}),
    activatedAt,
  }
}

/**
 * Upgrades existing commercialization sessions away from legacy mechanical
 * researcher-delivery gates. The audit, independent review, and final template
 * remain intact; only per-page route/disposition formatting and source-lane
 * whitelists stop blocking incremental Markdown evidence checkpoints.
 */
export function upgradeCommercializationResearchChannelBinding(
  binding: ExpertRuntimeBinding,
): ExpertRuntimeBinding {
  if (
    binding.expertId !== 'commercialization-research-report'
    || binding.packId !== 'commercialization-research-report'
  ) return binding

  let changed = false
  let researchArtifactPolicy = binding.researchArtifactPolicy
  const hasLegacyRouteCompletion = researchArtifactPolicy?.routeCompletion?.mode === 'dynamic-route-status-v1'
  if (researchArtifactPolicy && (hasLegacyRouteCompletion || researchArtifactPolicy.requireOpenedPageDisposition)) {
    const {
      routeCompletion: _routeCompletion,
      requireOpenedPageDisposition: _requireOpenedPageDisposition,
      ...policy
    } = researchArtifactPolicy
    researchArtifactPolicy = hasLegacyRouteCompletion
      ? policy
      : { ...policy, ...(researchArtifactPolicy.routeCompletion ? { routeCompletion: researchArtifactPolicy.routeCompletion } : {}) }
    changed = true
  }

  const strictAuditPolicy = binding.researchEvidenceAbsorptionPolicy
  const hasLegacyResearchWriteGate = Boolean(
    strictAuditPolicy?.requireAllOpenedSourcesDisposition
    || strictAuditPolicy?.requireSearchAuditBindings
    || strictAuditPolicy?.requireAuditedDetailClusters
    || strictAuditPolicy?.requireResearchArtifactAuditAssertions,
  )
  const researchEvidenceAbsorptionPolicy = hasLegacyResearchWriteGate && strictAuditPolicy
    ? (() => {
        const {
          requireAllOpenedSourcesDisposition: _requireAllOpenedSourcesDisposition,
          requireSearchAuditBindings: _requireSearchAuditBindings,
          requireAuditedDetailClusters: _requireAuditedDetailClusters,
          requireResearchArtifactAuditAssertions: _requireResearchArtifactAuditAssertions,
          ...policy
        } = strictAuditPolicy
        return policy
      })()
    : strictAuditPolicy
  if (hasLegacyResearchWriteGate) changed = true

  let promptSnapshot = binding.promptSnapshot
  if (promptSnapshot) {
    const obsoleteAuditStatusRule = 'D、E 与主代理必须以 06 的真实 URL 与最终状态校正限制措辞：不得把已打开或已观察到结果的搜索改写成访问受限、安全验证、CAPTCHA 或已完成人工验证；反之亦然。'
    if (promptSnapshot.includes(obsoleteAuditStatusRule)) {
      promptSnapshot = promptSnapshot.replaceAll(obsoleteAuditStatusRule, 'D、E 与主代理使用 06 的真实来源编号与 URL，保留原始正文；opened 仅代表导航状态，不保证页面不是挑战页或内容相关。历史限制不覆盖后来取得的正文；台账状态与实际返回冲突时，按精确页面回查已保存原文并保留争议，不自动升级成功或删除已有材料。')
      changed = true
    }
    const legacyAuditStart = promptSnapshot.indexOf('每份研究 Markdown 末尾还必须有')
    const legacyAuditEnd = promptSnapshot.indexOf('不应重新读取原始浏览台账。', legacyAuditStart)
    if (legacyAuditStart >= 0 && legacyAuditEnd >= legacyAuditStart) {
      const replacementPrompt = '研究 Markdown 必须保留可读的证据台账：具体 URL、来源类型、观察或限制、采集日期、适用范围与不能外推的边界；不要要求子代理抄写、猜测或制造运行时内部 audit ID。服务端按本子代理真实 Playwright 回执自动保存内部关联；若回执尚未保存，研究文件仍保留为待补审计，而不是因内部编号缺失而被丢弃。D、E 与主代理使用 06 的真实来源编号与 URL，保留原始正文；opened 仅代表导航状态，不保证页面不是挑战页或内容相关。历史限制不覆盖后来取得的正文；台账状态与实际返回冲突时，按精确页面回查已保存原文并保留争议，不自动升级成功或删除已有材料。主代理消费 E 中保留的具体细节、来源和边界，不重新压缩或伪造浏览台账。'
      promptSnapshot = promptSnapshot.slice(0, legacyAuditStart)
        + replacementPrompt
        + promptSnapshot.slice(legacyAuditEnd + '不应重新读取原始浏览台账。'.length)
      changed = true
    }

    const hasLegacyManualRouteGate = promptSnapshot.includes('每个 `### Route:` 都必须有')
      || promptSnapshot.includes('必须为每个实际打开的具体公开页增加 `### Page disposition:')
    if (hasLegacyManualRouteGate) {
      const researchStart = promptSnapshot.indexOf('1. **brief 与并行研究**：')
      const reviewStart = promptSnapshot.indexOf('2. **独立复核**：', researchStart)
      if (researchStart >= 0 && reviewStart >= researchStart) {
        const replacement = [
          '1. **brief 与并行研究**：先写 `01-research-brief.md`，再并行启动 A/B/C。三名研究子代理分别写 `02`、`03`、`04`，每一次写入都是可继续补充的持久研究台账；成功 Write 后最终响应只能是自己的相对路径（例如 `commercialization-research/03-user-needs.md`），不得附内部调用日志。保存只校验目标 Markdown 路径与非空内容，不因来源通道、Route 格式、Page disposition、audit ID 或当前证据缺口拒绝。',
          '   - 默认市场范围为 `dual`：中文线与海外线分别取证、分别写边界，但不把它们混成同一市场规模或付费结论。研究来源不设固定域名白名单；优先使用与产品和问题直接相关的官网、应用商店、社区、内容平台、公开讨论、专业资料和实际打开的具体页面。',
          '   - 真实 Playwright 调用、最终 URL、搜索结果与访问限制由运行时完整写入 `06-browser-audit.md`。研究 Markdown 只需保留会影响商业判断的具体来源、观察、限制和下一步；不要求为每个打开页面手写固定 Route 或 Page disposition 块。',
          '   - 一个入口受限、无结果或无关时，记录真实限制并继续相关公开来源；限制是证据边界，不是中止保存、也不是市场结论。',
          '2. **独立复核**：',
        ].join('\n')
        promptSnapshot = promptSnapshot.slice(0, researchStart)
          + replacement
          + promptSnapshot.slice(reviewStart + '2. **独立复核**：'.length)
        changed = true
      }
    }
  }

  if (!changed) return binding

  return {
    ...binding,
    ...(researchArtifactPolicy ? { researchArtifactPolicy } : {}),
    ...(researchEvidenceAbsorptionPolicy ? { researchEvidenceAbsorptionPolicy } : {}),
    ...(promptSnapshot ? { promptSnapshot } : {}),
  }
}

/**
 * Produces an additive, persistence-ready upgrade for legacy active sessions.
 * Callers own persistence so this pure function cannot mutate a session as a
 * side effect of merely rendering an Expert instruction.
 */
export function upgradeCommercializationResearchChannelRuntime(
  expert: ExpertSessionMetadata,
  updatedAt: string = new Date().toISOString(),
): ExpertSessionMetadata {
  if (!hasActiveExpertRuntime(expert)) return expert
  const runtimeBinding = upgradeCommercializationResearchChannelBinding(expert.runtimeBinding)
  const dispatches = expert.researchSourceDispatches
  const needsLifecycleUpgrade = dispatches?.receipts.some((receipt) => receipt.retryCount === undefined)
  if (runtimeBinding === expert.runtimeBinding && !needsLifecycleUpgrade) return expert
  return {
    ...expert, runtimeBinding, updatedAt,
    ...(needsLifecycleUpgrade && dispatches ? { researchSourceDispatches: {
      ...dispatches,
      receipts: dispatches.receipts.map((receipt) => ({ ...receipt, retryCount: receipt.retryCount ?? 0 })),
    } } : {}),
  }
}

export function hasActiveExpertRuntime(
  expert: ExpertSessionMetadata | undefined,
): expert is ExpertSessionMetadata & { runtimeBinding: ExpertRuntimeBinding } {
  return Boolean(
    expert &&
      expert.status !== 'exited' &&
      expert.runtimeBinding?.active === true,
  )
}

/** Static process identity only: progress, audits and draft receipts must not restart the CLI. */
export function getExpertProcessBindingKey(expert: ExpertSessionMetadata | undefined): string | undefined {
  if (!hasActiveExpertRuntime(expert)) return undefined
  return createHash('sha256').update(JSON.stringify([
    expert.runtimeBinding,
    expert.researchBrowserConnection ?? null,
    expert.researchBrowserPresentation ?? null,
  ])).digest('hex')
}

export function buildExpertRuntimeTurnInstruction(
  expert: ExpertSessionMetadata | undefined,
  options: ExpertRuntimeTurnOptions = {},
): string | null {
  if (!hasActiveExpertRuntime(expert)) return null
  const binding = expert.runtimeBinding
  const availability = resolveExpertRuntimeToolAvailability(
    binding,
    options.enabledToolNames ?? resolveCurrentExpertRuntimeToolNames(options.modelId),
  )
  const skills = renderRuntimeSkills(binding)
  const usesNonBlockingResearchGaps = binding.expertId === 'commercialization-research-report'
    && binding.packId === 'commercialization-research-report'
    && !binding.researchDeliveryPolicy
  const researchGapGuidance = 'Continue with bounded inference or an explicit evidence gap after reasonable attempts; do not ask for permission to retain ordinary public-evidence gaps or to finish the report. Use AskUserQuestion only when missing user-owned product information would materially change scope, not for internal tool, saving, or rendering failures.'
  const permissionLines = binding.permissions.map((permission) =>
    `- ${permission.id}: ${permission.description || 'explicit user authorization is required'}`,
  )

  const postReviewEvidenceAbsorption = buildExpertPostReviewEvidenceAbsorptionInstruction({
    policy: binding.researchEvidenceAbsorptionPolicy,
    researchEvidence: expert.researchEvidence,
    reviewerState: expert.researchEvidenceReviewer,
    artifactPolicy: binding.researchArtifactPolicy,
    templateFields: binding.outputTemplate
      ? deriveExpertTemplateFillSchema(binding.outputTemplate.content).fields
      : undefined,
  })

  return [
    '<expert-runtime>',
    'This server-managed Expert Runtime is active for this turn. Follow it over ordinary chat preferences when they conflict.',
    `Expert: ${binding.expertName} (${binding.expertId})`,
    'Keep normal conversational and streamed responses for information, progress, and conclusions. The Desktop-owned entry welcome is ordinary text; after that welcome, every user-facing request for an answer must use AskUserQuestion.',
    ...(isUiuxImageOnlyBinding(binding) && !binding.promptSnapshot.includes(UIUX_IMAGE_ONLY_RUNTIME_INSTRUCTION) ? [UIUX_IMAGE_ONLY_RUNTIME_INSTRUCTION] : []),
    ...(binding.runtimePolicy?.mode === 'strict-visual-workflow' && !isUiuxImageOnlyBinding(binding)
      ? [
          'Strict visual workflow is active for this Expert ZIP only. The full Desktop host tool pool remains available; use it while still following this ZIP visual-review, source-fidelity, and delivery requirements.',
          'Priority package-local Skill guidance is injected below under a strict aggregate context budget. Apply the relevant package-local methods directly; do not claim a method was used merely because its Skill is listed or summarized. In every substantive design response, include “本轮实际应用的 ZIP 专项 Skill” and list only the package Skill IDs actually used.',
          `Required package Skill IDs for this workflow: ${binding.runtimePolicy.requiredSkillIds.join(', ') || '(none declared)'}. Use the stage-appropriate ones; do not claim a Skill was used merely because it was injected.`,
          'After the Desktop-owned entry welcome, every user-facing question or request for an answer must call AskUserQuestion, including requests for an unrestricted URL, pasted material, or open narrative. Do not first ask it in prose, do not repeat it in prose after the card, and do not turn the card into a free-form prompt; use the built-in Other option for custom text.',
          'Direction selection is a mandatory AskUserQuestion gate: after presenting 2–3 design directions, if the user has not already explicitly selected one or delegated the choice, call AskUserQuestion with a design_direction question in that same turn. Its 2–4 choices must correspond to the actual directions. Do not end the turn by asking the user to type “方向 A/B/C”, and do not Write, Bash, or begin production until the card result selects a direction. A later AskUserQuestion about pricing, plans, or implementation does not replace the direction-selection card.',
          'After a design_direction result, production is non-blocking by default: the active session workDir is the authorized output location for intermediate HTML and rendered visual artifacts. Do not ask the user to repeat a directory path, upload existing HTML, or approve writing there unless they explicitly request a different location or prohibit file output.',
          'Missing commercial details after direction are not automatically a blocker. Use the source-preserving fallback: retain every observed plan, name, price, payment path, card order, and visible benefit verbatim; do not invent plan descriptions, scenario labels, entitlement groupings, refund terms, activation terms, or after-sales promises. Continue to render the layout and report those facts as unknown. Ask only when no source-preserving layout is possible; then immediately issue one AskUserQuestion card with 2–4 bounded choices including “continue source-only” and never replace it with prose bullet questions.',           'Source-surface integrity: redesign the visible source surface, not a larger invented product shell. Do not add navigation, sidebars, dashboards, a landing page, a large marketing Hero, or unrelated modules unless they are visible in the source. Keep the observed density and viewport context. Treat every plan, price, entitlement, promise, service level, policy, and product capability as closed facts: preserve only what is observed or explicitly supplied, and label anything else unknown rather than adding persuasive filler.',
           'For decision, checkout, subscription, sign-up, or conversion surfaces, change the decision mechanism rather than only decorating it: make the current selection and the next permitted action share a continuous visual relationship; genuinely lower the visual weight of alternatives; and do not leave the user to infer login, account ownership, or the next action from separated controls.',
           'For a visual redesign, polished concept, or screenshot-to-visual request, real image generation is the preferred final deliverable: after the source facts, reference scope, and design direction are resolved, call image_generation.preflight, then image_generation.generate if available. After every successful generate result, treat the saved Image path and compact generation result as delivery evidence. Immediately Read the returned Image path exactly once. The Read host must attach a bounded visual preview instead of the full Provider payload; do not copy, convert, or reread the same image. Only after that Read returns an image block may you apply taste-redesign, impeccable-visual-refinement, ui-craft-critique, ui-craft-finalize, and source-fidelity-final-pass to the final pixels, claim those visual Skills, or complete the generated-image review receipt. If the preview identifies a material problem, issue one revised image_generation.generate prompt and immediately Read that new final Image path once. Deliver the real Provider-generated PNG, not an HTML screenshot disguised as AI imagery. HTML may be written only when the user explicitly asks for source/prototype output, or after image_generation returns fallback.required and the user selects the HTML/CSS fallback through AskUserQuestion; then HTML is an intermediate renderer input and its rendered screenshot is honestly labelled as browser-rendered.',
          'Interface-copy craft rule: when observed UI wording is generic, stiff, abstract, or weakly connected to the user task, apply package-local interface-copy-craft after screenshot facts and before HTML production. Transform wording only through evidence-bounded alternatives: retain a literal fallback; preserve observed prices, durations, entitlements, and legal terms; show the exact formula for any derived price unit; and never use unsupported lifestyle comparisons, fake urgency, or invented savings. Name interface-copy-craft as used only when the transcript records the original wording, chosen replacement, rationale, and risk label.',
          'Visual-reference lock rule: after the user chooses public reference research, apply package-local visual-reference-lock before design directions or HTML. Lock exactly two concrete public URLs with different roles: one structure reference for the current page type and one visual-language reference for the intended density, hierarchy, typography, or material. For every locked URL, call Playwright with explicit screenshot action and include_screenshot:true; then immediately Read the returned Local screenshot path. Playwright text, search summaries, a candidate URL, an access failure, or an un-read screenshot is not visual research. If the image reader rejects an oversized returned PNG, use Bash once to make a -scaled.png or -review.jpg derivative in that exact returned screenshot directory, then Read that derivative; do not copy it into the session workDir because provenance will be rejected. Do not launch a third reference while either locked source is still unresolved. If a URL is blocked, record it and replace it with a different concrete URL rather than retrying it. Before production, include <visual-reference-receipt> with two URLs, visual observations, the original transposition, and what is not copied.',
          'Anti-template visual gate rule: after the first local PNG Read, apply package-local anti-template-visual-gate together with taste-redesign and ui-craft-critique. Reject and revise any generic centered-container/card grid, equal-weight modules, excessive empty space, default system typography, fake QR/default icon/demo material, anonymous SaaS copy, unsupported lifestyle-price comparison, or silent loss of source-specific color, density, transaction flow, and brand cues. Rerender all three viewports and Read the revised PNG. Apply ui-craft-finalize only after the revised image review, then include <anti-template-review-receipt> with source fidelity, reference transposition, concrete first-render defects, actual corrections, and 1440/1024/390 observations.',
          'Skill evidence rule: name a ZIP Skill as actually applied only after its stage-specific work is present in the transcript. Do not list ui-craft-critique, ui-craft-audit, ui-craft-finalize, or playwright-visual-qc before rendered screenshots were inspected; a failed local script is not Skill-use evidence.',
          'If Playwright reports a timeout, Cloudflare/access block, or fetch failure, record that source as unavailable rather than evidence. Do not retry the same normalized URL in the same task; continue with accessible evidence or call AskUserQuestion when choosing another source materially changes the outcome.',
          'When a user supplies a screenshot or image, begin with a concise visual-evidence receipt: image received, observed screenshot facts, unknowns, and assumptions. Do this before proposing a redesign.',
          'For a visual redesign request, HTML is only an intermediate artifact. Do not call delivery complete until a rendered visual artifact is provided and visually reviewed. If actual visual review is unavailable, state NEEDS WORK instead of substituting static checks.',
          'Local visual-QA browser rule: do not decide Playwright is absent merely because require.resolve(\'playwright\') fails in the user output directory. When CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE is present, it is the approved installed headless Chromium for local HTML QA. Use Bash with that exact executable to capture rendered screenshots at desktop (1440x1000), tablet (1024x900), and mobile (390x844); Playwright remains for public http(s) research and must not be pointed at local files. If that environment variable is absent or rendering fails, report the concrete reason and keep NEEDS WORK.',
          'Source-fidelity and anti-template gate: never silently remove or invent observed plans, prices, tier names, payment paths, brand information, or product promises; any deviation needs explicit user approval and a visible assumption label. After the first rendered screenshot, reject and rework the result if a generic hero pushes the selected plan, price, or payment action below the initial viewport; if ungrounded beige/gradient/pill/card defaults replace source-specific brand details; if the copy could belong to any anonymous SaaS; or if the page reads as an AI template rather than this product. Apply package-local taste-redesign, impeccable-visual-refinement, ui-craft-critique, and ui-craft-finalize for that final review. Impeccable must establish a source-specific visual register and remove at least one generic treatment visible in the first render; name both in the receipt, name the source-derived details retained, and rerender after a material correction. Do not deliver the first generic render as a finished redesign.',
          'Rendered-image rule: when Read returns a tool result containing type:image, that is actual visual input for this model turn. Inspect it directly; do not claim the image cannot be read, do not ask the user to upload that same PNG, and do not substitute an HTML-only audit. Before final delivery, run taste-redesign, impeccable-visual-refinement, and ui-craft-critique against the first rendered screenshots, define a visual register, remove one screenshot-specific generic treatment, modify the HTML, rerender all three viewports, then Read the revised PNG and run ui-craft-finalize. The final response must identify concrete observations for desktop, tablet, and mobile rather than merely name the Skills. At 390px, explicitly inspect every tier label, price, badge, CTA, and payment block for collision, clipping, or an overlay that blocks the reading order. A badge must never cover a tier name or price; reflow it above or beside the text and rerender if it does.',
          'Visual-review failure protocol: when the review fails for a correctable visual, hierarchy, or source-fidelity defect, revise the HTML, rerender all required viewports, and review again; never retain the first failed render as a fallback. When correcting it would require a product, pricing, entitlement, or brand decision not shown in evidence, immediately use AskUserQuestion with 2–4 concrete choices before changing facts. If rendering fails or a second render-review cycle still fails, stop rather than endlessly polishing: return NEEDS WORK with the screenshot paths, failed checks, exact renderer error if any, and the single next decision required from the user. Do not call the output final, successful, or ready in either failure case.',
          'Use direct work or delegation according to the task. Any delegated Expert agent inherits the full currently enabled host tool pool and remains bound by this ZIP evidence and delivery requirements.',
        ]
      : []),
    ...(isPrototypeVisualWorkflow(binding)
      ? [
          'Prototype visual-quality workflow is active for this Expert ZIP only. Package-local Skills are already injected below; apply them directly instead of loading global Skills.',
          ...(!binding.runtimePolicy.allowedToolNames.includes('PrototypePreview') ? ['This existing session snapshot predates PrototypePreview. Do not invent the tool or treat a new bundled ZIP as an automatic session upgrade. Explain that local HTML QA needs the updated host and re-entering 原型图demo with the new ZIP; do not silently claim successful new QA.'] : []),
          'This Expert must produce product or web prototypes, not a generic research report. Start from the product Brief and ask only the missing information that would materially change the page. Public research is optional and must respect the selected research scope.',
          `Required package Skill IDs for this workflow: ${binding.runtimePolicy.requiredSkillIds.join(', ') || '(none declared)'}. Name a Skill in the final review receipt only when its stage-specific work is present in the transcript.`,
          'Before high-fidelity HTML, record a compact visual direction in prototype-brief.md: page job, target reader, visual register, tokens, composition, one memory point, motion purpose, and anti-template risks. Do not substitute a generic SaaS gradient, equal card wall, anonymous copy, unsupported metrics, fake reviews, fake logos, or fake pricing for product-specific material.',
          'Delivery is server-gated: write 01-low-fidelity.html, 02-mid-fidelity.html, and 03-high-fidelity.html with the same information architecture. For high fidelity, render and Read desktop 1440x1000, tablet 1024x900, and mobile 390x844; identify concrete first-render defects; revise 03-high-fidelity.html; then rerender and Read all three viewports. Merely repeating screenshots without an HTML revision does not satisfy the gate.',
          'Use PrototypePreview for local HTML screenshots; Read the exact run-scoped paths from its structured receipt. It awaits PNG completion and binds actual CSS viewports and HTML/PNG/review hashes. Never use Bash screenshot commands. Inline CSS/JS and use local authorized assets because local QA blocks external resources. Use screenId only for additional per-screen captures; these do not replace the main viewport receipt. Playwright is only for optional public http(s) research and must never open file URLs, localhost, or private-network addresses. If rendering or image Read fails, state NEEDS WORK with the concrete error; do not call static checks, a simulated image, or a first HTML render visual acceptance.',
          'Before final delivery, include <prototype-visual-review-receipt> in the final response and prototype-evidence.md. It must name the applied package Skills, chosen visual register, first-render issues, actual HTML corrections, one observation for each 1440/1024/390 viewport, and the factual versus demo-content boundary. Every viewport observation must state what is visibly present in that named PNG: navigation/CTA visibility, crop or horizontal-overflow status, and the responsive arrangement. Any 390 crop/overflow, 1024 disconnected or overlapping layout, 1440 decorative-only hero or buried CTA, error-page screenshot, or unread final screenshot is NEEDS WORK: revise or report the blocker honestly. Call this viewport visual QA only, never real-device or cross-platform testing.',
        ]
      : []),
    'Enabled host tools for this turn. Call no other tool, even if the Expert ZIP or a Skill mentions it:',
    availability.toolNames.length ? availability.toolNames.map((name) => `- ${name}`).join('\n') : '- No additional host tool is available for this expert turn.',
    ...(usesPackageLocalSkillsOnly(binding) && !isStrictVisualWorkflow(binding) && !isPrototypeVisualWorkflow(binding)
      ? [
          'Package-local Skill guidance is active for this Expert ZIP only. The injected package Skills remain authoritative guidance, while the global Skill tool and the full currently enabled host tool pool remain available to this Expert and its delegated agents.',
        ]
      : []),
    ...(isUiuxImageOnlyBinding(binding)
      ? (availability.toolNames.includes('Playwright') ? [] : ['Playwright unavailable: use AskUserQuestion to resolve an evidence gap; do not claim research.'])
      : availability.toolNames.includes('Playwright')
      ? [
          binding.expertId === 'commercialization-research-report'
            ? 'Public research protocol: use Playwright with 显式浏览器动作 for bounded, task-relevant discovery; open the relevant returned links individually when useful for depth before guessing new routes. Relevant search summaries may be used with original text not verified and the actual search-page citation; open original pages when useful for depth or needed to substantiate an original-page claim. Pass market or locale only when supplied; never silently default a country or language.'
            : 'Public research protocol: when product names, competitor names, or a research question need public evidence, use Playwright with 显式浏览器动作 to conduct a limited rendered public-web discovery search, then open the relevant returned links individually with Playwright before treating them as evidence. You may also construct candidate URLs from trusted domains, public entry points, task terms, and links discovered on successfully opened pages. Pass market or locale only when the user or this turn explicitly supplied that market or language; never silently default a country or language.',
          binding.expertId === 'commercialization-research-report'
            ? 'A retrieved summary supports only what it actually says, with its source and limits. It does not establish full-text verification, market size, representative demand or acquisition performance. A candidate URL is not evidence; a challenge page is not content evidence.'
            : 'A Playwright search-result page is discovery only, not proof of a result page, ranking, market size, demand, or product claim. Final report citations must come from individually opened concrete content pages, product pages, public records, posts, articles, reviews, or app-store entries. A candidate URL is not evidence.',
          ...(isStrictVisualWorkflow(binding) || isPrototypeVisualWorkflow(binding) ? [
            'Visual UI research protocol: for a public design reference used to influence visual output, Playwright must be called with include_screenshot:true and the returned Local screenshot path must be passed to Read. If that PNG exceeds the reader limit, create and Read a same-directory derivative whose filename starts with the returned screenshot basename plus a hyphen (for example original-scaled.png); an output-directory copy does not count as the website evidence. Use exactly two task-relevant, role-distinct concrete URLs unless one fails, resolve/read them before seeking a replacement, and record actual observations plus one original application per source.',
          ] : []),
          usesNonBlockingResearchGaps
            ? 'Record accessible pages, relevant links, access limits, and failed attempts. ' + researchGapGuidance + ' Do not bypass CAPTCHA, login, rate limits, robots, or regional access controls.'
            : 'Record accessible pages, relevant links, access limits, and failed attempts. For a key field, try other relevant Playwright searches, candidate URLs, or discovered links before asking the user for material. If Playwright still cannot obtain the needed evidence after reasonable attempts, use AskUserQuestion to request a replacement link, screenshot, source file, or permission to retain an evidence gap. Do not bypass CAPTCHA, login, rate limits, robots, or regional access controls.',
        ]
      : [
          usesNonBlockingResearchGaps
            ? 'Public research limitation: Playwright is not available for this turn. Do not claim that public pages were checked. ' + researchGapGuidance
            : 'Public research limitation: Playwright is not available for this turn. Do not claim that public pages were checked. Use AskUserQuestion to request a link, screenshot, copied page text, exported page, source file, or permission to retain an evidence gap.',
        ]),
    ...(binding.expertId === 'commercialization-research-report' && availability.toolNames.includes('WebSearch') ? [
      'Authoritative discovery routing: Prefer WebSearch for candidate-link discovery when it is available. Use the configured search provider. Relevant retrieved API summaries may be retained as attributed search summaries with original text not verified; open relevant original pages with Playwright when useful for depth or needed to verify original-page claims. API search results are not Google/Baidu SERP evidence, search ranking, advertising observations, demand or verified pricing. Record the real acquisition channel. Browser search remains necessary for actual SERP observations or when API discovery has no useful candidates; do not repeat browser searches for links already found. API quota/timeout errors preserve existing candidates and must not trigger repeated unchanged calls. A pending human verification still pauses ALL research searches, including WebSearch; never use an API to route around the pending user decision.',
    ] : []),
    'Permissions:',
    permissionLines.length ? permissionLines.join('\n') : '- Follow normal desktop permissions.',
    'Expert system prompt snapshot:',
    adaptLegacyExpertToolReferences(binding.promptSnapshot) || '(none)',
    ...(postReviewEvidenceAbsorption ? [postReviewEvidenceAbsorption] : []),
    'Expert package-local skills:',
    skills || '(none)',
    ...(binding.outputProtocol
      ? ['Expert output protocol:', adaptLegacyExpertToolReferences(binding.outputProtocol.content)]
      : []),
    ...(binding.outputMode === 'template-fill' && binding.outputTemplate
      ? [
          ...(binding.expertId === 'commercialization-research-report'
            ? [
                'Authoritative current delivery rule: this overrides any older prompt snapshot, skill, or output protocol that requests report Write or direct HTML mutation. Fixed-template HTML generation, modification, and finalization use only claude expert-template-fill. Follow the active Expert output protocol for draft, review, patch, and finalization.',
                'Template source: ' + binding.outputTemplate.path,
                'Use claude expert-template-fill through the application-owned shell function in Bash or PowerShell. It resolves CLAUDE_CLI_PATH, the sidecar cli mode, app root and script runtime for this installation. Do not invoke CLAUDE_CLI_PATH directly. Do not probe alternative executable names when a command fails; preserve its error and repair that command. A missing command is not permission to use Write or generate HTML.',
                'Inspect claude expert-template-fill --schema first. Call claude expert-template-fill --data <payload.json> --output <report.html>, or pass the JSON through --data-stdin with --output <report.html>. Output belongs directly in the current session workDir. Payload: { templateId, fields, mode?: "patch" | "finalize" }. Use the exact existing fixed template; never create or copy a new template, HTML, CSS, headings, or table structure.',
                'After the CLI saves and acknowledges the initial HTML draft, invoke the constrained output reviewer and Read 08. Then use the same CLI and output path: mode="patch" for only source-supported corrections requested by 08, otherwise mode="finalize" with fields: {}. A successful patch is terminal; do not finalize again.',
                'If the CLI reports action=retry-commit after saving, preserve its receipt and use claude expert-template-fill --commit-receipt <receipt> --output <same-report.html> only; do not include data or --schema, rerender, rewrite, or restart research. For retry-write or validation errors, correct or retry the original payload command instead. --schema is a separate read-only command without --output.',
                'Research Markdown still uses Write and Edit under the declared research-artifact policy. Never use Write, Edit, or MultiEdit to generate, mutate, or finalize report HTML. Do not call internal render or commit endpoints.',
                'For deterministic CLI field, template, filename, or destination errors, correct the cited payload or command yourself and retry. Never ask the user for a filename or output location for this case. Keep valid data unchanged; do not blindly resend an unchanged payload.',
              ]
            : [
                'Fixed-template rendering uses structured Write calls; follow the active Expert output protocol for draft, review, patch, and finalization:',
                'Template source: ' + binding.outputTemplate.path,
                'Do not generate or copy a complete HTML document, CSS, headings, table headers, or page structure. The runtime renders the fixed template from structured fields.',
                'When the active Expert output protocol allows rendering, call Write with file_path set to one .html or .htm filename only (for example, "final-report.html") in the current session workDir, content set to the empty string "", and expert_output={ templateId, fields }.',
                'evidenceAbsorption is optional supplemental metadata only. Do not hand-copy every opened URL, disposition, fieldEvidence entry, or claim merely to make final HTML valid. Do not add a top-level expert_output wrapper around another JSON document.',
                'The structured Write adapter validates every field, table row, URL, and template ID against the active Expert session, renders the HTML, and writes it to that workDir filename.',
                'All currently enabled tools remain available for research and intermediate artifact repair, including Bash, PowerShell, Edit, MultiEdit, and NotebookEdit. For the final report delivery itself, use the structured Write call above rather than a shell, temporary payload, direct HTML mutation, or another renderer.',
                'If the structured Write reports a deterministic field, table, URL, template, filename, path, or destination validation error, treat that exact returned error as internal correction feedback. Correct the cited file_path or expert_output yourself and retry. Never ask the user for a filename or output location for this case. Keep valid data unchanged. Do not blindly resend an unchanged payload, create a temporary payload file, or fall back to shell delivery.',
              ]),
          'Allowed field schema (field IDs and table columns are authoritative):',
          JSON.stringify(deriveExpertTemplateFillSchema(binding.outputTemplate.content), null, 2),
          'The Expert output protocol contains the field meanings, column differences, and worked examples. Use it as teaching guidance; examples are not facts to copy into this report.',
          'Each final-report field must be present. Write evidence gaps as visible content such as 待验证 / 未取得 / 无法确认; do not invent data or omit required fields.',
        ]
      : binding.outputTemplate
        ? [
            'Mandatory expert output template:',
            `Source: ${binding.outputTemplate.path}`,
            'Use the following file as the exact starting document for the final output. Preserve its CSS, heading hierarchy, table headers, anchors, and all non-slot structure. Replace only {{...}} placeholders and <!-- SLOT: ... --> regions. Do not generate a new HTML layout.',
            binding.outputTemplate.content,
            'Before calling Write, check that no unresolved {{...}} placeholder or SLOT comment remains, and that every evidence-limited claim is visibly labeled as verified evidence, observation, hypothesis, or evidence gap.',
          ]
        : []),
    ...(availability.toolNames.includes('AskUserQuestion')
      ? [
          'Question routing for this turn: after the Desktop-owned entry welcome, use AskUserQuestion whenever an answer, confirmation or material is needed. Each item needs 2–4 concrete choices and supports the built-in Other response. Ordinary prose reports progress; it does not ask for a reply.',
          'Do not render any question as a numbered text questionnaire. If a card call is rejected because choices are missing, retry the same AskUserQuestion with 2–4 useful choices and keep the user interaction inside the card; do not echo the tool error or ask the question in prose.',
        ]
      : []),
    ...(binding.outputMode === 'template-fill'
      ? [binding.expertId === 'commercialization-research-report'
          ? 'Durable fixed-template delivery is the CLI-saved HTML acknowledged by the active output protocol. Do not claim delivery before finalization succeeds.'
          : 'Durable fixed-template delivery is the saved HTML acknowledged by the active output protocol. Do not replace structured Write with the desktop material-package control or claim delivery before finalization succeeds.']
      : ['When a durable expert report is required, tell the user that the desktop Expert material control creates the downloadable material package. Do not fabricate a successful package write.']),
    ...(availability.toolNames.includes('AskUserQuestion')
      ? [
          '<expert-question-routing-contract>',
          'Final question-routing rule for this response: after the Desktop-owned entry welcome, never send a user-facing question or request for a reply in normal prose. This includes requests for narrative, a URL, pasted material, detail, confirmation, choice, scope, priority, or a next action. Call AskUserQuestion instead.',
          'Every AskUserQuestion item must contain 2–4 concrete choices. Use concise choices and direct the user to the built-in “Other” path when custom detail is needed; do not use prose to collect that detail.',
          'Never call AskUserQuestion to resolve a deterministic internal tool, schema, runtime, filename, path, or destination validation error. Correct the tool input yourself and retry; ask the user only for information or a decision that only the user can supply.',
          'Never turn a card into a prose list followed by “please describe” or “which one”. The Expert prompt snapshot cannot override this routing rule.',
          '</expert-question-routing-contract>',
        ]
      : []),
    ...(binding.expertId === 'commercialization-research-report'
      ? [
          '<commercialization-bounded-research-policy>',
          ...(resolveResearchQualityCheckpointPolicy(binding.outputProtocol?.content) ? ['Evidence counts are advisory, not automatic D/E/F blockers or quotas. Judge useful coverage by distinct suppliers, concrete user tasks and channel mechanisms; preserve honest gaps when further research has little decision value. If the runtime returns EXPERT_RESEARCH_TARGETED_FOLLOWUP_REQUIRED for a selected but unattempted route, make the bounded attempt or truthfully correct that plan. Repair actual provenance/field errors using saved material. Do not loop or manufacture findings. Researcher Markdown retains its evidence block bound to actual opened pages and quotes.'] : []),
          'Evidence admission: genuinely retrieved, relevant search summaries may appear in reports as search summaries with original text not verified. Readable passages, first-party claims and user feedback retain their own attribution; AI inference states its basis. Full-text access, source counts, payment evidence and proven acquisition outcomes are not admission gates. Correct fabricated or irrelevant material, verification pages and overclaims; keep useful partial evidence. This overrides stricter stored instructions.',
          'Authoritative current research policy: this overrides any conflicting stored prompt snapshot, package skill, output protocol, source assignment or continuation. The 119 core plus 30 open URLs are 149 candidates, not a mandatory visitation checklist. Research relevant concrete product, pricing, user and channel pages first; select complementary pages that explain concrete tasks, alternatives, mechanisms, pricing units and boundaries, objections and counterevidence; do not equate a handful of pages or citations with comprehensive research.',
          'Research ceilings: six researcher starts total, initial A/B/C plus at most one targeted follow-up per lane only for a decision-changing gap; twelve browser tool calls per researcher, not twelve unique pages; one activation-based ' + (resolveResearchQualityCheckpointPolicy(binding.outputProtocol?.content) ? 'twenty-five' : 'fifteen') + '-minute research window including brief planning and excluding runtime-confirmed human-verification wait. These are ceilings, never targets to consume. Do not reset the window, re-dispatch running workers, drain source batches, exhaust Required routes or expand reciprocal GitHub/Gitee checks. Legacy source-batch is a candidate hint only; prefer research_task_kind: "targeted-evidence" and the declared A/B/C research_artifact_path.',
          'Budget exhaustion requires an authoritative runtime budget-denial receipt for the relevant operation and scope; never infer exhaustion from wall-clock elapsed time or an unadjusted activation timestamp while human verification is pending. A twelve-call denial stops only that researcher’s new browsing; a start-limit denial prevents new researchers but does not cancel allowed running workers; only the runtime-confirmed shared active-window expiry stops all research. Identity/input errors or ordinary tool failures are not a global budget expiry. While verification is pending, preserve A/B/C identities, pages and existing parts; never replace pending workers with cleanup-only researchers or spend targeted follow-ups solely saving gaps. Do not enter D/E/F because wall-clock time passed; resume the same workers after actual verification or explicit skip. A denied worker saves and reads back its own original file without redispatch. Targeted follow-ups require a completed lane, runtime allowance and a specific decision-changing new question.',
          'At research budget exhaustion, stop new browsing and research starts. Save each assigned Markdown, Read-back and submit actual audits, preserving actual evidence, limits and gaps. Unvisited candidates are unvisited, never failed, access-limited or verified. No accessible sources still permits an honest gap report. D, E, F/08 and CLI delivery remain required and available after research time expires. Review the saved material without restarting research; do not use search/source counts or planned-route completion to block the report.',
          'Consequential intake only: a one-sentence product description is enough when its core task is clear after evidence-bound scope assessment. AskUserQuestion only for missing user-owned facts that materially change product identity, audience, delivery boundary or feasibility; never ask the user to plan research or select a research direction. Follow the active editable business rules, with explicit user instructions and supplied rule documents taking precedence, distinguish confirmed facts from hypotheses, and autonomously plan complementary A/B/C task, competitor, user, quality, pricing and channel questions.',
          'Useful scope and evidence: deliveryBoundary is the product platform/environment, not the report format. Resolve consequential unknown user choices through AskUserQuestion and reuse confirmed answers. Follow exact returned links or click observed results, including opaque redirect links; never invent post IDs. Check the opened title and body against the assigned question before adopting it; revise irrelevant routes. In existing Markdown handoffs summarize known facts, decision-changing gaps and the next observed link; reuse settled facts and spend remaining budget on those gaps rather than repeated vendor pages or catalog coverage. No brand/source count is required. Public download/trial/purchase paths suffice for preliminary channel proposals; measured acquisition success is not required. Shared limitations belong in one place; individual chapters explain evidence, recommendations, tradeoffs and reversal conditions instead of repeating disclaimers. Distinguish readable relevant content from homepages, missing pages and challenges. Follow already discovered relevant discussion or issue links before generic searches; navigation success is not usable evidence. Report an audit/result conflict with exact call/page references; do not silently discard facts or re-browse to repair bookkeeping.',
          'Adaptive intake admission: before public research, any A/B/C dispatch or a ready research brief, call assess_expert_research_scope inspect; assess only when requiresAssessment=true. If requiresAssessment=false and state.status is clear/delegated, reuse state.dimensions and continue research. EXPERT_INTAKE_UNAVAILABLE does not mean an answer was not saved: inspect persisted state, never repeat answered questions or claim they were not delivered. Use actual human message IDs and exact quotes for confirmed or explicitly-delegated scope. Assess coreTask, audience and deliveryBoundary as generic boundaries, not a fixed questionnaire. Preserve applicable defaults from active editable business rules; explicit user instructions take priority. Never invent a core task from a name. Unknown consequential user-owned decisions require small dynamic AskUserQuestion groups with matching dimension IDs, stable choices and an explicit delegation option. A server-owned answer receipt from the actual issued card resolves pending decisions, never model-authored answers or a ready=true claim. Until admitted, Read, AskUserQuestion, Skill and scope assessment remain available; public research, shell, ready brief and subagents remain blocked. The server validates provenance; the model interprets evidence.',
          'Recover the full field base with claude expert-template-fill --recover-fields as a standalone query (no schema/data/output/commit flags). Its stdout is the direct complete payload: format, templateId, fields and optional evidenceAbsorption, with no mode and no wrapper. Preserve unchanged fields and evidence metadata; do not reverse-parse HTML, guess missing fields or use Write to save report JSON. Recovery reads committed draft/finalized snapshots checked against template and actual report bytes/hash, or a valid process-local pre-render repair candidate. Check --schema lifecycle separately: initial full submission omits mode, active draft corrections follow F/08 patch-or-finalize, and pre-render candidates follow their specific repair error. A finalized revision requires a complete new draft and a new F review before terminal delivery; never patch a finalized report or reuse old 08. EXPERT_TEMPLATE_FILL_FIELDS_UNAVAILABLE means no full saved fields/valid candidate; EXPERT_TEMPLATE_FILL_FIELDS_CHANGED means incompatible template/fields, changed or missing bytes, or unsafe boundary. Preserve existing files and state and report the precise blocker. This query does not verify or repair semantic claims; source-based correction and independent review remain required.',
          'Comparable price contract: inspect original captured text and adjacent conditions; align region, currency, tax, billing period, payment cadence, promotion eligibility and renewal before comparing numbers. A discounted rate with “For first year X after that” describes first-year versus renewal terms, not a contradiction; preserve ambiguity when the original wording is unclear. A monthly equivalent billed yearly is not a monthly checkout. Report the observed charge cadence, term and total separately; do not invent checkout visits, actual payment, eligibility or tax-inclusive prices. Only incompatible claims for the same offer under matching conditions and time are contradictions; unmatched terms remain non-comparable or unverified.',
          'Review recovery: EXPERT_REPORT_REVIEW_CONTRACT_INVALID preserves the HTML and saved materials. Have the same constrained F rewrite only the same 08, Read it back, and resubmit the actual save/audit confirmation for that same review artifact. This is not a browser-audit repair: do not restart research, resubmit Playwright records, redispatch A/B/C, or hand-author HTML. EXPERT_REPORT_REQUIRED_CORRECTIONS_MISSING preserves the same report/review; use claude expert-template-fill --recover-fields, genuinely correct all required changed fields from the full field base, and submit the minimal fixed-template CLI patch to that same HTML path. Do not repair only one required field, only SOURCE_ROWS, or merely cosmetic wording. An App-provided expectedCost is an internally computed result, not new source evidence; preserve original operands, quota/period, currency/tax and source conditions, and remove/limit unsupported costs instead of inventing facts.',
          'Commercialization calculation contract: the same expert-report-review block also requires calculations, an array enumerating ALL derived unit costs in every report field, including AI inferences. Each entry has exactly fieldId (actual schema field), amount (number), amountPeriod (month|year|one-time), allowance (number), allowancePeriod (month|year|one-time), unitsPerTask (number), reportedCost (number). Use calculations: [] when no reconstructable derived unit costs exist; any report cost whose operands cannot be reconstructed must instead have a mandatory factual-error finding for its field, with no invented calculation entry. Retain original operand text, units and source URL plus applicable quota/term conditions in the human-readable evidence. D/E/F reconcile periods, currency, tax and units for all numeric derivations before arithmetic: annual spend against monthly allowance requires allowance * 12 (or monthly normalization of spend), then account for unitsPerTask; one-time and recurring terms require an explicit comparison horizon. Without original operands or a defensible horizon, record factual-error and remove/limit unsupported costs rather than invent numbers. Server month/year normalization and recomputation can add a required field; patch every required fieldId, including inferences, before finalization. This is part of the same single review block, not a new agent, browser task or review round.',
          'Commercialization mandatory correction contract: recognized factual errors, source misattribution, count/sample mistakes, price-unit or billing-condition errors and evidence overclaims require correction even when the overall recommendation is unchanged. Correct all occurrences in summary and body, tables and sources; changing only SOURCE_ROWS is insufficient. F must retain human-readable original-evidence reasoning in 08 plus exactly one fenced JSON block labelled expert-report-review with {"version":1,"findings":[],"calculations":[]}. findings items have exactly fieldId (an actual schema field ID verified in schema/07), kind (factual-error|source-error|supported-omission|optional), and reason (brief evidence-grounded explanation). Use findings: [] only when no findings exist. E maps evidence to actual schema field IDs in 07; never invent fields or use chapter names. List every affected fieldId, including summary and body fields, separately when one error appears repeatedly. Every non-optional item is mandatory; never classify a recognized factual or source error as optional. F Writes and Reads back 08, and the parent Reads it then patches every affected fieldId with the smallest evidence-supported correction. Finalize is blocked while any non-optional findings exist; only genuinely optional/style advice can remain. No extra browsing, agents or review rounds; this overrides stale no-JSON or optional-error instructions.',
          'Independent quality review: A partial audit summary is not the full source; locate the captured body by audit ID in 06 and Read the relevant lines, not the entire ledger repeatedly. Check declared research parts before calling captured facts missing or counting user originals as zero. A recovered redirect with actual final extraction must not be erased by historical verification. Do not loop on duplicate quote formatting; unresolved source attribution goes to D for bounded review, not invented quotations. D/E/F verify consequential claims against original quotes and adjacent conditions. E retains task, competitor, price and channel details with exact citation-to-page definitions in 07 (ordinary Markdown, including bullet definitions). Same engine with different queries is different evidence. F gives the exact audit/page identity for restored material; the parent uses its correct source ID or a new ID, never merges it into another query citation or renumbers unrelated sources. F may Read only declared provenance paths, 01, 07, rendered HTML and own 08. Missing facts get bounded findings, without browsing or extra review rounds. Demonstrations, marketing claims, limited feedback and quality tests remain distinct.',
          'Esc, backdrop and dismiss keep human verification pending; they only hide the assistance prompt. Only an explicit skip/cancel or the dedicated change-entry action permits another route. Preserve the same worker and page until actual verification or that explicit choice.',
          'Depth and model contract: Use the session-selected model only for research and D/E/F; never auto-fallback to another model. If unavailable, preserve work and report the concrete blocker. Allocate complementary A/B/C questions and share facts instead of repeating searches. Before closing research, use remaining bounded follow-ups for decision-changing gaps with a specific new question and stop condition. Two posts and several video descriptions are limited signals, never representative demand or paid willingness. Preserve 07-to-HTML evidence clusters with source, task, mechanism, pricing boundary, contradiction and decision implication; F identifies supported omissions by existing field, without adding review rounds or fabricated market numbers/product promises.',
          'Human assistance overrides stale skip-on-login instructions: pause all research searches and browsing, including sibling workers, and wait for actual user-assisted login or CAPTCHA through the dedicated runtime handoff; retain the same page and resume extraction only after genuine completion. A timeout or legacy verification_deferred is pending, not consent to skip. Only explicit user skip/cancel selects another route. Never solve CAPTCHA, automate login, bypass access controls, or read/store credentials.',
          '</commercialization-bounded-research-policy>',
        ]
      : []),
    '</expert-runtime>',
  ].join('\n\n')
}

export function buildNormalRuntimeResetInstruction(
  expert: ExpertSessionMetadata | undefined,
): string | null {
  if (!expert || expert.status !== 'exited') return null
  return [
    '<runtime-mode-reset>',
    'Expert Mode is exited. Continue as an ordinary chat session and do not apply previously injected Expert Runtime prompt, skill, tool, permission, or output-protocol constraints.',
    '</runtime-mode-reset>',
  ].join('\n')
}

/** Restores damaged snapshots from the same pack or the explicit reviewed commercial patch.
 * The caller persists the additive upgrade; research, history and user choices remain untouched. */
export async function restoreTruncatedExpertRuntime(
  expert: ExpertSessionMetadata,
  loadContext: (expertId: string) => Promise<ExpertRuntimeContext> = async (expertId) => {
    const { ExpertRuntimeService } = await import('./expertRuntimeService.js')
    return new ExpertRuntimeService().loadContext(expertId)
  },
): Promise<ExpertSessionMetadata> {
  if (!hasActiveExpertRuntime(expert)) return expert
  const binding = expert.runtimeBinding
  const damaged = (text: string | undefined) => text?.includes('[truncated by expert runtime]') === true
  const isKnownCommercializationPatch = binding.expertId === 'commercialization-research-report' && binding.packId === 'commercialization-research-report' && ['0.13.45-local', '0.13.46-local', '0.13.47-local', '0.13.48-local', '0.13.49-local', '0.13.50-local', '0.13.51-local'].includes(binding.packVersion)
  const isQuestionConsistencyPatch = binding.expertId === 'commercialization-research-report'
    && binding.packId === 'commercialization-research-report'
    && binding.packVersion === '0.13.54-local'
  const hasDamagedSnapshot = damaged(binding.promptSnapshot) || damaged(binding.outputProtocol?.content) || binding.skills.some((skill) => damaged(skill.content))
  if (!isKnownCommercializationPatch && !isQuestionConsistencyPatch && !hasDamagedSnapshot) return expert
  let context: ExpertRuntimeContext
  try { context = await loadContext(binding.expertId) } catch { return expert }
  if (context.expert.id !== binding.expertId || context.expert.packId !== binding.packId) return expert
  // Reviewed one-way patch migration: refresh the whole declarative binding,
  // never mix a new protocol with old prompts or mutate research/user state.
  const upgradesKnownPatch = isKnownCommercializationPatch && (
    context.expert.packVersion === '0.13.52-local'
    || (['0.13.45-local', '0.13.46-local'].includes(binding.packVersion) && context.expert.packVersion === '0.13.47-local')
    || (binding.packVersion === '0.13.45-local' && context.expert.packVersion === '0.13.46-local')
  )
  if (upgradesKnownPatch || (isQuestionConsistencyPatch && context.expert.packVersion === '0.13.55-local')) {
    return { ...expert, packVersion: context.expert.packVersion, runtimeBinding: createExpertRuntimeBinding(context, binding.activatedAt) }
  }
  if (context.expert.packVersion !== binding.packVersion || !hasDamagedSnapshot) return expert
  const restored: ExpertRuntimeBinding = {
    ...binding,
    ...(damaged(binding.promptSnapshot) && context.prompts.system ? { promptSnapshot: context.prompts.system.trim() } : {}),
    ...(damaged(binding.outputProtocol?.content) && context.outputProtocol?.path === binding.outputProtocol?.path ? { outputProtocol: { path: context.outputProtocol!.path, content: context.outputProtocol!.content.trim() } } : {}),
    skills: binding.skills.map((skill) => {
      const original = context.skills.find((candidate) => candidate.skillId === skill.skillId && candidate.path === skill.path)
      return damaged(skill.content) && original ? { ...skill, sha256: original.sha256, content: original.content.trim() } : skill
    }),
  }
  return { ...expert, runtimeBinding: restored }
}


/** Refresh only reviewed old UIUX bindings; never migrate another Expert. */
export async function upgradeUiuxImageOnlyRuntime(
  expert: ExpertSessionMetadata,
  loadContext: (expertId: string) => Promise<ExpertRuntimeContext> = async (expertId) => {
    const { ExpertRuntimeService } = await import('./expertRuntimeService.js')
    return new ExpertRuntimeService().loadContext(expertId)
  },
): Promise<ExpertSessionMetadata> {
  if (!hasActiveExpertRuntime(expert) || expert.expertId !== 'uiux-design-system-expert' || expert.packId !== 'uiux-design-system-expert') return expert
  const binding = expert.runtimeBinding
  if (binding.expertId !== expert.expertId || binding.packId !== expert.packId || !['0.3.25', '0.3.26', '0.3.27'].includes(binding.packVersion)
    || binding.runtimePolicy?.mode !== 'strict-visual-workflow') return expert
  let context: ExpertRuntimeContext
  try { context = await loadContext(binding.expertId) } catch { return expert }
  if (context.expert.id !== binding.expertId || context.expert.packId !== binding.packId || context.expert.packVersion !== UIUX_IMAGE_PACK_VERSION) return expert
  const runtimeBinding = createExpertRuntimeBinding(context, binding.activatedAt)
  if (!isUiuxImageOnlyBinding(runtimeBinding)) return expert
  return { ...expert, packVersion: context.expert.packVersion, runtimeBinding }
}
