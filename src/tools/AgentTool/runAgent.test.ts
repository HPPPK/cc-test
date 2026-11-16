import { afterEach, describe, expect, test } from 'bun:test'
import { readFile, mkdtemp, mkdir, symlink, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { assignedResearchArtifactPath, assignedResearchArtifactPathFromTask, buildExpertSubagentPackagePrompt, resolveExpertResearchTaskKind, formatFileFirstOutputReviewContext, researcherArtifactWriteError, researcherArtifactEditError, pageExpertResearchRead, reportWorkerReadError, resolveExpertAgentModel } from './runAgent.js'

const policyKey = 'CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY'
const outputRootKey = 'CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT'
const originalPolicy = process.env[policyKey]
const originalOutputRoot = process.env[outputRootKey]

afterEach(() => {
  if (originalPolicy === undefined) delete process.env[policyKey]
  else process.env[policyKey] = originalPolicy
  if (originalOutputRoot === undefined) delete process.env[outputRootKey]
  else process.env[outputRootKey] = originalOutputRoot
})

describe('runAgent expert source-assignment callback', () => {
  test('binds the callback in the runtime parameter destructuring before invoking it', async () => {
    const source = await readFile(new URL('./runAgent.ts', import.meta.url), 'utf8')
    const signatureStart = source.indexOf('export async function* runAgent({')
    const signatureEnd = source.indexOf('}: {', signatureStart)
    const runtimeParameters = source.slice(signatureStart, signatureEnd)

    expect(signatureStart).toBeGreaterThanOrEqual(0)
    expect(signatureEnd).toBeGreaterThan(signatureStart)
    expect(runtimeParameters).toContain('onExpertResearchAssignment,')
  })
})

describe('researcherArtifactWriteError', () => {
  test('recognizes a single Windows absolute researcher target named in the parent prompt', () => {
    const assigned = assignedResearchArtifactPath([
      { message: { content: [{ type: 'text', text: '请写入 C:\\Users\\test\\Desktop\\0816\\commercialization-research\\04-channels.md' }] } } as never,
    ], [
      'commercialization-research/02-competitors.md',
      'commercialization-research/04-channels.md',
    ])

    expect(assigned).toBe('commercialization-research/04-channels.md')
  })

  test('uses the current Agent call target instead of shared sibling history when assigning a source package', () => {
    const paths = [
      'commercialization-research/02-competitors.md',
      'commercialization-research/03-user-needs.md',
      'commercialization-research/04-channels.md',
    ]
    const context = {
      expertId: 'commercialization-research-report',
      packId: 'commercialization-research-report',
      packVersion: 'test',
      artifactPaths: {
        briefPath: 'commercialization-research/01-research-brief.md',
        researcherPaths: paths,
        reviewerPath: 'commercialization-research/05-evidence-review.md',
        auditPath: 'commercialization-research/06-browser-audit.md',
      },
      researchSourcePlan: {
        batches: [
          { owner: 'competitors' as const, artifactPath: paths[0], entries: [{ tier: 'core' as const, category: '竞品', candidateUrl: 'https://competitor.example.com/', candidateHost: 'competitor.example.com', owner: 'competitors' as const }] },
          { owner: 'demand-market' as const, artifactPath: paths[1], entries: [{ tier: 'core' as const, category: '需求', candidateUrl: 'https://demand.example.com/', candidateHost: 'demand.example.com', owner: 'demand-market' as const }] },
          { owner: 'commercialization-channel' as const, artifactPath: paths[2], entries: [{ tier: 'core' as const, category: '渠道', candidateUrl: 'https://channel.example.com/', candidateHost: 'channel.example.com', owner: 'commercialization-channel' as const }] },
        ],
      },
      skills: [],
    }
    const promptMessages = [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'parent spawned all siblings: ' + paths.join(' ') }] } },
      { type: 'user', message: { content: [{ type: 'text', text: 'shared fork prefix still names every sibling: ' + paths.join(' ') }] } },
    ] as never

    const prepared = buildExpertSubagentPackagePrompt({
      agentType: 'expert-evidence-researcher',
      promptMessages,
      declaredResearchArtifactPath: paths[1],
      taskPrompt: 'Write only ' + paths[1],
      expertSkillContext: context,
    })

    expect(prepared.researcherTargetPath).toBe(paths[1])
    expect(prepared.prompt).toContain('<expert-research-source-assignment>')
    expect(prepared.prompt).toContain('https://demand.example.com/')
    expect(prepared.prompt).not.toContain('https://competitor.example.com/')
    expect(prepared.prompt).not.toContain('https://channel.example.com/')
  })

  test('does not let a current Agent task fall back to shared history when its source target is ambiguous', () => {
    const paths = ['commercialization-research/02-competitors.md', 'commercialization-research/03-user-needs.md']
    expect(assignedResearchArtifactPathFromTask(undefined, paths.join(' '), paths)).toBeUndefined()
    expect(assignedResearchArtifactPathFromTask(paths[0], 'Write only ' + paths[1], paths)).toBeUndefined()
  })

  test('fails explicitly instead of silently dropping a planned source package without a unique researcher path', () => {
    const paths = ['commercialization-research/02-competitors.md', 'commercialization-research/03-user-needs.md']
    expect(() => buildExpertSubagentPackagePrompt({
      agentType: 'expert-evidence-researcher',
      promptMessages: [{ type: 'assistant', message: { content: [{ type: 'text', text: 'shared history has a unique-looking old path: ' + paths[0] }] } }] as never,
      taskPrompt: paths.join(' '),
      expertSkillContext: {
        expertId: 'commercialization-research-report',
        packId: 'commercialization-research-report',
        packVersion: 'test',
        artifactPaths: { briefPath: 'commercialization-research/01-research-brief.md', researcherPaths: paths, reviewerPath: 'commercialization-research/05-evidence-review.md', auditPath: 'commercialization-research/06-browser-audit.md' },
        researchSourcePlan: { batches: [{ owner: 'competitors', artifactPath: paths[0], entries: [] }] },
        skills: [],
      },
    })).toThrow('EXPERT_RESEARCH_SOURCE_ASSIGNMENT_REQUIRED')
  })



  test('refuses to launch a commercialization researcher without its server source package', () => {
    expect(() => buildExpertSubagentPackagePrompt({
      agentType: 'expert-evidence-researcher',
      promptMessages: [] as never,
      declaredResearchArtifactPath: 'commercialization-research/02-competitors.md',
      taskPrompt: 'Write only commercialization-research/02-competitors.md',
      expertSkillContext: undefined,
    })).toThrow('EXPERT_RESEARCH_SOURCE_CONTEXT_REQUIRED')
  })

  test('keeps unrelated agents compatible when no commercialization source package exists', () => {
    expect(buildExpertSubagentPackagePrompt({
      agentType: 'general-purpose',
      promptMessages: [] as never,
      taskPrompt: 'Inspect a normal task',
      expertSkillContext: undefined,
    })).toEqual({})
  })

  test('allows incremental route-free Markdown checkpoints at its assigned path', () => {
    process.env[outputRootKey] = 'C:/Users/test/Desktop/0816'
    process.env[policyKey] = JSON.stringify({
      mode: 'markdown-path-only',
      directory: 'commercialization-research',
      briefPath: 'commercialization-research/01-research-brief.md',
      researcherPaths: ['commercialization-research/04-channels.md'],
      reviewerPath: 'commercialization-research/05-evidence-review.md',
      auditPath: 'commercialization-research/06-browser-audit.md',
      maxCharacters: 90000,
    })

    const target = 'commercialization-research/04-channels.md'
    const checkpoint = '# 已发现的渠道证据\n- 官网下载页：仅证明官方直达分发，不代表获客效果。'

    expect(researcherArtifactWriteError({ file_path: target, content: checkpoint }, target)).toBeUndefined()
    expect(researcherArtifactWriteError({ file_path: 'commercialization-research\\04-channels.md', content: checkpoint }, target)).toBeUndefined()
    expect(researcherArtifactWriteError({ file_path: 'C:/Users/test/Desktop/0816/commercialization-research/04-channels.md', content: checkpoint }, target)).toBeUndefined()
    expect(researcherArtifactWriteError({ file_path: 'commercialization-research/03-user-needs.md', content: checkpoint }, target)).toContain('task-assigned Markdown')
    expect(researcherArtifactWriteError({ file_path: target, content: '   ' }, target)).toContain('non-empty content')
  })
})

describe('formatFileFirstOutputReviewContext', () => {
  test('uses the same Markdown-only receipt contract as the file-first reviewer', () => {
    const prompt = formatFileFirstOutputReviewContext({
      briefPath: 'commercialization-research/01-research-brief.md',
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      reportPath: 'final-report.html',
      targetPath: 'commercialization-research/08-report-completeness-review.md',
      templateFields: [{ id: 'COMPETITOR_LANDSCAPE_ROWS', kind: 'table-rows', columns: ['产品', '能力'] }],
      provenancePaths: ['commercialization-research/02-competitors.parts/one.md', 'commercialization-research/05-evidence-review.md', 'commercialization-research/06-browser-audit.md'],
    })

    expect(prompt).toContain('08-report-completeness-review.md')
    expect(prompt).toContain('COMPETITOR_LANDSCAPE_ROWS')
    expect(prompt).toContain('never section numbers')
    expect(prompt).toContain('return exactly one short file receipt')
    expect(prompt).toContain('Do not repeat findings, evidence, URLs, review prose, limitations, error history, or next steps')
    expect(prompt).toContain('receipt is not a completion gate')
    expect(prompt).toContain('Read that exact output Markdown for save verification')
    expect(prompt).toContain('source-supported corrections')
    expect(prompt).not.toContain('free-form handoff')
    expect(prompt).toContain('02-competitors.parts/one.md')
    expect(prompt).toContain('independently check original captured source text')
  })
})


test('targeted competitor research retains its MD target without requiring an unrelated source batch', () => {
  const target = 'commercialization-research/02-competitors.md'
  const prepared = buildExpertSubagentPackagePrompt({
    agentType: 'expert-evidence-researcher', promptMessages: [],
    declaredResearchArtifactPath: target, taskPrompt: '只补直接竞品官网', researchTaskKind: 'targeted-evidence',
    expertSkillContext: {
      expertId: 'commercialization-research-report', packId: 'commercialization-research-report', packVersion: 'test',
      researchTaskKind: 'targeted-evidence',
      artifactPaths: { briefPath: 'commercialization-research/01-research-brief.md', researcherPaths: [target], reviewerPath: 'commercialization-research/05-evidence-review.md', auditPath: 'commercialization-research/06-browser-audit.md' },
      skills: [],
    },
  })
  expect(prepared.researcherTargetPath).toBe(target)
  expect(prepared.prompt).toContain('<expert-targeted-evidence-task>')
  expect(prepared.prompt).not.toContain('<expert-research-source-assignment>')
})


test('Agent input preserves explicit research purpose while old calls remain valid', async () => {
  const { inputSchema } = await import('./AgentTool.js')
  const base = { description: 'Research assigned evidence', prompt: 'Research current task', subagent_type: 'expert-evidence-researcher' }
  expect(inputSchema().parse(base)).not.toHaveProperty('research_task_kind')
  for (const research_task_kind of ['source-batch', 'targeted-evidence'] as const) {
    expect(inputSchema().parse({ ...base, research_task_kind }).research_task_kind).toBe(research_task_kind)
  }
})


describe('owned Markdown incremental edits', () => {
  test('allows a normal Edit append to the assigned ledger, not sibling paths or empty edits', () => {
    const path = 'commercialization-research/03-user-needs.md'
    expect(researcherArtifactEditError({ file_path: path, old_string: '## Evidence', new_string: '## Evidence\nA concrete observation' }, path)).toBeUndefined()
    expect(researcherArtifactEditError({ file_path: 'commercialization-research/02-competitors.md', old_string: 'x', new_string: 'y' }, path)).toContain('assigned Markdown')
    expect(researcherArtifactEditError({ file_path: path, old_string: 'x', new_string: '' }, path)).toBeDefined()
    expect(researcherArtifactEditError({ file_path: '../03-user-needs.md', old_string: 'x', new_string: 'y' }, path)).toBeDefined()
  })
})


test('gives every worker a private part while keeping its source batch and write permissions aligned', () => {
  const base = 'commercialization-research/02-competitors.md'
  const policy = { mode: 'markdown-path-only', directory: 'commercialization-research', briefPath: 'commercialization-research/01-research-brief.md', researcherPaths: [base], researcherParts: true, reviewerPath: 'commercialization-research/05-evidence-review.md', auditPath: 'commercialization-research/06-browser-audit.md', maxCharacters: 90000 }
  process.env[policyKey] = JSON.stringify(policy)
  process.env[outputRootKey] = 'C:/research'
  const make = (agentId: string) => buildExpertSubagentPackagePrompt({ agentId, agentType: 'expert-evidence-researcher', promptMessages: [], declaredResearchArtifactPath: base, taskPrompt: 'Research ' + base,
    expertSkillContext: { expertId: 'commercialization-research-report', packId: 'commercialization-research-report', packVersion: '0.13.52-local', artifactPaths: policy, skills: [],
      researchSourcePlan: { batches: [{ owner: 'competitors', artifactPath: base, entries: [{ tier: 'core', category: 'discovery', candidateUrl: 'https://example.com', candidateHost: 'example.com', owner: 'competitors' }] }] } } })
  const one = make('worker-one'), two = make('worker-two')
  expect(one.researcherTargetPath).toBe('commercialization-research/02-competitors.parts/worker-one.md')
  expect(two.researcherTargetPath).not.toBe(one.researcherTargetPath)
  expect(one.prompt).toContain('https://example.com')
  expect(one.prompt).toContain('唯一负责产物：' + one.researcherTargetPath!)
  expect(one.prompt).not.toContain('唯一负责产物：' + base)
  expect(one.prompt).toContain('新分片不存在时直接 Write')
  expect(researcherArtifactWriteError({ file_path: one.researcherTargetPath, content: '# saved' }, one.researcherTargetPath)).toBeUndefined()
  expect(researcherArtifactWriteError({ file_path: two.researcherTargetPath, content: '# wrong owner' }, one.researcherTargetPath)).toBeDefined()
  expect(assignedResearchArtifactPathFromTask(one.researcherTargetPath, 'Continue ' + one.researcherTargetPath, [base])).toBe(base)
})

test('pages research reads without resetting later offsets or expanding small requests', () => {
  expect(pageExpertResearchRead({ file_path: 'x.md' })).toEqual({ file_path: 'x.md', offset: 1, limit: 200 })
  expect(pageExpertResearchRead({ file_path: 'x.md', offset: 401, limit: 1000 })).toMatchObject({ offset: 401, limit: 200 })
  expect(pageExpertResearchRead({ file_path: 'x.md', offset: 201, limit: 40 })).toMatchObject({ offset: 201, limit: 40 })
})


describe('report worker Read and write-back verification boundary', () => {
  const paths = {
    briefPath: 'commercialization-research/01-research-brief.md',
    researcherPaths: ['commercialization-research/02-competitors.parts/one.md'],
    reviewerPath: 'commercialization-research/05-evidence-review.md',
    auditPath: 'commercialization-research/06-browser-audit.md',
    absorptionPath: 'commercialization-research/07-report-field-absorption.md',
    completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
  }
  const setup = () => {
    process.env[policyKey] = JSON.stringify({ ...paths, mode: 'markdown-path-only', directory: 'commercialization-research', researcherParts: true, researcherPaths: ['commercialization-research/02-competitors.md'], maxCharacters: 90000 })
    process.env[outputRootKey] = 'C:/research'
  }
  test.each(['expert-evidence-absorber', 'expert-evidence-output-reviewer'])('%s can Read its own exact output for the required verification', agentType => {
    setup()
    const own = agentType === 'expert-evidence-absorber' ? paths.absorptionPath : paths.completionReviewPath
    for (const file_path of [own, 'C:/research/' + own]) {
      expect(reportWorkerReadError({ file_path }, { agentType, artifactPaths: paths, reportPath: 'C:/research/report.html' })).toBeUndefined()
    }
  })
  test('rejects declared raw evidence symlinks and directory symlinks outside the workDir', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'expert-review-boundary-'))
    try {
      const workDir = path.join(root, 'session')
      await mkdir(path.join(workDir, 'commercialization-research'), { recursive: true })
      const secret = path.join(root, 'secret.md')
      await writeFile(secret, 'private')
      await symlink(secret, path.join(workDir, paths.auditPath))
      await symlink(root, path.join(workDir, 'commercialization-research/02-competitors.parts'))
      setup()
      process.env[outputRootKey] = workDir
      const reviewer = { agentType: 'expert-evidence-output-reviewer', artifactPaths: paths }
      for (const file_path of [paths.auditPath, paths.researcherPaths[0]]) {
        expect(reportWorkerReadError({ file_path }, reviewer)).toBeDefined()
        expect(reportWorkerReadError({ file_path: path.join(workDir, file_path) }, reviewer)).toBeDefined()
      }
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  test('allows registered sources and the exact reviewed HTML, not arbitrary or sibling output paths', () => {
    setup()
    const absorber = { agentType: 'expert-evidence-absorber', artifactPaths: paths }
    const reviewer = { agentType: 'expert-evidence-output-reviewer', artifactPaths: paths, reportPath: 'C:/research/report.html' }
    for (const file_path of [paths.briefPath, ...paths.researcherPaths, paths.reviewerPath, paths.auditPath]) expect(reportWorkerReadError({ file_path }, absorber)).toBeUndefined()
    for (const file_path of [paths.briefPath, paths.absorptionPath, ...paths.researcherPaths, paths.reviewerPath, paths.auditPath, reviewer.reportPath]) expect(reportWorkerReadError({ file_path }, reviewer)).toBeUndefined()
    for (const ctx of [absorber, reviewer]) {
      for (const file_path of ['C:/other/' + paths.absorptionPath, '../secrets.md', 'commercialization-research/private.md']) expect(reportWorkerReadError({ file_path }, ctx)).toBeDefined()
    }
    expect(reportWorkerReadError({ file_path: paths.completionReviewPath }, absorber)).toBeDefined()
    expect(reportWorkerReadError({ file_path: 'commercialization-research/02-competitors.parts/unregistered.md' }, reviewer)).toBeDefined()
    expect(reportWorkerReadError({ file_path: 'C:/research/another.html' }, reviewer)).toBeDefined()
  })
})

test('reserves the normalized researcher and exact assigned artifact before entering its query loop', async () => {
  const source = await readFile(new URL('./runAgent.ts', import.meta.url), 'utf8')
  const reservation = source.indexOf('await reserveExpertResearcherStart(')
  expect(reservation).toBeGreaterThan(source.indexOf('const researcherTargetPath = expertPackagePrompt.researcherTargetPath'))
  expect(reservation).toBeLessThan(source.indexOf('for await (const message of query('))
  expect(source.slice(reservation, reservation + 220)).toContain('agentType: agentDefinition.agentType')
  expect(source.slice(reservation, reservation + 220)).toContain('artifactPath: researcherTargetPath')
})

test('canonical server targeted context overrides omitted or legacy source-batch task kind', () => {
  const target = 'commercialization-research/02-competitors.md'
  const expertSkillContext = { expertId: 'commercialization-research-report', packId: 'imported-canonical', packVersion: 'test', researchTaskKind: 'targeted-evidence' as const, artifactPaths: { briefPath: 'commercialization-research/01-research-brief.md', researcherPaths: [target], reviewerPath: 'commercialization-research/05-evidence-review.md', auditPath: 'commercialization-research/06-browser-audit.md' }, skills: [] }
  for (const researchTaskKind of [undefined, 'source-batch'] as const) {
    const prepared = buildExpertSubagentPackagePrompt({ agentId: 'legacy', agentType: 'expert-evidence-researcher', promptMessages: [], declaredResearchArtifactPath: target, researchTaskKind, expertSkillContext })
    expect(prepared.researcherTargetPath).toBe(target)
    expect(prepared.prompt).toContain('targeted')
  }
})

test('task-kind normalization preserves other experts and precedes source receipt routing', async () => {
  const other = { expertId: 'other', packId: 'other', packVersion: 'test', researchTaskKind: 'targeted-evidence' as const, skills: [] }
  expect(resolveExpertResearchTaskKind('source-batch', other)).toBe('source-batch')
  expect(resolveExpertResearchTaskKind(undefined, undefined)).toBeUndefined()
  const source = await readFile(new URL('./runAgent.ts', import.meta.url), 'utf8')
  const normalize = source.indexOf('researchTaskKind = resolveExpertResearchTaskKind(researchTaskKind, expertSkillContext)')
  expect(normalize).toBeGreaterThan(source.indexOf('const [expertSkillContext, expertResearchEvidenceContext]'))
  expect(normalize).toBeLessThan(source.indexOf('const expertPackagePrompt = buildExpertSubagentPackagePrompt'))
  expect(normalize).toBeLessThan(source.indexOf("const sourceBatch = researchTaskKind === 'targeted-evidence'"))
})


describe('host-scoped Flash-only subagent model selection', () => {
  test.each(['deepseek-pro', 'claude-opus-4-6', 'inherit', undefined])('pins agent model %s and incoming aliases regardless of a cleared subagent override', (agentModel) => {
    const env = { CC_JIANGXIA_EXPERT_MODEL_POLICY: 'deepseek-flash-only' }
    for (const toolModel of ['opus', 'sonnet', 'haiku', 'deepseek-pro', undefined] as const) {
      expect(resolveExpertAgentModel(agentModel, 'deepseek-pro', toolModel as Parameters<typeof resolveExpertAgentModel>[2], 'bypassPermissions', env)).toBe('deepseek-flash')
    }
  })
  test('pins every delegated selector to the explicitly selected session model', () => {
    const env = { CC_JIANGXIA_EXPERT_MODEL_POLICY: 'session-model-only', CC_JIANGXIA_EXPERT_MODEL_ID: 'gpt-6-luna' }
    for (const candidate of ['deepseek-pro', 'opus', 'inherit', undefined]) {
      expect(resolveExpertAgentModel(candidate, 'other-model', undefined, 'default', env)).toBe('gpt-6-luna')
    }
    expect(() => resolveExpertAgentModel('inherit', 'other-model', undefined, 'default', { CC_JIANGXIA_EXPERT_MODEL_POLICY: 'session-model-only' })).toThrow('model')
  })
  test('supports the scoped legacy env alias but preserves ordinary model selection', () => {
    expect(resolveExpertAgentModel('deepseek-pro', 'other-model', undefined, 'default', { CC_HAHA_EXPERT_MODEL_POLICY: 'deepseek-flash-only' })).toBe('deepseek-flash')
    expect(resolveExpertAgentModel('deepseek-pro', 'other-model', undefined, 'default', {})).toBe('deepseek-pro')
    expect(resolveExpertAgentModel('inherit', 'deepseek-pro', undefined, 'default', { CC_JIANGXIA_EXPERT_MODEL_POLICY: 'unrelated-policy' })).toBe('deepseek-pro')
  })
  test('runAgent uses the policy resolver before constructing the agent context', async () => {
    const source = await readFile(new URL('./runAgent.ts', import.meta.url), 'utf8')
    const entry = source.indexOf('const resolvedAgentModel = resolveExpertAgentModel(')
    expect(entry).toBeGreaterThan(0)
    expect(entry).toBeLessThan(source.indexOf('const agentId = override?.agentId'))
  })
})
