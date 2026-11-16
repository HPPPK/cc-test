import { unsupportedFeature } from '../utils/unsupportedFeature.js'

export function parseConnectUrl(_url: string): { serverUrl: string, authToken?: string } { return unsupportedFeature('legacy-direct-connect') }
