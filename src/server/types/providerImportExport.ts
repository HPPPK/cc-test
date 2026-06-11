/**
 * Provider import/export bundle schemas.
 *
 * These schemas model saved provider records only. They intentionally do not
 * include active/default provider selection or OAuth/login state.
 */

import { z } from 'zod'
import {
  ApiFormatSchema,
  AutoCompactWindowSchema,
  ModelContextWindowsSchema,
  ModelMappingSchema,
  ProviderAuthStrategySchema,
} from './provider.js'

export const ProviderBundleKindSchema = z.literal('cc-jiangxia-provider-bundle')
export const ProviderBundleSchemaVersionSchema = z.literal(1)

export const ProviderBundleCredentialStatusSchema = z.enum([
  'redacted',
  'present',
  'missing',
])

export const ProviderImportResolutionActionSchema = z.enum([
  'add',
  'rename',
  'overwrite',
  'skip',
])

export const ProviderImportConflictTypeSchema = z.enum([
  'name',
  'id',
  'equivalent-config',
])

export const ProviderImportDiagnosticCodeSchema = z.enum([
  'BUNDLE_INVALID_JSON',
  'BUNDLE_UNSUPPORTED_VERSION',
  'BUNDLE_INVALID_PROVIDER',
  'PROVIDER_CONFLICT',
  'SECRET_EXPORT_CONFIRMATION_REQUIRED',
  'IMPORT_RESOLUTION_INVALID',
  'IMPORT_TARGET_STALE',
])

export const ProviderImportDiagnosticSeveritySchema = z.enum([
  'error',
  'warning',
  'info',
])

export const ProviderImportDiagnosticSchema = z.object({
  code: ProviderImportDiagnosticCodeSchema,
  severity: ProviderImportDiagnosticSeveritySchema.default('error'),
  message: z.string().min(1),
  candidateId: z.string().min(1).optional(),
  sourceProviderId: z.string().min(1).optional(),
}).strict()

export const ProviderBundleCredentialSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('redacted'),
  }).strict(),
  z.object({
    status: z.literal('present'),
    apiKey: z.string().min(1),
  }).strict(),
  z.object({
    status: z.literal('missing'),
  }).strict(),
])

export const ProviderBundleAppMetadataSchema = z.object({
  name: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
}).strict()

export const ProviderBundleProviderSchema = z.object({
  sourceProviderId: z.string().min(1).optional(),
  name: z.string().min(1),
  presetId: z.string().min(1),
  baseUrl: z.string().min(1),
  apiFormat: ApiFormatSchema.default('anthropic'),
  authStrategy: ProviderAuthStrategySchema.optional(),
  models: ModelMappingSchema,
  autoCompactWindow: AutoCompactWindowSchema.optional(),
  modelContextWindows: ModelContextWindowsSchema.optional(),
  notes: z.string().optional(),
  credential: ProviderBundleCredentialSchema,
}).strict()

export const ProviderBundleSchema = z.object({
  schemaVersion: ProviderBundleSchemaVersionSchema,
  kind: ProviderBundleKindSchema,
  exportedAt: z.string().datetime().optional(),
  app: ProviderBundleAppMetadataSchema.optional(),
  containsSecrets: z.boolean(),
  providers: z.array(ProviderBundleProviderSchema),
}).strict().superRefine((bundle, context) => {
  if (bundle.containsSecrets) {
    return
  }

  bundle.providers.forEach((provider, index) => {
    if (provider.credential.status === 'present') {
      context.addIssue({
        code: 'custom',
        path: ['providers', index, 'credential'],
        message: 'Secret-free provider bundles cannot include credential values',
      })
    }
  })
})

export const ProviderExportRequestSchema = z.object({
  providerIds: z.array(z.string().min(1)).default([]),
  all: z.boolean().default(false),
}).strict()

export const ProviderExportResponseSchema = z.object({
  bundle: ProviderBundleSchema,
}).strict()

export const ProviderSecretExportConfirmationSchema = z.object({
  acknowledgedCredentialExposure: z.literal(true),
}).strict()

export const ProviderSecretExportConfirmationRequestSchema =
  ProviderExportRequestSchema.extend({
    confirmation: ProviderSecretExportConfirmationSchema,
  }).strict()

export const ProviderImportBundleSummarySchema = z.object({
  schemaVersion: ProviderBundleSchemaVersionSchema,
  containsSecrets: z.boolean(),
  providerCount: z.number().int().min(0),
}).strict()

export const ProviderImportConflictSchema = z.object({
  type: ProviderImportConflictTypeSchema,
  targetProviderId: z.string().min(1),
  targetProviderName: z.string().min(1).optional(),
  reason: z.string().min(1),
}).strict()

export const ProviderImportCandidateSchema = z.object({
  candidateId: z.string().min(1),
  sourceProviderId: z.string().min(1).optional(),
  name: z.string().min(1),
  credentialStatus: ProviderBundleCredentialStatusSchema,
  valid: z.boolean(),
  diagnostics: z.array(ProviderImportDiagnosticSchema),
  conflict: ProviderImportConflictSchema.nullable().optional(),
  defaultResolution: ProviderImportResolutionActionSchema,
  suggestedName: z.string().min(1).optional(),
}).strict()

export const ProviderImportPreviewSchema = z.object({
  bundle: ProviderImportBundleSummarySchema,
  candidates: z.array(ProviderImportCandidateSchema),
  errors: z.array(ProviderImportDiagnosticSchema),
  canCommit: z.boolean(),
}).strict()

export const ProviderImportPreviewRequestSchema = z.object({
  bundle: ProviderBundleSchema,
}).strict()

export const ProviderImportPreviewResponseSchema = z.object({
  preview: ProviderImportPreviewSchema,
}).strict()

export const ProviderImportResolutionSchema = z.discriminatedUnion('action', [
  z.object({
    candidateId: z.string().min(1),
    action: z.literal('add'),
    name: z.string().min(1).optional(),
  }).strict(),
  z.object({
    candidateId: z.string().min(1),
    action: z.literal('rename'),
    name: z.string().min(1),
  }).strict(),
  z.object({
    candidateId: z.string().min(1),
    action: z.literal('overwrite'),
    targetProviderId: z.string().min(1),
  }).strict(),
  z.object({
    candidateId: z.string().min(1),
    action: z.literal('skip'),
  }).strict(),
])

export const ProviderImportCommitRequestSchema = z.object({
  bundle: ProviderBundleSchema,
  resolutions: z.array(ProviderImportResolutionSchema),
}).strict()

export const ProviderImportCommitProviderSummarySchema =
  ProviderBundleProviderSchema.omit({
    credential: true,
    sourceProviderId: true,
  }).extend({
    id: z.string().min(1),
  }).strict()

export const ProviderImportSkippedSchema = z.object({
  candidateId: z.string().min(1),
  reason: z.string().min(1),
}).strict()

export const ProviderImportCommitResultSchema = z.object({
  created: z.array(ProviderImportCommitProviderSummarySchema),
  updated: z.array(ProviderImportCommitProviderSummarySchema),
  skipped: z.array(ProviderImportSkippedSchema),
  errors: z.array(ProviderImportDiagnosticSchema),
  providers: z.array(ProviderImportCommitProviderSummarySchema).optional(),
  shouldRefetchProviders: z.boolean().optional(),
  activeId: z.string().min(1).nullable(),
}).strict()

export const ProviderImportCommitResponseSchema = z.object({
  result: ProviderImportCommitResultSchema,
}).strict()

export type ProviderBundleKind = z.infer<typeof ProviderBundleKindSchema>
export type ProviderBundleSchemaVersion = z.infer<typeof ProviderBundleSchemaVersionSchema>
export type ProviderBundleCredentialStatus = z.infer<typeof ProviderBundleCredentialStatusSchema>
export type ProviderImportResolutionAction = z.infer<typeof ProviderImportResolutionActionSchema>
export type ProviderImportConflictType = z.infer<typeof ProviderImportConflictTypeSchema>
export type ProviderImportDiagnosticCode = z.infer<typeof ProviderImportDiagnosticCodeSchema>
export type ProviderImportDiagnosticSeverity = z.infer<typeof ProviderImportDiagnosticSeveritySchema>
export type ProviderImportDiagnostic = z.infer<typeof ProviderImportDiagnosticSchema>
export type ProviderBundleCredential = z.infer<typeof ProviderBundleCredentialSchema>
export type ProviderBundleAppMetadata = z.infer<typeof ProviderBundleAppMetadataSchema>
export type ProviderBundleProvider = z.infer<typeof ProviderBundleProviderSchema>
export type ProviderBundle = z.infer<typeof ProviderBundleSchema>
export type ProviderExportRequest = z.infer<typeof ProviderExportRequestSchema>
export type ProviderExportResponse = z.infer<typeof ProviderExportResponseSchema>
export type ProviderSecretExportConfirmation = z.infer<typeof ProviderSecretExportConfirmationSchema>
export type ProviderSecretExportConfirmationRequest = z.infer<
  typeof ProviderSecretExportConfirmationRequestSchema
>
export type ProviderImportBundleSummary = z.infer<typeof ProviderImportBundleSummarySchema>
export type ProviderImportConflict = z.infer<typeof ProviderImportConflictSchema>
export type ProviderImportCandidate = z.infer<typeof ProviderImportCandidateSchema>
export type ProviderImportPreview = z.infer<typeof ProviderImportPreviewSchema>
export type ProviderImportPreviewRequest = z.infer<typeof ProviderImportPreviewRequestSchema>
export type ProviderImportPreviewResponse = z.infer<typeof ProviderImportPreviewResponseSchema>
export type ProviderImportResolution = z.infer<typeof ProviderImportResolutionSchema>
export type ProviderImportCommitRequest = z.infer<typeof ProviderImportCommitRequestSchema>
export type ProviderImportCommitProviderSummary = z.infer<
  typeof ProviderImportCommitProviderSummarySchema
>
export type ProviderImportSkipped = z.infer<typeof ProviderImportSkippedSchema>
export type ProviderImportCommitResult = z.infer<typeof ProviderImportCommitResultSchema>
export type ProviderImportCommitResponse = z.infer<typeof ProviderImportCommitResponseSchema>
