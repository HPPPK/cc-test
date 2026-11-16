import type { ReactNode } from 'react'
import type { AgentMemoryScope } from '../../tools/AgentTool/agentMemory.js'
import { unsupportedFeature } from '../../utils/unsupportedFeature.js'

type SnapshotChoice = 'merge' | 'keep' | 'replace'
export function SnapshotUpdateDialog(_props: { agentType: string, scope: AgentMemoryScope, snapshotTimestamp: string, onComplete: (choice: SnapshotChoice) => void, onCancel: () => void }): ReactNode { return unsupportedFeature('agent-memory-snapshot') }
export function buildMergePrompt(_agentType: string, _scope: AgentMemoryScope): string { return unsupportedFeature('agent-memory-snapshot') }
