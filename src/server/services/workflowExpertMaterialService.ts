import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const MAX_SUMMARY_CHARACTERS = 12_000
const MAX_EVIDENCE_CHARACTERS = 4_000

export const EXPERT_MATERIALS_ARTIFACT_ID = 'expert-materials'

export type WorkflowExpertMaterialStartupContext = {
  schemaVersion: 1
  source: 'expert-materials'
  materials: Array<{
    runId: string
    expertId: string
    expertName: string
    title: string
    shortSummary: string
    createdAt: string
    summaryPath: string
    materialJsonPath: string
    evidencePath: string
    summaryContent: string
    evidenceExcerpt: string
  }>
}

type ExpertMaterialRefInput = {
  runId: string
  expertId: string
  expertName: string
  summaryPath: string
  materialJsonPath: string
  evidencePath: string
  createdAt: string
  title: string
  shortSummary: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Expert material ${name} must be a non-empty string`)
  }
  return value.trim()
}

function normalizeMaterialRef(value: unknown): ExpertMaterialRefInput {
  if (!isRecord(value)) throw new Error('Expert material must be an object')
  const runId = requiredString(value.runId, 'runId')
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error('Expert material runId is invalid')
  return {
    runId,
    expertId: requiredString(value.expertId, 'expertId'),
    expertName: requiredString(value.expertName, 'expertName'),
    summaryPath: requiredString(value.summaryPath, 'summaryPath'),
    materialJsonPath: requiredString(value.materialJsonPath, 'materialJsonPath'),
    evidencePath: requiredString(value.evidencePath, 'evidencePath'),
    createdAt: requiredString(value.createdAt, 'createdAt'),
    title: requiredString(value.title, 'title'),
    shortSummary: requiredString(value.shortSummary, 'shortSummary'),
  }
}

function bounded(text: string, limit: number): string {
  const normalized = text.trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 18)).trimEnd()} [truncated]`
}

function assertInsideWorkspace(workDir: string, filePath: string, runId: string): string {
  const expertRunsRoot = path.resolve(workDir, '.workflow', 'intake', 'expert-runs')
  const expectedRunRoot = path.resolve(expertRunsRoot, runId)
  const resolved = path.resolve(filePath)
  const relative = path.relative(expectedRunRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Expert material path is outside the selected run directory')
  }
  return resolved
}

async function readRequiredFile(filePath: string, label: string, maxCharacters: number): Promise<string> {
  let stat
  try {
    stat = await fs.stat(filePath)
  } catch {
    throw new Error(`Expert material ${label} file is unavailable`)
  }
  if (!stat.isFile()) throw new Error(`Expert material ${label} path is not a file`)
  return bounded(await fs.readFile(filePath, 'utf-8'), maxCharacters)
}

export async function collectWorkflowExpertMaterials(
  workDir: string,
  repoMetadata: unknown,
): Promise<WorkflowExpertMaterialStartupContext | null> {
  if (!isRecord(repoMetadata) || !Array.isArray(repoMetadata.expertMaterials)) return null
  const refs = repoMetadata.expertMaterials.map(normalizeMaterialRef)
  if (refs.length === 0) return null

  const materials = await Promise.all(refs.map(async (ref) => {
    const summaryPath = assertInsideWorkspace(workDir, ref.summaryPath, ref.runId)
    const materialJsonPath = assertInsideWorkspace(workDir, ref.materialJsonPath, ref.runId)
    const evidencePath = assertInsideWorkspace(workDir, ref.evidencePath, ref.runId)
    const [summaryContent, evidenceExcerpt] = await Promise.all([
      readRequiredFile(summaryPath, 'summary', MAX_SUMMARY_CHARACTERS),
      readRequiredFile(evidencePath, 'evidence', MAX_EVIDENCE_CHARACTERS),
      readRequiredFile(materialJsonPath, 'metadata', 1),
    ]).then(([summary, evidence]) => [summary, evidence])
    return {
      ...ref,
      summaryPath,
      materialJsonPath,
      evidencePath,
      summaryContent,
      evidenceExcerpt,
    }
  }))

  return {
    schemaVersion: 1,
    source: 'expert-materials',
    materials,
  }
}

export function makeWorkflowExpertMaterialsStartupPrompt(
  context: WorkflowExpertMaterialStartupContext,
): string {
  return [
    '<workflow-expert-materials>',
    'Use these selected expert materials as startup evidence. Preserve their provenance and do not claim that an unselected material was used.',
    ...context.materials.flatMap((material) => [
      `## ${material.title}`,
      `Expert: ${material.expertName} (${material.expertId})`,
      `Run: ${material.runId}; created: ${material.createdAt}`,
      `Summary: ${material.shortSummary}`,
      material.summaryContent,
      material.evidenceExcerpt ? `Evidence excerpt:\n${material.evidenceExcerpt}` : '',
    ].filter(Boolean)),
    '</workflow-expert-materials>',
  ].join('\n\n')
}
