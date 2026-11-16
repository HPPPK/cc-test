import type { LogOption } from '../types/logs.js'
import { unsupportedFeature } from './unsupportedFeature.js'
export function parseCcshareId(_value: string): string | null { return unsupportedFeature('ccshare-resume') }
export function loadCcshare(_id: string): Promise<LogOption> { return unsupportedFeature('ccshare-resume') }
