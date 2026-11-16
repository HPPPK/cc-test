import { test, expect, spyOn, mock } from 'bun:test'
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

test('actual runAgent reserves bounded research from the real ZIP before relaying permissions; sibling write still denied', async () => {
  const root = path.resolve(import.meta.dir, '../../..')
  const out = process.env.EXPERT_CONSISTENCY_OUT || path.join(root, 'artifacts/expert-consistency-20260917')
  await mkdir(out, { recursive: true })
  const dir = await mkdtemp(path.join(out, 'agent-relay-'))
  const work = path.join(dir, 'work'); await mkdir(work)
  const old = { ...process.env }
  Object.assign(process.env, { CLAUDE_CONFIG_DIR: path.join(dir, 'config'), CLAUDE_EXPERT_PACKS_DIR: path.join(root, 'src/server/packs/experts'), CC_JIANGXIA_EXPERT_TEMPLATE_FILL_OUTPUT_ROOT: work })
  const { ExpertSessionService } = await import('../../server/services/expertSessionService.js')
  const { ExpertPackRegistryService, resetExpertPackRegistryForTests } = await import('../../server/services/expertPackRegistryService.js')
  const { sessionService } = await import('../../server/services/sessionService.js')
  const { guardExpertResearchIntake, submitExpertResearchAssessment } = await import('../../server/services/expertResearchIntakeService.js')
  const { handleSessionsApi } = await import('../../server/api/sessions.js')
  const { getCwdState, setCwdState, setOriginalCwd } = await import('../../bootstrap/state.js')
  const oldCwd = getCwdState(); setCwdState(work); setOriginalCwd(work)
  const { runAgent } = await import('./runAgent.js')
  const queryModule = await import('../../query.js')
  const { getEmptyToolPermissionContext } = await import('../../Tool.js')
  const { hasPermissionsToUseTool } = await import('../../utils/permissions/permissions.js')
  const { createFileStateCacheWithSizeLimit } = await import('../../utils/fileStateCache.js')
  const { createAssistantMessage, createUserMessage } = await import('../../utils/messages.js')
  const { FileWriteTool } = await import('../FileWriteTool/FileWriteTool.js')
  const { FileReadTool } = await import('../FileReadTool/FileReadTool.js')
  const { PlaywrightTool } = await import('../PlaywrightTool/PlaywrightTool.js')
  const { EXPERT_EVIDENCE_RESEARCH_AGENT } = await import('./built-in/expertEvidenceResearchAgent.js')
  const { runToolUse } = await import('../../services/tools/toolExecution.js')
  let server: ReturnType<typeof Bun.serve> | undefined
  try {
    resetExpertPackRegistryForTests()
    await new ExpertPackRegistryService().importExpertPackZip(await readFile(path.join(root, 'src/server/packs/experts/commercialization-research-report.zip')))
    const sid = (await sessionService.createSession(work)).sessionId
    const svc = new ExpertSessionService(); await svc.enterExpertMode(sid, 'commercialization-research-report')
    await expect(guardExpertResearchIntake(sid, 'Agent')).rejects.toThrow('EXPERT_INTAKE_REQUIRED')
    const sessionFile = (await sessionService.findSessionFile(sid))!.filePath
    await appendFile(sessionFile, JSON.stringify({
      uuid: 'relay-human-scope', type: 'user', messageKind: 'user_input',
      message: { role: 'user', content: '研究面向桌面办公用户的中键动作面板，交付桌面应用。' },
    }) + '\n')
    const admitted = await submitExpertResearchAssessment(sid, { dimensions: [
      { id: 'coreTask', provenance: 'confirmed', value: '中键动作面板', evidence: { messageId: 'relay-human-scope', quote: '中键动作面板' } },
      { id: 'audience', provenance: 'confirmed', value: '桌面办公用户', evidence: { messageId: 'relay-human-scope', quote: '桌面办公用户' } },
      { id: 'deliveryBoundary', provenance: 'confirmed', value: '桌面应用', evidence: { messageId: 'relay-human-scope', quote: '交付桌面应用' } },
    ] })
    expect(admitted.researchIntake?.status).toBe('clear')
    await expect(guardExpertResearchIntake(sid, 'Agent')).resolves.toBeUndefined()
    const binding = (await sessionService.getSession(sid))!.expert!.runtimeBinding!
    process.env.CC_JIANGXIA_EXPERT_SESSION_ID = sid
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = JSON.stringify(binding.researchArtifactPolicy)
    const permissions = { ...getEmptyToolPermissionContext(), mode: 'default' as const }
    const context: any = { options: { commands: [], debug: false, mainLoopModel: 'fixture', tools: [FileReadTool, FileWriteTool, PlaywrightTool], verbose: false, thinkingConfig: { type: 'disabled' }, mcpClients: [], mcpResources: {}, isNonInteractiveSession: true, agentDefinitions: { activeAgents: [], errors: [], warnings: [], metadata: { directories: [], loadedFromSettings: [] } } }, abortController: new AbortController(), readFileState: createFileStateCacheWithSizeLimit(100), getAppState: () => ({ toolPermissionContext: permissions, tasks: {}, sessionHooks: new Map() }), setAppState() {}, setInProgressToolUseIDs() {}, setResponseLength() {}, updateFileHistoryState() {}, updateAttributionState() {}, messages: [] }
    const brief = { type:'tool_use', id:'brief', name:'Write', input:{file_path:path.join(work,binding.researchArtifactPolicy!.briefPath), content:'# Brief\n拟开发新品，中键动作面板。用户人群待验证，完整商业分析。\n```expert-source-selection\n'+JSON.stringify({version:1,lanes:['competitors','user-needs','channels'].map(lane=>({lane,coreRationale:'核心应用统计可作背景，本次具体用户与产品页面优先。',coreConsidered:[{candidateUrl:'https://www.talkingdata.com/',decision:'deferred',reason:'宏观应用统计不能代替本线具体产品与使用者材料。'}],picks:[{candidateUrl:'https://www.reddit.com/',purpose:'发现本线具体讨论与产品线索',reason:'按当前问题选择相关公开帖子，不将搜索摘要当证据。'}]}))})+'\n```'} }
    for await (const result of runToolUse(brief as any, createAssistantMessage({content:[brief] as any}), (async()=>({behavior:'allow'})) as any, context)) expect(JSON.stringify(result)).not.toContain('is_error":true')
    const reservations: Array<{ action?: string; agentId?: string; artifactPath?: string; status: number }> = []
    server = Bun.serve({ port: 0, hostname: '127.0.0.1', async fetch(req) {
      const url = new URL(req.url)
      try {
        const reservation = url.pathname.endsWith('/expert/research-budget') ? await req.clone().json() : undefined
        const response = await handleSessionsApi(req, url, url.pathname.split('/').filter(Boolean))
        if (reservation) reservations.push({ ...reservation, status: response.status })
        return response
      } catch (error: any) {
        return Response.json({ message: error.message, code: error.code }, { status: error.statusCode || 500 })
      }
    } })
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL='http://127.0.0.1:'+server.port
    let reached = false
    const agentId='relay-fixture'
    spyOn(queryModule,'query').mockImplementation(async function* (params:any) {
      reached=true
      // Observe the real local API request before any model execution, rather
      // than manufacturing a legacy source-package dispatch receipt.
      expect(reservations).toEqual([{
        action: 'reserve-researcher', agentId,
        artifactPath: 'commercialization-research/02-competitors.parts/' + agentId + '.md', status: 200,
      }])
      expect(params.toolUseContext.getAppState().toolPermissionContext.shouldAvoidPermissionPrompts).toBe(false)
      expect(params.toolUseContext.getAppState().toolPermissionContext.awaitAutomatedChecksBeforeDialog).toBe(true)
      const assistant=createAssistantMessage({content:'fixture model output'})
      const own=path.join(work,'commercialization-research/02-competitors.parts/'+agentId+'.md')
      const decision=await params.canUseTool(FileWriteTool,{file_path:own,content:'# evidence'},params.toolUseContext,assistant,'own-write')
      expect(decision.behavior).toBe('ask')
      const { getToolResultsDir } = await import('../../utils/toolResultStorage.js')
      const resultsDir = getToolResultsDir()
      await mkdir(resultsDir, { recursive: true })
      const ownResult = path.join(resultsDir, 'worker-browser-result.txt')
      const otherResult = path.join(resultsDir, 'sibling-browser-result.txt')
      await writeFile(ownResult, 'full real browser output fixture')
      await writeFile(otherResult, 'another worker fixture')
      await params.canUseTool(PlaywrightTool, { actions: [{ type: 'navigate', url: 'https://example.com' }] }, params.toolUseContext, assistant, 'worker-browser-result')
      const readOwnDecision = await params.canUseTool(FileReadTool, { file_path: ownResult }, params.toolUseContext, assistant, 'read-own-result')
      expect(readOwnDecision.behavior).not.toBe('deny')
      const wrongParent = await params.canUseTool(FileReadTool, { file_path: path.join(resultsDir, 'wrong-parent', 'worker-browser-result.txt') }, params.toolUseContext, assistant, 'read-wrong-parent')
      expect(wrongParent.behavior).toBe('deny')
      expect(wrongParent.message).toContain(JSON.stringify(ownResult))
      expect(wrongParent.message).not.toContain(otherResult)

      expect((await params.canUseTool(FileReadTool, { file_path: otherResult }, params.toolUseContext, assistant, 'read-sibling-result')).behavior).toBe('deny')
      const sibling=path.join(work,'commercialization-research/03-user-needs.parts/other.md')
      expect((await params.canUseTool(FileWriteTool,{file_path:sibling,content:'# forbidden'},params.toolUseContext,assistant,'sibling-write')).behavior).toBe('deny')
      expect((await params.canUseTool(PlaywrightTool,{actions:[{type:'navigate',url:'https://example.org/docs'},{type:'extract'}]},params.toolUseContext,assistant,'browser')).behavior).toBe('ask')
      yield createAssistantMessage({content:'permission boundary checked'})
    } as any)
    for await (const _ of runAgent({agentDefinition:EXPERT_EVIDENCE_RESEARCH_AGENT,promptMessages:[createUserMessage({content:'研究指定范围'})],declaredResearchArtifactPath:'commercialization-research/02-competitors.md',taskPrompt:'研究指定范围',toolUseContext:context,canUseTool:hasPermissionsToUseTool,isAsync:true,querySource:'agent:custom' as any,override:{agentId:agentId as any,systemPrompt:[] as any,userContext:{},systemContext:{}},availableTools:[FileReadTool,FileWriteTool,PlaywrightTool]})) {}
    expect(reached).toBe(true)
    expect(reservations).toHaveLength(1)
    expect((await sessionService.getSession(sid))!.expert!.researchSourceDispatches?.receipts ?? []).toEqual([])
    // The reservation admitted by runAgent must actually back browser-call
    // admission, even though this permission test never opens a remote page.
    const browserReservation = await fetch(process.env.CC_JIANGXIA_DESKTOP_SERVER_URL + '/api/sessions/' + sid + '/expert/research-budget', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reserve-browser', agentId, requestId: 'permission-relay-budget-probe' }),
    })
    expect(browserReservation.status).toBe(200)
    expect(await browserReservation.json()).toMatchObject({ allowed: true, applicable: true })
  } finally {
    server?.stop(true);mock.restore();setCwdState(oldCwd);setOriginalCwd(oldCwd)
    for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key]
    Object.assign(process.env,old);resetExpertPackRegistryForTests()
  }
},60000)
