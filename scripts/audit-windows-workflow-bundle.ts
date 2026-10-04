import { spawn } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  auditWorkflowPackResources,
  type WorkflowPackAuditReport,
} from './audit-workflow-packs.js'

export type WindowsWorkflowBundleExtractor = (
  installerPath: string,
  extractDir: string,
) => Promise<void>

export async function auditWindowsWorkflowBundle(options: {
  installerPath: string
  lockFile?: string
  layer: string
  outputFile: string
  extractor?: WindowsWorkflowBundleExtractor
}): Promise<WorkflowPackAuditReport> {
  const installerPath = path.resolve(options.installerPath)
  await access(installerPath)
  const extractRoot = await mkdtemp(path.join(tmpdir(), 'cc-jiangxia-workflow-bundle-'))

  try {
    await (options.extractor ?? extractWindowsInstaller)(installerPath, extractRoot)
    return await auditWorkflowPackResources({
      resourceDir: extractRoot,
      outputFile: options.outputFile,
      layer: options.layer,
      ...(options.lockFile ? { lockFile: options.lockFile } : {}),
    })
  } finally {
    await rm(extractRoot, { recursive: true, force: true })
  }
}

async function extractWindowsInstaller(installerPath: string, extractDir: string): Promise<void> {
  const extension = path.extname(installerPath).toLowerCase()
  if (extension === '.exe') {
    const sevenZip = await resolveSevenZip()
    await runCommand(sevenZip, ['x', '-y', '-o' + extractDir, installerPath])
    return
  }
  if (extension === '.msi') {
    await runCommand('msiexec.exe', ['/a', installerPath, '/qn', 'TARGETDIR=' + extractDir])
    return
  }
  throw new Error('Unsupported Windows installer for workflow pack audit: ' + installerPath)
}

async function resolveSevenZip(): Promise<string> {
  const candidates = [
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, '7-Zip', '7z.exe') : '',
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)']!, '7-Zip', '7z.exe') : '',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {}
  }
  return '7z'
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', error => reject(new Error('Failed to start ' + command + ': ' + error.message)))
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(command + ' failed while extracting the Windows installer (code=' + String(code) + ', signal=' + String(signal) + ')'))
    })
  })
}

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const installerPath = argValue(args, '--installer')
  const outputFile = argValue(args, '--output-file')
  const layer = argValue(args, '--layer')
  if (!installerPath || !outputFile || !layer) {
    throw new Error('Usage: bun run scripts/audit-windows-workflow-bundle.ts --installer <exe-or-msi> --layer <name> --output-file <file> [--lock-file <file>]')
  }
  const report = await auditWindowsWorkflowBundle({
    installerPath,
    outputFile,
    layer,
    ...(argValue(args, '--lock-file') ? { lockFile: argValue(args, '--lock-file') } : {}),
  })
  console.log('[workflow-pack-bundle-audit] ' + report.layer + ' verified ' + report.packs.length + ' pack(s).')
}
