import { lstatSync, realpathSync } from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod/v4'
import type { Tool } from '../../Tool.js'

/** Read-only access to an output produced by this worker's actual browser call. */
export function isOwnBrowserResultReadable(input: unknown, options: { directory: string; ownedToolUseIds: ReadonlySet<string> }): boolean {
  const file = input && typeof input === 'object' ? (input as Record<string, unknown>).file_path : undefined
  if (typeof file !== 'string' || !path.isAbsolute(file)) return false
  const resolved = path.resolve(file)
  if (path.dirname(resolved) !== path.resolve(options.directory)) return false
  const name = path.basename(resolved)
  if (!/^[A-Za-z0-9_-]+\.(?:txt|json)$/.test(name) || !options.ownedToolUseIds.has(name.replace(/\.(?:txt|json)$/, ''))) return false
  try {
    return lstatSync(resolved).isFile() && !lstatSync(resolved).isSymbolicLink()
      && path.dirname(realpathSync(resolved)) === realpathSync(options.directory)
  } catch { return false }
}

/** Suggest only an existing file owned by this worker; never rewrite the call. */
export function ownBrowserResultRecoveryPath(input: unknown, options: { directory: string; ownedToolUseIds: ReadonlySet<string> }): string | undefined {
  const file = input && typeof input === 'object' ? (input as Record<string, unknown>).file_path : undefined
  if (typeof file !== 'string') return undefined
  const expected = path.join(options.directory, path.basename(file))
  return isOwnBrowserResultReadable({ file_path: expected }, options) ? expected : undefined
}

/** Accept equivalent spellings; realpath/role authorization still runs in the host. */
export function constrainWorkerWriteTool(tool: Tool, targetPath?: string, workspaceRoot = process.cwd()): Tool {
  if (tool.name !== 'Write' || !targetPath) return tool
  const schema = tool.inputSchema as z.ZodObject
  if (typeof schema.extend !== 'function') return tool
  return { ...tool, inputSchema: schema.extend({ file_path: z.string().describe('Assigned Markdown: ' + targetPath + '; an equivalent absolute path is allowed.').refine(value => path.resolve(workspaceRoot, value) === path.resolve(workspaceRoot, targetPath), { message: 'Use the assigned Markdown path: ' + targetPath }) }) } as Tool
}

export function workerOutputInstruction(targetPath: string): string {
  return '<expert-worker-output>\nThe runtime-owned output path is exactly ' + JSON.stringify(targetPath)
    + '. Use this file_path or its equivalent absolute path for Write and subsequent Read verification. Do not shorten, rename, or infer another filename. Do not Read your output before you have successfully written it. If saving fails, retry only this same path with the existing content; do not restart research or generate HTML.\n</expert-worker-output>'
}

const browserResultsByAgent = new Map<string, { directory: string; ownedToolUseIds: Set<string> }>()
export function registerAgentBrowserResult(agentId: string, directory: string, toolUseId: string): void {
  const owned = browserResultsByAgent.get(agentId) ?? { directory, ownedToolUseIds: new Set<string>() }
  if (owned.directory !== directory) return
  owned.ownedToolUseIds.add(toolUseId)
  browserResultsByAgent.set(agentId, owned)
}
export function isAgentBrowserResultReadable(input: unknown, agentId?: string): boolean {
  const owned = agentId ? browserResultsByAgent.get(agentId) : undefined
  return owned ? isOwnBrowserResultReadable(input, owned) : false
}
export function clearAgentBrowserResults(agentId: string): void {
  browserResultsByAgent.delete(agentId)
}
