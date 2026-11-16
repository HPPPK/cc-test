import { unsupportedFeature } from './unsupportedFeature.js'
export function getDefaultUdsSocketPath(): string { return unsupportedFeature('uds-messaging') }
export function startUdsMessaging(_path: string, _options: { isExplicit: boolean }): Promise<void> { return unsupportedFeature('uds-messaging') }
