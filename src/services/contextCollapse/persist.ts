import type { ContextCollapseCommitEntry, ContextCollapseSnapshotEntry } from '../../types/logs.js'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'
export function restoreFromEntries(_commits: ContextCollapseCommitEntry[], _snapshot?: ContextCollapseSnapshotEntry): void { unsupportedFeature('context-collapse') }
