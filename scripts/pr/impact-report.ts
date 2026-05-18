#!/usr/bin/env bun

import { evaluateChangePolicy, selectFastLaneTests } from './change-policy.js'
import { changedFilesForLocalPrCheck } from './changed-files.js'

function parseListArg(name: string) {
  const index = process.argv.indexOf(name)
  if (index === -1) {
    return []
  }

  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) {
    return []
  }

  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

async function changedFiles() {
  const files = parseListArg('--files')
  return changedFilesForLocalPrCheck(files)
}

function commandList(result: ReturnType<typeof evaluateChangePolicy>) {
  const commands = ['bun run check:policy']

  if (result.checks.desktop) {
    commands.push('bun run check:desktop')
  }
  if (result.checks.server) {
    commands.push('bun run check:server')
  }
  if (result.checks.adapters) {
    commands.push('bun run check:adapters')
  }
  if (result.checks.desktopNative) {
    commands.push('bun run check:native')
  }
  if (result.checks.docs) {
    commands.push('bun run check:docs')
  }
  if (result.checks.coverage) {
    commands.push('bun run check:coverage')
  }

  return commands
}

function hasMatchingTest(files: string[], predicate: (file: string) => boolean) {
  return files.some((file) => (
    predicate(file) &&
    (/\.test\.[cm]?[jt]sx?$/.test(file) || file.includes('/__tests__/'))
  ))
}

function changedProductionFiles(files: string[], predicate: (file: string) => boolean) {
  return files.filter((file) => (
    predicate(file) &&
    !/\.test\.[cm]?[jt]sx?$/.test(file) &&
    !file.includes('/__tests__/') &&
    !file.includes('/fixtures/')
  ))
}

function coverageWarnings(files: string[]) {
  const warnings: string[] = []
  const desktopProd = changedProductionFiles(files, (file) => file.startsWith('desktop/src/'))
  const serverProd = changedProductionFiles(files, (file) => file.startsWith('src/server/'))
  const adapterProd = changedProductionFiles(files, (file) => file.startsWith('adapters/'))
  const agentRuntimeProd = changedProductionFiles(files, (file) => (
    file.startsWith('src/server/ws/') ||
    file.startsWith('src/server/services/conversation') ||
    file.startsWith('src/tools/') ||
    file.startsWith('src/utils/')
  ))

  if (desktopProd.length > 0 && !hasMatchingTest(files, (file) => file.startsWith('desktop/src/'))) {
    warnings.push('Desktop product files changed without a desktop test file in the PR.')
  }

  if (serverProd.length > 0 && !hasMatchingTest(files, (file) => file.startsWith('src/server/'))) {
    warnings.push('Server product files changed without a server test file in the PR.')
  }

  if (adapterProd.length > 0 && !hasMatchingTest(files, (file) => file.startsWith('adapters/'))) {
    warnings.push('Adapter product files changed without an adapter test file in the PR.')
  }

  if (agentRuntimeProd.length > 0) {
    warnings.push('Agent/model runtime path changed: prefer request-shape/mock tests in PR and maintainer live-model smoke before release.')
  }

  return warnings
}

function riskNotes(files: string[]) {
  const notes: string[] = []

  if (files.some((file) => file.startsWith('desktop/src-tauri/'))) {
    notes.push('Tauri/native code changed: check sidecar build and cargo check output closely.')
  }
  if (files.some((file) => file.startsWith('desktop/src/stores/') || file.startsWith('desktop/src/api/'))) {
    notes.push('Desktop state/API layer changed: verify store persistence, WebSocket behavior, and startup errors.')
  }
  if (files.some((file) => file.startsWith('src/server/ws/') || file.startsWith('src/server/services/conversation'))) {
    notes.push('Session runtime changed: review reconnect, startup diagnostics, provider selection, and thinking settings.')
  }
  if (files.some((file) => file.includes('provider') || file.includes('WebSearchTool'))) {
    notes.push('Provider/search behavior changed: PR gate uses mock tests; live-provider tests should stay maintainer-only.')
  }
  if (files.some((file) => file.startsWith('.github/workflows/') || file.startsWith('scripts/pr/'))) {
    notes.push('CI/policy changed: inspect the PR workflow behavior itself, not just application tests.')
  }

  return notes
}

const labels = [
  ...parseListArg('--labels'),
  ...(process.env.PR_LABELS?.split(',').map((label) => label.trim()).filter(Boolean) ?? []),
]

if (process.env.ALLOW_CLI_CORE_CHANGE === '1') {
  labels.push('allow-cli-core-change')
}
if (process.env.ALLOW_MISSING_TESTS === '1') {
  labels.push('allow-missing-tests')
}
if (process.env.ALLOW_COVERAGE_BASELINE_CHANGE === '1') {
  labels.push('allow-coverage-baseline-change')
}

const files = await changedFiles()
const result = evaluateChangePolicy(files, labels)
const commands = commandList(result)
const warnings = [...coverageWarnings(result.files)]
const blockingTestSignals = result.missingTestSignals
const notes = riskNotes(result.files)

// 获取 fast-lane 测试选择
const fastLaneSelection = selectFastLaneTests(files)

console.log('# PR impact report')
console.log('')
console.log(`Changed files: ${result.files.length}`)
console.log(`Areas: ${result.areas.length ? result.areas.join(', ') : 'none'}`)
console.log(`Labels: ${result.labels.length ? result.labels.join(', ') : 'none'}`)
console.log(`Blocked: ${result.blocked ? 'yes' : 'no'}`)

if (result.blockingReason) {
  console.log('Blocking reasons:')
  for (const reason of result.blockingReasons) {
    console.log(`- ${reason}`)
  }
}

console.log('')
console.log('## Required local checks')
for (const command of commands) {
  console.log(`- \`${command}\``)
}

// Fast-lane tests 部分 (CA-003: 跳过的区域必须可解释)
console.log('')
console.log('## Fast-lane tests')
console.log('')
console.log('### Core smoke')
for (const pattern of fastLaneSelection.coreSmoke) {
  console.log(`- ${pattern}`)
}

console.log('')
console.log('### Selected by area')
const selectedAreas = Object.entries(fastLaneSelection.selectedTests)
if (selectedAreas.length === 0) {
  console.log('- (none)')
} else {
  for (const [area, patterns] of selectedAreas) {
    if (patterns && patterns.length > 0) {
      for (const pattern of patterns) {
        console.log(`- ${area}: ${pattern}`)
      }
    } else {
      console.log(`- ${area}: (none)`)
    }
  }
}

console.log('')
console.log('### Skipped')
if (fastLaneSelection.skipped.length === 0) {
  console.log('- (none)')
} else {
  for (const skipped of fastLaneSelection.skipped) {
    console.log(`- ${skipped.area}: ${skipped.reason}`)
  }
}

console.log('')
console.log('### Risk assessment')
console.log(`- Level: ${result.riskLevel}`)
if (result.escalatedChecks && result.escalatedChecks.length > 0) {
  console.log(`- Escalated checks: ${result.escalatedChecks.join(', ')}`)
} else {
  console.log('- Escalated checks: (none)')
}

console.log('')
console.log('## Test coverage signals')
if (blockingTestSignals.length > 0) {
  for (const signal of blockingTestSignals) {
    console.log(`- BLOCKING: ${signal}`)
  }
}
if (warnings.length === 0 && blockingTestSignals.length === 0) {
  console.log('- No obvious missing-test signal from changed paths.')
} else {
  for (const warning of warnings) {
    console.log(`- ${warning}`)
  }
}

console.log('')
console.log('## Risk notes')
if (notes.length === 0) {
  console.log('- No special risk notes from changed paths.')
} else {
  for (const note of notes) {
    console.log(`- ${note}`)
  }
}

// CA-005: High-risk paths escalate to the right checks
// CA-003: Skipped lanes must be explainable
console.log('')
if (result.escalatedChecks && result.escalatedChecks.length > 0) {
  console.log('## Escalated checks')
  console.log('')

  // 收集触发升级的路径
  const triggeringPaths: string[] = []

  for (const check of result.escalatedChecks) {
    console.log(`- ${check}`)

    if (check === 'native-checks') {
      const tauriFiles = result.files.filter((f) => f.startsWith('desktop/src-tauri/'))
      triggeringPaths.push(...tauriFiles)
    }
    if (check === 'live-provider-checks') {
      const providerFiles = result.files.filter((f) =>
        f.includes('provider') ||
        f.includes('WebSearchTool') ||
        f.startsWith('src/server/ws/') ||
        f.startsWith('src/server/services/conversation')
      )
      triggeringPaths.push(...providerFiles)
    }
    if (check === 'release-gates') {
      const releaseFiles = result.files.filter((f) =>
        f.startsWith('.github/workflows/') ||
        f.startsWith('scripts/pr/')
      )
      triggeringPaths.push(...releaseFiles)
    }
  }

  console.log('')
  console.log('Triggered by high-risk paths:')
  for (const path of [...new Set(triggeringPaths)]) {
    console.log(`- ${path}`)
  }
} else if (result.riskLevel === 'medium' && result.riskGuidance) {
  console.log('## Risk guidance')
  console.log('')
  console.log(`- ${result.riskGuidance}`)
} else if (result.riskLevel === 'low' && result.skipExplanation) {
  console.log('## Heavy check skip')
  console.log('')
  console.log(`- ${result.skipExplanation}`)
}

console.log('')
console.log('## Agent/model testing policy')
console.log('- Default PR gate should not call real models or live providers.')
console.log('- Cover agent behavior with mock CLI, request-shape assertions, transcript fixtures, and provider capability tests.')
console.log('- Run live-model smoke tests only in maintainer-controlled workflows with secrets, rate limits, and explicit labels.')
