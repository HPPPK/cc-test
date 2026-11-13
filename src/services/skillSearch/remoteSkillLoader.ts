import { unsupportedFeature } from '../../utils/unsupportedFeature.js'
export type RemoteSkillLoadResult = { cacheHit: boolean, latencyMs: number, skillPath: string, content: string, fileCount: number, totalBytes: number, fetchMethod: string }
export function loadRemoteSkill(_slug: string, _url: string): Promise<RemoteSkillLoadResult> { return unsupportedFeature('remote-skill-search') }
