import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createExpertRuntimeBinding, buildExpertRuntimeTurnInstruction, resolveExpertRuntimeToolPolicy } from '../src/server/services/expertRuntimeBindingService.js'
import { buildBundledExpertPacks } from './build-expert-packs.js'
import { ZipPackAdapter } from '../src/server/services/zipPackAdapter.js'
import { ExpertPackRegistryService } from '../src/server/services/expertPackRegistryService.js'

// These verify the shipped instruction contract, not generated UI quality or live model compliance.
const sourceDir = path.resolve(import.meta.dir, '../experts')
const packId = 'web-information-designer'
let outputDir: string
let bytes: Uint8Array
let zip: Awaited<ReturnType<ZipPackAdapter['read']>>
let prompt: string
let workflow: string
let quality: string
let protocol: any
let intake: any

beforeAll(async () => {
  outputDir = await mkdtemp(path.join(tmpdir(), 'prototype-html-contract-'))
  const [output] = await buildBundledExpertPacks({ sourceDir, outputDir, packId })
  bytes = new Uint8Array(await readFile(output!))
  zip = await new ZipPackAdapter().read(bytes)
  prompt = await zip.readText('experts/' + packId + '/prompts/system.md')
  workflow = await zip.readText('skills/prototype-fidelity-workflow/SKILL.md')
  quality = await zip.readText('skills/prototype-visual-quality-gate/SKILL.md')
  protocol = JSON.parse(await zip.readText('experts/' + packId + '/outputs/material-protocol.json'))
  intake = JSON.parse(await zip.readText('experts/' + packId + '/forms/intake.json'))
})

afterAll(async () => {
  if (!outputDir) return
  const resolved = path.resolve(outputDir)
  if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith('prototype-html-contract-')) {
    throw new Error('Refuse cleanup outside the test-owned temp directory')
  }
  await rm(resolved, { recursive: true, force: true })
})

describe('原型图demo HTML generation instruction contract', () => {
  it('ships the exact HTML expert identity without enabling image generation', async () => {
    const preview = await new ExpertPackRegistryService().previewExpertPackZip(bytes, { detectConflicts: false })
    expect(preview.pack).toMatchObject({ packId, name: '原型图demo', version: '1.5.1' })
    expect(preview.experts[0]).toMatchObject({ id: packId, name: '原型图demo' })
    expect(preview.experts[0]!.systemPromptContent).toBe(prompt)
    expect(preview.experts[0]!.tools.map(tool => tool.hostToolId)).toEqual(expect.arrayContaining(['AskUserQuestion', 'Read', 'Write', 'Bash', 'Playwright', 'PrototypePreview']))
    expect(preview.experts[0]!.hostTools.map(tool => tool.id)).toContain('PrototypePreview')
    const manifest = await zip.readJson('manifest.json') as any
    const expert = await zip.readJson('experts/' + packId + '/expert.json') as any
    expect(expert.version).toBe(manifest.version)
    expect(manifest.runtimePolicy.mode).toBe('prototype-visual-workflow')
    expect(manifest.runtimePolicy.allowedToolNames).toEqual(['AskUserQuestion', 'Playwright', 'Read', 'Write', 'Bash', 'PrototypePreview'])
    expect(expert.tools.map((tool: any) => tool.hostToolId)).not.toContain('image_generation')
    expect(protocol.mode).toBe('prototype-html-artifact-set')
  })

  it('sets distinct multi-screen and landing-section defaults with no padding or invented scope', () => {
    expect(protocol.prototypeContract.screenCoverage).toMatchObject({
      productApp: { targetMin: 8, targetMax: 12, minimumTaskScreens: 6, minimumStateScreens: 2 },
      productLanding: { targetMin: 8, targetMax: 10, countUnit: 'substantive-section', excludeNavigationAndFooter: true },
      smallPrdRule: 'ask-to-reduce-do-not-invent-features',
      explicitUserScopeWins: true,
    })
    expect(prompt).toContain('8–12')
    expect(prompt).toContain('8–10')
    expect(workflow).toContain('不计入屏数')
    expect(workflow).toContain('不是新增登录、会员、支付的许可')
  })

  it('requires conditional palette confirmation rather than treating style preference as consent', () => {
    expect(protocol.prototypeContract.paletteConfirmation).toMatchObject({
      tool: 'AskUserQuestion', trigger: 'palette-missing-and-not-explicitly-delegated',
      preserveUserColors: true, genericStyleIsNotPaletteConsent: true, confirmBeforeVisualDesign: true,
    })
    const fields = intake.steps.find((step: any) => step.id === 'productBrief').fields
    expect(fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'brandPalette', kind: 'textarea', required: false }),
      expect.objectContaining({ id: 'screenScope', kind: 'textarea', required: false }),
    ]))
    expect(intake.steps.find((step: any) => step.id === 'paletteGuidance').markdown).toContain('AskUserQuestion')
    expect(prompt).toContain('高级感、科技感、参考某网站，不等于已确认配色')
    expect(workflow).toContain('用户已给 HEX')
    expect(workflow).toContain('用户明确说“配色你定”')
    expect(workflow).toContain('等颜色答案时可以整理 PRD 和屏幕清单')
  })

  it('maps PRD to stable screen IDs in all three HTML overview documents', () => {
    expect(protocol.prototypeContract.screenInventoryFields).toEqual(expect.arrayContaining([
      'screenId', 'prdRequirement', 'userTask', 'entry', 'exit', 'primaryAction', 'content', 'states', 'verification',
    ]))
    expect(protocol.prototypeContract.consistencyRequirements).toContain('same-screen-ids-and-task-flow')
    expect(workflow).toContain('data-screen-id')
    expect(workflow).toContain('data-section-id')
    expect(workflow).toContain('总览模式')
    expect(workflow).toContain('同一份 DOM')
    expect(workflow).toContain('PNG 是扁平图片')
  })

  it('injects concrete worked screen maps and component examples in a bound Skill, not just unreachable reference links', async () => {
    const manifest = await zip.readJson('manifest.json') as any
    expect(manifest.entrypoints.skills).toContain('prototype-fidelity-workflow')
    for (const text of ['S01', 'S08', 'L01', 'L08', 'file-uploader/usage', 'data-table/usage', 'ui.shadcn.com/blocks', '对照：问题 → 借鉴点 → 用到哪屏 → 不照搬什么']) {
      expect(workflow).toContain(text)
    }
    expect(workflow).toContain('input type="file"')
    expect(workflow).toContain('input type="range"')
    expect(workflow).toContain('真实前端行为 / 演示模拟 / 未实现')
    const sources = await zip.readText('skills/SOURCES.md')
    expect(sources).toContain('2026-09-11')
    expect(sources).toContain('未进行这些参考页面的浏览器截图或颜色实测')
  })

  it('separates visual evidence from interaction claims and rejects fake multi-screen richness', () => {
    expect(quality).toContain('Multi-screen acceptance')
    expect(quality).toContain('正常纵向滚动')
    expect(quality).toContain('截图不能证明')
    expect(quality).toContain('空白撑高')
    expect(quality).toContain('design-tokens')
    expect(protocol.visualQualityContract.multiScreenReview).toContain('each-screen-content-and-task')
    expect(prompt).toContain('不是图片生成')
  })

  it('keeps the old artifact protocol shape and runtime filenames compatible', () => {
    expect(protocol.version).toBe(3)
    expect(intake.version).toBe(2)
    expect(protocol.primaryOutput.requiredPaths).toEqual([
      'prototype-brief.md', '01-low-fidelity.html', '02-mid-fidelity.html', '03-high-fidelity.html', 'prototype-evidence.md',
    ])
    expect(prompt).toContain('PrototypePreview')
    expect(prompt).toContain('imgs/qa/<runId>/')
    expect(prompt).toContain('screenId')
    expect(prompt).not.toContain('CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE')
    expect(workflow).not.toContain('--screenshot=')
    expect(prompt).toContain('不要依赖联网 CDN')
  })

  it('carries the full multi-screen examples and palette gate into a new runtime snapshot and turn instruction', async () => {
    const preview = await new ExpertPackRegistryService().previewExpertPackZip(bytes, { detectConflicts: false })
    const expert = preview.experts[0]!
    const skills = await Promise.all(expert.skillIds.map(async (skillId) => {
      const skillPath = 'skills/' + skillId + '/SKILL.md'
      const content = await zip.readText(skillPath)
      return {
        skillId, path: skillPath, source: 'expert-pack' as const, packId, packVersion: expert.packVersion,
        sha256: createHash('sha256').update(content).digest('hex'), bytes: Buffer.byteLength(content), title: skillId, content,
      }
    }))
    const binding = createExpertRuntimeBinding({
      expert, prompts: { system: expert.systemPromptContent! }, skills, forms: [],
      hostTools: expert.hostTools, permissions: expert.permissions,
      outputProtocol: { path: expert.outputProtocolPath!, content: JSON.stringify(protocol) },
      runtimeInstructions: '', globalSkillFallbackUsed: false,
    }, '2026-09-11T00:00:00.000Z')
    const session = {
      mode: 'expert' as const, expertId: expert.id, expertName: expert.name, packId, packVersion: expert.packVersion,
      status: 'active' as const, runtimeBinding: binding, materialRefs: [], startedAt: binding.activatedAt, updatedAt: binding.activatedAt,
    }
    const enabledToolNames = ['AskUserQuestion', 'Read', 'Write', 'Bash', 'Playwright', 'PrototypePreview', 'image_generation']
    const instruction = buildExpertRuntimeTurnInstruction(session, { enabledToolNames })!
    expect(instruction).toContain('高级感、科技感、参考某网站，不等于已确认配色')
    expect(instruction).toContain('例 A：照片整理/修复工具的 8 屏')
    expect(instruction).toContain('例 B：桌面文档工具落地页的 8 个区块')
    expect(instruction).toContain('Multi-screen acceptance')
    expect(instruction).not.toContain('[truncated by expert runtime]')
    expect(instruction).not.toContain('HTML is only an intermediate artifact.')
    expect(resolveExpertRuntimeToolPolicy(session, { enabledToolNames }).allowedTools).not.toContain('image_generation')
    expect(resolveExpertRuntimeToolPolicy(session, { enabledToolNames }).disallowedTools).toContain('image_generation')
    expect(resolveExpertRuntimeToolPolicy(session, { enabledToolNames }).allowedTools).toContain('PrototypePreview')
    expect(binding.tools.some(tool => tool.hostToolId === 'PrototypePreview')).toBe(true)
    expect(instruction).not.toContain('Use the approved CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE through Bash')
    expect(instruction).not.toContain('full currently enabled host tool pool remain available')
    expect(binding.skills.find((skill) => skill.skillId === 'prototype-fidelity-workflow')?.content).toBe(workflow.trim())
  })

  it('keeps edited source files byte-identical to the targeted ZIP entries', async () => {
    for (const relative of ['expert.json', 'manifest.json', 'prompts/system.md', 'forms/intake.json', 'outputs/material-protocol.json', 'skills/SOURCES.md', 'skills/prototype-fidelity-workflow/SKILL.md', 'skills/prototype-visual-quality-gate/SKILL.md']) {
      const entry = relative === 'manifest.json' || relative.startsWith('skills/') ? relative : 'experts/' + packId + '/' + relative
      expect(await zip.readText(entry)).toBe(await readFile(path.join(sourceDir, packId, relative), 'utf8'))
    }
  })
})
