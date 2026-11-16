import type { WizardContextValue, WizardStepComponent } from './types.js'
import type { Workflow, State } from '../../commands/install-github-app/types.js'
import type { FeedbackSurveyResponse } from '../FeedbackSurvey/utils.js'
declare const wizard: WizardContextValue<{ name: string }>
wizard.updateWizardData({ name: 'fixture' })
// @ts-expect-error Wizard data patches preserve the specific record shape
wizard.updateWizardData({ name: 2 })
// @ts-expect-error Install workflow identifiers are concrete
const invalidWorkflow: Workflow = 'invented'
// @ts-expect-error Unknown feedback choices cannot enter survey state
const invalidResponse: FeedbackSurveyResponse = 'excellent'
// @ts-expect-error Installation steps are concrete
const invalidStep: State['step'] = 'invented'
const step: WizardStepComponent<{ name: string }> = () => null
void [invalidWorkflow, invalidResponse, invalidStep, step]
