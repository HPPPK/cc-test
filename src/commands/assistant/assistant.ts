import type { ReactNode } from 'react'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'
export function computeDefaultInstallDir(): Promise<string> { return unsupportedFeature('assistant-install') }
export function NewInstallWizard(_props: { defaultDir: string, onInstalled: (directory: string) => void, onCancel: () => void, onError: (message: string) => void }): ReactNode { return unsupportedFeature('assistant-install') }
