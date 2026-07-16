import { t as translateCurrent, type TranslationKey } from '../../i18n'
import type { WorkflowTemplateListItem, WorkflowTemplateSource } from '../../types/session'

export type WorkflowTemplateDisplay = WorkflowTemplateListItem

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string

export function localizeWorkflowTemplateDisplay(
  template: WorkflowTemplateListItem,
  translate: Translate = translateCurrent,
): WorkflowTemplateDisplay {
  const prefixes = workflowTemplateTranslationPrefixes(template)
  if (prefixes.length === 0) return template

  return {
    ...template,
    name: translateWorkflowTemplateField(translate, prefixes, 'name', template.name),
    description: template.description
      ? translateWorkflowTemplateField(translate, prefixes, 'description', template.description)
      : template.description,
    phaseNames: template.phaseNames?.map((phaseName, index) => (
      translateWorkflowTemplatePhaseName(translate, prefixes, phaseName, index)
    )),
  }
}

export function workflowTemplateSourceLabel(
  source: WorkflowTemplateSource,
  translate: Translate = translateCurrent,
) {
  return translate(`workflows.templateSource.${source}` as TranslationKey)
}

function workflowTemplateTranslationPrefixes(template: WorkflowTemplateListItem) {
  const prefixes = [`workflows.templates.${template.id}`]
  if (template.source === 'builtin') prefixes.push(`workflows.builtinTemplates.${template.id}`)
  return prefixes
}

function translateWorkflowTemplateField(
  translate: Translate,
  prefixes: string[],
  field: 'name' | 'description',
  fallback: string,
) {
  for (const prefix of prefixes) {
    const translated = translateWithFallback(translate, `${prefix}.${field}`, fallback)
    if (translated !== fallback) return translated
  }
  return fallback
}

function translateWorkflowTemplatePhaseName(
  translate: Translate,
  prefixes: string[],
  phaseName: string,
  index: number,
) {
  const slug = slugFromText(phaseName)
  const phaseKeys = slug ? [`phase.${slug}`, `phase.${index + 1}`] : [`phase.${index + 1}`]

  for (const prefix of prefixes) {
    for (const phaseKey of phaseKeys) {
      const translated = translateWithFallback(translate, `${prefix}.${phaseKey}`, phaseName)
      if (translated !== phaseName) return translated
    }
  }
  return phaseName
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
