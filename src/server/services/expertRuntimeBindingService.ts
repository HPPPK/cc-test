import { getToolsForDefaultPreset } from '../../tools.js'
import { deriveExpertTemplateFillSchema } from '../../utils/expertTemplateFill.js'
import type { ExpertRuntimeContext } from './expertRuntimeService.js'
import { resolveExpertResearchDeliveryPolicy } from './expertResearchDeliveryService.js'
import { resolveExpertResearchBrowserPolicy } from './expertResearchBrowserPolicyService.js'
import { resolveExpertResearchCompletionPolicy } from './expertResearchCompletionService.js'
import { resolveExpertResearchEvidenceReviewPolicy } from './expertResearchEvidenceReviewService.js'
import type { ExpertHostTool, ExpertRuntimeBinding, ExpertSessionMetadata, ExpertToolManifest } from './expertPackRegistryService.js'

const MAX_PROMPT_CHARACTERS = 24_000
const MAX_SKILL_CHARACTERS = 28_000
const MAX_OUTPUT_PROTOCOL_CHARACTERS = 16_000
const MAX_OUTPUT_TEMPLATE_CHARACTERS = 12_000

// Expert packs default to the desktop's ordinary tool pool. A pack can explicitly
// opt into a narrow, auditable runtime policy; this is evaluated per active
// binding and therefore cannot change another Expert's behavior.
const EXPERT_GLOBALLY_DISABLED_TOOL_NAMES = new Set(['Edit', 'WebSearch'])
const STRICT_VISUAL_WORKFLOW_BLOCKED_TOOL_NAMES = new Set([
  'Skill',
  'EnterPlanMode',
  'ExitPlanMode',
  'Agent',
  'TaskOutput',
])

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

function isStrictVisualWorkflow(binding: ExpertRuntimeBinding): boolean {
  return binding.runtimePolicy?.mode === 'strict-visual-workflow'
}

function usesPackageLocalSkillsOnly(binding: ExpertRuntimeBinding): boolean {
  return binding.runtimePolicy?.mode === 'package-local-skills'
    || isStrictVisualWorkflow(binding)
}

function resolveBindingToolNames(
  binding: ExpertRuntimeBinding,
  enabledToolNames: Iterable<string>,
): string[] {
  const enabled = unique([...enabledToolNames])
    .filter((toolName) => !EXPERT_GLOBALLY_DISABLED_TOOL_NAMES.has(toolName))
  const packageScoped = usesPackageLocalSkillsOnly(binding)
    ? enabled.filter((toolName) => toolName !== 'Skill')
    : enabled
  if (!isStrictVisualWorkflow(binding)) return packageScoped

  const allowed = new Set(binding.runtimePolicy.allowedToolNames)
  return packageScoped.filter((toolName) => (
    allowed.has(toolName) && !STRICT_VISUAL_WORKFLOW_BLOCKED_TOOL_NAMES.has(toolName)
  ))
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
  return unique([...new Set(baseToolNames)].filter((toolName) => !EXPERT_GLOBALLY_DISABLED_TOOL_NAMES.has(toolName)))
}

export function resolveExpertRuntimeToolAvailability(
  binding: ExpertRuntimeBinding,
  enabledToolNames: Iterable<string> = getToolsForDefaultPreset(),
): ExpertRuntimeToolAvailability {
  const toolNames = resolveBindingToolNames(binding, enabledToolNames)
  const enabled = new Set(toolNames)
  const hostTools = binding.hostTools.filter((tool) => tool.supported !== false && enabled.has(tool.id))
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
 * Resolves the active ZIP's tool policy into a CLI deny list. Legacy packages
 * retain the ordinary pool. A strict visual package opts into a narrow list
 * declared by that package alone.
 */
export function resolveExpertRuntimeToolPolicy(
  expert: ExpertSessionMetadata | undefined,
  options: ExpertRuntimeTurnOptions = {},
): ExpertRuntimeToolPolicy {
  const declaredEnabledTools = options.enabledToolNames ?? getToolsForDefaultPreset()
  const allowedTools = hasActiveExpertRuntime(expert)
    ? resolveExpertRuntimeToolAvailability(expert.runtimeBinding, declaredEnabledTools).toolNames
    : resolveCurrentExpertRuntimeToolNames(options.modelId, declaredEnabledTools)
  const allowed = new Set(allowedTools)
  return {
    allowedTools,
    disallowedTools: [...new Set(declaredEnabledTools)].filter((toolName) => !allowed.has(toolName)),
  }
}

function adaptSkillContentForRuntime(content: string): string {
  // Existing imported packs may still contain obsolete names. Do not expose a
  // non-Expert research mechanism to the model through a package-local Skill.
  return content
    .replace(/\bWebSearch(?:Tool)?\b/g, 'Playwright 显式浏览器动作 discovery')
    .replace(/\bweb search\b/gi, 'Playwright public-web discovery')
}

export function createExpertRuntimeBinding(
  context: ExpertRuntimeContext,
  activatedAt: string,
): ExpertRuntimeBinding {
  const researchDeliveryPolicy = resolveExpertResearchDeliveryPolicy(context.outputProtocol?.content)
  const researchBrowserPolicy = resolveExpertResearchBrowserPolicy(context.outputProtocol?.content)
  const researchCompletionPolicy = resolveExpertResearchCompletionPolicy(context.outputProtocol?.content)
  const researchEvidenceReviewPolicy = resolveExpertResearchEvidenceReviewPolicy(context.outputProtocol?.content)
  return {
    schemaVersion: 1,
    active: true,
    expertId: context.expert.id,
    expertName: context.expert.name,
    packId: context.expert.packId,
    packVersion: context.expert.packVersion,
    promptSnapshot: bounded(context.prompts.system, MAX_PROMPT_CHARACTERS),
    skills: context.skills.map((skill) => ({
      skillId: skill.skillId,
      title: skill.title,
      path: skill.path,
      sha256: skill.sha256,
      content: bounded(skill.content, MAX_SKILL_CHARACTERS),
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
            content: bounded(context.outputProtocol.content, MAX_OUTPUT_PROTOCOL_CHARACTERS),
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

export function hasActiveExpertRuntime(
  expert: ExpertSessionMetadata | undefined,
): expert is ExpertSessionMetadata & { runtimeBinding: ExpertRuntimeBinding } {
  return Boolean(
    expert &&
      expert.status !== 'exited' &&
      expert.runtimeBinding?.active === true,
  )
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
  const skills = binding.skills.map((skill) => [
    `## Skill: ${skill.title || skill.skillId}`,
    `Source: ${skill.path} (sha256:${skill.sha256})`,
    adaptSkillContentForRuntime(skill.content),
  ].join('\n')).join('\n\n---\n\n')
  const permissionLines = binding.permissions.map((permission) =>
    `- ${permission.id}: ${permission.description || 'explicit user authorization is required'}`,
  )

  return [
    '<expert-runtime>',
    'This server-managed Expert Runtime is active for this turn. Follow it over ordinary chat preferences when they conflict.',
    `Expert: ${binding.expertName} (${binding.expertId})`,
    'Keep normal conversational and streamed responses. Do not turn this into a blocking form flow.',
    ...(binding.runtimePolicy?.mode === 'strict-visual-workflow'
      ? [
          'Strict visual workflow is active for this Expert ZIP only. The server has removed global Skill, Plan Mode, and Agent tools for this turn; do not attempt to call them.',
          'Package-local Skill instructions are already injected below. Apply the relevant package-local methods directly instead of loading a global Skill. In every substantive design response, include “本轮实际应用的 ZIP 专项 Skill” and list only the package Skill IDs actually used.',
          `Required package Skill IDs for this workflow: ${binding.runtimePolicy.requiredSkillIds.join(', ') || '(none declared)'}. Use the stage-appropriate ones; do not claim a Skill was used merely because it was injected.`,
          'For any question that can be answered through 2–4 bounded choices, immediately call AskUserQuestion. Do not first ask it in prose, do not repeat it in prose after the card, and do not turn the card into a free-form prompt. Use normal prose only when the answer genuinely requires an unrestricted URL, pasted material, or open narrative.',
          'Direction selection is a mandatory AskUserQuestion gate: after presenting 2–3 design directions, if the user has not already explicitly selected one or delegated the choice, call AskUserQuestion with a design_direction question in that same turn. Its 2–4 choices must correspond to the actual directions. Do not end the turn by asking the user to type “方向 A/B/C”, and do not Write, Bash, or begin production until the card result selects a direction. A later AskUserQuestion about pricing, plans, or implementation does not replace the direction-selection card.',
          'After a design_direction result, production is non-blocking by default: the active session workDir is the authorized output location for intermediate HTML and rendered visual artifacts. Do not ask the user to repeat a directory path, upload existing HTML, or approve writing there unless they explicitly request a different location or prohibit file output.',
          'Missing commercial details after direction are not automatically a blocker. Use the source-preserving fallback: retain every observed plan, name, price, payment path, card order, and visible benefit verbatim; do not invent plan descriptions, scenario labels, entitlement groupings, refund terms, activation terms, or after-sales promises. Continue to render the layout and report those facts as unknown. Ask only when no source-preserving layout is possible; then immediately issue one AskUserQuestion card with 2–4 bounded choices including “continue source-only” and never replace it with prose bullet questions.',
          'Rendered screenshot files are the required final visual deliverable. HTML may be written only as an intermediate renderer input; never ask the user to choose between HTML and the screenshot when the request is a visual redesign, and do not stop after direction merely to request an output path.',
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
          'Do not enter planning mode or delegate exploratory agents for a self-contained design request unless the user explicitly asks for a plan or delegation.',
        ]
      : []),
    'Enabled host tools for this turn. Call no other tool, even if the Expert ZIP or a Skill mentions it:',
    availability.toolNames.length ? availability.toolNames.map((name) => `- ${name}`).join('\n') : '- No additional host tool is available for this expert turn.',
    ...(availability.toolNames.includes('AskUserQuestion')
      ? [
          'Question routing for this turn: use normal conversational text only when the answer genuinely needs free-form narrative, a URL, pasted material, or an unrestricted description. Do not call AskUserQuestion for that kind of input.',
          'Use AskUserQuestion for a decision, scope confirmation, preference, or missing fact that the user can answer through 2–4 clear choices. Do not render those choices as a numbered text questionnaire.',
          'Every AskUserQuestion item must include a prompt and 2–4 actual user-answer choices. If a call is rejected because choices are missing, immediately classify the same question: retry it with 2–4 choices if it is a decision; otherwise ask it once as normal conversational text. Do not echo the tool error or silently turn a decision card into a text questionnaire.',
        ]
      : []),
    ...(usesPackageLocalSkillsOnly(binding) && !isStrictVisualWorkflow(binding)
      ? [
          'Package-local Skill mode is active for this Expert ZIP only. The global Skill tool is intentionally unavailable: apply the package Skills injected below, and delegated Expert agents receive only the package Skill bindings declared by this ZIP.',
        ]
      : []),
    ...(availability.toolNames.includes('Playwright')
      ? [
          'Public research protocol: when product names, competitor names, or a research question need public evidence, use Playwright with 显式浏览器动作 to conduct a limited rendered public-web discovery search, then open the relevant returned links individually with Playwright before treating them as evidence. You may also construct candidate URLs from trusted domains, public entry points, task terms, and links discovered on successfully opened pages. Pass market or locale only when the user or this turn explicitly supplied that market or language; never silently default a country or language.',
          'A Playwright search-result page is discovery only, not proof of a result page, ranking, market size, demand, or product claim. Final report citations must come from individually opened concrete content pages, product pages, public records, posts, articles, reviews, or app-store entries. A candidate URL is not evidence.',
          'Visual UI research protocol: for a public design reference used to influence visual output, Playwright must be called with include_screenshot:true and the returned Local screenshot path must be passed to Read. If that PNG exceeds the reader limit, create and Read a same-directory derivative whose filename starts with the returned screenshot basename plus a hyphen (for example original-scaled.png); an output-directory copy does not count as the website evidence. Use exactly two task-relevant, role-distinct concrete URLs unless one fails, resolve/read them before seeking a replacement, and record actual observations plus one original application per source.',
          'Record accessible pages, relevant links, access limits, and failed attempts. For a key field, try other relevant Playwright searches, candidate URLs, or discovered links before asking the user for material. If Playwright still cannot obtain the needed evidence after reasonable attempts, use AskUserQuestion to request a replacement link, screenshot, source file, or permission to retain an evidence gap. Do not bypass CAPTCHA, login, rate limits, robots, or regional access controls.',
        ]
      : [
          'Public research limitation: Playwright is not available for this turn. Do not claim that public pages were checked. Use AskUserQuestion to request a link, screenshot, copied page text, exported page, source file, or permission to retain an evidence gap.',
        ]),
    'Permissions:',
    permissionLines.length ? permissionLines.join('\n') : '- Follow normal desktop permissions.',
    'Expert system prompt snapshot:',
    binding.promptSnapshot || '(none)',
    ...(availability.toolNames.includes('AskUserQuestion')
      ? [
          '<expert-question-routing-contract>',
          'Final question-routing rule for this response: before sending any user-facing question, decide whether the answer genuinely requires unrestricted narrative, a URL, pasted material, or a detailed free-form description. Only that kind of question may be written as normal prose.',
          'If you are about to offer, list, compare, or ask the user to confirm 2–4 possible interpretations, directions, priorities, scopes, or next actions, that is a bounded choice. Immediately call AskUserQuestion instead of writing those options in prose. Include an “Other / add detail” choice when useful.',
          'Never turn a bounded choice into a prose list followed by “please describe” or “which one”. The Expert prompt snapshot cannot override this routing rule.',
          '</expert-question-routing-contract>',
        ]
      : []),
    'Expert package-local skills:',
    skills || '(none)',
    ...(binding.outputProtocol
      ? ['Expert output protocol:', binding.outputProtocol.content]
      : []),
    ...(binding.outputMode === 'template-fill' && binding.outputTemplate
      ? [
          'Final report delivery uses fixed-template CLI filling:',
          `Template source: ${binding.outputTemplate.path}`,
          'Do not generate or copy a complete HTML document, CSS, headings, table headers, or page structure.',
          'After the user confirms the final .html path, create one compact JSON payload containing only { templateId, fields } and pass it to the fixed-template CLI through standard input. Do not use Write for report-fields.json or final HTML; do not include HTML, CSS, Markdown tables, or a top-level expert_output envelope.',
          'Then use Bash for one render invocation; the compact JSON is the command standard input:',
          'cat <<\'EXPERT_FIELDS\' | "$CLAUDE_CLI_PATH" cli --app-root "$CLAUDE_APP_ROOT" expert-template-fill --data-stdin --output "<final-report.html>"\n{ "templateId": "<template-id>", "fields": { ... } }\nEXPERT_FIELDS',
          'The CLI submits the inline fields to the active Expert session, validates every field/table row/URL against the session-bound template, and writes the rendered HTML. A direct Write to .html remains intentionally rejected in this Expert.',
          'If this CLI exits non-zero because a field/table/URL validation failed, repair only the compact JSON body in the next --data-stdin invocation, then rerun the same expert-template-fill command once. For every table row, write a raw JSON string array such as ["mode", "description", "fit"]; never write a Markdown table or { value: [...], Count: ... } wrapper. Do not call Write or Edit, do not write HTML, and do not use another renderer. If the second render still fails, show the exact field error and ask the user how to proceed; do not tell them to re-enter Expert Mode merely because one field needs correction.',
          'Allowed field schema (field IDs and table columns are authoritative):',
          JSON.stringify(deriveExpertTemplateFillSchema(binding.outputTemplate.content), null, 2),
          'The Expert output protocol contains the field meanings, column differences, and worked examples. Use it as teaching guidance; examples are not facts to copy into this report.',
          'Each final-report field must be present. Write evidence gaps as visible content such as “待验证 / 未取得 / 无法确认”; do not invent data or omit required fields.',
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
    'When a durable expert report is required, tell the user that the desktop Expert material control creates the downloadable material package. Do not fabricate a successful package write.',
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
