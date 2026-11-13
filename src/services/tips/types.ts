import type { FileStateCache } from '../../utils/fileStateCache.js'
import type { ThemeName } from '../../utils/theme.js'

export type TipContext = {
  theme: ThemeName
  readFileState?: FileStateCache
  bashTools?: ReadonlySet<string>
}
export type Tip = {
  id: string
  cooldownSessions: number
  content(context: Pick<TipContext, 'theme'>): Promise<string>
  isRelevant(context?: TipContext): Promise<boolean>
}
