import { baselineCases } from './baseline/cases'
import type { BaselineTarget, LaneDefinition, QualityGateMode } from './types'

export function lanesForMode(mode: QualityGateMode, baselineTargets: BaselineTarget[] = []): LaneDefinition[] {
  // Lanes are defined in execution order for each mode:
  // PR mode: impact-report -> policy-checks -> area checks -> coverage -> heavy checks
  // Fast mode: impact-report -> policy-checks -> core-smoke -> fast-lane-tests
  // Baseline/Release: impact-report -> policy-checks -> coverage (full) -> heavy checks -> baseline cases -> live smokes
  const lanes: LaneDefinition[] = [
    // === Layer 1: Scope and Governance (always first) ===
    {
      id: 'impact-report',
      title: 'Impact report',
      description: 'Summarize changed areas, required local checks, and risk notes.',
      kind: 'command',
      command: ['bun', 'run', 'check:impact'],
      requiredForModes: ['pr', 'baseline', 'release', 'fast'],
      category: 'scope',
    },
    {
      id: 'policy-checks',
      title: 'Policy checks',
      description: 'Run policy, workflow, hook, quarantine, and gate unit tests when any PR quality policy applies.',
      kind: 'command',
      command: ['bun', 'run', 'check:policy'],
      impactRequiredCheck: 'bun run check:policy',
      requiredForModes: ['pr', 'release', 'fast'],
      category: 'governance',
    },

    // === Layer 2: Core smoke and fast-lane tests ===
    {
      id: 'core-smoke',
      title: 'Core smoke tests',
      description: 'Tiny fixed set of critical-path smoke tests for fast feedback. Validates policy and quarantine governance tests.',
      kind: 'command',
      command: ['bun', 'test', 'scripts/pr/change-policy.test.ts', 'scripts/quality-gate/quarantine.test.ts'],
      requiredForModes: ['fast'],
      category: 'smoke',
      timeoutMs: 30000,
      executionKind: 'sequential',
    },
    {
      id: 'fast-lane-tests',
      title: 'Fast lane tests',
      description: 'Changed-area dynamic test selection based on impact analysis. Runs only tests relevant to modified files.',
      kind: 'command',
      command: ['bun', 'run', 'check:fast-lane'],
      requiredForModes: ['fast'],
      category: 'unit',
      timeoutMs: 60000,
      dependsOn: ['impact-report'],
    },
    {
      id: 'workflow-session-mode-smoke',
      title: 'Workflow session mode smoke',
      description: 'Run isolated workflow session mode server/API/WebSocket smoke coverage without live provider credentials.',
      kind: 'command',
      command: ['bun', 'run', 'scripts/quality-gate/workflow-session-mode-smoke.ts'],
      requiredForModes: ['pr'],
      category: 'smoke',
    },

    // === Layer 3: Area-specific checks (conditional on impact) ===
    {
      id: 'desktop-checks',
      title: 'Desktop checks',
      description: 'Run desktop lint, Vitest, and production build when desktop paths changed.',
      kind: 'command',
      command: ['bun', 'run', 'check:desktop'],
      impactRequiredCheck: 'bun run check:desktop',
      requiredForModes: ['pr'],
      category: 'unit',
    },
    {
      id: 'server-checks',
      title: 'Server checks',
      description: 'Run server, provider, runtime, MCP, OAuth, WebSocket, and API tests when server paths changed.',
      kind: 'command',
      command: ['bun', 'run', 'check:server'],
      impactRequiredCheck: 'bun run check:server',
      requiredForModes: ['pr'],
      category: 'unit',
    },
    {
      id: 'adapter-checks',
      title: 'Adapter checks',
      description: 'Run adapter tests when IM adapter paths changed.',
      kind: 'command',
      command: ['bun', 'run', 'check:adapters'],
      impactRequiredCheck: 'bun run check:adapters',
      requiredForModes: ['pr'],
      category: 'unit',
    },
    {
      id: 'docs-checks',
      title: 'Docs checks',
      description: 'Run docs install and VitePress build when docs paths changed.',
      kind: 'command',
      command: ['bun', 'run', 'check:docs'],
      impactRequiredCheck: 'bun run check:docs',
      requiredForModes: ['pr'],
      category: 'docs',
    },

    // === Layer 4: Coverage ===
    {
      id: 'coverage',
      title: 'Coverage gate',
      description: 'Run unit/component coverage suites and enforce the ratcheted coverage baseline.',
      kind: 'command',
      command: ['bun', 'run', 'check:coverage'],
      requiredForModes: ['pr', 'baseline', 'release'],
      category: 'coverage',
      // coverageMode is set per-mode in the return statement below
    },

    // === Layer 5: Heavy checks (conditional on risk) ===
    {
      id: 'quarantine',
      title: 'Quarantine governance',
      description: 'Validate quarantined tests still have owners, exit criteria, and active review windows.',
      kind: 'command',
      command: ['bun', 'run', 'check:quarantine'],
      requiredForModes: ['pr', 'baseline', 'release'],
      category: 'governance',
    },
    {
      id: 'native-checks',
      title: 'Native desktop checks',
      description: 'Build sidecars and run the Tauri native compile check when native or packaging paths changed.',
      kind: 'command',
      command: ['bun', 'run', 'check:native'],
      impactRequiredCheck: 'bun run check:native',
      requiredForModes: ['pr', 'release'],
      category: 'native',
      // CA-005: High-risk paths escalate to the right checks
      // Native-checks only runs when Tauri/native code changes (high risk)
      riskTrigger: {
        riskLevels: ['high'],
        escalatedChecks: ['native-checks'],
      },
    },
    {
      id: 'persistence-upgrade',
      title: 'Persistence upgrade checks',
      description: 'Validate local JSON and desktop localStorage migrations against old-version fixtures.',
      kind: 'command',
      command: ['bun', 'run', 'check:persistence-upgrade'],
      requiredForModes: ['pr', 'release'],
      category: 'governance',
      // CA-005: High-risk paths escalate to the right checks
      // Persistence-upgrade runs when desktop state/API layer changes (medium+ risk)
      riskTrigger: {
        riskLevels: ['medium', 'high'],
        escalatedChecks: ['persistence-upgrade'],
      },
    },

    // === Baseline/Release only ===
    {
      id: 'baseline-catalog',
      title: 'Baseline case catalog validation',
      description: 'Validate real Coding Agent baseline case definitions and fixture metadata.',
      kind: 'command',
      command: ['bun', 'test', 'scripts/quality-gate/baseline/cases.test.ts'],
      requiredForModes: ['baseline', 'release'],
      category: 'unit',
    },
  ]

  const targets = baselineTargets.length > 0
    ? baselineTargets
    : [{ providerId: null, modelId: 'current', label: 'current-runtime' }]

  for (const testCase of baselineCases) {
    for (const target of targets) {
      const targetSlug = target.label.replace(/[^a-zA-Z0-9._-]+/g, '-')
      lanes.push({
        id: `baseline:${testCase.id}:${targetSlug}`,
        title: `${testCase.title} (${target.label})`,
        description: testCase.description,
        kind: 'baseline-case',
        baselineCaseId: testCase.id,
        baselineTarget: target,
        requiredForModes: ['baseline', 'release'],
        category: 'integration',
        live: true,
      })
    }
  }

  for (const target of targets) {
    const targetSlug = target.label.replace(/[^a-zA-Z0-9._-]+/g, '-')
    lanes.push({
      id: `provider-smoke:${targetSlug}`,
      title: `Provider live/proxy smoke (${target.label})`,
      description: 'Validate live provider connectivity. Saved or active OpenAI-compatible providers also exercise the local non-stream and streaming proxy endpoints; env-only targets validate upstream connectivity and transform pipeline.',
      kind: 'provider-smoke',
      baselineTarget: target,
      requiredForModes: ['baseline', 'release'],
      category: 'smoke',
      live: true,
    })
  }

  for (const target of targets) {
    const targetSlug = target.label.replace(/[^a-zA-Z0-9._-]+/g, '-')
    lanes.push({
      id: `desktop-smoke:agent-browser-chat:${targetSlug}`,
      title: `Desktop agent-browser chat smoke (${target.label})`,
      description: 'Open the desktop web app with agent-browser, send a real chat task, and verify the model edits a fixture project through the UI.',
      kind: 'desktop-smoke',
      baselineTarget: target,
      requiredForModes: ['baseline', 'release'],
      category: 'smoke',
      live: true,
    })
  }

  // Filter lanes for the requested mode and apply mode-specific properties
  const filteredLanes = lanes.filter((lane) => lane.requiredForModes.includes(mode))

  // Set coverageMode based on mode:
  // - PR mode uses 'changed-line' coverage for faster feedback
  // - Baseline and release modes use 'full' coverage for complete verification
  for (const lane of filteredLanes) {
    if (lane.id === 'coverage') {
      lane.coverageMode = mode === 'pr' ? 'changed-line' : 'full'
    }
  }

  return filteredLanes
}
