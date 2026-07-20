import type { ExpertRuntimeContext } from './expertRuntimeService.js'
import type { ExpertSessionMetadata, ExpertRuntimeBinding } from './expertPackRegistryService.js'

const MAX_PROMPT_CHARACTERS = 24_000
const MAX_SKILL_CHARACTERS = 28_000
const MAX_OUTPUT_PROTOCOL_CHARACTERS = 12_000

function bounded(value: string | undefined, limit: number): string {
  const normalized = value?.trim() ?? ''
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 32)).trimEnd()}\n[truncated by expert runtime]`
}

export function createExpertRuntimeBinding(
  context: ExpertRuntimeContext,
  activatedAt: string,
): ExpertRuntimeBinding {
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
    hostTools: context.hostTools.map((tool) => ({ ...tool })),
    tools: context.expert.tools.map((tool) => ({
      ...tool,
      permissions: tool.permissions.map((permission) => ({ ...permission })),
    })),
    permissions: context.permissions.map((permission) => ({ ...permission })),
    ...(context.outputProtocol
      ? {
          outputProtocol: {
            path: context.outputProtocol.path,
            content: bounded(context.outputProtocol.content, MAX_OUTPUT_PROTOCOL_CHARACTERS),
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
  expert: ExpertSessionMetadata,
): string | null {
  if (!hasActiveExpertRuntime(expert)) return null
  const binding = expert.runtimeBinding
  const skills = binding.skills.map((skill) => [
    `## Skill: ${skill.title || skill.skillId}`,
    `Source: ${skill.path} (sha256:${skill.sha256})`,
    skill.content,
  ].join('\n')).join('\n\n---\n\n')
  const toolNames = binding.tools
    .map((tool) => tool.hostToolId || tool.name || tool.id)
    .filter(Boolean)
  const permissionLines = binding.permissions.map((permission) =>
    `- ${permission.id}: ${permission.description || 'explicit user authorization is required'}`,
  )

  return [
    '<expert-runtime>',
    'This server-managed Expert Runtime is active for this turn. Follow it over ordinary chat preferences when they conflict.',
    `Expert: ${binding.expertName} (${binding.expertId})`,
    'Keep normal conversational and streamed responses. Do not turn this into a blocking form flow.',
    'Use the normal host tools exposed by the desktop runtime. The following expert tool declarations are authoritative; do not claim that an undeclared package tool executed:',
    toolNames.length ? toolNames.map((name) => `- ${name}`).join('\n') : '- No extra expert tools declared.',
    'Permissions:',
    permissionLines.length ? permissionLines.join('\n') : '- Follow normal desktop permissions.',
    'Expert system prompt snapshot:',
    binding.promptSnapshot || '(none)',
    'Expert package-local skills:',
    skills || '(none)',
    ...(binding.outputProtocol
      ? ['Expert output protocol:', binding.outputProtocol.content]
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
