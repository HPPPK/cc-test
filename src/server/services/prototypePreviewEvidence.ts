import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { PrototypePreviewReceipt } from './prototypePreviewService.js'

/** Recheck actual files at terminal time; shell aliases and delayed writes cannot bypass it. */
export async function validatePrototypePreviewFiles(receipt: PrototypePreviewReceipt, workDir: string): Promise<string[]> {
  const reasons: string[] = []
  const root = await realpath(workDir)
  for (const file of [receipt.source, ...receipt.screenshots, ...(receipt.assets || [])]) {
    try {
      const resolved = await realpath(file.path)
      const relative = path.relative(root, resolved)
      if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
        reasons.push('预览证据路径超出当前会话目录')
        continue
      }
      const bytes = await readFile(resolved)
      if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) reasons.push(path.basename(file.path) + ' 内容已变化：最终文件与截图回执不匹配，必须重新预览和读取')
    } catch { reasons.push(path.basename(file.path) + ' 证据文件不存在或无法读取') }
  }
  return reasons
}
