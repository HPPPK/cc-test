import type { WorkflowLabel, WorkflowTemplateListItem } from '../../types/session'

export type WorkflowTaskCategory = 'development' | 'feature-extension' | 'debug'

export const WORKFLOW_TASK_CATEGORIES: WorkflowTaskCategory[] = [
  'development',
  'feature-extension',
  'debug',
]

export const TASK_CATEGORY_LABEL: Record<WorkflowTaskCategory, WorkflowLabel> = {
  development: 'new-product',
  'feature-extension': 'enhancement',
  debug: 'bug',
}

export function taskCategoryForTemplate(
  template: Pick<WorkflowTemplateListItem, 'labels'>,
): WorkflowTaskCategory {
  const primaryCodingLabel = template.labels?.find((label) =>
    label === 'new-product' || label === 'enhancement' || label === 'bug'
  )
  if (primaryCodingLabel === 'bug') return 'debug'
  if (primaryCodingLabel === 'enhancement') return 'feature-extension'
  if (primaryCodingLabel === 'new-product') return 'development'

  return 'development'
}

export function formatTaskCategory(category: WorkflowTaskCategory): string {
  if (category === 'feature-extension') return 'Feature Extension'
  if (category === 'debug') return 'Debug'
  return 'Development'
}
