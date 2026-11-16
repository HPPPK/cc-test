import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

/** Called only by the internal organization notification feature. */
export function useAntOrgWarningNotification(): void { unsupportedFeature('internal-org-notification') }
