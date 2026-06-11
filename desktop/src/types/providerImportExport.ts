import type {
  ApiFormat,
  ModelContextWindows,
  ModelMapping,
  ProviderAuthStrategy,
} from './provider'

export type ProviderBundleKind = 'cc-jiangxia-provider-bundle'

export type ProviderBundleCredentialStatus = 'redacted' | 'present' | 'missing'

export type ProviderBundleCredential = {
  status: ProviderBundleCredentialStatus
  apiKey?: string
}

export type ProviderBundleProvider = {
  sourceProviderId?: string
  name: string
  presetId: string
  baseUrl: string
  apiFormat: ApiFormat
  authStrategy?: ProviderAuthStrategy
  models: ModelMapping
  autoCompactWindow?: number
  modelContextWindows?: ModelContextWindows
  notes?: string
  credential: ProviderBundleCredential
}

export type ProviderBundleAppMetadata = {
  name?: string
  version?: string
}

export type ProviderBundle = {
  schemaVersion: 1
  kind: ProviderBundleKind
  exportedAt?: string
  app?: ProviderBundleAppMetadata
  containsSecrets: boolean
  providers: ProviderBundleProvider[]
}

export type ProviderSecretFreeBundle = ProviderBundle & {
  containsSecrets: false
}

export type ProviderSecretBundle = ProviderBundle & {
  containsSecrets: true
}

export type ProviderExportRequest = {
  providerIds?: string[]
  all?: boolean
}

export type ProviderExportResponse = {
  bundle: ProviderSecretFreeBundle
}

export type ProviderSecretExportRequest = ProviderExportRequest & {
  confirmation: {
    acknowledgedCredentialExposure: true
  }
}

export type ProviderSecretExportResponse = {
  bundle: ProviderSecretBundle
}

export type ProviderImportPreviewRequest = {
  bundle: ProviderBundle
}

export type ProviderImportDiagnosticCode =
  | 'BUNDLE_INVALID_JSON'
  | 'BUNDLE_UNSUPPORTED_VERSION'
  | 'BUNDLE_INVALID_PROVIDER'
  | 'PROVIDER_CONFLICT'
  | 'SECRET_EXPORT_CONFIRMATION_REQUIRED'
  | 'IMPORT_RESOLUTION_INVALID'
  | 'IMPORT_TARGET_STALE'

export type ProviderImportDiagnosticSeverity = 'info' | 'warning' | 'error'

export type ProviderImportDiagnostic = {
  code: ProviderImportDiagnosticCode | (string & {})
  severity: ProviderImportDiagnosticSeverity
  message: string
  candidateId?: string
  path?: string
}

export type ProviderImportConflictType = 'name' | 'id' | 'equivalent-config'

export type ProviderImportConflict = {
  type: ProviderImportConflictType
  targetProviderId: string
  targetProviderName?: string
  reason: string
}

export type ProviderImportResolutionAction = 'add' | 'rename' | 'overwrite' | 'skip'

export type ProviderImportCandidate = {
  candidateId: string
  sourceProviderId?: string
  name: string
  credentialStatus: ProviderBundleCredentialStatus
  valid: boolean
  diagnostics: ProviderImportDiagnostic[]
  conflict: ProviderImportConflict | null
  defaultResolution: ProviderImportResolutionAction
  suggestedName?: string
}

export type ProviderImportPreview = {
  bundle: {
    schemaVersion: number
    containsSecrets: boolean
    providerCount: number
  }
  candidates: ProviderImportCandidate[]
  errors: ProviderImportDiagnostic[]
  canCommit: boolean
}

export type ProviderImportPreviewResponse = {
  preview: ProviderImportPreview
}

export type ProviderImportResolution = {
  candidateId: string
  action: ProviderImportResolutionAction
  name?: string
  targetProviderId?: string
}

export type ProviderImportCommitRequest = {
  bundle: ProviderBundle
  resolutions: ProviderImportResolution[]
}

export type ProviderImportSkippedCandidate = {
  candidateId: string
  reason: string
}

export type ProviderImportCommitProviderSummary =
  Omit<ProviderBundleProvider, 'credential' | 'sourceProviderId'> & {
    id: string
  }

export type ProviderImportCommitResult = {
  created: ProviderImportCommitProviderSummary[]
  updated: ProviderImportCommitProviderSummary[]
  skipped: ProviderImportSkippedCandidate[]
  errors: ProviderImportDiagnostic[]
  providers?: ProviderImportCommitProviderSummary[]
  shouldRefetchProviders?: boolean
  activeId: string | null
}

export type ProviderImportCommitResponse = {
  result: ProviderImportCommitResult
}
