export type ExpertRunStatus = 'placeholder' | 'preparing' | 'analyzing' | 'completed' | 'failed'

export type ExpertRun = {
  runId: string
  expertId: string
  expertTitle: string
  createdAt: string
  status: ExpertRunStatus
  outputDirectory: string
  materialPackageRoot: string
  materialFiles: string[]
}

export function buildExpertOutputDirectory(projectRoot: string, runId: string, expertId: string): string {
  return `${projectRoot.replace(/[\\/]$/, '')}/.workflow/intake/expert-runs/${runId}/${expertId}`
}

export function createPlaceholderExpertRun(expertId: string, now = new Date()): ExpertRun {
  const timestamp = now.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '')
  const runId = `expert-${timestamp}-${Math.random().toString(36).slice(2, 8)}`
  return {
    runId,
    expertId,
    expertTitle: expertId,
    createdAt: now.toISOString(),
    status: 'placeholder',
    outputDirectory: '',
    materialPackageRoot: '',
    materialFiles: ['material-summary.md', 'material.json', 'evidence.md'],
  }
}
