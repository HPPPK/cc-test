import type { ComponentType, Dispatch, ReactNode, SetStateAction } from 'react'

/** Steps obtain their typed data through useWizard rather than component props. */
export type WizardStepComponent<T extends Record<string, unknown>> = ComponentType<Record<string, never>>
export type WizardContextValue<T extends Record<string, unknown>> = {
  currentStepIndex: number
  totalSteps: number
  wizardData: T
  setWizardData: Dispatch<SetStateAction<T>>
  updateWizardData: (updates: Partial<T>) => void
  goNext: () => void
  goBack: () => void
  goToStep: (index: number) => void
  cancel: () => void
  title?: string
  showStepCounter: boolean
}
export type WizardProviderProps<T extends Record<string, unknown>> = {
  steps: WizardStepComponent<T>[]
  initialData?: T
  onComplete: (data: T) => void
  onCancel?: () => void
  children?: ReactNode
  title?: string
  showStepCounter?: boolean
}
