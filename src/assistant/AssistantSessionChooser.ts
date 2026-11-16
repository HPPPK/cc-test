import type { ReactNode } from 'react'
import type { AssistantSession } from './sessionDiscovery.js'
import { unsupportedFeature } from '../utils/unsupportedFeature.js'
export function AssistantSessionChooser(_props: { sessions: AssistantSession[], onSelect: (sessionId: string) => void, onCancel: () => void }): ReactNode { return unsupportedFeature('assistant') }
