import { test, expect, spyOn, mock } from 'bun:test'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import path from 'node:path'

test('actual runAgent binds real ZIP before relaying background Write/Playwright permission; sibling write still denied', async () => {
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
    const binding = (await sessionService.getSession(sid))!.expert!.runtimeBinding!
    process.env.CC_JIANGXIA_EXPERT_SESSION_ID = sid
    process.env.CC_JIANGXIA_EXPERT_RESEARCH_ARTIFACT_POLICY = JSON.stringify(binding.researchArtifactPolicy)
    const permissions = { ...getEmptyToolPermissionContext(), mode: 'default' as const }
    const context: any = { options: { commands: [], debug: false, mainLoopModel: 'fixture', tools: [FileReadTool, FileWriteTool, PlaywrightTool], verbose: false, thinkingConfig: { type: 'disabled' }, mcpClients: [], mcpResources: {}, isNonInteractiveSession: true, agentDefinitions: { activeAgents: [], errors: [], warnings: [], metadata: { directories: [], loadedFromSettings: [] } } }, abortController: new AbortController(), readFileState: createFileStateCacheWithSizeLimit(100), getAppState: () => ({ toolPermissionContext: permissions, tasks: {}, sessionHooks: new Map() }), setAppState() {}, setInProgressToolUseIDs() {}, setResponseLength() {}, updateFileHistoryState() {}, updateAttributionState() {}, messages: [] }
    const brief = { type:'tool_use', id:'brief', name:'Write', input:{file_path:path.join(work,binding.researchArtifactPolicy!.briefPath), content:'# Brief\n拟开发新品，中键动作面板。用户人群待验证，完整商业分析。'} }
    for await (const result of runToolUse(brief as any, createAssistantMessage({content:[brief] as any}), (async()=>({behavior:'allow'})) as any, context)) expect(JSON.stringify(result)).not.toContain('is_error":true')
    server = Bun.serve({port:0,hostname:'127.0.0.1', async fetch(req) { const url=new URL(req.url); try {return await handleSessionsApi(req,url,url.pathname.split('/').filter(Boolean))} catch(e:any){return Response.json({message:e.message,code:e.code},{status:e.statusCode||500})} }})
    process.env.CC_JIANGXIA_DESKTOP_SERVER_URL='http://127.0.0.1:'+server.port
    let reached = false
    const agentId='relay-fixture'
    spyOn(queryModule,'query').mockImplementation(async function* (params:any) {
      reached=true
      expect(params.toolUseContext.getAppState().toolPermissionContext.shouldAvoidPermissionPrompts).toBe(false)
      expect(params.toolUseContext.getAppState().toolPermissionContext.awaitAutomatedChecksBeforeDialog).toBe(true)
      const assistant=createAssistantMessage({content:'fixture model output'})
      const own=path.join(work,'commercialization-research/02-competitors.parts/'+agentId+'.md')
      const decision=await params.canUseTool(FileWriteTool,{file_path:own,content:'# evidence'},params.toolUseContext,assistant,'own-write')
      expect(decision.behavior).toBe('ask')
      const sibling=path.join(work,'commercialization-research/03-user-needs.parts/other.md')
      expect((await params.canUseTool(FileWriteTool,{file_path:sibling,content:'# forbidden'},params.toolUseContext,assistant,'sibling-write')).behavior).toBe('deny')
      expect((await params.canUseTool(PlaywrightTool,{actions:[{type:'navigate',url:'https://example.org/docs'},{type:'extract'}]},params.toolUseContext,assistant,'browser')).behavior).toBe('ask')
      yield createAssistantMessage({content:'permission boundary checked'})
    } as any)
    for await (const _ of runAgent({agentDefinition:EXPERT_EVIDENCE_RESEARCH_AGENT,promptMessages:[createUserMessage({content:'研究指定范围'})],declaredResearchArtifactPath:'commercialization-research/02-competitors.md',taskPrompt:'研究指定范围',toolUseContext:context,canUseTool:hasPermissionsToUseTool,isAsync:true,querySource:'agent:custom' as any,override:{agentId:agentId as any,systemPrompt:[] as any,userContext:{},systemContext:{}},availableTools:[FileReadTool,FileWriteTool,PlaywrightTool]})) {}
    expect(reached).toBe(true)
    expect((await sessionService.getSession(sid))!.expert!.researchSourceDispatches!.receipts.some(r=>r.agentId===agentId)).toBe(true)
  } finally {
    server?.stop(true);mock.restore();setCwdState(oldCwd);setOriginalCwd(oldCwd)
    for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key]
    Object.assign(process.env,old);resetExpertPackRegistryForTests()
  }
},60000)
