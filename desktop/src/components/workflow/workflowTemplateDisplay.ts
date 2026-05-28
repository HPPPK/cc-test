import { t as translateCurrent, type TranslationKey } from '../../i18n'
import type { WorkflowTemplateListItem, WorkflowTemplateSource } from '../../types/session'

export type WorkflowTemplateDisplay = WorkflowTemplateListItem

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string

export function localizeWorkflowTemplateDisplay(
  template: WorkflowTemplateListItem,
  translate: Translate = translateCurrent,
): WorkflowTemplateDisplay {
  if (template.source !== 'builtin') return template

  const prefix = `workflows.builtinTemplates.${template.id}`
  return {
    ...template,
    name: translateWithFallback(translate, `${prefix}.name`, template.name),
    description: template.description
      ? translateWithFallback(translate, `${prefix}.description`, template.description)
      : template.description,
    phaseNames: template.phaseNames?.map((phaseName) => (
      translateWithFallback(translate, `${prefix}.phase.${slugFromText(phaseName)}`, phaseName)
    )),
  }
}

export function workflowTemplateSourceLabel(
  source: WorkflowTemplateSource,
  translate: Translate = translateCurrent,
) {
  return translate(`workflows.templateSource.${source}`)
}

function translateWithFallback(translate: Translate, key: string, fallback: string) {
  const translated = translate(key as TranslationKey)
  return translated === key ? fallback : translated
}

function slugFromText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
