import type {
  WorkflowSkillBinding,
  WorkflowSkillBindingMode,
  WorkflowSkillBindingResolution,
} from './workflowTypes.js'

export const WORKFLOW_SUPERPOWERS_SKILL_IDS = [
  'superpowers:brainstorming',
  'superpowers:writing-plans',
  'superpowers:systematic-debugging',
  'superpowers:test-driven-development',
  'superpowers:requesting-code-review',
  'superpowers:verification-before-completion',
  'superpowers:finishing-a-development-branch',
] as const

const DEFAULT_BINDING_MODE: WorkflowSkillBindingMode = 'native-if-installed-else-fallback-contract'

const FALLBACK_CONTRACTS: Record<string, string> = {
  'superpowers:brainstorming': 'Clarify intent, propose 2-3 options, recommend one, write the design/spec artifact, and do not code.',
  'superpowers:writing-plans': 'Plan in small batches with target files, validation, and stop conditions. Do not leave vague TODO or TBD items.',
  'superpowers:systematic-debugging': 'Reproduce first, gather evidence, identify root cause, and do not fix before evidence exists.',
  'superpowers:test-driven-development': 'Create or update a failing test or reproduction check first, implement minimally, then verify.',
  'superpowers:requesting-code-review': 'Review changed files against the spec, plan, or debug report and block critical issues.',
  'superpowers:verification-before-completion': 'Require fresh verification evidence before completion.',
  'superpowers:finishing-a-development-branch': 'Summarize changes, verification, risks, and next actions.',
}

export type WorkflowSkillRegistryInput = {
  installedSkillIds?: Set<string>
  allowFallbackContracts?: boolean
}

export function normalizeWorkflowSkillBinding(binding: string | WorkflowSkillBinding): WorkflowSkillBinding {
  if (typeof binding === 'string') {
    return { id: binding, mode: DEFAULT_BINDING_MODE }
  }
  return {
    id: binding.id,
    mode: binding.mode ?? DEFAULT_BINDING_MODE,
  }
}

export function resolveWorkflowSkillBindings(
  bindings: Array<string | WorkflowSkillBinding> | undefined,
  input: WorkflowSkillRegistryInput = {},
): WorkflowSkillBindingResolution[] {
  if (!bindings?.length) return []

  const installed = input.installedSkillIds ?? new Set<string>()
  const allowFallbackContracts = input.allowFallbackContracts ?? true
  return bindings
    .map(normalizeWorkflowSkillBinding)
    .filter((binding) => typeof binding.id === 'string' && binding.id.length > 0)
    .map((binding) => resolveBinding(binding, installed, allowFallbackContracts))
}

function resolveBinding(
  binding: WorkflowSkillBinding,
  installedSkillIds: Set<string>,
  allowFallbackContracts: boolean,
): WorkflowSkillBindingResolution {
  const mode = binding.mode ?? DEFAULT_BINDING_MODE

  if (mode === 'disabled') {
    return {
      id: binding.id,
      mode,
      availability: 'disabled',
    }
  }

  const nativeAvailable = installedSkillIds.has(binding.id)
  if (nativeAvailable && (mode === 'native-if-installed' || mode === 'native-if-installed-else-fallback-contract')) {
    return {
      id: binding.id,
      mode,
      availability: 'native',
    }
  }

  if (allowFallbackContracts && (mode === 'fallback-contract' || mode === 'native-if-installed-else-fallback-contract')) {
    return {
      id: binding.id,
      mode,
      availability: 'fallback',
      fallbackContract: FALLBACK_CONTRACTS[binding.id] ?? 'Use the workflow phase contract as the local fallback. Do not claim a native skill was used.',
    }
  }

  return {
    id: binding.id,
    mode,
    availability: 'disabled',
  }
}
