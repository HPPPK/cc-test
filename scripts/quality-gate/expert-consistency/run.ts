import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
const root = path.resolve(import.meta.dir, '../../..')
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const out = path.resolve(process.env.EXPERT_CONSISTENCY_OUT || path.join(root, 'artifacts', 'expert-consistency-' + stamp))
await mkdir(path.join(out, 'logs'), { recursive: true })
const cases = [
  ['criteria', 'scripts/quality-gate/expert-consistency/evidence.test.ts'],
  ['contracts', 'scripts/quality-gate/expert-consistency/contracts.test.ts'],
  ['static', 'scripts/quality-gate/expert-consistency/static.test.ts'],
  ['agent-permission', 'src/tools/AgentTool/expertPermissionRelay.test.ts'],
  ['agent-permission-integration', 'src/tools/AgentTool/expertPermissionRelay.integration.test.ts'],
  ['agent-runtime', 'src/tools/AgentTool/runAgent.test.ts'],
  ['startup', 'src/server/__tests__/expert-runtime-lifecycle.test.ts'],
  ['persistence', 'src/server/services/expertStartupPersistence.test.ts'],
  ['questions', 'src/server/__tests__/concurrent-questions.integration.test.ts'],
  ['source-queue', 'src/server/services/expertResearchSourceLibraryService.test.ts'],
  ['route-handoff', 'src/server/services/expertResearchRouteCompletionService.test.ts'],
  ['continuation', 'src/server/services/expertResearchAutoContinueService.test.ts'],
  ['verification', 'src/server/services/expertHumanVerificationService.test.ts'],
  ['browser-handoff', 'src/services/tools/expertBrowserVerificationRuntime.test.ts'],
  ['stream', 'src/server/__tests__/proxy-streaming.test.ts'],
  ['outbox', 'src/server/ws/clientOutbox.integration.test.ts'],
  ['write-runtime', 'src/services/tools/expertTemplateFillRuntime.test.ts'],
  ['session', 'src/server/services/expertSessionService.test.ts'],
  ['controlled', 'scripts/quality-gate/expert-consistency/controlled.test.ts'],
]
const selected = process.argv.find(a => a.startsWith('--lane='))?.slice(7)
const results: any[] = []
for (const [name, file] of cases.filter(([name]) => (!selected || selected === name) && !(process.argv.includes('--skip-controlled') && name === 'controlled'))) {
  const log = path.join(out, 'logs', name+'.log')
  const start = Date.now()
  const child = Bun.spawn([process.execPath, 'test', './'+file, '--timeout', '600000', ...(process.argv.includes('--coverage') ? ['--coverage', '--coverage-reporter=lcov', '--coverage-dir='+path.join(out, 'coverage', name)] : [])], { cwd:root, env:{ ...process.env, EXPERT_CONSISTENCY_OUT:out }, stdout:'pipe', stderr:'pipe' })
  // Drain both streams concurrently to avoid pipe backpressure in the verifier itself.
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  await writeFile(log, stdout+'\n'+stderr)
  results.push({ name, file, status:code===0?'passed':'failed', exitCode:code, durationMs:Date.now()-start, log })
  console.log(name+': '+(code===0?'PASS':'FAIL')+' ('+Math.round((Date.now()-start)/1000)+'s)')
  await writeFile(path.join(out, 'lanes.json'), JSON.stringify(results,null,2))
}
if (process.argv.includes('--live')) {
  const child = Bun.spawn([process.execPath, path.join(import.meta.dir,'live.ts')], { cwd:root, env:{...process.env, EXPERT_CONSISTENCY_OUT:out}, stdout:'inherit',stderr:'inherit' })
  const code=await child.exited
  results.push({name:'live',exitCode:code,status:code===0?'inspect-live-evidence':'failed-or-blocked'})
}
console.log('Evidence: '+out)
process.exitCode=results.some(r=>r.exitCode!==0)?1:0
