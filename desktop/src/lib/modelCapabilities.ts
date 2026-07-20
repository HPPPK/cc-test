export type DesktopModelCapabilities = {
  textInput: boolean
  imageInput: boolean
  audioInput: boolean
  videoInput: boolean
  fileTextInput: boolean
  pdfInput: boolean
  toolCalling: boolean
  structuredOutput: boolean
  jsonMode: boolean
  longContext: boolean
  codeReasoning: boolean
}

export type DesktopModelCapabilityDefinition = {
  provider: string | null
  modelId: string
  capabilities: DesktopModelCapabilities
  source: 'registry' | 'provider-metadata' | 'provider-default' | 'custom' | 'unknown'
}

export const DEFAULT_DESKTOP_MODEL_CAPABILITIES: DesktopModelCapabilities = {
  textInput: true,
  imageInput: false,
  audioInput: false,
  videoInput: false,
  fileTextInput: true,
  pdfInput: false,
  toolCalling: true,
  structuredOutput: false,
  jsonMode: false,
  longContext: false,
  codeReasoning: true,
}

const VISION_CAPABILITIES: DesktopModelCapabilities = {
  ...DEFAULT_DESKTOP_MODEL_CAPABILITIES,
  imageInput: true,
  pdfInput: true,
  structuredOutput: true,
  jsonMode: true,
  longContext: true,
}

const TEXT_CAPABILITIES: DesktopModelCapabilities = {
  ...DEFAULT_DESKTOP_MODEL_CAPABILITIES,
  structuredOutput: true,
  jsonMode: true,
  longContext: true,
}

const REGISTRY = [
  { provider: 'official', modelId: 'claude-opus-4-7', capabilities: VISION_CAPABILITIES },
  { provider: 'official', modelId: 'claude-sonnet-4-6', capabilities: VISION_CAPABILITIES },
  { provider: 'official', modelId: 'claude-haiku-4-5', capabilities: VISION_CAPABILITIES },
  { provider: 'openai', modelId: 'gpt-5.5', capabilities: VISION_CAPABILITIES },
  { provider: 'deepseek', modelId: 'deepseek-chat', capabilities: TEXT_CAPABILITIES },
] as const

export const UNSUPPORTED_IMAGE_INPUT_MESSAGE =
  '当前选择的模型不支持直接看图片。你可以：1. 换成支持图片的模型（推荐）2. 上传图片但先用工具转成文字说明3. 不上传图片，改用文字描述'

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function getDesktopModelCapability(provider: string | null | undefined, modelId: string | null | undefined): DesktopModelCapabilityDefinition {
  const normalizedProvider = normalize(provider ?? 'official') || 'official'
  const normalizedModel = normalize(modelId)
  const match = REGISTRY.find((entry) => entry.provider === normalizedProvider && entry.modelId === normalizedModel)
  if (match) {
    return {
      provider: match.provider,
      modelId: match.modelId,
      capabilities: { ...match.capabilities },
      source: 'registry',
    }
  }
  return {
    provider: provider ?? null,
    modelId: modelId ?? '',
    capabilities: { ...DEFAULT_DESKTOP_MODEL_CAPABILITIES },
    source: 'unknown',
  }
}

export function isImageLikeAttachment(value: { type?: string; mimeType?: string; name?: string; path?: string } | null | undefined): boolean {
  if (!value) return false
  if (value.type === 'image') return true
  if (value.mimeType?.toLowerCase().startsWith('image/')) return true
  const name = (value.name || value.path || '').toLowerCase()
  return /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|svg)$/.test(name)
}

export type DesktopModelCapabilityRequirements = {
  required?: Record<string, boolean> | string[]
  optional?: Record<string, boolean> | string[]
}

function normalizeRequirementSet(value: Record<string, boolean> | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, expected]) => expected === true ? [key] : [])
}

export function evaluateDesktopModelRequirements(
  capabilities: DesktopModelCapabilities,
  requirements: DesktopModelCapabilityRequirements | null | undefined,
): { ok: boolean; blockers: string[]; warnings: string[] } {
  const required = normalizeRequirementSet(requirements?.required)
  const optional = normalizeRequirementSet(requirements?.optional)
  return {
    ok: required.every((capability) => capabilities[capability as keyof DesktopModelCapabilities] === true),
    blockers: required.filter((capability) => capabilities[capability as keyof DesktopModelCapabilities] !== true),
    warnings: optional.filter((capability) => capabilities[capability as keyof DesktopModelCapabilities] !== true),
  }
}
