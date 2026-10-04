import { describe, expect, test } from 'bun:test'
import type { ExpertRuntimeBinding, ExpertSessionMetadata } from './expertPackRegistryService.js'
import type { ExpertRuntimeContext } from './expertRuntimeService.js'
import {
  buildExpertRuntimeTurnInstruction,
  getExpertProcessBindingKey,
  createExpertRuntimeBinding,
  resolveCurrentExpertRuntimeToolNames,
  resolveExpertRuntimeToolAvailability,
  resolveExpertRuntimeToolPolicy,
  upgradeCommercializationResearchChannelBinding,
  upgradeCommercializationResearchChannelRuntime,
  upgradeUiuxImageOnlyRuntime,
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
      { id: 'ask', name: 'Ask', type: 'hostBuiltinRef', entrypoint: 'tools/ask.json', hostToolId: 'AskUserQuestion', purpose: 'Gather missing input.', permissions: [] },
      { id: 'read', name: 'Read', type: 'hostBuiltinRef', entrypoint: 'tools/read.json', hostToolId: 'Read', purpose: 'Read supplied files.', permissions: [] },
      { id: 'browser', name: 'Browser research', type: 'hostBuiltinRef', entrypoint: 'tools/browser.json', hostToolId: 'Playwright', purpose: 'Inspect public pages.', permissions: [] },
      { id: 'legacy-search', name: 'Legacy web discovery', type: 'hostBuiltinRef', entrypoint: 'tools/search.json', hostToolId: 'WebSearch', purpose: 'Legacy web discovery.', permissions: [] },
      { id: 'fetch', name: 'Web Fetch', type: 'hostBuiltinRef', entrypoint: 'tools/fetch.json', hostToolId: 'WebFetch', purpose: 'Fetch an authorized URL.', permissions: [] },
      { id: 'writer', name: 'Write material', type: 'hostBuiltinRef', entrypoint: 'tools/write.json', hostToolId: 'ExpertMaterialWriter', purpose: 'Write a material package.', permissions: [] },
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
  test('keeps every enabled discovery tool while injecting candidate-URL browser research guidance', () => {
    const runtimeBinding = binding()
    const enabledToolNames = ['AskUserQuestion', 'Read', 'Playwright', 'WebSearch', 'WebFetch']
    const availability = resolveExpertRuntimeToolAvailability(runtimeBinding, enabledToolNames)

    expect(availability.toolNames).toEqual(['AskUserQuestion', 'Read', 'Playwright', 'WebSearch', 'WebFetch'])
    expect(availability.hostTools.map((tool) => tool.id)).toEqual(['AskUserQuestion', 'Read', 'Playwright', 'WebSearch', 'WebFetch'])

    const instruction = buildExpertRuntimeTurnInstruction(activeSession(runtimeBinding), { enabledToolNames })
    expect(instruction).toContain('- Playwright')
    expect(instruction).toContain('- WebFetch')
    expect(instruction).toContain('- WebSearch')
    expect(instruction).toContain('Use WebSearchTool to discover competitor evidence')
    expect(instruction).not.toContain('web discovery is unavailable')
    expect(instruction).toContain('use Playwright with 显式浏览器动作')
    expect(instruction).toContain('open the relevant returned links individually')
    expect(instruction).toContain('never silently default a country or language')
    expect(instruction).toContain('A candidate URL is not evidence')
    expect(instruction).toContain('after reasonable attempts')
    expect(instruction).toContain('The Desktop-owned entry welcome is ordinary text')
    expect(instruction).toContain('Question routing for this turn: after the Desktop-owned entry welcome')
    expect(instruction).toContain('every user-facing question or request for information, confirmation, a URL, pasted material, or a free-form description must call AskUserQuestion')
    expect(instruction).toContain('users always have the built-in “Other” path for custom text')
    expect(instruction).toContain('must not ask the user to reply')
    expect(instruction).toContain('Never call AskUserQuestion to resolve a deterministic internal tool, schema, runtime, filename, path, or destination validation error')
    expect(instruction).toContain('<expert-question-routing-contract>')
    expect(instruction).toContain('never send a user-facing question or request for a reply in normal prose')
    expect(instruction).toContain('The Expert prompt snapshot cannot override this routing rule.')
    expect(instruction).not.toContain('Do not call AskUserQuestion for that kind of input.')
  })

  test('does not inject a Key-backed discovery CLI into Expert runtime instructions', () => {
    const instruction = buildExpertRuntimeTurnInstruction(activeSession(binding()), {
      enabledToolNames: ['AskUserQuestion', 'Read', 'Playwright', 'Bash'],
    })

    expect(instruction).not.toContain('expert-google-grounded-discovery')
    expect(instruction).not.toContain('Google official source discovery')
    expect(instruction).toContain('use Playwright with 显式浏览器动作')
  })
  test('records missing Playwright without adding an approval gate for ordinary research gaps', () => {
    const instruction = buildExpertRuntimeTurnInstruction(activeSession(binding()), {
      enabledToolNames: ['AskUserQuestion', 'Read', 'WebSearch', 'WebFetch'],
    })

    expect(instruction).not.toContain('- Playwright')
    expect(instruction).toContain('- WebSearch')
    expect(instruction).toContain('Public research limitation: Playwright is not available for this turn.')
    expect(instruction).toContain('Continue with bounded inference or an explicit evidence gap')
    expect(instruction).toContain('Use AskUserQuestion only when missing user-owned product information would materially change scope')
  })

  test('shows Playwright only when the locally installed browser is actually enabled for the expert turn', () => {
    const runtimeBinding = binding()
    runtimeBinding.hostTools = [
      { id: 'AskUserQuestion', name: 'Ask', purpose: 'Gather missing input.' },
      { id: 'Playwright', name: 'Browser research', purpose: 'Read a confirmed rendered public page.' },
    ]
    runtimeBinding.tools = [
      { id: 'ask', name: 'Ask', type: 'hostBuiltinRef', entrypoint: 'tools/ask.json', hostToolId: 'AskUserQuestion', purpose: 'Gather missing input.', permissions: [] },
      { id: 'browser', name: 'Browser research', type: 'hostBuiltinRef', entrypoint: 'tools/browser.json', hostToolId: 'Playwright', purpose: 'Inspect public pages.', permissions: [] },
    ]

    const unavailable = buildExpertRuntimeTurnInstruction(activeSession(runtimeBinding), { enabledToolNames: ['AskUserQuestion'] })
    expect(unavailable).not.toContain('- Playwright')

    const available = buildExpertRuntimeTurnInstruction(activeSession(runtimeBinding), { enabledToolNames: ['AskUserQuestion', 'Playwright'] })
    expect(available).toContain('- Playwright')
    expect(available).toContain('use Playwright with 显式浏览器动作')
    expect(available).toContain('never silently default a country or language')
    expect(available).toContain('search-result page is discovery only')
  })

  test('preserves Playwright for legacy strict visual ZIPs that still declare BrowserResearch', () => {
    const runtimeBinding = binding()
    runtimeBinding.runtimePolicy = {
      mode: 'strict-visual-workflow',
      allowedToolNames: ['AskUserQuestion', 'Read', 'BrowserResearch'],
      requiredSkillIds: [],
    }
    runtimeBinding.hostTools = [
      { id: 'AskUserQuestion', name: 'Ask', purpose: 'Gather missing input.' },
      { id: 'Read', name: 'Read', purpose: 'Read supplied files.' },
      { id: 'BrowserResearch', name: 'BrowserResearch', purpose: 'Read a rendered public page.' },
    ]
    runtimeBinding.promptSnapshot = 'Use BrowserResearch only for public rendered pages.'
    runtimeBinding.skills = [{
      skillId: 'legacy-browser-research',
      title: 'Legacy browser research',
      path: 'skills/legacy-browser-research/SKILL.md',
      sha256: 'legacy',
      content: 'Use BrowserResearch to open public design references.',
    }]

    const enabledToolNames = ['AskUserQuestion', 'Read', 'Playwright']
    const availability = resolveExpertRuntimeToolAvailability(runtimeBinding, enabledToolNames)

    expect(availability.toolNames).toEqual(['AskUserQuestion', 'Read', 'Playwright'])
    expect(availability.hostTools.map((tool) => tool.id)).toEqual(['AskUserQuestion', 'Read', 'Playwright'])
    expect(availability.hostTools.at(-1)?.name).toBe('Playwright')

    const instruction = buildExpertRuntimeTurnInstruction(activeSession(runtimeBinding), { enabledToolNames })
    expect(instruction).toContain('- Playwright')
    expect(instruction).toContain('Public research protocol:')
    expect(instruction).not.toContain('Public research limitation: Playwright is not available for this turn.')
    expect(instruction).not.toContain('BrowserResearch')
  })

  test('keeps every current host tool for every selected model', () => {
    expect(resolveCurrentExpertRuntimeToolNames('deepseek-chat', ['Read', 'WebSearch'])).toEqual(['Read', 'WebSearch'])
    expect(resolveCurrentExpertRuntimeToolNames('gpt-5.6', ['Read', 'WebSearch', 'Playwright'])).toEqual(['Read', 'WebSearch', 'Playwright'])
  })

  test('keeps template-fill draft review and finalization consistent with the active output protocol', () => {
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
    expect(instruction).not.toContain('Final report delivery uses one structured Write call:')
    expect(instruction).toContain('follow the active Expert output protocol for draft, review, patch, and finalization')
    expect(instruction).toContain('file_path set to one .html or .htm filename only')
    expect(instruction).toContain('content set to the empty string ""')
    expect(instruction).toContain('expert_output={ templateId, fields }')
    expect(instruction).toContain('current session workDir')
    expect(instruction).not.toContain('desktop Expert material control creates the downloadable material package')
    expect(instruction).toContain('All currently enabled tools remain available for research and intermediate artifact repair')
    expect(instruction).toContain('including Bash, PowerShell, Edit, MultiEdit, and NotebookEdit')
    expect(instruction).toContain('For the final report delivery itself, use the structured Write call above')
    expect(instruction).toContain('evidenceAbsorption is optional supplemental metadata only')
    expect(instruction).toContain('Correct the cited file_path or expert_output yourself and retry')
    expect(instruction).toContain('Never ask the user for a filename or output location for this case')
    expect(instruction).toContain('Do not blindly resend an unchanged payload')
    expect(instruction).not.toContain('EXPERT_TEMPLATE_FILL_REPAIR_LIMIT_REACHED')
    expect(instruction).not.toContain('required top-level evidenceAbsorption mapping')
    expect(instruction).not.toContain('fixed-template CLI filling')
    expect(instruction).not.toContain('--data-stdin')
    expect(instruction).not.toContain('$CLAUDE_CLI_PATH')
    expect(instruction).not.toContain('Do not use Write for report-fields.json or final HTML')
    expect(instruction).toContain('字段说明')
    expect(instruction).toContain('示例')
    expect(instruction).toContain('REPORT_TITLE')
    expect(instruction).toContain('SOURCE_ROWS')
    expect(instruction).toContain('table-rows')
    expect(instruction).not.toContain('<style>body{color:#111}</style>')
    expect(instruction).not.toContain('Mandatory expert output template:')
    expect(instruction.lastIndexOf('<expert-question-routing-contract>'))
      .toBeGreaterThan(instruction.lastIndexOf('Allowed field schema'))
    expect(instruction.lastIndexOf('<expert-question-routing-contract>'))
      .toBeGreaterThan(instruction.lastIndexOf('When a durable expert report is required'))
  })

  test('keeps the complete host tool pool for template-fill and ordinary Experts', () => {
    const enabledToolNames = [
      'AskUserQuestion', 'Read', 'Playwright', 'Agent', 'Write',
      'Bash', 'PowerShell', 'Edit', 'MultiEdit', 'NotebookEdit', 'WebSearch',
    ]
    const templateFillBinding = binding()
    templateFillBinding.outputMode = 'template-fill'

    expect(resolveExpertRuntimeToolAvailability(templateFillBinding, enabledToolNames).toolNames)
      .toEqual(enabledToolNames)
    expect(resolveExpertRuntimeToolPolicy(activeSession(templateFillBinding), { enabledToolNames }).disallowedTools)
      .toEqual([])

    const ordinaryToolNames = resolveExpertRuntimeToolAvailability(binding(), enabledToolNames).toolNames
    expect(ordinaryToolNames).toEqual(enabledToolNames)
  })

  test('carries the opt-in session workDir output contract only into the declared Expert binding', () => {
    const context = {
      expert: {
        id: 'direct-output-pack',
        name: 'Direct Output Pack',
        packId: 'direct-output-pack',
        packVersion: '1.0.0',
        tools: [],
      },
      prompts: {},
      skills: [],
      hostTools: [],
      permissions: [],
      outputProtocol: {
        path: 'outputs/material-protocol.json',
        content: JSON.stringify({
          primaryOutput: { autoDestination: { mode: 'session-workdir-direct' } },
        }),
      },
    } as unknown as ExpertRuntimeContext

    expect(createExpertRuntimeBinding(context, '2026-08-13T00:00:00.000Z').templateFillOutputPolicy).toEqual({
      mode: 'session-workdir-direct',
    })
    expect(createExpertRuntimeBinding({ ...context, outputProtocol: undefined }, '2026-08-13T00:00:00.000Z').templateFillOutputPolicy).toBeUndefined()
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

  test('carries the ZIP-declared Markdown research artifact policy only into that Expert binding', () => {
    const context = {
      expert: { id: 'artifact-pack', name: 'Artifact Pack', packId: 'artifact-pack', packVersion: '1.0.0', tools: [] },
      prompts: {}, skills: [], hostTools: [], permissions: [],
      outputProtocol: {
        path: 'outputs/material-protocol.json',
        content: JSON.stringify({
          researchArtifacts: {
            mode: 'markdown-path-only',
            directory: 'commercialization-research',
            briefPath: 'commercialization-research/01-research-brief.md',
            researcherPaths: [
              'commercialization-research/02-competitors.md',
              'commercialization-research/03-user-needs.md',
              'commercialization-research/04-channels.md',
            ],
            reviewerPath: 'commercialization-research/05-evidence-review.md',
            auditPath: 'commercialization-research/06-browser-audit.md',
            maxCharacters: 90000,
          },
        }),
      },
    } as unknown as ExpertRuntimeContext

    expect(createExpertRuntimeBinding(context, '2026-08-17T00:00:00.000Z').researchArtifactPolicy).toMatchObject({
      mode: 'markdown-path-only',
      briefPath: 'commercialization-research/01-research-brief.md',
      reviewerPath: 'commercialization-research/05-evidence-review.md',
    })
    expect(createExpertRuntimeBinding({ ...context, outputProtocol: undefined }, '2026-08-17T00:00:00.000Z').researchArtifactPolicy).toBeUndefined()
  })

  test('carries the ZIP-declared post-review evidence absorption policy only into that Expert runtime binding', () => {
    const context = {
      expert: {
        id: 'absorption-pack',
        name: 'Absorption Pack',
        packId: 'absorption-pack',
        packVersion: '1.0.0',
        tools: [],
      },
      prompts: {},
      skills: [],
      hostTools: [],
      permissions: [],
      outputProtocol: {
        path: 'outputs/material-protocol.json',
        content: JSON.stringify({
          postReviewEvidenceAbsorption: {
            required: true,
            userInteraction: 'none',
            before: 'template-fill',
            reviewerAgentType: 'expert-evidence-reviewer',
            sourceAgentTypes: ['expert-evidence-researcher'],
            sourceFieldId: 'SOURCE_ROWS',
            requireAllOpenedSourcesDisposition: true,
            requireSourceFieldMapping: true,
          },
        }),
      },
    } as unknown as ExpertRuntimeContext

    expect(createExpertRuntimeBinding(context, '2026-08-13T00:00:00.000Z').researchEvidenceAbsorptionPolicy).toEqual({
      required: true,
      userInteraction: 'none',
      before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS',
      requireAllOpenedSourcesDisposition: true,
      requireSourceFieldMapping: true,
    })
    expect(createExpertRuntimeBinding({ ...context, outputProtocol: undefined }, '2026-08-13T00:00:00.000Z').researchEvidenceAbsorptionPolicy).toBeUndefined()
  })

  test('injects only declared Markdown paths after a ZIP-declared file-first absorption phase is ready', () => {
    const runtimeBinding = binding()
    runtimeBinding.researchEvidenceAbsorptionPolicy = {
      required: true, userInteraction: 'none', before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer', sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS', requireAllOpenedSourcesDisposition: true, requireSourceFieldMapping: true,
    }
    runtimeBinding.researchArtifactPolicy = {
      mode: 'markdown-path-only', directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: [
        'commercialization-research/02-competitors.md',
        'commercialization-research/03-user-needs.md',
        'commercialization-research/04-channels.md',
      ],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md', maxCharacters: 90000,
    }
    const expert = activeSession(runtimeBinding)
    expert.researchEvidence = {
      updatedAt: '2026-08-13T00:00:00.000Z',
      records: runtimeBinding.researchArtifactPolicy.researcherPaths.map((artifactPath, index) => ({
        agentId: 'researcher-' + index, agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-13T00:00:00.000Z', content: 'detailed researcher content ' + index, artifactPath,
        entries: [{ target: 'https://typora.io/', finalUrl: 'https://typora.io/', kind: 'url' as const, status: 'opened' as const }],
      })),
    }
    expert.researchEvidenceReviewer = {
      updatedAt: '2026-08-13T00:01:00.000Z',
      reviewer: {
        agentId: 'reviewer', agentType: 'expert-evidence-reviewer', recordedAt: '2026-08-13T00:01:00.000Z',
        content: 'Reviewer supports the price fact.', artifactPath: 'commercialization-research/05-evidence-review.md', entries: [],
      },
    }

    const instruction = buildExpertRuntimeTurnInstruction(expert, { enabledToolNames: ['Playwright', 'Bash'] })
    expect(instruction).toContain('<expert-post-review-evidence-absorption>')
    expect(instruction).toContain('01-research-brief.md')
    expect(instruction).toContain('05-evidence-review.md')
    expect(instruction).toContain('06-browser-audit.md')
    expect(instruction).not.toContain('detailed researcher content')
    expect(instruction).not.toContain('Reviewer supports the price fact.')
  })

  test('uses the fixed-template schema when building post-review field guidance', () => {
    const runtimeBinding = binding()
    runtimeBinding.outputMode = 'template-fill'
    runtimeBinding.outputTemplate = {
      path: 'experts/commercialization/templates/report.html',
      content: '<html data-template-id="guidance-v1"><body><h1>{{REPORT_TITLE}}</h1><table><thead><tr><th>Source</th><th>URL</th></tr></thead><tbody><!-- SLOT: SOURCE_ROWS --></tbody></table></body></html>',
    }
    runtimeBinding.researchEvidenceAbsorptionPolicy = {
      required: true,
      userInteraction: 'none',
      before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS',
      requireAllOpenedSourcesDisposition: true,
      requireSourceFieldMapping: true,
      fieldGranularityGuidance: [{
        fieldId: 'SOURCE_ROWS',
        instruction: 'Keep every source row specific to its observed page and evidence boundary.',
      }],
    }
    const expert = activeSession(runtimeBinding)
    expert.researchEvidence = {
      updatedAt: '2026-08-20T00:00:00.000Z',
      records: [{
        agentId: 'researcher',
        agentType: 'expert-evidence-researcher',
        recordedAt: '2026-08-20T00:00:00.000Z',
        content: 'Observed source details.',
        entries: [{
          target: 'https://example.com/source',
          finalUrl: 'https://example.com/source',
          kind: 'url',
          status: 'opened',
        }],
      }],
    }
    expert.researchEvidenceReviewer = {
      updatedAt: '2026-08-20T00:01:00.000Z',
      reviewer: {
        agentId: 'reviewer',
        agentType: 'expert-evidence-reviewer',
        recordedAt: '2026-08-20T00:01:00.000Z',
        content: 'Reviewer supports the observed source detail.',
        entries: [],
      },
    }

    const instruction = buildExpertRuntimeTurnInstruction(expert, {
      enabledToolNames: ['AskUserQuestion', 'Read', 'Playwright', 'Write'],
    })
    expect(instruction).toContain('SOURCE_ROWS: Keep every source row specific to its observed page and evidence boundary.')
    expect(instruction).toContain('"SOURCE_ROWS"')
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
  test('uses the complete global enabled tool pool for every Expert', () => {
    const runtimeBinding = binding()
    runtimeBinding.hostTools = [{ id: 'Read', name: 'Read', purpose: 'Read supplied files.' }]
    runtimeBinding.tools = []
    const enabledToolNames = ['Read', 'Write', 'Bash', 'Glob', 'Agent', 'WebSearch', 'Edit']

    const availability = resolveExpertRuntimeToolAvailability(runtimeBinding, enabledToolNames)
    expect(availability.toolNames).toEqual(enabledToolNames)

    const policy = resolveExpertRuntimeToolPolicy(activeSession(runtimeBinding), { enabledToolNames })
    expect(policy.allowedTools).toEqual(enabledToolNames)
    expect(policy.disallowedTools).toEqual([])
  })

  test('keeps the complete host pool for a package-local Skills Expert', () => {
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
    expect(availability.toolNames).toEqual(enabledToolNames)

    const policy = resolveExpertRuntimeToolPolicy(activeSession(packageLocalBinding), { enabledToolNames })
    expect(policy.disallowedTools).toEqual([])

    const instruction = buildExpertRuntimeTurnInstruction(activeSession(packageLocalBinding), { enabledToolNames })
    expect(instruction).toContain('Package-local Skill guidance is active for this Expert ZIP only.')
    expect(instruction).toContain('global Skill tool and the full currently enabled host tool pool remain available')
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
    expect(strictAvailability.toolNames).toEqual(enabledToolNames)

    const strictPolicy = resolveExpertRuntimeToolPolicy(activeSession(strictBinding), { enabledToolNames })
    expect(strictPolicy.disallowedTools).toEqual([])

    const instruction = buildExpertRuntimeTurnInstruction(activeSession(strictBinding), { enabledToolNames })
    expect(instruction).toContain('Strict visual workflow is active for this Expert ZIP only.')
    expect(instruction).toContain('The full Desktop host tool pool remains available')
    expect(instruction).toContain('本轮实际应用的 ZIP 专项 Skill')
    expect(instruction).toContain('screenshot-ui-redesign, ui-craft-critique, playwright-visual-qc')
    expect(instruction).toContain('every user-facing question or request for an answer must call AskUserQuestion')
    expect(instruction).toContain('Direction selection is a mandatory AskUserQuestion gate:')
    expect(instruction).toContain('do not Write, Bash, or begin production until the card result selects a direction')
    expect(instruction).toContain('production is non-blocking by default')
    expect(instruction).toContain('active session workDir is the authorized output location')
    expect(instruction).toContain('Missing commercial details after direction are not automatically a blocker.')
    expect(instruction).toContain('continue source-only')
    expect(instruction).toContain('never replace it with prose bullet questions')
    expect(instruction).toContain('real image generation is the preferred final deliverable')
    expect(instruction).toContain('Immediately Read the returned Image path exactly once')
    expect(instruction).toContain('bounded visual preview')
    expect(instruction).toContain('Source-surface integrity:')
    expect(instruction).not.toContain('do not automatically Read the original Provider PNG')
    expect(instruction).toContain('Deliver the real Provider-generated PNG, not an HTML screenshot disguised as AI imagery.')
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
    expect(instruction).toContain('- Skill')
    expect(instruction).toContain('- EnterPlanMode')
    expect(instruction).toContain('- Agent')
  })


  test('bounds strict visual package Skill injection while retaining required methods', () => {
    const strictBinding: ExpertRuntimeBinding = {
      ...binding(),
      expertId: 'uiux-design-system-expert',
      runtimePolicy: {
        mode: 'strict-visual-workflow',
        allowedToolNames: [],
        requiredSkillIds: ['required-redesign', 'required-critique'],
      },
      skills: [
        {
          skillId: 'optional-first',
          title: 'Optional first',
          path: 'skills/optional-first/SKILL.md',
          sha256: 'optional-first',
          content: 'optional-first-content '.repeat(300),
        },
        {
          skillId: 'required-redesign',
          title: 'Required redesign',
          path: 'skills/required-redesign/SKILL.md',
          sha256: 'required-redesign',
          content: 'required-redesign-content '.repeat(300),
        },
        {
          skillId: 'required-critique',
          title: 'Required critique',
          path: 'skills/required-critique/SKILL.md',
          sha256: 'required-critique',
          content: 'required-critique-content '.repeat(300),
        },
        ...Array.from({ length: 20 }, (_, index) => ({
          skillId: `optional-${index}`,
          title: `Optional ${index}`,
          path: `skills/optional-${index}/SKILL.md`,
          sha256: `optional-${index}`,
          content: `optional-${index}-content `.repeat(300),
        })),
      ],
    }

    const instruction = buildExpertRuntimeTurnInstruction(activeSession(strictBinding), {
      enabledToolNames: ['AskUserQuestion', 'Read'],
    })

    expect(instruction).toContain('## Skill: Required redesign')
    expect(instruction).toContain('## Skill: Required critique')
    expect(instruction).toContain('## Package-local Skill index')
    expect(instruction).toContain('optional-')
    expect(instruction).toContain('strict aggregate context budget')
    expect(instruction.length).toBeLessThan(55_000)
  })

  test('isolates the prototype visual-quality gate to the 原型图demo ZIP', () => {
    const standardBinding = binding()
    const prototypeBinding: ExpertRuntimeBinding = {
      ...binding(),
      expertId: 'web-information-designer',
      expertName: '原型图demo',
      packId: 'web-information-designer',
      runtimePolicy: {
        mode: 'prototype-visual-workflow',
        allowedToolNames: ['AskUserQuestion', 'Read', 'Write', 'Bash', 'Playwright'],
        requiredSkillIds: ['prototype-fidelity-workflow', 'prototype-visual-quality-gate', 'frontend-design'],
      },
    }
    const enabledToolNames = ['AskUserQuestion', 'Read', 'Write', 'Bash', 'Playwright', 'Agent', 'Skill']

    expect(resolveExpertRuntimeToolAvailability(prototypeBinding, enabledToolNames).toolNames).toEqual([
      'AskUserQuestion', 'Read', 'Write', 'Bash', 'Playwright',
    ])
    expect(resolveExpertRuntimeToolPolicy(activeSession(prototypeBinding), { enabledToolNames })).toEqual({
      allowedTools: ['AskUserQuestion', 'Read', 'Write', 'Bash', 'Playwright'],
      disallowedTools: ['Agent', 'Skill'],
    })

    const standardInstruction = buildExpertRuntimeTurnInstruction(activeSession(standardBinding), { enabledToolNames })
    const prototypeInstruction = buildExpertRuntimeTurnInstruction(activeSession(prototypeBinding), { enabledToolNames })
    expect(standardInstruction).not.toContain('Prototype visual-quality workflow is active for this Expert ZIP only.')
    expect(prototypeInstruction).toContain('Prototype visual-quality workflow is active for this Expert ZIP only.')
    expect(prototypeInstruction).toContain('prototype-fidelity-workflow, prototype-visual-quality-gate, frontend-design')
    expect(prototypeInstruction).toContain('server-gated')
    expect(prototypeInstruction).toContain('<prototype-visual-review-receipt>')
    expect(prototypeInstruction).toContain('Any 390 crop/overflow, 1024 disconnected or overlapping layout, 1440 decorative-only hero or buried CTA')
    expect(prototypeInstruction).toContain('what is visibly present in that named PNG')
    expect(prototypeInstruction).toContain('PrototypePreview')
    expect(prototypeInstruction).toContain('existing session snapshot predates PrototypePreview')
    expect(prototypeInstruction).toContain('not a generic research report')
  })


  test('upgrades legacy commercialization researcher gates without losing the audit and review workflow', () => {
    const legacy: ExpertRuntimeBinding = {
      ...binding(),
      promptSnapshot: [
        '1. **brief 与并行研究**：旧版分工。',
        '   - 必须为每个实际打开的具体公开页增加 `### Page disposition: <audit ID 或最终 URL>`。',
        '2. **独立复核**：06 仍是浏览事实来源。',
      ].join('\n'),
      researchEvidenceAbsorptionPolicy: {
        required: true,
        userInteraction: 'none',
        before: 'template-fill',
        reviewerAgentType: 'expert-evidence-reviewer',
        sourceAgentTypes: ['expert-evidence-researcher'],
        sourceFieldId: 'SOURCE_ROWS',
        requireAllOpenedSourcesDisposition: true,
        requireSourceFieldMapping: true,
        requireSearchAuditBindings: true,
        requireAuditedDetailClusters: true,
        requireResearchArtifactAuditAssertions: true,
      },
      researchArtifactPolicy: {
        mode: 'markdown-path-only',
        directory: 'commercialization-research',
        briefPath: 'commercialization-research/01-research-brief.md',
        researcherPaths: ['commercialization-research/04-channels.md'],
        reviewerPath: 'commercialization-research/05-evidence-review.md',
        auditPath: 'commercialization-research/06-browser-audit.md',
        maxCharacters: 10000,
        requireOpenedPageDisposition: true,
        routeCompletion: {
          mode: 'dynamic-route-status-v1',
          sourceLanes: {
            'cn-channel': { hostSuffixes: ['sspai.com'] },
            'global-channel': { hostSuffixes: ['reddit.com'] },
            'cn-user': { hostSuffixes: ['zhihu.com'] },
          },
        },
      },
    }

    const upgraded = upgradeCommercializationResearchChannelBinding(legacy)
    expect(upgraded).not.toBe(legacy)
    expect(upgraded.researchArtifactPolicy).not.toHaveProperty('routeCompletion')
    expect(upgraded.researchArtifactPolicy).not.toHaveProperty('requireOpenedPageDisposition')
    expect(legacy.researchArtifactPolicy?.routeCompletion).toBeDefined()
    expect(upgraded.promptSnapshot).toContain('每一次写入都是可继续补充的持久研究台账')
    expect(upgraded.promptSnapshot).not.toContain('Page disposition: <audit ID')
    expect(upgraded.researchEvidenceAbsorptionPolicy).not.toHaveProperty('requireSearchAuditBindings')
    expect(upgraded.researchEvidenceAbsorptionPolicy).not.toHaveProperty('requireAllOpenedSourcesDisposition')
    expect(upgraded.researchEvidenceAbsorptionPolicy).not.toHaveProperty('requireAuditedDetailClusters')
    expect(upgraded.researchEvidenceAbsorptionPolicy).not.toHaveProperty('requireResearchArtifactAuditAssertions')
    expect(legacy.researchEvidenceAbsorptionPolicy?.requireResearchArtifactAuditAssertions).toBe(true)

    const session = activeSession(legacy)
    const upgradedSession = upgradeCommercializationResearchChannelRuntime(session, '2026-08-20T08:30:00.000Z')
    expect(upgradedSession.updatedAt).toBe('2026-08-20T08:30:00.000Z')
    expect(upgradedSession.runtimeBinding.researchArtifactPolicy).not.toHaveProperty('routeCompletion')

    const foreignBinding = { ...legacy, expertId: 'other-expert', packId: 'other-pack' }
    expect(upgradeCommercializationResearchChannelBinding(foreignBinding)).toBe(foreignBinding)
    const foreignSession = activeSession(foreignBinding)
    expect(upgradeCommercializationResearchChannelRuntime(foreignSession)).toBe(foreignSession)
  })


  test('preserves the current brief-selected route contract while still removing legacy fixed-domain lanes', () => {
    const current: ExpertRuntimeBinding = {
      ...binding(),
      researchArtifactPolicy: {
        mode: 'markdown-path-only',
        directory: 'commercialization-research',
        briefPath: 'commercialization-research/01-research-brief.md',
        researcherPaths: ['commercialization-research/03-user-needs.md'],
        reviewerPath: 'commercialization-research/05-evidence-review.md',
        auditPath: 'commercialization-research/06-browser-audit.md',
        maxCharacters: 10000,
        routeCompletion: { mode: 'dynamic-route-status-v2', requireAttemptedRequiredRoutes: true },
      },
    }

    const upgraded = upgradeCommercializationResearchChannelBinding(current)

    expect(upgraded).toBe(current)
    expect(upgraded.researchArtifactPolicy?.routeCompletion).toEqual({
      mode: 'dynamic-route-status-v2',
      requireAttemptedRequiredRoutes: true,
    })
  })

})

test('preserves complete ZIP prompt, skills and valid output protocol beyond legacy character caps', () => {
  const prompt = '研究规则'.repeat(7000) + '\nFINALIZE_AFTER_REVIEW'
  const protocol = JSON.stringify({ description: '字段说明'.repeat(5000), tail: 'END_OF_PROTOCOL' })
  const context = { expert: { id: 'research', name: 'Research', packId: 'research', packVersion: '1', tools: [] }, prompts: { system: prompt }, skills: [{ skillId: 'research', title: 'Research', path: 'skills/research/SKILL.md', sha256: 'test', content: prompt + 'END_OF_SKILL' }], forms: [], hostTools: [], permissions: [], outputProtocol: { path: 'outputs/material-protocol.json', content: protocol } } as unknown as ExpertRuntimeContext
  const actual = createExpertRuntimeBinding(context, '2026-09-08T00:00:00Z')
  expect(actual.promptSnapshot).toBe(prompt)
  expect(actual.skills[0]!.content).toBe(prompt + 'END_OF_SKILL')
  expect(actual.outputProtocol!.content).toBe(protocol)
  expect(JSON.parse(actual.outputProtocol!.content).tail).toBe('END_OF_PROTOCOL')
})

test('rehydrates only truncated fields from the same installed pack and preserves session evidence', async () => {
  const { restoreTruncatedExpertRuntime } = await import('./expertRuntimeBindingService.js')
  const old = activeSession(binding())
  old.runtimeBinding!.promptSnapshot = 'partial\n[truncated by expert runtime]'
  old.runtimeBinding!.outputProtocol = { path: 'outputs/material-protocol.json', content: '{"partial":\n[truncated by expert runtime]' }
  old.researchEvidence = { records: [], updatedAt: '2026-09-07T00:00:00Z' }
  const context = { expert: { id: old.expertId, packId: old.packId, packVersion: old.packVersion }, prompts: { system: '完整研究与最终交付规则' }, outputProtocol: { path: 'outputs/material-protocol.json', content: '{"complete":true}' }, skills: [] } as unknown as ExpertRuntimeContext
  const actual = await restoreTruncatedExpertRuntime(old, async () => context)
  expect(actual.runtimeBinding!.promptSnapshot).toBe('完整研究与最终交付规则')
  expect(JSON.parse(actual.runtimeBinding!.outputProtocol!.content)).toEqual({ complete: true })
  expect(actual.researchEvidence).toBe(old.researchEvidence)
  expect(old.runtimeBinding!.promptSnapshot).toContain('[truncated by expert runtime]')
  expect(await restoreTruncatedExpertRuntime(old, async () => ({ ...context, expert: { ...context.expert, packVersion: 'other-version' } }))).toBe(old)
})

test('upgrades old dispatch receipts additively without inventing an agent completion', () => {
  const old = activeSession(binding())
  old.researchSourceDispatches = { receipts: [{ artifactPath: 'commercialization-research/03-user-needs.md', batchFingerprint: 'old', agentId: 'legacy-worker', coreEntryCount: 1, openEntryCount: 0, dispatchedAt: '2026-09-07T00:00:00Z' }] }
  const actual = upgradeCommercializationResearchChannelRuntime(old)
  expect(actual.researchSourceDispatches!.receipts[0]!.retryCount).toBe(0)
  expect(actual.researchSourceDispatches!.receipts[0]!.completedAt).toBeUndefined()
  expect(old.researchSourceDispatches.receipts[0]!.retryCount).toBeUndefined()
  expect(upgradeCommercializationResearchChannelRuntime(actual)).toBe(actual)
})


test('migrates the known commercial patch atomically without mixing old prompts and new protocol', async () => {
  const { restoreTruncatedExpertRuntime } = await import('./expertRuntimeBindingService.js')
  const old = activeSession(binding())
  Object.assign(old, { expertId: 'commercialization-research-report', packId: 'commercialization-research-report', packVersion: '0.13.45-local' })
  Object.assign(old.runtimeBinding!, { expertId: old.expertId, packId: old.packId, packVersion: old.packVersion, promptSnapshot: 'old partial [truncated by expert runtime]' })
  old.researchEvidence = { records: [], updatedAt: '2026-09-07T00:00:00Z' }
  const context = { expert: { id: old.expertId, name: 'Commercial', packId: old.packId, packVersion: '0.13.46-local', tools: [] }, prompts: { system: 'two-minute bounded verification and one retry' }, skills: [], forms: [], hostTools: [], permissions: [], outputProtocol: { path: 'outputs/material-protocol.json', content: '{"rule":"new matching protocol"}' } } as unknown as ExpertRuntimeContext
  const restored = await restoreTruncatedExpertRuntime(old, async () => context)
  expect(restored.packVersion).toBe('0.13.46-local')
  expect(restored.runtimeBinding!.packVersion).toBe('0.13.46-local')
  expect(restored.runtimeBinding!.promptSnapshot).toBe(context.prompts.system)
  expect(restored.runtimeBinding!.outputProtocol!.content).toBe(context.outputProtocol!.content)
  expect(restored.researchEvidence).toBe(old.researchEvidence)
  expect(restored.runtimeBinding!.activatedAt).toBe(old.runtimeBinding!.activatedAt)
  expect(await restoreTruncatedExpertRuntime(old, async () => ({ ...context, expert: { ...context.expert, packVersion: '0.14.0' } }))).toBe(old)
})


test.each(['0.13.45-local', '0.13.46-local'])('upgrades %s to the task-purpose patch without resetting durable research or choices', async (version) => {
  const { restoreTruncatedExpertRuntime } = await import('./expertRuntimeBindingService.js')
  const old = activeSession(binding())
  Object.assign(old, { expertId: 'commercialization-research-report', packId: 'commercialization-research-report', packVersion: version })
  Object.assign(old.runtimeBinding!, { expertId: old.expertId, packId: old.packId, packVersion: version, promptSnapshot: 'old source-only instructions' })
  old.researchEvidence = { records: [], updatedAt: '2026-09-08T08:00:00Z' }
  old.researchSourceDispatches = { receipts: [{ artifactPath: 'commercialization-research/02-competitors.md', batchFingerprint: 'kept-batch', agentId: 'kept-agent', coreEntryCount: 10, openEntryCount: 0, dispatchedAt: '2026-09-08T08:00:00Z', completedAt: '2026-09-08T08:01:00Z', retryCount: 1 }] }
  old.intakeState = { answers: { product: 'fixture-product', market: 'CN' }, errors: {}, completedStepIds: ['product'], updatedAt: '2026-09-08T08:00:00Z' }
  const context = { expert: { id: old.expertId, name: 'Commercial', packId: old.packId, packVersion: '0.13.47-local', tools: [] }, prompts: { system: 'research_task_kind source-batch / targeted-evidence' }, skills: [], forms: [], hostTools: [], permissions: [], outputProtocol: { path: 'outputs/material-protocol.json', content: '{"taskPurpose":"same contract"}' } } as unknown as ExpertRuntimeContext
  const restored = await restoreTruncatedExpertRuntime(old, async () => context)
  expect(restored.packVersion).toBe('0.13.47-local')
  expect(restored.runtimeBinding!.promptSnapshot).toBe(context.prompts.system)
  expect(restored.runtimeBinding!.outputProtocol!.content).toBe(context.outputProtocol!.content)
  expect(restored.researchEvidence).toBe(old.researchEvidence)
  expect(restored.researchSourceDispatches).toBe(old.researchSourceDispatches)
  expect(restored.intakeState).toBe(old.intakeState)
  expect(restored.runtimeBinding!.activatedAt).toBe(old.runtimeBinding!.activatedAt)
  expect(await restoreTruncatedExpertRuntime(old, async () => ({ ...context, expert: { ...context.expert, packVersion: '0.14.0' } }))).toBe(old)
})


describe('commercialization 0.13.55 prompt consistency upgrade', () => {
  function fixtures() {
    const old = activeSession(binding())
    old.packVersion = '0.13.54-local'
    Object.assign(old.runtimeBinding!, { packVersion: old.packVersion, promptSnapshot: 'existing research rules' })
    old.runtimeBinding!.outputProtocol = { path: 'outputs/material-protocol.json', content: '{"delivery":"one structured Write call"}' }
    old.researchEvidence = { records: [], updatedAt: '2026-09-17T00:00:00Z' }
    old.researchSourceDispatches = { receipts: [] }
    old.intakeState = { answers: { product: 'kept product' }, errors: {}, completedStepIds: ['product'], updatedAt: '2026-09-17T00:00:00Z' }
    const context = { expert: { id: old.expertId, name: 'Commercial', packId: old.packId, packVersion: '0.13.55-local', tools: [] }, prompts: { system: 'consistent research rules' }, skills: [{ skillId: 'research-method', title: 'Research', path: 'skills/research-method/SKILL.md', sha256: 'new', content: 'AskUserQuestion only for necessary product unknowns' }], forms: [], hostTools: [], permissions: [], outputProtocol: { path: 'outputs/material-protocol.json', content: '{"delivery":"draft then 08 then patch or finalize"}' } } as unknown as ExpertRuntimeContext
    return { old, context }
  }

  test('refreshes the exact reviewed 0.13.54 binding atomically and preserves answers and research', async () => {
    const { restoreTruncatedExpertRuntime } = await import('./expertRuntimeBindingService.js')
    const { old, context } = fixtures()
    const restored = await restoreTruncatedExpertRuntime(old, async () => context)
    expect(restored.packVersion).toBe('0.13.55-local')
    expect(restored.runtimeBinding!.packVersion).toBe('0.13.55-local')
    expect(restored.runtimeBinding!.promptSnapshot).toBe(context.prompts.system)
    expect(restored.runtimeBinding!.outputProtocol!.content).toBe(context.outputProtocol!.content)
    expect(restored.runtimeBinding!.skills[0]!.content).toBe(context.skills[0]!.content)
    expect(restored.researchEvidence).toBe(old.researchEvidence)
    expect(restored.researchSourceDispatches).toBe(old.researchSourceDispatches)
    expect(restored.intakeState).toBe(old.intakeState)
    expect(restored.runtimeBinding!.activatedAt).toBe(old.runtimeBinding!.activatedAt)
    expect(old.runtimeBinding!.outputProtocol!.content).toContain('one structured Write call')
    expect(await restoreTruncatedExpertRuntime(restored, async () => { throw new Error('must not reload') })).toBe(restored)
  })

  test('does not revive exited sessions or migrate other versions and experts', async () => {
    const { restoreTruncatedExpertRuntime } = await import('./expertRuntimeBindingService.js')
    const { old, context } = fixtures()
    let loads = 0
    const load = async () => { loads += 1; return context }
    const exited = { ...old, status: 'exited' as const }
    expect(await restoreTruncatedExpertRuntime(exited, load)).toBe(exited)
    const unrelated = { ...old, expertId: 'other', packId: 'other', runtimeBinding: { ...old.runtimeBinding!, expertId: 'other', packId: 'other' } }
    expect(await restoreTruncatedExpertRuntime(unrelated, load)).toBe(unrelated)
    expect(loads).toBe(0)
    for (const version of ['0.13.52-local', '0.13.54-local', '0.14.0']) {
      expect(await restoreTruncatedExpertRuntime(old, async () => ({ ...context, expert: { ...context.expert, packVersion: version } }))).toBe(old)
    }
    expect(await restoreTruncatedExpertRuntime(old, async () => ({ ...context, expert: { ...context.expert, id: 'other' } }))).toBe(old)
    expect(await restoreTruncatedExpertRuntime(old, async () => { throw new Error('pack unavailable') })).toBe(old)
  })
})

describe('UIUX generated-image-only target isolation', () => {
  const imageBinding = (): ExpertRuntimeBinding => ({
    ...binding(), expertId: 'uiux-design-system-expert', expertName: 'UIUX设计系统专家', packId: 'uiux-design-system-expert', packVersion: '0.3.26',
    promptSnapshot: 'UIUX image workflow', skills: [],
    runtimePolicy: { mode: 'strict-visual-workflow', allowedToolNames: ['AskUserQuestion', 'Read', 'Playwright', 'image_generation'], requiredSkillIds: [] },
    outputProtocol: { path: 'experts/uiux-design-system-expert/output-protocol.json', content: JSON.stringify({ deliveryMode: 'generated-image-only' }) },
  })
  const pool = ['AskUserQuestion', 'Read', 'Playwright', 'image_generation', 'Write', 'Bash', 'Edit', 'Skill', 'Agent']
  test('UIUX only exposes real image and reference tools, with a real session deny list', () => {
    const policy = resolveExpertRuntimeToolPolicy(activeSession(imageBinding()), { enabledToolNames: pool })
    expect(policy.allowedTools).toEqual(pool.slice(0, 4))
    expect(policy.disallowedTools).toEqual(pool.slice(4))
    const prompt = buildExpertRuntimeTurnInstruction(activeSession(imageBinding()), { enabledToolNames: pool })!
    expect(prompt).toContain('UIUX_GENERATED_IMAGE_ONLY')
    expect(prompt).not.toContain('Rerender all three viewports')
    expect(prompt).not.toContain('modify the HTML, rerender')
    expect(prompt).toContain('inspiration_source')
    expect(prompt).toContain('design_direction')
  })
  test('UIUX missing/disabled image tools are not invented', () => {
    const policy = resolveExpertRuntimeToolPolicy(activeSession(imageBinding()), { enabledToolNames: ['AskUserQuestion', 'Read', 'Write'] })
    expect(policy.allowedTools).toEqual(['AskUserQuestion', 'Read'])
    expect(policy.disallowedTools).toEqual(['Write'])
  })
  test('does not opt the prototype, commercialization, or custom packs into the UIUX policy', () => {
    for (const id of ['web-information-designer', 'commercialization-research-report', 'custom-uiux']) {
      const other = { ...imageBinding(), expertId: id, packId: id }
      expect(resolveExpertRuntimeToolPolicy(activeSession(other), { enabledToolNames: pool }).disallowedTools).toEqual([])
      expect(buildExpertRuntimeTurnInstruction(activeSession(other), { enabledToolNames: pool })).not.toContain('UIUX_GENERATED_IMAGE_ONLY')
    }
  })
})


describe('UIUX generated-image-only reviewed binding migration', () => {
  test.each(['0.3.25', '0.3.26', '0.3.27'])('upgrades the exact old UIUX %s fixture and preserves session data; unrelated packs do not load', async (oldVersion) => {
    const oldBinding = { ...binding(), expertId: 'uiux-design-system-expert', packId: 'uiux-design-system-expert', packVersion: oldVersion, runtimePolicy: { mode: 'strict-visual-workflow' as const, allowedToolNames: ['Read', 'Write'], requiredSkillIds: [] } }
    const before = activeSession(oldBinding)
    const context = { expert: { id: before.expertId, name: 'UIUX设计系统专家', packId: before.packId, packVersion: '0.3.28', tools: [], runtimePolicy: { mode: 'strict-visual-workflow', allowedToolNames: ['Read', 'image_generation'], requiredSkillIds: [] } }, prompts: { system: 'Real image instructions' }, skills: [], hostTools: [], permissions: [], outputProtocol: { path: 'output-protocol.json', content: '{"deliveryMode":"generated-image-only"}' } } as unknown as ExpertRuntimeContext
    const upgraded = await upgradeUiuxImageOnlyRuntime(before, async () => context)
    expect(upgraded.packVersion).toBe('0.3.28')
    expect(upgraded.runtimeBinding?.packVersion).toBe('0.3.28')
    expect(upgraded.startedAt).toBe(before.startedAt)
    expect(upgraded.materialRefs).toBe(before.materialRefs)
    expect(before.runtimeBinding?.packVersion).toBe(oldVersion)
    for (const unchanged of [upgraded, { ...before, expertId: 'web-information-designer' }, { ...before, packId: 'commercialization-research-report' }]) {
      let loaded = false
      expect(await upgradeUiuxImageOnlyRuntime(unchanged, async () => { loaded = true; throw new Error('unexpected') })).toBe(unchanged)
      expect(loaded).toBe(false)
    }
    expect(await upgradeUiuxImageOnlyRuntime(before, async () => { throw new Error('missing') })).toBe(before)
    expect(await upgradeUiuxImageOnlyRuntime(before, async () => ({ ...context, expert: { ...context.expert, id: 'wrong' } }))).toBe(before)
  })
})


describe('UIUX merged instruction isolation', () => {
  test('injects the image contract once and keeps visual derivative rules out of commercialization', async () => {
    const { UIUX_IMAGE_ONLY_RUNTIME_INSTRUCTION } = await import('../../services/tools/uiuxImageContract.js')
    const uiux = { ...binding(), expertId: 'uiux-design-system-expert', packId: 'uiux-design-system-expert', packVersion: '0.3.28', promptSnapshot: UIUX_IMAGE_ONLY_RUNTIME_INSTRUCTION, runtimePolicy: { mode: 'strict-visual-workflow' as const, allowedToolNames: ['Read', 'Playwright', 'AskUserQuestion', 'image_generation'], requiredSkillIds: [] }, outputProtocol: { path: 'output-protocol.json', content: '{"deliveryMode":"generated-image-only"}' } }
    const instruction = buildExpertRuntimeTurnInstruction(activeSession(uiux), { enabledToolNames: ['Read', 'Playwright', 'AskUserQuestion', 'image_generation'] })!
    expect(instruction.split('UIUX_GENERATED_IMAGE_ONLY:')).toHaveLength(2)
    expect(instruction).not.toContain('create and Read a same-directory derivative')
    expect(instruction).toContain('Read the EXACT returned Local screenshot path')
    const ordinary = { ...binding(), promptSnapshot: 'ordinary', runtimePolicy: undefined, hostTools: [{ id: 'Playwright', name: 'Playwright', purpose: 'public research', supported: true }] }
    const other = buildExpertRuntimeTurnInstruction(activeSession(ordinary), { enabledToolNames: ['Read', 'Playwright'] })!
    expect(other).not.toContain('create and Read a same-directory derivative')
    expect(other).not.toContain('UIUX_GENERATED_IMAGE_ONLY:')
  })
})


describe('Expert process binding identity', () => {
  test('tracks static prompt and presentation changes but ignores research progress', () => {
    const expert = activeSession(binding())
    const key = getExpertProcessBindingKey(expert)
    expect(key).toMatch(/^[a-f0-9]{64}$/)
    expect(getExpertProcessBindingKey({ ...expert, updatedAt: '2026-09-16T12:00:00Z', researchEvidence: { records: [] } } as any)).toBe(key)
    expect(getExpertProcessBindingKey({ ...expert, runtimeBinding: { ...expert.runtimeBinding!, promptSnapshot: 'Changed prompt' } })).not.toBe(key)
    expect(getExpertProcessBindingKey({ ...expert, researchBrowserPresentation: 'always_visible' })).not.toBe(key)
    expect(getExpertProcessBindingKey({ ...expert, status: 'exited' })).toBeUndefined()
    expect(getExpertProcessBindingKey(undefined)).toBeUndefined()
  })
})


describe('commercialization question routing consistency', () => {
  test('does not inject visual-reference quotas or evidence-gap permission gates into research', () => {
    const instruction = buildExpertRuntimeTurnInstruction(activeSession(binding()), { enabledToolNames: ['AskUserQuestion', 'Read', 'Playwright', 'Write'] })!
    expect(instruction).not.toContain('Use exactly two task-relevant, role-distinct concrete URLs')
    expect(instruction).not.toContain('permission to retain an evidence gap')
    expect(instruction).toContain('Continue with bounded inference or an explicit evidence gap')
    expect(instruction).toContain('every user-facing request for an answer must use AskUserQuestion')
  })

  test('does not turn missing browser evidence into a new user approval gate', () => {
    const instruction = buildExpertRuntimeTurnInstruction(activeSession(binding()), { enabledToolNames: ['AskUserQuestion', 'Read', 'Write'] })!
    expect(instruction).not.toContain('permission to retain an evidence gap')
    expect(instruction).toContain('Do not claim that public pages were checked')
    expect(instruction).toContain('Continue with bounded inference or an explicit evidence gap')
  })

  test('keeps public visual-reference guidance scoped to an actual visual expert', () => {
    const visual = { ...binding(), expertId: 'custom-visual', packId: 'custom-visual', runtimePolicy: { mode: 'strict-visual-workflow' as const, allowedToolNames: ['Read', 'Playwright', 'AskUserQuestion'], requiredSkillIds: [] } }
    const instruction = buildExpertRuntimeTurnInstruction(activeSession(visual), { enabledToolNames: ['AskUserQuestion', 'Read', 'Playwright'] })!
    expect(instruction).toContain('Use exactly two task-relevant, role-distinct concrete URLs')
  })
})
