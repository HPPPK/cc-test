import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildBundledExpertPacks } from './build-expert-packs.js'
import { ZipPackAdapter } from '../src/server/services/zipPackAdapter.js'

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

    const outputs = await buildBundledExpertPacks({ sourceDir, outputDir })
    const output = outputs.find((candidate) => path.basename(candidate) === 'commercialization-research-report.zip')
    expect(output).toBeDefined()

    const zip = await adapter.read(new Uint8Array(await readFile(output!)))
    const manifest = JSON.parse(await zip.readText('manifest.json'))
    const expert = JSON.parse(await zip.readText('experts/commercialization-research-report/expert.json'))
    const browserSkillPath = 'skills/browser-information-retrieval/SKILL.md'
    const skillPath = 'skills/external-demand-evidence/SKILL.md'
    const channelSkillPath = 'skills/channel-acquisition-evidence/SKILL.md'
    const systemPrompt = await zip.readText('experts/commercialization-research-report/prompts/system.md')
    const outputProtocol = await zip.readText('experts/commercialization-research-report/outputs/material-protocol.json')

    expect(manifest.version).toBe('0.13.0-local')
    expect(expert.version).toBe(manifest.version)
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
      'expert-evidence-researcher': ['browser-information-retrieval'],
      'expert-evidence-reviewer': ['browser-information-retrieval'],
    })
    expect(manifest.runtimePolicy).toMatchObject({
      mode: 'package-local-skills',
      requiredSkillIds: ['browser-information-retrieval'],
    })
    for (const skillId of manifest.entrypoints.skills) {
      expect(zip.has(`skills/${skillId}/SKILL.md`)).toBe(true)
    }
    expect(zip.has('skills/commercialization-research-method/SKILL.md')).toBe(true)
    expect(zip.has(browserSkillPath)).toBe(true)
    expect(zip.has(skillPath)).toBe(true)
    expect(zip.has(channelSkillPath)).toBe(true)
    expect(zip.has('skills/google-grounded-source-discovery/SKILL.md')).toBe(false)
    expect(expert).not.toHaveProperty('researchDiscovery')
    const browserSkill = await zip.readText(browserSkillPath)
    expect(browserSkill).toContain('透明、可前台观察的 Playwright')
    expect(browserSkill).toContain('type: "navigate"')
    expect(browserSkill).toContain('type: "fill"')
    expect(browserSkill).toContain('type: "press"')
    expect(browserSkill).toContain('https://www.google.com/')
    expect(browserSkill).toContain('https://www.baidu.com/')
    expect(browserSkill).toContain('https://www.bing.com/')
    expect(browserSkill).toContain('https://www.so.com/')
    expect(browserSkill).not.toContain('search_query')
    expect(browserSkill).toContain('子代理**不得调用 AskUserQuestion**')
    expect(browserSkill).toContain('用户没有明确选择时，持续等待，不自动降级')
    expect(browserSkill).toContain('Google、百度、Bing、360 各自的成功、受限、无结果或未尝试状态都必须独立记录')
    expect(browserSkill).toContain('最终 HTML 的 3.5 `SEARCH_ACQUISITION_NOTE` 只写最多两句采集边界说明')
    expect(browserSkill).toContain('渠道证据包、Playwright 审计回执和运行日志')
    expect(browserSkill).not.toContain('`SEARCH_ACQUISITION_NOTE` 必须把每个入口写成')
    expect(await zip.readText(skillPath)).toContain('Playwright')
    expect(await zip.readText(channelSkillPath)).toContain('渠道证据包')
    expect(systemPrompt).toContain('browser-information-retrieval')
    expect(systemPrompt).toContain('搜索入口: "google"')
    expect(systemPrompt).toContain('搜索入口: "baidu"')
    expect(systemPrompt).toContain('搜索入口: "360"')
    expect(systemPrompt).toContain('<tool-audit>')
    expect(systemPrompt).toContain('<playwright-browser-audit>')
    expect(systemPrompt).toContain('子代理真实浏览台账与冲突处理')
    expect(systemPrompt).toContain('最终来源闭环')
    expect(systemPrompt).toContain('SEARCH_ACQUISITION_NOTE')
    expect(systemPrompt).toContain('内部四入口审计台账仍是必做研究记录，但绝不直接输出到最终 HTML')
    expect(systemPrompt).toContain('逐引擎流水')
    expect(systemPrompt).toContain('过程记录')
    expect(systemPrompt).toContain('错误写法（禁止）')
    expect(outputProtocol).toContain('逐引擎查询 URL、最终 URL、状态和限制原因必须保留在内部渠道证据包与运行日志中，但不得写进最终 HTML')
    expect(systemPrompt).toContain('官网 → 官方价格/购买页')
    expect(systemPrompt).toContain('EXPERT_PLAYWRIGHT_REQUIRED')
    expect(systemPrompt).toContain('证据受限报告')
    expect(systemPrompt).not.toContain('EXPERT_RESEARCH_COMPLETION_REQUIRED')
    expect(outputProtocol).toContain('researchCompletion')
    expect(outputProtocol).toContain('requiredSearchEngines')
    expect(outputProtocol).toContain('verificationFallbackSearchEngines')
    expect(JSON.parse(outputProtocol).researchBrowser.verificationFallbackSearchEngines).toEqual(['Google', '百度', 'Bing', '360'])
    expect(systemPrompt).toContain('external-demand-evidence')
    expect(systemPrompt).toContain('channel-acquisition-evidence')
    expect(systemPrompt).toContain('expert-template-fill --data-stdin')
    expect(systemPrompt).not.toContain('先用现有 Write 写一个小型 UTF-8 `report-fields.json`')
    expect(outputProtocol).toContain('allow-with-evidence-gaps')
    expect(outputProtocol).toContain('minimumCompletedAgentsByType')
    expect(outputProtocol).toContain('minimumDistinctOpenedSourceDomains')
    expect(outputProtocol).toContain('finalSourceCoverage')
    expect(systemPrompt).toContain('已打开来源不得在最终表中退化为“待补证”')
    expect(systemPrompt).toContain('先做来源表，再写各章节')
    expect(systemPrompt).toContain('动态结构化澄清链（研究启动前必做）')
    expect(systemPrompt).toContain('核心差异能力（必须卡片）')
    expect(systemPrompt).toContain('本轮要支持的商业决策')
    expect(systemPrompt).toContain('研究范围确认（最后一张卡）')
    expect(systemPrompt).toContain('普通文本的唯一入口')
    expect(systemPrompt).toContain('不能改为正文写“请再补充一句核心差异能力”')
    expect(systemPrompt).toContain('每次 `AskUserQuestion` 只提出 **1 个**')
    expect(systemPrompt).toContain('主代理和研究子代理都不得调用 `AskUserQuestion`')
    expect(systemPrompt).toContain('运行时会加入同一张专用弹窗并等待相同结果')
    expect(systemPrompt).toContain('research-delivery:commercialization-report')
    expect(systemPrompt).toContain('evidence_gap_delivery')
    expect(systemPrompt).toContain('用户看不到')
    expect(systemPrompt).toContain('accept_current_scope')
    expect(systemPrompt).toContain('Quicker 替代')
    expect(systemPrompt).toContain('AI 老照片修复')
    expect(systemPrompt).toContain('verification_resolution: "record_evidence_gap"')
    expect(systemPrompt).toContain('Google、百度、Bing、360 各自的查询词、发起 URL、最终 URL、日期、状态')
    expect(systemPrompt).not.toContain('SEARCH_ACQUISITION_NOTE 必须直接展示这份台账')
    expect(systemPrompt).toContain('研究子代理不得为 CAPTCHA/登录验证调用 AskUserQuestion')
    expect(systemPrompt).toContain('MONETIZATION_MODEL_ROWS')
    expect(outputProtocol).toContain('templateFieldGuide')
    expect(outputProtocol).toContain('AI 视频翻译')
    expect(outputProtocol).toContain('关键词快照')
    expect(outputProtocol).toContain('researchDelivery')
    expect(outputProtocol).toContain('allowUserAuthorizedCdp')
    expect(outputProtocol).toContain('managedPresentationDefault')
    expect(outputProtocol).toContain('assistable_background')
    expect(outputProtocol).toContain('allowManagedPresentationChoice')
    expect(outputProtocol).not.toContain('forceVisiblePlaywright')
    expect(outputProtocol).toContain('desktopHumanVerificationHandoff')
    expect(outputProtocol).toContain('forbidSubagentAskUserQuestion')
    expect(outputProtocol).toContain('accept_current_scope')
    expect(outputProtocol).toContain('Quicker 替代')
    expect(systemPrompt).toContain('来源集中')
    expect(systemPrompt).toContain('品牌不同不等于外部用户/内容证据')
    expect(systemPrompt).toContain('不是证据缺口标签')
    expect(await zip.readText(channelSkillPath)).toContain('均是第一方产品事实')
    expect(await zip.readText(channelSkillPath)).toContain('负向观察结论')
  })
})
