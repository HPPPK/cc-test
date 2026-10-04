import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
const root = path.resolve(import.meta.dir, '../../..')
const out = process.env.EXPERT_CONSISTENCY_OUT || path.join(root, 'artifacts/expert-consistency-20260917')
await mkdir(out, { recursive: true })
const p = Bun.spawn([process.execPath, path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', path.join(import.meta.dir, 'tsconfig.json'), '--pretty', 'false'], {cwd:root,stdout:'pipe',stderr:'pipe'})
const [stdout,stderr,code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited])
await writeFile(path.join(out,'types.log'), stdout+stderr)
const own = (stdout+stderr).split(String.fromCharCode(10)).filter(l=>l.includes('scripts/quality-gate/expert-consistency/'))
await writeFile(path.join(out,'types-summary.json'),JSON.stringify({exitCode:code,newHarnessDiagnostics:own,dependencyDiagnostics:(stdout+stderr).split(String.fromCharCode(10)).filter(l=>l.includes('error TS')&&!l.includes('scripts/quality-gate/expert-consistency/')).length},null,2))
console.log(JSON.stringify({exitCode:code,newHarnessDiagnostics:own,log:path.join(out,'types.log')}))
process.exitCode=code
