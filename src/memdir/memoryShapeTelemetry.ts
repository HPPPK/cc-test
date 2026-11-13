import type { MemoryHeader } from './memoryScan.js'
import type { memoryScopeForPath } from '../utils/memoryFileDetection.js'
import { unsupportedFeature } from '../utils/unsupportedFeature.js'
export function logMemoryRecallShape(_memories: MemoryHeader[], _selected: MemoryHeader[]): void { unsupportedFeature('memory-shape-telemetry') }
export function logMemoryWriteShape(_toolName: string, _input: unknown, _filePath: string, _scope: NonNullable<ReturnType<typeof memoryScopeForPath>>): void { unsupportedFeature('memory-shape-telemetry') }
