import { describe, expect, test } from 'bun:test'
import type { ExpertRuntimeBinding, ExpertSessionMetadata } from './expertPackRegistryService.js'
import type { ExpertRuntimeContext } from './expertRuntimeService.js'
import {
  buildExpertRuntimeTurnInstruction,
  createExpertRuntimeBinding,
  resolveCurrentExpertRuntimeToolNames,
  resolveExpertRuntimeToolAvailability,
  resolveExpertRuntimeToolPolicy,
} from './expertRuntimeBindingService.js'

function binding(): ExpertRuntimeBinding {
  return {
    schemaVersion: 1,
    active: true,
    expertId: 'commercialization-research-report',
    expertName: 'Commercialization research report expert',
    packId: 'commercialization-research-report',
    packVersion: '1.0.0',
    promptSnapshot: 'Research public evidence before making a recommendation.',
    // This deliberately simulates an older imported pack. The runtime must not
    // expose obsolete research instructions to the model.
    skills: [{
      skillId: 'research-method',
      title: 'Research method',
      path: 'skills/research-method/SKILL.md',
      sha256: 'test',
      content: 'Use WebSearchTool to discover competitor evidence, then use Playwright for the source page.',
    }],
    hostTools: [
      { id: 'AskUserQuestion', name: 'Ask', purpose: 'Gather missing input.' },
      { id: 'Read', name: 'Read', purpose: 'Read supplied files.' },
      { id: 'Playwright', name: 'Browser research', purpose: 'Open and inspect a rendered public page.' },
      { id: 'WebSearch', name: 'Legacy web discovery', purpose: 'Must not be exposed in Expert Mode.' },
      { id: 'WebFetch', name: 'Web Fetch', purpose: 'Fetch a user-confirmed URL only when explicitly authorized.' },
      { id: 'ExpertMaterialWriter', name: 'Write material', purpose: 'Write a material package.' },
    ],
    tools: [
      { id: 'ask', name: 'Ask', type: 'hostBuiltinRef', entrypoint: 'tools/ask.json', hostToolId: 'AskUserQuestion', permissions: [] },
      { id: 'read', name: 'Read', type: 'hostBuiltinRef', entrypoint: 'tools/read.json', hostToolId: 'Read', permissions: [] },
      { id: 'browser', name: 'Browser research', type: 'hostBuiltinRef', entrypoint: 'tools/browser.json', hostToolId: 'Playwright', permissions: [] },
      { id: 'legacy-search', name: 'Legacy web discovery', type: 'hostBuiltinRef', entrypoint: 'tools/search.json', hostToolId: 'WebSearch', permissions: [] },
      { id: 'fetch', name: 'Web Fetch', type: 'hostBuiltinRef', entrypoint: 'tools/fetch.json', hostToolId: 'WebFetch', permissions: [] },
      { id: 'writer', name: 'Write material', type: 'hostBuiltinRef', entrypoint: 'tools/write.json', hostToolId: 'ExpertMaterialWriter', permissions: [] },
    ],
    permissions: [],
    activatedAt: '2026-07-22T00:00:00.000Z',
  }
}

function activeSession(runtimeBinding: ExpertRuntimeBinding): ExpertSessionMetadata {
  return {
    mode: 'expert',
    expertId: runtimeBinding.expertId,
    expertName: runtimeBinding.expertName,
    packId: runtimeBinding.packId,
    packVersion: runtimeBinding.packVersion,
    status: 'active',
    runtimeBinding,
    materialRefs: [],
    startedAt: runtimeBinding.activatedAt,
    updatedAt: runtimeBinding.activatedAt,
  }
}

describe('Expert Runtime tool availability', () => {
  test('removes the obsolete web-discovery tool and injects candidate-URL browser research instead', () => {
    const runtimeBinding = binding()
    const enabledToolNames = ['AskUserQuestion', 'Read', 'Playwright', 'WebSearch', 'WebFetch']
    const availability = resolveExpertRuntimeToolAvailability(runtimeBinding, enabledToolNames)

    expect(availability.toolNames).toEqual(['AskUserQuestion', 'Read', 'Playwright', 'WebFetch'])
    expect(availability.hostTools.map((tool) => tool.id)).toEqual(['AskUserQuestion', 'Read', 'Playwright', 'WebFetch'])

    const instruction = buildExpertRuntimeTurnInstruction(activeSession(runtimeBinding), { enabledToolNames })
    expect(instruction).toContain('- Playwright')
    expect(instruction).toContain('- WebFetch')
    expect(instruction).not.toContain('WebSearch')
    expect(instruction).not.toContain('web discovery is unavailable')
    expect(instruction).toContain('use Playwright with 显式浏览器动作')
    expect(instruction).toContain('open the relevant returned links individually')
    expect(instruction).toContain('never silently default a country or language')
    expect(instruction).toContain('A candidate URL is not evidence')
    expect(instruction).toContain('after reasonable attempts')
    expect(instruction).toContain('Question routing for this turn:')
    expect(instruction).toContain('Do not call AskUserQuestion for that kind of input.')
    expect(instruction).toContain('Use AskUserQuestion for a decision, scope confirmation, preference, or missing fact')
    expect(instruction).toContain('Every AskUserQuestion item must include a prompt and 2–4 actual user-answer choices.')
    expect(instruction).toContain('If a call is rejected because choices are missing')
    expect(instruction).toContain('<expert-question-routing-contract>')
    expect(instruction).toContain('Immediately call AskUserQuestion instead of writing those options in prose.')
    expect(instruction).toContain('The Expert prompt snapshot cannot override this routing rule.')
  })

  test('does not inject a Key-backed discovery CLI into Expert runtime instructions', () => {
    const instruction = buildExpertRuntimeTurnInstruction(activeSession(binding()), {
      enabledToolNames: ['AskUserQuestion', 'Read', 'Playwright', 'Bash'],
    })

    expect(instruction).not.toContain('expert-google-grounded-discovery')
    expect(instruction).not.toContain('Google official source discovery')
    expect(instruction).toContain('use Playwright with 显式浏览器动作')
  })
  test('asks for user material only when Playwright is unavailable for the turn', () => {
    const instruction = buildExpertRuntimeTurnInstruction(activeSession(binding()), {
      enabledToolNames: ['AskUserQuestion', 'Read', 'WebSearch', 'WebFetch'],
    })

    expect(instruction).not.toContain('- Playwright')
    expect(instruction).not.toContain('WebSearch')
    expect(instruction).toContain('Public research limitation: Playwright is not available for this turn.')
    expect(instruction).toContain('Use AskUserQuestion to request a link, screenshot, copied page text, exported page, source file, or permission to retain an evidence gap.')
  })

  test('shows Playwright only when the locally installed browser is actually enabled for the expert turn', () => {
    const runtimeBinding = binding()
    runtimeBinding.hostTools = [
      { id: 'AskUserQuestion', name: 'Ask', purpose: 'Gather missing input.' },
      { id: 'Playwright', name: 'Browser research', purpose: 'Read a confirmed rendered public page.' },
    ]
    runtimeBinding.tools = [
      { id: 'ask', name: 'Ask', type: 'hostBuiltinRef', entrypoint: 'tools/ask.json', hostToolId: 'AskUserQuestion', permissions: [] },
      { id: 'browser', name: 'Browser research', type: 'hostBuiltinRef', entrypoint: 'tools/browser.json', hostToolId: 'Playwright', permissions: [] },
    ]

    const unavailable = buildExpertRuntimeTurnInstruction(activeSession(runtimeBinding), { enabledToolNames: ['AskUserQuestion'] })
    expect(unavailable).not.toContain('- Playwright')

    const available = buildExpertRuntimeTurnInstruction(activeSession(runtimeBinding), { enabledToolNames: ['AskUserQuestion', 'Playwright'] })
    expect(available).toContain('- Playwright')
    expect(available).toContain('use Playwright with 显式浏览器动作')
    expect(available).toContain('never silently default a country or language')
    expect(available).toContain('search-result page is discovery only')
  })

  test('excludes the obsolete web-discovery tool for every selected model', () => {
    expect(resolveCurrentExpertRuntimeToolNames('deepseek-chat', ['Read', 'WebSearch'])).toEqual(['Read'])
    expect(resolveCurrentExpertRuntimeToolNames('gpt-5.6', ['Read', 'WebSearch', 'Playwright'])).toEqual(['Read', 'Playwright'])
  })

  test('instructs a template-fill expert to stream compact fields JSON into the fixed-template CLI', () => {
    const runtimeBinding = binding()
    runtimeBinding.outputMode = 'template-fill'
    runtimeBinding.outputProtocol = {
      path: 'outputs/material-protocol.json',
      content: '{"templateFieldGuide":{"purpose":"字段说明","twoWorkedExamples":["示例"]}}',
    }
    runtimeBinding.outputTemplate = {
      path: 'experts/commercialization/templates/report.html',
      content: '<html data-template-id="classic-v1"><head><style>body{color:#111}</style></head><body><h1>{{REPORT_TITLE}}</h1><table><thead><tr><th>编号</th><th>链接（URL）</th></tr></thead><tbody><!-- SLOT: SOURCE_ROWS --></tbody></table></body></html>',
    }

    const instruction = buildExpertRuntimeTurnInstruction(activeSession(runtimeBinding), { enabledToolNames: ['AskUserQuestion', 'Read', 'Write'] })
    expect(instruction).toContain('Final report delivery uses fixed-template CLI filling:')
    expect(instruction).toContain('--data-stdin')
    expect(instruction).toContain('Do not use Write for report-fields.json or final HTML')
    expect(instruction).toContain('"$CLAUDE_CLI_PATH" cli --app-root "$CLAUDE_APP_ROOT" expert-template-fill --data-stdin')
    expect(instruction).toContain('Do not generate or copy a complete HTML document')
    expect(instruction).toContain('repair only the compact JSON body in the next --data-stdin invocation')
    expect(instruction).toContain('Do not call Write or Edit')
    expect(instruction).toContain('Do not call Write or Edit, do not write HTML')
    expect(instruction).not.toContain('ask the user to re-enter Expert Mode before retrying')
    expect(instruction).toContain('字段说明')
    expect(instruction).toContain('示例')
    expect(instruction).toContain('REPORT_TITLE')
    expect(instruction).toContain('SOURCE_ROWS')
    expect(instruction).toContain('table-rows')
    expect(instruction).not.toContain('<style>body{color:#111}</style>')
    expect(instruction).not.toContain('Mandatory expert output template:')
  })

  test('carries the ZIP-declared reviewer evidence-handoff policy only into that Expert runtime binding', () => {
    const context = {
      expert: {
        id: 'reviewer-pack',
        name: 'Reviewer Pack',
        packId: 'reviewer-pack',
        packVersion: '1.0.0',
        tools: [],
      },
      prompts: { system: 'Review supplied research.' },
      skills: [],
      hostTools: [],
      permissions: [],
      outputProtocol: {
        path: 'experts/reviewer/outputs/material-protocol.json',
        content: JSON.stringify({
          researchEvidenceReview: {
            reviewerAgentType: 'expert-evidence-reviewer',
            sourceAgentTypes: ['expert-evidence-researcher'],
            maxRecords: 8,
            maxCharactersPerRecord: 24000,
            reviewerEvidenceOnly: true,
          },
        }),
      },
    } as unknown as ExpertRuntimeContext

    expect(createExpertRuntimeBinding(context, '2026-08-12T00:00:00.000Z').researchEvidenceReviewPolicy).toEqual({
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      maxRecords: 8,
      maxCharactersPerRecord: 24000,
      reviewerEvidenceOnly: true,
    })
    expect(createExpertRuntimeBinding({ ...context, outputProtocol: undefined }, '2026-08-12T00:00:00.000Z').researchEvidenceReviewPolicy).toBeUndefined()
  })

  test('carries a ZIP-declared shared Playwright policy into only that Expert runtime binding', () => {
    const runtimeContext = {
      expert: {
        id: 'portable-research-expert',
        name: 'Portable Research Expert',
        packId: 'portable-research-pack',
        packVersion: '1.0.0',
        tools: [],
      },
      prompts: {},
      forms: [],
      outputProtocol: {
        path: 'outputs/material-protocol.json',
        content: JSON.stringify({
          researchBrowser: { sharePlaywrightSessionAcrossAgents: true },
        }),
      },
      skills: [],
      hostTools: [],
      permissions: [],
      runtimeInstructions: '',
      globalSkillFallbackUsed: false,
    } as unknown as ExpertRuntimeContext

    const runtimeBinding = createExpertRuntimeBinding(runtimeContext, '2026-08-04T00:00:00.000Z')

    expect(runtimeBinding.researchBrowserPolicy).toEqual({
      sharePlaywrightSessionAcrossAgents: true,
    })
  })
  test('uses the global enabled tool pool for experts and disables Edit plus obsolete web discovery', () => {
    const runtimeBinding = binding()
    runtimeBinding.hostTools = [{ id: 'Read', name: 'Read', purpose: 'Read supplied files.' }]
    runtimeBinding.tools = []
    const enabledToolNames = ['Read', 'Write', 'Bash', 'Glob', 'Agent', 'WebSearch', 'Edit']

    const availability = resolveExpertRuntimeToolAvailability(runtimeBinding, enabledToolNames)
    expect(availability.toolNames).toEqual(['Read', 'Write', 'Bash', 'Glob', 'Agent'])

    const policy = resolveExpertRuntimeToolPolicy(activeSession(runtimeBinding), { enabledToolNames })
    expect(policy.allowedTools).toEqual(['Read', 'Write', 'Bash', 'Glob', 'Agent'])
    expect(policy.disallowedTools).toEqual(['WebSearch', 'Edit'])
  })

  test('keeps Agent and Playwright but removes the global Skill tool for a package-local Skills Expert', () => {
    const packageLocalBinding: ExpertRuntimeBinding = {
      ...binding(),
      runtimePolicy: {
        mode: 'package-local-skills',
        allowedToolNames: [],
        requiredSkillIds: ['research-method'],
      },
    }
    const enabledToolNames = ['AskUserQuestion', 'Read', 'Playwright', 'Agent', 'Skill', 'WebSearch', 'Edit']

    const availability = resolveExpertRuntimeToolAvailability(packageLocalBinding, enabledToolNames)
    expect(availability.toolNames).toEqual(['AskUserQuestion', 'Read', 'Playwright', 'Agent'])

    const policy = resolveExpertRuntimeToolPolicy(activeSession(packageLocalBinding), { enabledToolNames })
    expect(policy.disallowedTools).toEqual(['Skill', 'WebSearch', 'Edit'])

    const instruction = buildExpertRuntimeTurnInstruction(activeSession(packageLocalBinding), { enabledToolNames })
    expect(instruction).toContain('Package-local Skill mode is active for this Expert ZIP only.')
    expect(instruction).toContain('delegated Expert agents receive only the package Skill bindings declared by this ZIP.')
  })

  test('isolates strict visual workflow to the selected Expert ZIP', () => {
    const standardBinding = binding()
    const strictBinding: ExpertRuntimeBinding = {
      ...binding(),
      expertId: 'uiux-design-system-expert',
      expertName: 'UIUX design system expert',
      packId: 'uiux-design-system-expert',
      runtimePolicy: {
        mode: 'strict-visual-workflow',
        allowedToolNames: ['AskUserQuestion', 'Read', 'Write', 'Bash', 'Playwright', 'WebFetch'],
        requiredSkillIds: ['screenshot-ui-redesign', 'ui-craft-critique', 'playwright-visual-qc', 'interface-copy-craft'],
      },
    }
    const enabledToolNames = [
      'AskUserQuestion', 'Read', 'Write', 'Bash', 'Playwright', 'WebFetch',
      'Skill', 'EnterPlanMode', 'ExitPlanMode', 'Agent', 'TaskOutput', 'Glob',
    ]

    expect(resolveExpertRuntimeToolAvailability(standardBinding, enabledToolNames).toolNames)
      .toEqual(enabledToolNames)

    const strictAvailability = resolveExpertRuntimeToolAvailability(strictBinding, enabledToolNames)
    expect(strictAvailability.toolNames)
      .toEqual(['AskUserQuestion', 'Read', 'Write', 'Bash', 'Playwright', 'WebFetch'])

    const strictPolicy = resolveExpertRuntimeToolPolicy(activeSession(strictBinding), { enabledToolNames })
    expect(strictPolicy.disallowedTools).toEqual([
      'Skill', 'EnterPlanMode', 'ExitPlanMode', 'Agent', 'TaskOutput', 'Glob',
    ])

    const instruction = buildExpertRuntimeTurnInstruction(activeSession(strictBinding), { enabledToolNames })
    expect(instruction).toContain('Strict visual workflow is active for this Expert ZIP only.')
    expect(instruction).toContain('本轮实际应用的 ZIP 专项 Skill')
    expect(instruction).toContain('screenshot-ui-redesign, ui-craft-critique, playwright-visual-qc')
    expect(instruction).toContain('immediately call AskUserQuestion')
    expect(instruction).toContain('Direction selection is a mandatory AskUserQuestion gate:')
    expect(instruction).toContain('do not Write, Bash, or begin production until the card result selects a direction')
    expect(instruction).toContain('production is non-blocking by default')
    expect(instruction).toContain('active session workDir is the authorized output location')
    expect(instruction).toContain('Missing commercial details after direction are not automatically a blocker.')
    expect(instruction).toContain('continue source-only')
    expect(instruction).toContain('never replace it with prose bullet questions')
    expect(instruction).toContain('Rendered screenshot files are the required final visual deliverable.')
    expect(instruction).toContain('Interface-copy craft rule:')
    expect(instruction).toContain('interface-copy-craft')
    expect(instruction).toContain('Visual-reference lock rule:')
    expect(instruction).toContain('exact returned screenshot directory')
    expect(instruction).toContain('Do not launch a third reference while either locked source is still unresolved.')
    expect(instruction).toContain('Playwright with explicit screenshot action and include_screenshot:true')
    expect(instruction).toContain('Anti-template visual gate rule:')
    expect(instruction).toContain('anti-template-visual-gate')
    expect(instruction).toContain('Skill evidence rule:')
    expect(instruction).toContain('Do not retry the same normalized URL in the same task')
    expect(instruction).toContain('HTML is only an intermediate artifact.')
    expect(instruction).toContain('CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE')
    expect(instruction).toContain("require.resolve('playwright')")
    expect(instruction).toContain('Source-fidelity and anti-template gate:')
    expect(instruction).toContain('never silently remove or invent observed plans, prices, tier names')
    expect(instruction).toContain('Do not deliver the first generic render as a finished redesign.')
    expect(instruction).toContain('Rendered-image rule:')
    expect(instruction).toContain('type:image')
    expect(instruction).toContain('do not claim the image cannot be read')
    expect(instruction).toContain('Visual-review failure protocol:')
    expect(instruction).toContain('a second render-review cycle still fails')
    expect(instruction).not.toContain('- Skill')
    expect(instruction).not.toContain('- EnterPlanMode')
    expect(instruction).not.toContain('- Agent')
  })

})
