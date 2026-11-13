import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { ApiError } from '../middleware/errorHandler.js'
import { resolveExpertResearchArtifactPath, type ExpertResearchArtifactPolicy } from './expertResearchArtifactPolicyService.js'
import type { ExpertResearchEvidenceState } from './expertResearchEvidenceReviewService.js'

/** Refresh registered Markdown only; an edit never manufactures a browser receipt. */
export async function refreshRegisteredResearchEvidence(
  workDir: string,
  policy: ExpertResearchArtifactPolicy,
  evidence: ExpertResearchEvidenceState,
  sourceAgentTypes: readonly string[],
): Promise<ExpertResearchEvidenceState> {
  const sourceTypes = new Set(sourceAgentTypes)
  const eligible = evidence.records.some(row => row.artifactPath && sourceTypes.has(row.agentType))
  if (!eligible) return evidence
  let realRoot: string
  try { realRoot = await fs.realpath(workDir) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return evidence
    throw new ApiError(409, '研究工作目录无法安全读取；请检查目录权限与路径，不得沿用旧材料副本通过复核。', 'EXPERT_RESEARCH_EVIDENCE_CONTRACT_INVALID')
  }
  const records = await Promise.all(evidence.records.map(async row => {
    if (!row.artifactPath || !sourceTypes.has(row.agentType)) return row
    try {
      const resolved = resolveExpertResearchArtifactPath({ workDir, policy, artifactPath: row.artifactPath, allowedKinds: ['researcher-report'] })
      let file = realRoot
      // Reject both file and directory symlinks, including links into sibling ledgers.
      for (const segment of resolved.relativePath.split(/[\\/]/)) {
        file = path.join(file, segment)
        if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('symbolic link')
      }
      if (!(await fs.stat(file)).isFile()) throw new Error('not a regular file')
      const content = await fs.readFile(file, 'utf8')
      return content === row.content ? row : { ...row, content }
    } catch (error) {
      // Missing handoffs retain the existing missing-worker/file recovery route.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return row
      throw new ApiError(409, '已登记研究材料无法安全重新读取：' + row.artifactPath + '。请检查文件权限与路径；不得沿用旧副本通过复核，也不要重开网页。', 'EXPERT_RESEARCH_EVIDENCE_CONTRACT_INVALID')
    }
  }))
  return records.every((row, index) => row === evidence.records[index])
    ? evidence : { ...evidence, records, updatedAt: new Date().toISOString() }
}
