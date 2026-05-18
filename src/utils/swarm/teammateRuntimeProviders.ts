import { createHash } from 'crypto'
import { ProviderService } from '../../server/services/providerService.js'
import type { SavedProvider } from '../../server/types/provider.js'
import {
  CLAUDE_HAIKU_4_5_CONFIG,
  CLAUDE_OPUS_4_6_CONFIG,
  CLAUDE_SONNET_4_6_CONFIG,
} from '../model/configs.js'

type RuntimeModelEntry = readonly [role: string, modelId: string | undefined]

const officialTeammateRuntimeModels = [
  ['opus', CLAUDE_OPUS_4_6_CONFIG.firstParty],
  ['sonnet', CLAUDE_SONNET_4_6_CONFIG.firstParty],
  ['haiku', CLAUDE_HAIKU_4_5_CONFIG.firstParty],
] as const satisfies readonly RuntimeModelEntry[]

function quoteRuntimeValue(value: string | null): string {
  return value === null ? 'null' : JSON.stringify(value)
}

function formatRuntimeModelChoices(entries: readonly RuntimeModelEntry[]): string {
  const rolesByModel = new Map<string, string[]>()

  for (const [role, modelId] of entries) {
    const normalized = modelId?.trim()
    if (!normalized) continue
    const roles = rolesByModel.get(normalized) ?? []
    roles.push(role)
    rolesByModel.set(normalized, roles)
  }

  if (rolesByModel.size === 0) {
    return 'no models configured'
  }

  return Array.from(rolesByModel.entries())
    .map(
      ([modelId, roles]) =>
        `model_id=${quoteRuntimeValue(modelId)} (${roles.join('/')})`,
    )
    .join(', ')
}

function formatProviderRuntimeLine(
  provider: Pick<SavedProvider, 'id' | 'name' | 'models'>,
  activeId: string | null,
): string {
  const modelChoices = formatRuntimeModelChoices([
    ['main', provider.models.main],
    ['haiku', provider.models.haiku],
    ['sonnet', provider.models.sonnet],
    ['opus', provider.models.opus],
  ])
  const active = provider.id === activeId ? ' (active)' : ''
  return `- provider_name=${quoteRuntimeValue(provider.name)}${active}: provider_id=${quoteRuntimeValue(provider.id)}; ${modelChoices}`
}

export function buildTeammateRuntimeProviderContent({
  providers,
  activeId,
}: {
  providers: Array<Pick<SavedProvider, 'id' | 'name' | 'models'>>
  activeId: string | null
}): string {
  const officialActive = activeId === null ? ' (active)' : ''
  const lines = [
    '## Teammate runtime providers',
    'When spawning a teammate with `Agent` (`name`/`team_name`), you may set `provider_id` and `model_id` to choose that teammate runtime.',
    'Use exactly one provider_id/model_id pair listed here. If provider_id is set, model_id is required. For provider_id=null, pass JSON null rather than the string "null". Provider secrets, URLs, and notes are intentionally not shown.',
    `- provider_name="Claude official"${officialActive}: provider_id=null; ${formatRuntimeModelChoices(officialTeammateRuntimeModels)}`,
  ]

  if (providers.length > 0) {
    lines.push(
      ...providers.map(provider => formatProviderRuntimeLine(provider, activeId)),
    )
  } else {
    lines.push('- No custom providers are configured.')
  }

  return lines.join('\n')
}

export async function getTeammateRuntimeProviderRoster(): Promise<{
  content: string
  fingerprint: string
}> {
  const { providers, activeId } = await new ProviderService().listProviders()
  const content = buildTeammateRuntimeProviderContent({ providers, activeId })
  const fingerprint = createHash('sha256').update(content).digest('hex')

  return { content, fingerprint }
}
