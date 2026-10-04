import { test, expect, spyOn, mock } from 'bun:test'
import { readFile, writeFile, mkdir, mkdtemp, rmdir } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
const root = path.resolve(import.meta.dir, '../../..')
const out = process.env.EXPERT_CONSISTENCY_OUT || path.join(root, 'artifacts/expert-consistency-20260917')

for (const finalMode of ['finalize', 'patch'] as const) test(finalMode + ': real .55 ZIP: question, brief, all source waves, >3 MD parts, review, absorption, disk recovery, draft, 08, terminal', async () => {
  await mkdir(out, { recursive: true })
  const area = await mkdtemp(path.join(out, 'controlled-'))
  const work = path.join(area, 'work'); await mkdir(work)
  const { getCwdState, setCwdState, setOriginalCwd } = await import('../../../src/bootstrap/state.js')
  const oldCwd = getCwdState(); setCwdState(work); setOriginalCwd(work)
  const oldEnv = { ...process.env }
  Object.assign(process.env, { CLAUDE_CONFIG_DIR: path.join(area, 'config'), CLAUDE_EXPERT_PACKS_DIR: path.join(root, 'src/server/packs/experts'), CC_JIANGXIA_EXPERT_TEMPLATE_FILL_WRITE: '1', CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT: work })
  const { ExpertPackRegistryService, resetExpertPackRegistryForTests } = await import('../../../src/server/services/expertPackRegistryService.js')
  const { ExpertSessionService } = await import('../../../src/server/services/expertSessionService.js')
  const { sessionService } = await import('../../../src/server/services/sessionService.js')
  const { handleSessionsApi } = await import('../../../src/server/api/sessions.js')
  const { runToolUse } = await import('../../../src/services/tools/toolExecution.js')
  const { getEmptyToolPermissionContext } = await import('../../../src/Tool.js')
  const { createFileStateCacheWithSizeLimit } = await import('../../../src/utils/fileStateCache.js')
  const { createAssistantMessage } = await import('../../../src/utils/messages.js')
  const { FileReadTool } = await import('../../../src/tools/FileReadTool/FileReadTool.js')
  const { getFileWriteToolForCurrentRuntime } = await import('../../../src/tools/FileWriteTool/FileWriteTool.js')
  const { AskUserQuestionTool } = await import('../../../src/tools/AskUserQuestionTool/AskUserQuestionTool.js')
  const { PlaywrightTool } = await import('../../../src/tools/PlaywrightTool/PlaywrightTool.js')
  const bridge = await import('../../../src/tools/PlaywrightTool/nodeBridge.js')
  const runtime = await import('../../../src/tools/PlaywrightTool/runtime.js')
  const { buildPlaywrightAudit, recordFinalizedExpertAgentResearchAudit } = await import('../../../src/tools/AgentTool/agentToolUtils.js')
  const { formatExpertAssignedResearchSourceBatch, formatExpertSubagentSkillContext } = await import('../../../src/services/tools/expertSubagentSkillRuntime.js')
  const { deriveExpertTemplateFillSchema } = await import('../../../src/utils/expertTemplateFill.js')
  const { parseResearchSourceLibrary, planResearchSourceLibraryExecutionBatches } = await import('../../../src/server/services/expertResearchSourceLibraryService.js')
  const { expertResearchAutoContinueService } = await import('../../../src/server/services/expertResearchAutoContinueService.js')
  const timeline: unknown[] = [], receipts: unknown[] = []
  const service = new ExpertSessionService()
  let server: ReturnType<typeof Bun.serve> | undefined
  let loseAck = false, ackCount = 0, sid = ''
  try {
    resetExpertPackRegistryForTests()
    await new ExpertPackRegistryService().importExpertPackZip(await readFile(path.join(root, 'src/server/packs/experts/commercialization-research-report.zip')))
    sid = (await sessionService.createSession(work)).sessionId
    await service.enterExpertMode(sid, 'commercialization-research-report')
    const binding = (await sessionService.getSession(sid))!.expert!.runtimeBinding!
    expect(binding.packVersion).toBe('0.13.55-local')
    expect(binding.researchDeliveryPolicy).toBeUndefined()
    const policy = binding.researchArtifactPolicy!
    Object.assign(process.env, { CC_JIANGXIA_EXPERT_SESSION_ID: sid, CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY: JSON.stringify(policy) })
    server = Bun.serve({ port: 0, hostname: '127.0.0.1', async fetch(req) {
      const url = new URL(req.url)
      try {
        // Fault injection only at the HTTP transport boundary, after real commit.
        const response = await handleSessionsApi(req, url, url.pathname.split('/').filter(Boolean))
        if (url.pathname.endsWith('template-fill-commit')) { ackCount++; if (loseAck) { loseAck = false; return Response.json({ error: 'fixture: lost commit response' }, { status: 503 }) } }
        return response
      } catch (e: any) { return Response.json({ error: e.message, code: e.code }, { status: e.statusCode || 500 }) }
    } })
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL = 'http://127.0.0.1:' + server.port
    const context: any = { options: { commands: [], debug: false, mainLoopModel: 'fixture', tools: [FileReadTool, getFileWriteToolForCurrentRuntime(), AskUserQuestionTool, PlaywrightTool], verbose: false, thinkingConfig: { type: 'disabled' }, mcpClients: [], mcpResources: {}, isNonInteractiveSession: true, agentDefinitions: { activeAgents: [], errors: [], warnings: [], metadata: { directories: [], loadedFromSettings: [] } } }, abortController: new AbortController(), readFileState: createFileStateCacheWithSizeLimit(1000), getAppState: () => ({ toolPermissionContext: { ...getEmptyToolPermissionContext(), mode: 'acceptEdits' }, tasks: {}, sessionHooks: new Map() }), setAppState() {}, setInProgressToolUseIDs() {}, setResponseLength() {}, updateFileHistoryState() {}, updateAttributionState() {}, messages: [] }
    let toolIndex = 0
    async function tool(name: string, input: any, allowError = false) {
      const use: any = { type: 'tool_use', id: 'consistency-' + ++toolIndex, name, input }
      const assistant = createAssistantMessage({ content: [use] })
      const messages: any[] = [assistant]
      for await (const update of runToolUse(use, assistant, (async () => ({ behavior: 'allow', decisionReason: { type: 'other', reason: 'isolated test' } })) as any, context)) if (update.message) messages.push(update.message)
      const errors = messages.flatMap(m => m.type === 'user' ? m.message.content.filter((b: any) => b.type === 'tool_result' && b.is_error) : [])
      timeline.push({ index: toolIndex, name, input, messages })
      await writeFile(path.join(area, 'progress.json'), JSON.stringify({ index: toolIndex, name, errors, at: new Date().toISOString() }))
      if (!allowError && errors.length) throw new Error(name + ' failed: ' + JSON.stringify(errors))
      return { messages, errors, use }
    }
    const abs = (p: string) => path.resolve(work, p)
    const save = (p: string, content: string) => tool('Write', { file_path: abs(p), content })
    const read = (p: string, offset?: number, limit?: number) => tool('Read', { file_path: abs(p), ...(offset ? { offset } : {}), ...(limit ? { limit } : {}) })
    const question = '这是调研现有 Quicker，还是拟开发新品？'
    const answer = '拟开发新品；Quicker 仅作为参照，面向桌面重复操作的效率工具。'
    const asked = await tool('AskUserQuestion', { questions: [{ question, header: '产品对象', options: [{ label: '现有 Quicker', description: '分析现有产品' }, { label: '拟开发新品', description: 'Quicker 是参照竞品' }], multiSelect: false }], answers: { [question]: answer } })
    expect(JSON.stringify(asked.messages)).toContain(answer)
    await expect(service.getSubagentSkillContext(sid, 'expert-evidence-researcher')).rejects.toThrow()
    const brief = '# 产品研究任务书\n用户确认：' + answer + '\n完整商业分析，市场范围国内与海外；国内线和海外线分别核实，不再询问分析方向或是否开始。\n本夹具无预先命名直接竞品，使用受控公开材料验证全部 A/B/C 来源任务的执行与交接。\n事实、有限观察、AI推断和证据缺口分开。'
    await save(policy.briefPath, brief)
    expect(await readFile(abs(policy.briefPath), 'utf8')).toContain(answer)
    const catalog = parseResearchSourceLibrary(binding.skills.find(s => s.skillId === 'research-source-library')!.content)
    const plan = planResearchSourceLibraryExecutionBatches({ catalog, researcherPaths: policy.researcherPaths })
    const all = plan.batches.flatMap(b => b.entries)
    expect(all.filter(e => e.tier === 'core')).toHaveLength(119)
    expect(new Set(all.map(e => [e.tier, e.category, e.candidateUrl].join("|"))).size).toBe(all.length)
    expect(all.some(e => /youtube/.test(e.candidateUrl))).toBe(true)
    expect(all.some(e => /bilibili/.test(e.candidateUrl))).toBe(true)
    spyOn(runtime, 'isPlaywrightRuntimeInstalled').mockReturnValue(true)
    spyOn(runtime, 'isPlaywrightRuntimeAvailable').mockReturnValue(true)
    spyOn(runtime, 'resolvePlaywrightExecutablePath').mockReturnValue('C:/fixture/chrome.exe')
    spyOn(bridge, 'isPlaywrightNodeBridgeAvailable').mockReturnValue(true)
    let pageOutcome = 0
    spyOn(bridge, 'runPlaywrightWithNodeBridge').mockImplementation(async (_id: any, input: any) => {
      const requestedUrl = input.actions.find((a: any) => a.type === 'navigate')!.url
      const parsed = new URL(requestedUrl)
      if (parsed.pathname === '/') parsed.pathname = '/fixture/product-details'
      const url = parsed.toString()
      const outcome = pageOutcome++ % 4
      return { url, title: 'Controlled source fixture', text: outcome === 0 ? '受控页面：支持自定义动作、跨应用快捷面板；价格尚未公开。KEY_DETAIL_快捷动作_尾页。' : outcome === 1 ? 'No matching product results' : '', links: [], accessLimited: outcome === 2, ...(outcome === 3 ? { error: 'fixture upstream HTTP 503' } : {}), steps: [{ index: 0, type: 'navigate', outcome: outcome === 3 ? 'error' : 'success', url, ...(outcome === 3 ? { error: 'HTTP 503' } : {}) }, { index: 1, type: 'extract', outcome: 'success', url }] } as any
    })
    const parts: string[] = [], used: Array<{ url: string; auditId: string }> = []
    for (let wave = 0; wave < 25; wave++) {
      const skillContext = await service.getSubagentSkillContext(sid, 'expert-evidence-researcher')
      console.log('CONTROLLED wave=' + wave + ' parts=' + parts.length)
      const batches = skillContext.researchSourcePlan?.batches.filter(b => b.entries.length) || []
      if (!batches.length) break
      for (const [lane, batch] of batches.entries()) {
        const agentId = 'fixture-' + wave + '-' + lane
        const artifact = batch.artifactPath.replace('.md', '.parts/' + agentId + '.md')
        const injected = formatExpertAssignedResearchSourceBatch(skillContext as any, artifact)!
        const childRules = formatExpertSubagentSkillContext(skillContext as any)
        for (const skill of skillContext.skills) expect(childRules.includes(skill.content)).toBe(true)
        expect(injected).toContain(batch.entries[0].candidateUrl)
        await service.recordResearchSourceDispatch(sid, { agentId, agentType: 'expert-evidence-researcher', artifactPath: batch.artifactPath, batchFingerprint: batch.batchFingerprint, coreEntryCount: batch.entries.filter(e => e.tier === 'core').length, openEntryCount: batch.entries.filter(e => e.tier === 'open').length })
        const browserMessages: any[] = []
        for (const entry of batch.entries) {
          context.agentId = agentId
          const result = await tool('Playwright', { actions: [{ type: 'navigate', url: entry.candidateUrl }, { type: 'extract' }], visible: false }, true)
          browserMessages.push(...result.messages)
        }
        delete context.agentId
        const audit = buildPlaywrightAudit(browserMessages)
        expect(audit.length).toBeGreaterThanOrEqual(batch.entries.length)
        expect(audit.some(e => e.status === 'pending')).toBe(false)
        for (const row of audit) if (row.status === 'opened' && browserMessages.some((m: any) => m.type === 'user' && m.message.content.some((b: any) => b.type === 'tool_result' && row.auditId?.includes(b.tool_use_id) && JSON.stringify(b.content).includes('KEY_DETAIL_快捷动作_尾页'))) && used.length < 3) used.push({ url: row.finalUrl || row.target, auditId: row.auditId! })
        const content = '# 受控研究分片 ' + agentId + '\nUNIQUE_DETAIL_' + agentId + '：该分片的快捷触发适用边界，不能跨样本外推。' + '\n' + audit.map(a => a.target + ' ' + a.status + ' ' + a.auditId).join('\n') + '\nKEY_DETAIL_快捷动作_尾页：事实只来自 opened 正文；失败、无结果与受限入口不推导产品能力。\nAI推断：快捷面板可能降低操作负担，需通过任务耗时实测验证。'
        await save(artifact, content); parts.push(artifact)
        await recordFinalizedExpertAgentResearchAudit({ agentId, agentType: 'expert-evidence-researcher', artifactPath: artifact, content: [{ type: 'text', text: artifact + ' 已保存' }], playwrightAudit: audit } as any, 'expert-evidence-researcher')
        receipts.push({ agentId, artifact, batch, audit, injected })
      }
    }
    expect(parts.length).toBeGreaterThan(3)
    const remaining = (await service.getSubagentSkillContext(sid, 'expert-evidence-researcher')).researchSourcePlan?.batches.flatMap(b => b.entries) || []
    expect(remaining).toHaveLength(0)
    const reviewContext = await service.getSubagentSkillContext(sid, 'expert-evidence-reviewer')
    for (const part of parts) { expect(reviewContext.artifactPaths!.researcherPaths).toContain(part); await read(part) }
    await service.getSubagentResearchEvidenceContext(sid, 'expert-evidence-reviewer')
    await read(policy.auditPath)
    const evidence = used.map(u => u.url + ' 核验事实：支持自定义动作和跨应用面板；价格缺口。').join('\n')
    await save(policy.reviewerPath, '# 独立复核\n' + evidence + '\nKEY_DETAIL_快捷动作_尾页 include；AI推断保留标注；受限、无结果、失败不作事实。')
    await recordFinalizedExpertAgentResearchAudit({ agentId: 'fixture-reviewer', agentType: 'expert-evidence-reviewer', artifactPath: policy.reviewerPath, content: [{ type: 'text', text: policy.reviewerPath }] } as any, 'expert-evidence-reviewer')
    const absorptionContext = await service.getSubagentSkillContext(sid, 'expert-evidence-absorber')
    for (const part of parts) expect(absorptionContext.artifactPaths!.researcherPaths).toContain(part)
    await read(policy.reviewerPath)
    const partDetails = (await Promise.all(parts.map(p => readFile(abs(p), 'utf8')))).map(text => text.split('\n').find(line => line.startsWith('UNIQUE_DETAIL_'))!)
    expect(partDetails.every(Boolean)).toBe(true)
    const absorption = '# 字段吸收\n' + partDetails.join('\n') + '\n' + evidence + '\n' + Array.from({ length: 100 }, (_, i) => '材料行 ' + i + '：有限观察，不能推断市场规模。').join('\n') + '\nPRODUCT_ONE_SENTENCE_DEFINITION: KEY_DETAIL_快捷动作_尾页\nAI推断：快捷面板可能降低任务负担，依据已核实的跨应用能力，需用户实验反证。\n来源只纳入以上实际使用 URL。'
    await save(policy.absorptionPath!, absorption)
    const schema = deriveExpertTemplateFillSchema(binding.outputTemplate!.content)
    const fields: Record<string, any> = {}
    for (const f of schema.fields) fields[f.id] = f.kind === 'table-rows' ? [f.columns.map(() => '证据缺口：本受控样本没有此项真实数据，需后续验证。')] : '证据缺口：本受控样本没有此项真实数据，需后续验证。'
    fields.REPORT_TITLE = '受控新品效率工具商业化报告（不是实际调研结论）'
    fields.PRODUCT_ONE_SENTENCE_DEFINITION = 'KEY_DETAIL_快捷动作_尾页：支持自定义动作与跨应用面板 [1]。AI推断：可能降低重复操作负担；依据是上述能力，需任务计时实验反证。'
    fields.OPPORTUNITY_GAP_CONTENT = partDetails.join('\n') + '\nAI推断：应分别验证各操作场景，不能用一个样本证明全部用户有付费意愿。'
    fields.EVIDENCE_STATUS_SUMMARY = '已核验事实：夹具页面中的快捷动作能力；有限公开观察：仅指定页面。AI推断：效率改善需实验反证。证据缺口：价格与市场规模未知。'
    const source = schema.fields.find(f => f.id === 'SOURCE_ROWS')!
    if (source.kind !== 'table-rows') throw new Error('Missing source table')
    fields.SOURCE_ROWS = used.map((u, i) => source.columns.map((c, j) => j === source.urlColumnIndex ? u.url : j === 0 ? '['+(i+1)+']' : /日期|时效/.test(c) ? '2026-09-17' : '受控正文：支持自定义动作与跨应用面板，价格未知；PRODUCT_ONE_SENTENCE_DEFINITION'))
    const payload = { file_path: 'fixture-report.html', content: '', expert_output: { templateId: schema.templateId, fields } }
    await read(policy.absorptionPath!, 1, 40)
    const partial = await tool('Write', structuredClone(payload), true)
    expect(JSON.stringify(partial.errors)).toContain('ABSORPTION_READ_REQUIRED')
    await read(policy.absorptionPath!, 41, 40); await read(policy.absorptionPath!, 81, 200)
    // Explicit fault lane only: fail at the disk-write boundary, never forge a write receipt.
    const disk = await import('../../../src/utils/file.js')
    const diskFailure = spyOn(disk, 'writeTextContent').mockImplementationOnce(() => { throw Object.assign(new Error('ENOSPC: controlled disk write failure'), { code: 'ENOSPC' }) })
    const failed = await tool('Write', structuredClone(payload), true)
    expect(failed.errors.length).toBeGreaterThan(0)
    expect(JSON.stringify(failed.errors)).toMatch(/ENOSPC/)
    expect(JSON.stringify(failed.errors)).not.toContain('SCHEMA')
    expect((await sessionService.getSession(sid))!.expert!.templateFillDraft).toBeUndefined()
    expect(ackCount).toBe(0)
    diskFailure.mockRestore()
    loseAck = true
    await tool('Write', structuredClone(payload))
    expect(ackCount).toBe(2)
    expect((await sessionService.getSession(sid))!.expert!.templateFillDraft?.completionReview).toBeTruthy()
    expect((await sessionService.getSession(sid))!.expert!.templateFillDelivery).toBeUndefined()
    const html = await readFile(abs('fixture-report.html'), 'utf8')
    expect(html).toContain('KEY_DETAIL_快捷动作_尾页')
    for (const detail of partDetails) expect(html).toContain(detail)
    expect(/\{\{[A-Z][A-Z0-9_]*\}\}/.test(html)).toBe(false)
    expect(html).not.toContain('<!-- SLOT:')
    for (const u of used) expect(html).toContain(u.url.replaceAll('&', '&amp;'))
    expect(html).toContain('AI推断')
    const visited = (receipts as any[]).flatMap(r => r.audit)
    const openedUrls = new Set(visited.filter(a => a.status === 'opened').map(a => a.finalUrl || a.target))
    for (const a of visited.filter(a => a.status !== 'opened')) if (!openedUrls.has(a.finalUrl || a.target)) expect(html.includes('href="' + (a.finalUrl || a.target) + '"')).toBe(false)
    await service.getSubagentSkillContext(sid, 'expert-evidence-output-reviewer')
    await read('fixture-report.html')
    await save(policy.completionReviewPath!, finalMode === 'patch' ? '# 完整性复核\n需要补写：PRODUCT_ONE_SENTENCE_DEFINITION 遗漏了价格尚未公开这一限定，07和引用正文已有此项依据，请只补这一字段。其余内容与07一致。' : '# 完整性复核\n报告与07一致，关键细节和实际使用来源均已保留。推断有标注，受限入口未冒充事实。不需要补写，无需修正。')
    await recordFinalizedExpertAgentResearchAudit({ agentId: 'fixture-output-reviewer', agentType: 'expert-evidence-output-reviewer', artifactPath: policy.completionReviewPath, content: [{ type: 'text', text: policy.completionReviewPath! }] } as any, 'expert-evidence-output-reviewer')
    await read(policy.completionReviewPath!)
    await tool('Write', { file_path: 'fixture-report.html', content: '', expert_output: { templateId: schema.templateId, mode: finalMode, fields: finalMode === 'patch' ? { PRODUCT_ONE_SENTENCE_DEFINITION: fields.PRODUCT_ONE_SENTENCE_DEFINITION + '价格尚未公开。' } : {} } })
    const final = (await sessionService.getSession(sid))!.expert!
    expect(final.templateFillDelivery).toBeTruthy()
    expect(await expertResearchAutoContinueService.tryContinue(sid)).toBe(false)
    const finalHtml = await readFile(abs('fixture-report.html'), 'utf8')
    if (finalMode === 'finalize') expect(finalHtml).toBe(html)
    else { expect(finalHtml).toContain('价格尚未公开。'); expect(finalHtml).not.toBe(html) }
    await writeFile(path.join(area, 'result.json'), JSON.stringify({ mode: 'controlled-external-responses', finalMode, sessionId: sid, zipVersion: binding.packVersion, coreEntries:119, totalEntries:all.length, parts:parts.length, acknowledgements:ackCount, reportSha256:createHash('sha256').update(finalHtml).digest('hex'), final }, null, 2))
  } finally {
    await writeFile(path.join(area, 'timeline.json'), JSON.stringify(timeline, null, 2))
    await writeFile(path.join(area, 'source-receipts.json'), JSON.stringify(receipts, null, 2))
    await writeFile(path.join(out, 'controlled-' + finalMode + '-latest.json'), JSON.stringify({ area, sessionId:sid }, null, 2))
    server?.stop(true); mock.restore(); setCwdState(oldCwd); setOriginalCwd(oldCwd)
    for (const k of Object.keys(process.env)) if (!(k in oldEnv)) delete process.env[k]
    Object.assign(process.env, oldEnv); resetExpertPackRegistryForTests()
  }
}, 600000)
