import { readFile, writeFile } from 'node:fs/promises'
import { ZipPackAdapter } from '../src/server/services/zipPackAdapter.js'
import { UIUX_IMAGE_PACK_VERSION as VERSION, UIUX_IMAGE_SKILLS, UIUX_IMAGE_ONLY_TOOLS, UIUX_IMAGE_ONLY_RUNTIME_INSTRUCTION, UIUX_REVIEW_EXAMPLE } from '../src/services/tools/uiuxImageContract.js'

const ID = 'uiux-design-system-expert'
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}

/** Replace executable guidance, not just a header; preserve provenance outside active entrypoints. */
export async function updateUiuxImageDeliveryPack(bytes: Uint8Array): Promise<Uint8Array> {
  const adapter = new ZipPackAdapter()
  const zip = await adapter.read(bytes)
  const manifest = record(await zip.readJson('manifest.json'))
  const expertPath = 'experts/' + ID + '/expert.json'
  const expert = record(await zip.readJson(expertPath))
  if (manifest.packId !== ID || expert.id !== ID) throw new Error('Refusing to modify a non-UIUX Expert')
  if (manifest.version === VERSION) return bytes
  if (!['0.3.25', '0.3.26', '0.3.27'].includes(manifest.version)) throw new Error('Unreviewed UIUX version: ' + manifest.version)
  const entries: Record<string, Uint8Array | string> = {}
  for (const entry of zip.entries) entries[entry.path] = await zip.readBytes(entry.path)
  const promptPath = 'experts/' + ID + '/prompts/system.md'
  const protocolPath = 'experts/' + ID + '/output-protocol.json'
  const archive = (file: string) => {
    const destination = 'third_party/uiux-pre-image-only/' + file
    if (!(destination in entries)) entries[destination] = entries[file]!
  }
  for (const file of [promptPath, protocolPath]) archive(file)
  // The old code-oriented Skills, scripts and templates remain provenance only.
  for (const file of Object.keys(entries)) {
    if (/^(?:skills|tools|forms|templates)\//.test(file) || new RegExp('^experts/' + ID + '/(?:forms|templates|tools)/').test(file)) {
      archive(file)
      delete entries[file]
    }
  }
  for (const skillId of UIUX_IMAGE_SKILLS) {
    const file = 'skills/' + skillId + '/SKILL.md'
    const content = await readFile(new URL('./uiux-image-skills/' + skillId + '.md', import.meta.url), 'utf8')
    if (!content.startsWith('---\nname: ' + skillId + '\n')) throw new Error('Invalid adapted Skill: ' + skillId)
    entries[file] = content
  }
  const description = '截图理解、需求头脑风暴、真实网站灵感、原创视觉方向、独立生图模型与读图审美复审；真实图片交付。'
  Object.assign(manifest, {
    version: VERSION, description,
    entrypoints: { ...record(manifest.entrypoints), skills: [...UIUX_IMAGE_SKILLS], tools: [] },
    hostTools: UIUX_IMAGE_ONLY_TOOLS.map(id => ({ id, name: id, purpose: id === 'image_generation' ? '使用用户独立配置的生图模型生成真实设计图。' : '图像事实、结构化决策和获准的公开视觉参考。', supported: true })),
    requiredHostTools: [],
    permissions: (Array.isArray(manifest.permissions) ? manifest.permissions : []).map((p: any) => p.id === 'write-expert-output' ? { ...p, description: '仅在用户授权工作目录保存真实生成图片和相关证据；参考截图不作为最终交付。' } : p),
    runtimePolicy: { ...record(manifest.runtimePolicy), mode: 'strict-visual-workflow', allowedToolNames: [...UIUX_IMAGE_ONLY_TOOLS], requiredSkillIds: [...UIUX_IMAGE_SKILLS] },
  })
  const profile = record(expert.profile)
  Object.assign(expert, {
    description, statusLabel: '真实生图流程：读图 → 灵感研究 → 选方向 → 生图 → 像素复审',
    promptPaths: { system: promptPath }, formPaths: [], outputProtocolPath: protocolPath, skillIds: [...UIUX_IMAGE_SKILLS],
    profile: { ...profile, tagline: description,
      soul: { ...record(profile.soul), whoIAm: description, boundaries: ['不编造截图事实、产品规则或生图回执。', '不把程序绘图或浏览器截图当成最终生图。', '不改变未获确认的价格、品牌、权益和业务承诺。'] },
      starterPrompts: ['根据我的截图提出原创视觉方向，确认后生成真实设计图。', '我有一段晦涩文案，请先梳理事实与视觉表达，再生成界面设计图。'],
      workflow: [{ id: 'understand', title: '读图与需求' }, { id: 'references', title: '灵感来源' }, { id: 'directions', title: '选定方向' }, { id: 'generate', title: '真实生图' }, { id: 'review', title: '读图复审' }],
      knowledgeBase: { ...record(profile.knowledgeBase), version: VERSION, notes: '14 个图片原生活跃 Skill；上游原文、脚本和许可仅在 third_party 中留档，不注入执行。' },
    },
  })
  delete expert.intakeFlow
  const oldProtocol = record(await zip.readJson(protocolPath))
  const protocol = { ...oldProtocol, version: 1, deliveryMode: 'generated-image-only',
    primaryOutput: { type: 'image', generatedBy: 'user-configured image_generation Provider/model', requiredEvidence: ['successful generation receipt', 'Read exact returned Image path as image block', 'generated-image-review-receipt'] },
    failurePolicy: { ...record(oldProtocol.failurePolicy), automaticFallback: false, automaticRetry: false, decisionTool: 'AskUserQuestion', generationFailureChoices: ['configure_then_retry', 'adjust_brief', 'stop'], previewFailureChoices: ['repair_preview_then_read', 'stop'], preserveSuccessfulImage: true },
    skillIds: [...UIUX_IMAGE_SKILLS], evidenceBoundaries: ['screenshot-fact', 'source-observation', 'design-hypothesis', 'unverified'], forbiddenSubstitutes: ['HTML', 'browser-screenshot', 'Python-drawing', 'SVG', 'Canvas'],
    referencePolicy: { ...record(oldProtocol.referencePolicy), userUrlsFirst: true, deduplicate: true, respectNoResearch: true, screenshotsMustBeRead: true, exactScreenshotPath: true, beforeDirectionAndGeneration: true, headless: true, captureTaskRelevantViewport: true, limitedEvidenceRequiresUserChoice: true, enforceUserUrlScope: true },
    review: { ...record(oldProtocol.review), receiptFormat: 'json', receiptSchemaVersion: UIUX_REVIEW_EXAMPLE.schemaVersion, maxTargetedRevisions: 1, requiredConcreteObservations: 2, imageDoesNotProve: ['interaction', 'responsiveness', 'accessibility-behavior', 'conversion-lift'] },
  }
  // Known obsolete delivery fields only; unknown user extension fields survive.
  for (const key of ['type', 'outputTemplatePath', 'templatePath', 'htmlQa', 'requiredViewports']) delete (protocol as Record<string, unknown>)[key]
  entries['manifest.json'] = JSON.stringify(manifest, null, 2) + '\n'
  entries[expertPath] = JSON.stringify(expert, null, 2) + '\n'
  entries[protocolPath] = JSON.stringify(protocol, null, 2) + '\n'
  entries[promptPath] = '# UIUX设计系统专家 — 真实图片交付\n\nTarget expert name: UIUX设计系统专家; expertId=uiux-design-system-expert; packId=uiux-design-system-expert. 不是原型图demo，不是商业化调研。购买只是一个例子。\n\n' + UIUX_IMAGE_ONLY_RUNTIME_INSTRUCTION + '\n\n全部活跃 Skill 正文已适配图片流程。归档内容不是可执行指令。先澄清任务，再确定来源；当前视口截图必须真实读到。生成成功但预览失败不是模型不能生图。不要从软件全家桶推断家庭共享。所有需要用户回答的问题用 AskUserQuestion；首次介绍后自然结束。\n'
  return adapter.write(entries)
}

if (import.meta.main) {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) throw new Error('Usage: bun run scripts/update-uiux-image-delivery.ts <input-uiux.zip> <output-uiux.zip>')
  await writeFile(output, await updateUiuxImageDeliveryPack(await readFile(input)))
  console.log('Updated only UIUX设计系统专家 to ' + VERSION)
}
