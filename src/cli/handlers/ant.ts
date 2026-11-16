import type { CommandUnknownOpts } from '@commander-js/extra-typings'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

export function logHandler(_id?: string | number): Promise<void> { return unsupportedFeature('internal-cli') }
export function errorHandler(_index?: number): Promise<void> { return unsupportedFeature('internal-cli') }
export function exportHandler(_source: string, _outputFile: string): Promise<void> { return unsupportedFeature('internal-cli') }
export function taskCreateHandler(_subject: string, _options: { description?: string, list?: string }): Promise<void> { return unsupportedFeature('internal-cli') }
export function taskListHandler(_options: { list?: string, pending?: boolean, json?: boolean }): Promise<void> { return unsupportedFeature('internal-cli') }
export function taskGetHandler(_id: string, _options: { list?: string }): Promise<void> { return unsupportedFeature('internal-cli') }
export function taskUpdateHandler(_id: string, _options: { list?: string, status?: string, subject?: string, description?: string, owner?: string, clearOwner?: boolean }): Promise<void> { return unsupportedFeature('internal-cli') }
export function taskDirHandler(_options: { list?: string }): Promise<void> { return unsupportedFeature('internal-cli') }
export function completionHandler(_shell: string, _options: { output?: string }, _program: CommandUnknownOpts): Promise<void> { return unsupportedFeature('internal-cli') }
