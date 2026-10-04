import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildBundledExpertPacks } from './build-expert-packs.js'
import { ZipPackAdapter } from '../src/server/services/zipPackAdapter.js'
import { ExpertPackRegistryService } from '../src/server/services/expertPackRegistryService.js'

const roots: string[] = []
const adapter = new ZipPackAdapter()

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('buildBundledExpertPacks', () => {
  it('builds a self-contained ZIP with manifest, expert resources, skills, and declarative tools', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'build-expert-packs-'))
    roots.push(root)
    const sourceDir = path.join(root, 'experts')
    const packDir = path.join(sourceDir, 'research-pack')
    const outputDir = path.join(root, 'out')
    await mkdir(path.join(packDir, 'skills', 'research'), { recursive: true })
    await mkdir(path.join(packDir, 'tools', 'write'), { recursive: true })
    await mkdir(path.join(packDir, 'prompts'), { recursive: true })
    await mkdir(path.join(packDir, 'third_party', 'sample'), { recursive: true })
    await writeFile(path.join(packDir, 'manifest.json'), JSON.stringify({
      packId: 'research-pack',
      name: 'Research Pack',
      version: '1.0.0',
      schemaVersion: 1,
      type: 'expert-pack',
      entrypoints: {
        experts: ['experts/research-pack/expert.json'],
        skills: ['research'],
        tools: ['tools/write/tool.json'],
      },
    }))
    await writeFile(path.join(packDir, 'expert.json'), JSON.stringify({ id: 'research-pack' }))
    await writeFile(path.join(packDir, 'prompts', 'system.md'), '# System')
    await writeFile(path.join(packDir, 'skills', 'research', 'SKILL.md'), '# Research')
    await writeFile(path.join(packDir, 'tools', 'write', 'tool.json'), JSON.stringify({ id: 'write' }))
    await writeFile(path.join(packDir, 'THIRD_PARTY_NOTICES.md'), '# Notices')
    await writeFile(path.join(packDir, 'third_party', 'sample', 'LICENSE'), 'MIT')

    const outputs = await buildBundledExpertPacks({ sourceDir, outputDir })
    expect(outputs).toEqual([path.join(outputDir, 'research-pack.zip')])

    const zip = await adapter.read(new Uint8Array(await readFile(outputs[0]!)))
    expect(zip.has('manifest.json')).toBe(true)
    expect(zip.has('experts/research-pack/expert.json')).toBe(true)
    expect(zip.has('experts/research-pack/prompts/system.md')).toBe(true)
    expect(zip.has('skills/research/SKILL.md')).toBe(true)
    expect(zip.has('tools/write/tool.json')).toBe(true)
    expect(zip.has('THIRD_PARTY_NOTICES.md')).toBe(true)
    expect(zip.has('third_party/sample/LICENSE')).toBe(true)
  })
  it('builds only the requested pack without creating ZIPs for sibling packs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'filtered-expert-pack-'))
    roots.push(root)
    const sourceDir = path.join(root, 'experts')
    const outputDir = path.join(root, 'out')

    for (const packId of ['first-pack', 'second-pack']) {
      const packDir = path.join(sourceDir, packId)
      await mkdir(path.join(packDir, 'prompts'), { recursive: true })
      await writeFile(path.join(packDir, 'manifest.json'), JSON.stringify({
        packId,
        name: packId,
        version: '1.0.0',
        schemaVersion: 1,
        type: 'expert-pack',
        entrypoints: { experts: [`experts/${packId}/expert.json`], skills: [] },
      }))
      await writeFile(path.join(packDir, 'expert.json'), JSON.stringify({ id: packId }))
      await writeFile(path.join(packDir, 'prompts', 'system.md'), '# System')
    }

    await expect(buildBundledExpertPacks({ sourceDir, outputDir, packId: 'second-pack' })).resolves.toEqual([
      path.join(outputDir, 'second-pack.zip'),
    ])
    await expect(readFile(path.join(outputDir, 'first-pack.zip'))).rejects.toThrow()
    await expect(buildBundledExpertPacks({ sourceDir, outputDir, packId: 'missing-pack' })).rejects.toThrow(
      'No Expert Pack with packId missing-pack was found',
    )
  })

  it('rejects a source pack that declares a missing Skill before writing a ZIP', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'incomplete-expert-pack-'))
    roots.push(root)
    const sourceDir = path.join(root, 'experts')
    const packDir = path.join(sourceDir, 'incomplete-pack')
    await mkdir(packDir, { recursive: true })
    await writeFile(path.join(packDir, 'manifest.json'), JSON.stringify({
      packId: 'incomplete-pack',
      name: 'Incomplete Pack',
      version: '1.0.0',
      schemaVersion: 1,
      type: 'expert-pack',
      entrypoints: { experts: ['experts/incomplete-pack/expert.json'], skills: ['missing-skill'] },
    }))

    await expect(buildBundledExpertPacks({ sourceDir, outputDir: path.join(root, 'out') })).rejects.toThrow(
      'Expert Pack is missing declared Skill file: skills/missing-skill/SKILL.md',
    )
  })

  it('bundles the commercialization pack browser retrieval and evidence skills with their runtime guidance', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'commercialization-expert-pack-'))
    roots.push(root)
    const sourceDir = path.resolve(import.meta.dir, '..', 'experts')
    const outputDir = path.join(root, 'out')

    const outputs = await buildBundledExpertPacks({ sourceDir, outputDir, packId: 'commercialization-research-report' })
    const output = outputs.find((candidate) => path.basename(candidate) === 'commercialization-research-report.zip')
    expect(output).toBeDefined()

    const zip = await adapter.read(new Uint8Array(await readFile(output!)))
    const manifest = JSON.parse(await zip.readText('manifest.json'))
    const expert = JSON.parse(await zip.readText('experts/commercialization-research-report/expert.json'))
    const browserSkillPath = 'skills/browser-information-retrieval/SKILL.md'
    const skillPath = 'skills/external-demand-evidence/SKILL.md'
    const channelSkillPath = 'skills/channel-acquisition-evidence/SKILL.md'
    const fieldEvidenceSkillPath = 'skills/commercialization-field-evidence/SKILL.md'
    const sourceLibrarySkillPath = 'skills/research-source-library/SKILL.md'
    const systemPrompt = await zip.readText('experts/commercialization-research-report/prompts/system.md')
    const outputProtocol = await zip.readText('experts/commercialization-research-report/outputs/material-protocol.json')
    const { createExpertRuntimeBinding } = await import('../src/server/services/expertRuntimeBindingService.js')
    const runtime = createExpertRuntimeBinding({ expert: { ...expert, packId: manifest.packId, packVersion: manifest.version, tools: [] }, prompts: { system: systemPrompt }, skills: [], forms: [], hostTools: [], permissions: [], outputProtocol: { path: 'outputs/material-protocol.json', content: outputProtocol } }, '2026-09-08T00:00:00Z')
    expect(runtime.promptSnapshot).toBe(systemPrompt.trim())
    expect(runtime.outputProtocol!.content).toBe(outputProtocol.trim())
    expect(JSON.parse(runtime.outputProtocol!.content)).toEqual(JSON.parse(outputProtocol))
    expect(runtime.promptSnapshot).not.toContain('[truncated by expert runtime]')
    expect(runtime.promptSnapshot).toContain('禁止的捷径')
    expect(runtime.promptSnapshot).toContain('渲染成功不等于文件保存成功')
    expect(runtime.promptSnapshot).toContain('不直接省略备选')
    expect(outputProtocol).toContain('Write must save the exact rendered file')
    expect(outputProtocol).toContain('Ordinary primary homepages are not targeted attempts')
    expect(await zip.readText(browserSkillPath)).toContain('分开调用的')
    const writeTool = JSON.parse(await zip.readText('tools/write/tool.json'))
    const htmlTemplate = await zip.readText('experts/commercialization-research-report/templates/commercialization-research-report-template.html')
    expect(manifest.version).toBe('0.13.55-local')
    expect(systemPrompt).toContain('累计读取完整文件')
    expect(systemPrompt).toContain('来源引用保真')
    expect(systemPrompt).toContain('E 可读自己声明的 07，F 可读自己声明的 08')
    expect(systemPrompt).toContain('不能从“未取证”推断网站受限')
    expect(systemPrompt).not.toContain('E 的 Markdown 要紧凑但具体')
    expect(systemPrompt).not.toContain('D Read \u006001\u0060–\u006004\u0060')
    expect(outputProtocol).toContain('Report-worker Read permissions include its own declared output')
    expect(outputProtocol).toContain('one successfully committed terminal Write')
    const researchMethod = await zip.readText('skills/commercialization-research-method/SKILL.md')
    expect(researchMethod).toContain('internal review, absorption and delivery never ask for permission to finish')
    expect(researchMethod).not.toContain('ask the user for a choice rather than inventing')
    expect(outputProtocol).toContain('full-file and complete paginated Reads are equivalent')
    expect(await zip.readText(fieldEvidenceSkillPath)).toContain('audit:<exact-audit-id>')
    expect(systemPrompt).toContain('否定结论、已完成的修正、可选建议不算必须补写')
    expect(outputProtocol).toContain('Rejected patch fields never replace the reviewed draft')
    expect(outputProtocol).toContain('Negated findings and optional suggestions are not patch requirements')
    expect(expert.version).toBe(manifest.version)
    expect(expert.formPaths).toBeUndefined()
    expect(expert.intakeFlow).toBeUndefined()
    expect(zip.has('experts/commercialization-research-report/forms/intake.json')).toBe(false)
    expect(expert.statusLabel).toContain(manifest.version)
    expect(manifest.entrypoints.skills.slice(0, 4)).toEqual([
      'commercialization-research-method',
      'source-graph-research',
      'browser-information-retrieval',
      'external-demand-evidence',
    ])
    expect(expert.skillIds.slice(0, 4)).toEqual(manifest.entrypoints.skills.slice(0, 4))
    expect(expert.skillIds.every((skillId: string) => manifest.entrypoints.skills.includes(skillId))).toBe(true)
    expect(expert.subagentSkillIds).toMatchObject({
      'expert-evidence-researcher': ['browser-information-retrieval', 'research-source-library', 'channel-acquisition-evidence'],
      'expert-evidence-reviewer': [],
      'expert-evidence-absorber': [],
      'expert-evidence-output-reviewer': [],
    })
    expect(systemPrompt).toContain('AskUserQuestion')
    expect(systemPrompt).toContain('完整、深入的新品商业分析')
    expect(systemPrompt).toContain('不要问用户“本轮偏向什么分析方向”')
    expect(systemPrompt).toContain('中文线 + 海外线')
    expect(systemPrompt).toContain('只要需要用户回答、确认、补充、提供 URL / 材料、作选择或说明自由文本，一律调用')
    expect(systemPrompt).toContain('不得复用“办公 / 知识工作者”')
    expect(systemPrompt).toContain('01-research-brief.md')
    expect(systemPrompt).toContain('05-evidence-review.md')
    expect(systemPrompt).toContain('07-report-field-absorption.md')
    expect(systemPrompt).toContain('TaskOutput(block: true)')
    expect(systemPrompt).toContain('expert-evidence-absorber')
    expect(systemPrompt).toContain('字段—任务—来源路线矩阵')
    expect(systemPrompt).toContain('用户信号路线矩阵')
    expect(systemPrompt).toContain('渠道来源路线矩阵')
    expect(systemPrompt).toContain('字段颗粒度复核')
    expect(systemPrompt).toContain('平台路线、取证状态与报告措辞')
    expect(systemPrompt).toContain('共同任务池')
    expect(systemPrompt).toContain('唯一 02 / 03 / 04 Markdown 路径')
    expect(systemPrompt).toContain('每个核心入口和维护的开放入口都做一次有界真实尝试')
    expect(systemPrompt).toContain('默认分账')
    expect(systemPrompt).toContain('当前不适用')
    expect(systemPrompt).toContain('不设逐站深读或数量门槛')
    expect(systemPrompt).toContain('D、E、08 与最终 HTML 只能在全部已分配入口都有真实终态后继续')
    expect(systemPrompt).toContain('派发回执不是完成证明')
    expect(writeTool.purpose).toContain('01-research-brief.md')
    expect(writeTool.purpose).toContain('research_artifact.kind')
    expect(JSON.parse(outputProtocol).version).toBe(21)
    expect(JSON.parse(outputProtocol).researchArtifacts.researcherParts).toBe(true)
    expect(systemPrompt).toContain('子代理总数与分片数不固定')
    expect(systemPrompt).toContain('全部已登记分片')
    const parsedOutputProtocol = JSON.parse(outputProtocol)
    expect(parsedOutputProtocol.researchTaskPurpose).toMatchObject({
      parameter: 'research_task_kind',
      default: 'source-batch',
      targetedEvidence: expect.stringContaining('do not claim an unrelated library batch'),
      handoff: expect.stringContaining('downstream review gates remain unchanged'),
    })
    const sourcePackDir = path.join(sourceDir, 'commercialization-research-report')
    const sourceLibrarySkill = await zip.readText(sourceLibrarySkillPath)
    for (const purpose of ['research_task_kind', 'source-batch', 'targeted-evidence']) {
      expect(systemPrompt).toContain(purpose)
      expect(sourceLibrarySkill).toContain(purpose)
      expect(runtime.promptSnapshot).toContain(purpose)
    }
    expect(systemPrompt).toBe(await readFile(path.join(sourcePackDir, 'prompts/system.md'), 'utf8'))
    expect(outputProtocol).toBe(await readFile(path.join(sourcePackDir, 'outputs/material-protocol.json'), 'utf8'))
    expect(sourceLibrarySkill).toBe(await readFile(path.join(sourcePackDir, 'skills/research-source-library/SKILL.md'), 'utf8'))
    expect(parsedOutputProtocol.postReviewEvidenceAbsorption.rules).toEqual(expect.arrayContaining([
      expect.stringContaining('acquired-but-unused is not unobtained or access-limited'),
      expect.stringContaining('E reads the brief and independent review to EOF first'),
      expect.stringContaining('Save substantive chapter-ready material using Read/Write only'),
      expect.stringContaining('Never collapse several posts/comments to one representative URL'),
      expect.stringContaining('not conversion, profitability or paid willingness'),
      expect.stringContaining('no new browsing, agents or review rounds'),
    ]))
    expect(parsedOutputProtocol.postReviewEvidenceAbsorption.rules).toEqual(expect.arrayContaining([
      expect.stringContaining('not a fixed-platform quota or a reason to block an evidence-gap report'),
    ]))
    const fieldEvidenceSkill = await zip.readText(fieldEvidenceSkillPath)
    expect(fieldEvidenceSkill).toBe(await readFile(path.join(sourcePackDir, fieldEvidenceSkillPath), 'utf8'))
    for (const guidance of ['未列入来源表不等于未取得', 'Read/Write']) {
      expect(systemPrompt).toContain(guidance)
      expect(fieldEvidenceSkill).toContain(guidance)
    }
    expect(systemPrompt).toMatch(/AI\s*推断/)
    expect(fieldEvidenceSkill).toMatch(/AI\s*推断/)
    expect(parsedOutputProtocol.researchArtifacts.splitting).toContain('D reviews all registered parts; E consumes the full independent review')
    expect(systemPrompt).not.toContain('未进入该表的平台只能表述为')
    expect(systemPrompt).not.toContain('D 和 E 必须消费运行时列出的全部已登记分片')
    expect(systemPrompt).not.toContain('所有研究 Markdown 都通过 Read(offset, limit) 分页读')
    expect(outputProtocol).not.toContain('未列入来源表的平台仅可能是候选')
    expect(parsedOutputProtocol.templateFieldGuide.fields.find((field: { field: string }) => field.field === 'DATA_DECLARATION').meaning).toContain('已取得但未采用')
    const packagedResearchArtifacts = parsedOutputProtocol.researchArtifacts
    expect(packagedResearchArtifacts).toMatchObject({
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
      absorptionPath: 'commercialization-research/07-report-field-absorption.md',
      completionReviewPath: 'commercialization-research/08-report-completeness-review.md',
      maxCharacters: 90000,
    })
    expect(systemPrompt).toContain('保存与完成不得因固定回传文本、Route 格式、Page disposition、内部 audit ID 或当前证据缺口失败')
    expect(systemPrompt).toContain('Required route: yes')
    expect(systemPrompt).toContain('不是执行开关')
    expect(systemPrompt).toContain('首次渲染成功前它不是 HTML 草稿')
    expect(systemPrompt).toContain('不再把所有成功打开的入口自动灌入来源表')
    expect(systemPrompt).toContain('仅首页/目录/搜索入口不等于取得正文')
    expect(systemPrompt).not.toContain('必须为每个实际打开的具体公开页增加 `### Page disposition:')
    expect(packagedResearchArtifacts.routeCompletion).toEqual({
      mode: 'dynamic-route-status-v2',
      requireAttemptedRequiredRoutes: true,
    })
    expect(packagedResearchArtifacts).not.toHaveProperty('requireOpenedPageDisposition')
        expect(JSON.parse(outputProtocol).templateFieldGuide.tables.map((field: { field: string }) => field.field)).toEqual(expect.arrayContaining([
      'RISKS_AND_COUNTEREVIDENCE_ROWS',
      'VALIDATION_GATE_ROWS',
    ]))
    expect(JSON.parse(outputProtocol).templateFieldGuide.fields.map((field: { field: string }) => field.field)).toContain('NEXT_STEP_PLAN_CONTENT')
    expect(JSON.parse(outputProtocol).researchBrowser).toMatchObject({
      searchEnginePacing: { enabled: true, minIntervalMs: 3000 },
      sharePlaywrightSessionAcrossAgents: true,
      desktopHumanVerificationHandoff: true,
    })
    expect(parsedOutputProtocol.researchCompletion).toBeUndefined()
    expect(JSON.parse(outputProtocol).researchEvidenceReview).toMatchObject({
      reviewerAgentType: 'expert-evidence-reviewer',
      sourceAgentTypes: ['expert-evidence-researcher'],
      reviewerEvidenceOnly: true,
      mode: 'upstream-evidence-only',
    })
    const evidenceAbsorption = JSON.parse(outputProtocol).postReviewEvidenceAbsorption
    expect(evidenceAbsorption).toMatchObject({
      required: true,
      userInteraction: 'none',
      before: 'template-fill',
      reviewerAgentType: 'expert-evidence-reviewer',
      absorberAgentType: 'expert-evidence-absorber',
      sourceAgentTypes: ['expert-evidence-researcher'],
      sourceFieldId: 'SOURCE_ROWS',
      requireSourceFieldMapping: true,
    })
    expect(evidenceAbsorption).not.toHaveProperty('requireAllOpenedSourcesDisposition')
    expect(evidenceAbsorption).not.toHaveProperty('requireUsedSourceFieldEvidence')
    expect(evidenceAbsorption).not.toHaveProperty('requireUsedSourceEvidenceForEveryMappedField')
    expect(evidenceAbsorption).not.toHaveProperty('requireReportReadyFieldEvidence')
    expect(evidenceAbsorption).toMatchObject({
      allowReasonedInference: true,
      requireEvidenceStatusSummary: true,
      evidenceStatusSummaryFieldId: 'EVIDENCE_STATUS_SUMMARY',
    })
    expect(evidenceAbsorption).not.toHaveProperty('requireFieldCoverage')
    expect(evidenceAbsorption).not.toHaveProperty('fieldCoverageFieldIds')
    expect(htmlTemplate).toContain('<!-- SLOT: EVIDENCE_STATUS_SUMMARY -->')
    expect(htmlTemplate).toContain('data-template-id="commercialization-research-classic-v4"')
    expect(htmlTemplate).toContain('<!-- SLOT: RISKS_AND_COUNTEREVIDENCE_ROWS -->')
    expect(htmlTemplate).toContain('<!-- SLOT: VALIDATION_GATE_ROWS -->')
    expect(htmlTemplate).toContain('<!-- SLOT: NEXT_STEP_PLAN_CONTENT -->')
    expect(htmlTemplate).toContain('.template-rich-text')
    expect(htmlTemplate).toContain('<!-- SLOT: PLATFORM_HEAT_ROWS -->')
    expect(systemPrompt).toContain('验证页不能充当正文证据')
    expect(systemPrompt).toContain('不要自行截断链接或删除文章、视频、查询的参数')
    expect(evidenceAbsorption.fieldGranularityGuidance).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: 'PLATFORM_HEAT_ROWS' }),
      expect.objectContaining({ fieldId: 'TARGET_USER_PROFILE_ROWS' }),
      expect.objectContaining({ fieldId: 'USER_NEEDS_AND_PAIN_POINTS' }),
      expect.objectContaining({ fieldId: 'SEARCH_ACQUISITION_ROWS' }),
    ]))
    expect(manifest.runtimePolicy).toMatchObject({
      mode: 'package-local-skills',
      allowedToolNames: [],
    })
    expect(manifest.runtimePolicy).not.toHaveProperty('requiredSkillIds')
    for (const skillId of manifest.entrypoints.skills) {
      expect(zip.has(`skills/${skillId}/SKILL.md`)).toBe(true)
    }
    expect(zip.has('skills/commercialization-research-method/SKILL.md')).toBe(true)
    expect(zip.has(browserSkillPath)).toBe(true)
    expect(zip.has(skillPath)).toBe(true)
    expect(zip.has(channelSkillPath)).toBe(true)
    expect(zip.has(fieldEvidenceSkillPath)).toBe(true)
    expect(zip.has(sourceLibrarySkillPath)).toBe(true)
    expect(zip.has('skills/google-grounded-source-discovery/SKILL.md')).toBe(false)
    expect(expert).not.toHaveProperty('researchDiscovery')
    const browserSkill = await zip.readText(browserSkillPath)
    expect(browserSkill).not.toContain('不深读、不循环')
    expect(browserSkill).toContain('本轮关键路线的真实取证')
    expect(browserSkill).toContain('type: "navigate"')
    expect(browserSkill).toContain('type: "fill"')
    expect(browserSkill).toContain('type: "press"')
    expect(browserSkill).toContain('https://www.google.com/')
    expect(browserSkill).toContain('https://www.baidu.com/')
    expect(browserSkill).toContain('https://www.bing.com/')
    expect(browserSkill).toContain('https://www.so.com/')
    expect(browserSkill).not.toContain('search_query')
    const demandSkill = await zip.readText(skillPath)
    const channelSkill = await zip.readText(channelSkillPath)
    expect(demandSkill).toContain('具体平台路线')
    expect(demandSkill).toContain('知乎公开回答')
    expect(demandSkill).toContain('Reddit 具体帖')
    expect(channelSkill).toContain('具体平台与页面路线')
    expect(channelSkill).toContain('适用时的网站 SEO 快速审计')
    expect(channelSkill).toContain('不得生成 SEO 总分、站点级百分比')
    expect(await zip.readText(fieldEvidenceSkillPath)).toContain('具体来源而非泛来源类别')
    const sourceLibrary = await zip.readText(sourceLibrarySkillPath)
    const coreTierStart = sourceLibrary.indexOf('<!-- research-source-library-tier: core -->')
    const openTierStart = sourceLibrary.indexOf('<!-- research-source-library-tier: open -->')
    const coreSourceLibrary = sourceLibrary.slice(coreTierStart, openTierStart)
    const openSourceNetwork = sourceLibrary.slice(openTierStart)
    expect(coreTierStart).toBeGreaterThanOrEqual(0)
    expect(openTierStart).toBeGreaterThan(coreTierStart)
    expect(sourceLibrary).toContain('公司 PM 核心来源库')
    expect(sourceLibrary).toContain('开放补充来源网络')
    expect(sourceLibrary).toContain('QuestMobile')
    expect([...coreSourceLibrary.matchAll(/https?:\/\/[^\s]+/g)]).toHaveLength(119)
    expect(sourceLibrary).toContain('PitchBook')
    expect(openSourceNetwork).toContain('https://www.bilibili.com/')
    expect(openSourceNetwork).toContain('https://www.zhihu.com/')
    expect(openSourceNetwork).toContain('https://www.xiaohongshu.com/')
    expect(openSourceNetwork).toContain('https://www.youtube.com/')
    expect(openSourceNetwork).toContain('https://www.reddit.com/')
    expect(openSourceNetwork).toContain('https://gitee.com/')
    expect(openSourceNetwork).toContain('https://tieba.baidu.com/')
    expect([...openSourceNetwork.matchAll(/https?:\/\/[^\s]+/g)]).toHaveLength(30)
    expect(sourceLibrary).toMatch(/^---\r?\nname: research-source-library\r?\n/)
    expect(sourceLibrary).toContain('全量任务池的默认分账和真实浏览状态')
    expect(sourceLibrary).toContain('三人的执行包合起来正好覆盖 119 个核心入口')
    expect(sourceLibrary).toContain('<expert-research-source-assignment>')
    expect(sourceLibrary).toContain('每线最多 10 个仍未终态的 URL')
    expect(sourceLibrary).toContain('都至少做一次有界真实 Playwright 尝试')
    expect(sourceLibrary).toContain('用户候选来源库任务池与浏览状态')
    expect(sourceLibrary).toContain('按 A/B/C 三线并行、每线最多 10 个 URL 逐批补齐未终态入口')
    expect(sourceLibrary).toContain('已派发但没有回执绝不能冒充完成')
    expect(sourceLibrary).toContain('最多定向补查一次')
    expect(systemPrompt).toContain('verification_deferred')
    expect(systemPrompt).toContain('最多定向补查一次')
    expect(systemPrompt).toContain('共享等待预算为两分钟')
    expect(sourceLibrary).toContain('官网、B站、YouTube、Reddit、GitHub、Gitee、X、小红书、知乎、百度贴吧、微博')
    expect(sourceLibrary).toContain('最终 HTML 来源表收录正文实际采用且有审计依据的页面及其具体支撑内容')
    expect(sourceLibrary).toContain('其它已访问入口完整保留在 06')
    expect(sourceLibrary).not.toContain('服务端会把本轮成功打开且可引用的具体页面追加到最终 HTML 来源表')
    expect(sourceLibrary).toContain('当前不适用')
    expect(sourceLibrary).toContain('version: 1.4.0')
    expect(sourceLibrary).not.toContain('easyAccessToken=')
    expect(await zip.readText(skillPath)).toContain('Playwright')
    expect(systemPrompt).toContain('所有面向 Desktop 用户展示的**普通回复、阶段进度、错误说明')
    expect(systemPrompt).toContain('EXPERT_RESEARCH_AUDIT_REPAIR_REQUIRED')
    expect(systemPrompt).toContain('不得等待或暂停')
    expect(systemPrompt).toContain('browser-information-retrieval')
    expect(systemPrompt).toContain('公司 PM 核心来源库 + 开放补充网络')
    expect(systemPrompt).toContain('research-source-library')
    expect(systemPrompt).toContain('不得用泛搜索绕过自己的默认批次')
    expect(systemPrompt).toContain('不设逐站深读或数量门槛')
    expect(systemPrompt).toContain('来源任务池不是 Required route: yes')
    expect(systemPrompt).toContain('未打开的平台只能称为候选入口、本轮未执行到或按产品判断当前不适用')
    expect(systemPrompt).toContain('net::ERR_CONNECTION_CLOSED')
    expect(systemPrompt).toContain('最终回传固定为一行文件回执')
    expect(systemPrompt).toContain('两种情况都只允许一次终态 Write')
    expect(systemPrompt).toContain('直接证据暂时取不到时，每个板块仍要基于已核验事实')
    expect(systemPrompt).toContain('背景路线核验')
    expect(systemPrompt).toContain('不得重复研究内容')
    expect(systemPrompt).not.toContain('每次最终返回中的 `<tool-audit>`')
    expect(systemPrompt).toContain('<playwright-browser-audit>')
    expect(systemPrompt).toContain('5.5 SEO/SEM')
    expect(systemPrompt).toContain('公开官网 / 落地页 SEO 快速审计')
    expect(systemPrompt).toContain('Playwright 调用计数、真实 URL/查询词与浏览限制由运行时写入 `06-browser-audit.md`')
    expect(systemPrompt).not.toContain('EXPERT_RESEARCH_COMPLETION_REQUIRED')
    expect(outputProtocol).toContain('The 119 company-core entries and maintained-open entries are split once across A/B/C')
    expect(outputProtocol).toContain('not a fixed-platform quota')
    expect(outputProtocol).not.toContain('"researchCompletion"')
    expect(outputProtocol).not.toContain('requiredSearchEngines')
    expect(outputProtocol).toContain('verificationFallbackSearchEngines')
    expect(outputProtocol).toContain('不得生成 SEO 总分、站点级百分比')
        expect(systemPrompt).toContain('external-demand-evidence')
    expect(systemPrompt).toContain('channel-acquisition-evidence')
    expect(systemPrompt).not.toContain('expert-template-fill --data-stdin')
    expect(manifest.entrypoints.tools).toEqual(['tools/write/tool.json'])
    expect(zip.has('experts/commercialization-research-report/tools/bash/tool.json')).toBe(false)
    expect(outputProtocol).toContain('server-side structured Write runtime renders the fixed HTML template')
    expect(outputProtocol).not.toContain('expert-template-fill --data-stdin')
    expect(outputProtocol).not.toContain('Use one Bash invocation')
    expect(outputProtocol).not.toContain('allow-with-evidence-gaps')
    expect(outputProtocol).toContain('08-report-completeness-review.md')
    expect(systemPrompt).toContain('expert-evidence-output-reviewer')
    expect(systemPrompt).toContain('subagent_type: "expert-evidence-reviewer"')
    expect(systemPrompt).toContain('05-evidence-review.md')
    expect(outputProtocol).not.toContain('minimumCompletedAgentsByType')
    expect(outputProtocol).not.toContain('minimumDistinctOpenedSourceDomains')
    expect(outputProtocol).not.toContain('finalSourceCoverage')
    expect(systemPrompt).not.toContain('<commercialization-intake>')
    expect(systemPrompt).not.toContain('research-delivery:commercialization-report')
    expect(systemPrompt).not.toContain('accept_current_scope')
    expect(systemPrompt).not.toContain('verification_resolution: "record_evidence_gap"')
    expect(systemPrompt).toContain('（AI推断）')
    expect(outputProtocol).toContain('templateFieldGuide')
    expect(JSON.parse(outputProtocol).researchDelivery).toBeUndefined()
    expect(systemPrompt).toContain('run_in_background: true')
    expect(systemPrompt).not.toContain('fieldCoverage')
    expect(systemPrompt).toContain('证据缺口 / 待验证')
    expect(expert.profile.workflow.map((step: { id: string }) => step.id)).toEqual([
      'rules',
      'brief',
      'runtime',
      'assumptions',
      'research',
      'experiment',
      'red-team',
      'evidence-review',
      'evidence-absorption',
      'delivery',
    ])
    expect(JSON.parse(outputProtocol).postReviewEvidenceAbsorption).toMatchObject({
      required: true,
      userInteraction: 'none',
      before: 'template-fill',
      searchEvidenceFieldIds: ['SEARCH_ACQUISITION_NOTE', 'SEARCH_ACQUISITION_ROWS', 'SEARCH_ACQUISITION_CONCLUSION'],
    })
    expect(parsedOutputProtocol.researchCompletion).toBeUndefined()
    expect(JSON.parse(outputProtocol).primaryOutput.autoDestination).toMatchObject({
      mode: 'session-workdir-direct',
      filenamePattern: expect.stringContaining('.html'),
    })
    expect(JSON.parse(outputProtocol).primaryOutput.autoDestination).not.toHaveProperty('defaultRelativeDirectory')
    expect(JSON.parse(outputProtocol).primaryOutput.autoDestination).not.toHaveProperty('intakeFieldId')
    expect(JSON.stringify(expert)).not.toContain('\"outputFolder\"')
    expect(outputProtocol).toContain('allowUserAuthorizedCdp')
    expect(outputProtocol).toContain('managedPresentationDefault')
    expect(outputProtocol).toContain('assistable_background')
    expect(outputProtocol).toContain('allowManagedPresentationChoice')
    expect(outputProtocol).not.toContain('forceVisiblePlaywright')
    expect(outputProtocol).toContain('desktopHumanVerificationHandoff')
    expect(outputProtocol).toContain('forbidSubagentAskUserQuestion')
    expect(outputProtocol).not.toContain('accept_current_scope')
  })

  it('builds and validates the maintained Expert MVP packs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'maintained-expert-mvps-'))
    roots.push(root)
    const outputDir = path.join(root, 'out')
    const sourceDir = path.join(path.resolve(import.meta.dir, '..'), 'experts')
    const outputs = await buildBundledExpertPacks({ sourceDir, outputDir })
    const expected = ['repo-health-check', 'web-information-designer']
    expect(outputs).not.toContain(path.join(outputDir, 'website-reference.zip'))
    const registry = new ExpertPackRegistryService()
    const expectedVersions: Record<string, string> = {
      'repo-health-check': '1.3.0',
      'web-information-designer': '1.5.0',
    }

    for (const packId of expected) {
      const outputPath = path.join(outputDir, packId + '.zip')
      expect(outputs).toContain(outputPath)
      const bytes = new Uint8Array(await readFile(outputPath))
      const preview = await registry.previewExpertPackZip(bytes, { detectConflicts: false })
      expect(preview.pack.version).toBe(expectedVersions[packId])
      expect(preview.experts[0]!.id).toBe(packId)
    }

    const prototypeZip = await adapter.read(new Uint8Array(await readFile(path.join(outputDir, 'web-information-designer.zip'))))
    const prototypeManifest = JSON.parse(await prototypeZip.readText('manifest.json')) as { runtimePolicy?: unknown }
    const prototypeExpert = JSON.parse(await prototypeZip.readText('experts/web-information-designer/expert.json')) as Record<string, unknown>
    expect(prototypeManifest.runtimePolicy).toEqual({
      mode: 'prototype-visual-workflow',
      allowedToolNames: ['AskUserQuestion', 'Playwright', 'Read', 'Write', 'Bash'],
      requiredSkillIds: ['prototype-fidelity-workflow', 'prototype-visual-quality-gate', 'frontend-design'],
    })
    expect(prototypeExpert).not.toHaveProperty('runtimePolicy')
    expect((await registry.previewExpertPackZip(
      new Uint8Array(await readFile(path.join(outputDir, 'web-information-designer.zip'))),
      { detectConflicts: false },
    )).experts[0]!.runtimePolicy).toEqual(prototypeManifest.runtimePolicy)

    const repoZip = await adapter.read(new Uint8Array(await readFile(path.join(outputDir, 'repo-health-check.zip'))))
    const repoExpert = JSON.parse(await repoZip.readText('experts/repo-health-check/expert.json')) as { tools: Array<{ hostToolId?: string }>; intakeFlow?: unknown }
    const repoIntake = JSON.parse(await repoZip.readText('experts/repo-health-check/forms/intake.json')) as { steps: Array<{ id: string; fields?: Array<{ id: string; kind: string; required?: boolean }> }> }
    const repoPrompt = await repoZip.readText('experts/repo-health-check/prompts/system.md')
    const repoSkill = await repoZip.readText('skills/repo-health-check-guide/SKILL.md')
    const repoProtocol = JSON.parse(await repoZip.readText('experts/repo-health-check/outputs/material-protocol.json')) as { evidenceBoundary?: { sourceModes?: string[]; forbidRepresentingPublicAuditAsCompleteLocalScan?: boolean }; analysisContract?: { scopeContract?: { requiredSelection?: string; scopes?: Record<string, { requiredEvidenceRule?: string }> }; findingContract?: { requireEvidenceStatus?: boolean; prohibitUnverifiedSeverity?: boolean }; reportQuality?: { requireActionPlan?: boolean; prohibitConclusionBeyondCoverage?: boolean; requireScopeMatchedDepth?: boolean; requireDirectCodeEvidenceForLogicClaims?: boolean } } }
    expect(repoExpert.tools.map((tool) => tool.hostToolId)).toContain('Playwright')
    expect(repoExpert.intakeFlow).toEqual(repoIntake)
    expect(repoIntake.steps.find((step) => step.id === 'assessmentScope')?.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'run-guide' }),
      expect.objectContaining({ id: 'structure-and-logic' }),
      expect.objectContaining({ id: 'risk-and-readiness' }),
      expect.objectContaining({ id: 'full-review' }),
    ]))
    expect(repoIntake.steps.find((step) => step.id === 'assessmentPurpose')?.options).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'quick-orientation' }),
      expect.objectContaining({ id: 'maintenance-handoff' }),
    ]))
    const repoMaterials = repoIntake.steps.find((step) => step.id === 'materials')?.fields ?? []
    expect(repoMaterials).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'projectRoot', kind: 'folder', required: false }),
      expect.objectContaining({ id: 'repositoryUrl', kind: 'url', required: false }),
    ]))
    expect(repoPrompt).toContain('也不是无论用户问什么都强行输出一份“全项目质量报告”')
    expect(repoPrompt).toContain('run-guide')
    expect(repoPrompt).toContain('结构和关键代码逻辑')
    expect(repoPrompt).toContain('公开 GitHub/Gitee 链接模式')
    expect(repoPrompt).toContain('publicCoverage')
    expect(repoPrompt).toContain('不登录、不克隆')
    expect(repoSkill).toContain('run-guide')
    expect(repoSkill).toContain('代码逻辑必须追真实链路')
    expect(repoSkill).toContain('public-repository')
    expect(repoSkill).toContain('证据状态')
    expect(repoProtocol.evidenceBoundary?.sourceModes).toEqual(['local', 'public-repository', 'combined'])
    expect(repoProtocol.evidenceBoundary?.forbidRepresentingPublicAuditAsCompleteLocalScan).toBe(true)
    expect(repoProtocol.analysisContract?.findingContract?.requireEvidenceStatus).toBe(true)
    expect(repoProtocol.analysisContract?.findingContract?.prohibitUnverifiedSeverity).toBe(true)
    expect(repoProtocol.analysisContract?.scopeContract?.requiredSelection).toBe('assessmentScope')
    expect(repoProtocol.analysisContract?.scopeContract?.scopes?.['structure-and-logic']?.requiredEvidenceRule).toContain('directly read implementation')
    expect(repoProtocol.analysisContract?.reportQuality?.requireScopeMatchedDepth).toBe(true)
    expect(repoProtocol.analysisContract?.reportQuality?.requireDirectCodeEvidenceForLogicClaims).toBe(true)
    expect(repoProtocol.analysisContract?.reportQuality?.requireActionPlan).toBe(true)
    expect(repoProtocol.analysisContract?.reportQuality?.prohibitConclusionBeyondCoverage).toBe(true)

    const webInformationZip = await adapter.read(new Uint8Array(await readFile(path.join(outputDir, 'web-information-designer.zip'))))
    const webInformationExpert = JSON.parse(await webInformationZip.readText('experts/web-information-designer/expert.json')) as {
      name: string
      version: string
      skillIds: string[]
      tools: Array<{ hostToolId?: string }>
      runtimePolicy?: { mode?: string; requiredSkillIds?: string[] }
    }
    const webInformationIntake = JSON.parse(await webInformationZip.readText('experts/web-information-designer/forms/intake.json')) as {
      version: number
      steps: Array<{ id: string; fields?: Array<{ id: string; kind: string; required?: boolean }> }>
    }
    const webInformationPrompt = await webInformationZip.readText('experts/web-information-designer/prompts/system.md')
    const prototypeWorkflowSkill = await webInformationZip.readText('skills/prototype-fidelity-workflow/SKILL.md')
    const prototypeVisualQualitySkill = await webInformationZip.readText('skills/prototype-visual-quality-gate/SKILL.md')
    const importedFrontendDesignSkill = await webInformationZip.readText('skills/frontend-design/SKILL.md')
    const importedFrontendDesignLicense = await webInformationZip.readText('skills/frontend-design/LICENSE.txt')
    const webInformationSources = await webInformationZip.readText('skills/SOURCES.md')
    const thirdPartyNotices = await webInformationZip.readText('THIRD_PARTY_NOTICES.md')
    const webInformationProtocol = JSON.parse(await webInformationZip.readText('experts/web-information-designer/outputs/material-protocol.json')) as {
      version: number
      primaryOutput?: { requiredPaths?: string[]; conditionalPaths?: Record<string, string[]> }
      prototypeContract?: { fidelityLevels?: Record<string, string>; consistencyRequirements?: string[] }
      evidenceBoundary?: { localQaBoundary?: string; prohibitedWithoutUserProof?: string[] }
      verificationContract?: { localHtmlQa?: string[] }
      visualQualityContract?: { requiredSkillIds?: string[]; requiredHighFidelityQa?: string[]; prohibitedTemplatePatterns?: string[] }
    }
    expect(webInformationZip.readJson('manifest.json')).resolves.toMatchObject({
      name: '原型图demo',
      version: '1.5.0',
      entrypoints: { skills: ['prototype-fidelity-workflow', 'prototype-visual-quality-gate', 'frontend-design'] },
      runtimePolicy: {
        mode: 'prototype-visual-workflow',
        allowedToolNames: ['AskUserQuestion', 'Playwright', 'Read', 'Write', 'Bash'],
        requiredSkillIds: ['prototype-fidelity-workflow', 'prototype-visual-quality-gate', 'frontend-design'],
      },
    })
    expect(webInformationExpert).toMatchObject({
      name: '原型图demo',
      version: '1.5.0',
      skillIds: ['prototype-fidelity-workflow', 'prototype-visual-quality-gate', 'frontend-design'],
    })
    expect(webInformationExpert).not.toHaveProperty('runtimePolicy')
    expect(webInformationExpert.tools.map((tool) => tool.hostToolId)).toEqual(expect.arrayContaining(['AskUserQuestion', 'Playwright', 'Read', 'Write', 'Bash']))
    expect(webInformationIntake.version).toBe(2)
    expect(webInformationIntake.steps.find((step) => step.id === 'prototypeType')).toBeTruthy()
    expect(webInformationIntake.steps.find((step) => step.id === 'researchScope')).toBeTruthy()
    expect(webInformationIntake.steps.find((step) => step.id === 'productBrief')?.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'productName', kind: 'text' }),
      expect.objectContaining({ id: 'coreValue', kind: 'textarea' }),
      expect.objectContaining({ id: 'sourceUrls', kind: 'url-list' }),
      expect.objectContaining({ id: 'brandAssets', kind: 'textarea' }),
    ]))
    expect(webInformationPrompt).toContain('确认不能替代交付')
    expect(webInformationPrompt).toContain('不能只复述“已确定方案”')
    expect(webInformationPrompt).toContain('01-low-fidelity.html')
    expect(webInformationPrompt).toContain('02-mid-fidelity.html')
    expect(webInformationPrompt).toContain('03-high-fidelity.html')
    expect(webInformationPrompt).toContain('CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE')
    expect(webInformationPrompt).toContain('Playwright 仍只用于公开研究')
    expect(webInformationPrompt).toContain('不能写成已经在真实 iOS、Android、macOS 或 Windows 设备上完成验证')
    expect(webInformationPrompt).toContain('演示反馈，待替换')
    expect(webInformationPrompt).toContain('视觉质量硬闸门')
    expect(webInformationPrompt).toContain('<prototype-visual-review-receipt>')
    expect(prototypeWorkflowSkill).toContain('同一个骨架派生三档保真度')
    expect(prototypeWorkflowSkill).toContain('不要把')
    expect(prototypeWorkflowSkill).toContain('file://')
    expect(prototypeWorkflowSkill).toContain('视觉质量闸门')
    expect(prototypeVisualQualitySkill).toContain('Prototype Visual Quality Gate')
    expect(prototypeVisualQualitySkill).toContain('Screenshot-led revision loop')
    expect(importedFrontendDesignSkill).toContain('name: frontend-design')
    expect(importedFrontendDesignLicense).toContain('Apache License')
    expect(webInformationSources).toContain('Anthropic')
    expect(thirdPartyNotices).toContain('Apache License 2.0')
    expect(webInformationProtocol.version).toBe(3)
    expect(webInformationProtocol.visualQualityContract?.requiredSkillIds).toEqual(['prototype-fidelity-workflow', 'prototype-visual-quality-gate', 'frontend-design'])
    expect(webInformationProtocol.visualQualityContract?.requiredHighFidelityQa).toEqual(expect.arrayContaining(['first-render:1440x1000', 'revision-after-image-review', 'revised-render:390x844']))
    expect(webInformationProtocol.visualQualityContract?.prohibitedTemplatePatterns).toEqual(expect.arrayContaining(['generic-gradient-saas-hero', 'fake-logo-or-review-or-price']))
    expect(webInformationProtocol.primaryOutput?.requiredPaths).toEqual(expect.arrayContaining(['prototype-brief.md', '01-low-fidelity.html', '02-mid-fidelity.html', '03-high-fidelity.html', 'prototype-evidence.md']))
    expect(webInformationProtocol.primaryOutput?.conditionalPaths?.['public-research']).toEqual(expect.arrayContaining(['prototype-research.md', 'prototype-sources.json']))
    expect(webInformationProtocol.prototypeContract?.fidelityLevels).toEqual(expect.objectContaining({ low: expect.any(String), medium: expect.any(String), high: expect.any(String) }))
    expect(webInformationProtocol.prototypeContract?.consistencyRequirements).toEqual(expect.arrayContaining(['same-information-architecture', 'same-primary-cta-intent']))
    expect(webInformationProtocol.evidenceBoundary?.prohibitedWithoutUserProof).toEqual(expect.arrayContaining(['customer reviews', 'prices', 'company or product logos']))
    expect(webInformationProtocol.evidenceBoundary?.localQaBoundary).toContain('current Expert session workDir')
    expect(webInformationProtocol.verificationContract?.localHtmlQa).toEqual(expect.arrayContaining([
      expect.stringContaining('CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE'),
      expect.stringContaining('1440x1000'),
      expect.stringContaining('not real-device or cross-platform testing'),
    ]))

  })
})


it('keeps commercialization repair and reference contracts identical in source and built ZIP', async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'expert-repair-parity-'))
  roots.push(outputDir)
  const sourceDir = path.join(path.resolve(import.meta.dir, '..'), 'experts')
  const [output] = await buildBundledExpertPacks({ sourceDir, outputDir, packId: 'commercialization-research-report' })
  const zip = await adapter.read(new Uint8Array(await readFile(output!)))
  const promptPath = 'experts/commercialization-research-report/prompts/system.md'
  const prompt = await zip.readText(promptPath)
  expect(prompt).toBe(await readFile(path.join(sourceDir, 'commercialization-research-report/prompts/system.md'), 'utf8'))
  expect(prompt).toContain('未声明字段设为 null')
  expect(prompt).toContain('[S1]: https://')
  expect(prompt).toContain('不会把普通聊天或工作流')
  expect(prompt).toContain('同一搜索 URL 的不同审计记录不能合并')
  const tool = await zip.readText('tools/write/tool.json')
  expect(tool).toBe(await readFile(path.join(sourceDir, 'commercialization-research-report/tools/write/tool.json'), 'utf8'))
  expect(tool).toContain('未声明字段设为 null')
  const skill = await zip.readText('skills/commercialization-field-evidence/SKILL.md')
  expect(skill).toContain('[S1]: https://')
  expect(skill).toContain('不是新的格式门槛')
  expect(skill).toContain('同一搜索 URL 的不同审计记录不能合并')
})


it('keeps commercialization pack profile and clarification skill aligned with staged template delivery', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'commercialization-question-contract-'))
  roots.push(root)
  const [output] = await buildBundledExpertPacks({ sourceDir: path.resolve(import.meta.dir, '../experts'), outputDir: root, packId: 'commercialization-research-report' })
  const zip = await adapter.read(new Uint8Array(await readFile(output!)))
  const expert = await zip.readJson<any>('experts/commercialization-research-report/expert.json')
  const manifest = await zip.readJson<any>('manifest.json')
  expect(expert.version).toBe(manifest.version)
  expect(expert.profile.soul.boundaries.join(' ')).not.toContain('使用一次结构化 Write')
  expect(expert.profile.soul.boundaries.join(' ')).toContain('草稿')
  expect(expert.profile.soul.boundaries.join(' ')).toContain('finalize')
  expect(expert.profile.knowledgeBase.notes).toContain(String(expert.skillIds.length) + ' 个')
  const protocol = await zip.readJson<any>('experts/commercialization-research-report/outputs/material-protocol.json')
  expect(protocol.primaryOutput.delivery).not.toContain('one structured Write call')
  expect(protocol.primaryOutput.delivery).toContain('draft')
  expect(protocol.primaryOutput.delivery).toContain('08')
  expect(protocol.primaryOutput.delivery).toContain('patch')
  expect(protocol.primaryOutput.delivery).toContain('finalize')
  expect(protocol.primaryOutput.fieldsDocument.content).toContain('mode')
  expect(protocol.primaryOutput.fieldsDocument.content).not.toContain('Put only templateId and template fields')
  const method = await zip.readText('skills/commercialization-research-method/SKILL.md')
  expect(method).toContain('Extract the product definition and constraints from supplied information first')
  expect(method).toContain('do not ask which analysis direction or decision the report should prioritize')
  expect(method).toContain('AskUserQuestion')

  // Check the real assembled instruction, not only separately correct source files.
  const { createExpertRuntimeBinding, buildExpertRuntimeTurnInstruction } = await import('../src/server/services/expertRuntimeBindingService.js')
  const skills = await Promise.all((expert.skillIds as string[]).map(async (skillId) => ({
    skillId, title: skillId, path: 'skills/' + skillId + '/SKILL.md', sha256: 'fixture',
    content: await zip.readText('skills/' + skillId + '/SKILL.md'),
  })))
  const prompt = await zip.readText(expert.promptPaths.system)
  const protocolContent = await zip.readText(expert.outputProtocolPath)
  const runtime = createExpertRuntimeBinding({
    expert: { ...expert, packId: manifest.packId, packVersion: manifest.version, tools: [], runtimePolicy: { ...manifest.runtimePolicy, requiredSkillIds: manifest.runtimePolicy?.requiredSkillIds ?? [] } },
    prompts: { system: prompt }, skills, forms: [], hostTools: manifest.hostTools, permissions: manifest.permissions,
    outputProtocol: { path: expert.outputProtocolPath, content: protocolContent },
    outputTemplate: { path: expert.outputTemplatePath, content: await zip.readText(expert.outputTemplatePath) },
  }, '2026-09-17T00:00:00Z')
  const instruction = buildExpertRuntimeTurnInstruction({ mode: 'expert', status: 'active', expertId: expert.id, expertName: expert.name, packId: manifest.packId, packVersion: manifest.version, runtimeBinding: runtime }, { enabledToolNames: ['AskUserQuestion', 'Read', 'Write', 'Edit', 'Agent', 'Playwright'] })!
  expect(instruction).toContain(prompt.trim())
  expect(instruction).toContain(protocolContent.trim())
  for (const skill of skills) expect(instruction).toContain(skill.content.trim())
  expect(instruction).not.toContain('[truncated by expert runtime]')
  expect(instruction).not.toContain('Use exactly two task-relevant, role-distinct concrete URLs')
  expect(instruction).not.toContain('permission to retain an evidence gap')
  expect(instruction).not.toContain('Use one structured Write call')
  expect(instruction).not.toContain('Put only templateId and template fields')
  expect(instruction).not.toContain('desktop Expert material control creates the downloadable material package')
  expect(instruction).toContain('every user-facing request for an answer must use AskUserQuestion')
  expect(runtime.researchDeliveryPolicy).toBeUndefined()
})
