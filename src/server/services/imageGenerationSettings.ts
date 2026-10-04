import { z } from 'zod'

/**
 * Application-wide image-generation selection. This is deliberately separate
 * from the chat runtime selection: an image request may only use a Provider
 * and model the user explicitly chose here.
 */
export type ImageGenerationSettings = {
  enabled: boolean
  providerId?: string
  model?: string
}

const optionalId = z.string().trim().min(1).max(256).optional()

export const imageGenerationSettingsSchema = z.object({
  enabled: z.boolean(),
  providerId: optionalId,
  model: optionalId,
}).strict().superRefine((value, context) => {
  if (!value.enabled) return
  if (!value.providerId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['providerId'],
      message: 'Image generation requires a Provider selected by the user when enabled',
    })
  }
  if (!value.model) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['model'],
      message: 'Image generation requires an image model selected by the user when enabled',
    })
  }
})

export const DEFAULT_IMAGE_GENERATION_SETTINGS: ImageGenerationSettings = {
  enabled: false,
}

/**
 * Reads persisted user settings without guessing from the current chat model,
 * active Provider, or legacy OPENAI_IMAGE_* environment variables.
 */
export function readImageGenerationSettings(value: unknown): ImageGenerationSettings {
  const parsed = imageGenerationSettingsSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_IMAGE_GENERATION_SETTINGS
}

export function validateImageGenerationSettings(value: unknown): ImageGenerationSettings {
  const parsed = imageGenerationSettingsSchema.safeParse(value)
  if (!parsed.success) {
    const detail = parsed.error.issues.map(issue => issue.message).join('; ')
    throw new Error(detail || 'Invalid image generation settings')
  }
  return parsed.data
}
