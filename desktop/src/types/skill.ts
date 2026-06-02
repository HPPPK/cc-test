import type {
  WorkflowPhaseSkillResolutionStatus,
  WorkflowPhaseSkillSource,
} from './session'

export type SkillSource = Extract<WorkflowPhaseSkillSource, 'user' | 'project' | 'plugin' | 'mcp' | 'bundled'>
export type SkillCatalogStatus = Extract<
  WorkflowPhaseSkillResolutionStatus,
  'available' | 'missing' | 'plugin-disabled' | 'unsupported-source'
>

export type SkillCatalogProvenance = {
  sourcePath?: string
  namespace?: string
  referenceId?: string
  version?: string
  contentHash?: string
  pluginName?: string
}

export type SkillMeta = {
  name: string
  displayName?: string
  description: string
  source: SkillSource
  catalogStatus?: SkillCatalogStatus
  userInvocable: boolean
  version?: string
  contentLength: number
  hasDirectory: boolean
  createdAt?: string
  updatedAt?: string
  pluginName?: string
  namespace?: string
  referenceId?: string
  contentHash?: string
  provenance?: SkillCatalogProvenance
}

export type SkillCatalogItem = Pick<
  SkillMeta,
  | 'name'
  | 'displayName'
  | 'description'
  | 'source'
  | 'catalogStatus'
  | 'userInvocable'
  | 'version'
  | 'hasDirectory'
  | 'createdAt'
  | 'updatedAt'
  | 'pluginName'
  | 'namespace'
  | 'referenceId'
  | 'contentHash'
  | 'provenance'
>

export type SkillsCatalogResponse = {
  skills: SkillCatalogItem[]
}

export type SkillsListResponse = {
  skills: SkillMeta[]
}

export type FileTreeNode = {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
}

export type SkillFrontmatter = Record<string, unknown>

export type SkillFile = {
  path: string
  content: string
  language: string
  frontmatter?: SkillFrontmatter
  body?: string
  isEntry?: boolean
}

export type SkillDetail = {
  meta: SkillMeta
  tree: FileTreeNode[]
  files: SkillFile[]
  skillRoot: string
}
