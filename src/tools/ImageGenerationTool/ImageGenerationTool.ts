import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import type { ImageGenerationResult } from '../../server/services/imageGenerationService.js'
import { getJiangxiaEnvValue } from '../../utils/appIdentity.js'
import { getCwd } from '../../utils/cwd.js'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  DESCRIPTION,
  IMAGE_GENERATION_TOOL_NAME,
  IMAGE_GENERATION_TOOL_PROMPT,
} from './prompt.js'

const inputSchema = lazySchema(() => z.strictObject({
  operation: z.enum(['preflight', 'generate']).describe('Use preflight to check the configured Provider, or generate to request one real image.'),
  prompt: z.string().min(1).max(50_000).optional().describe('A production-quality image prompt. Required for generate. Describe subject, composition, constraints, and reference-image facts when relevant.'),
  size: z.string().regex(/^\d{3,4}x\d{3,4}$/).optional().describe('Requested pixel dimensions, such as 1536x1024.'),
  quality: z.enum(['auto', 'low', 'medium', 'high']).optional().describe('Requested rendering quality.'),
  output_format: z.enum(['png', 'jpeg', 'webp']).optional().describe('Raster file format for the delivered image.'),
  file_name: z.string().min(1).max(128).optional().describe('Optional safe file name. The image is always written below output/imagegen in the current workspace.'),
}).superRefine((value, context) => {
  if (value.operation === 'generate' && !value.prompt?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['prompt'], message: 'prompt is required when operation is generate' })
  }
}))
type InputSchema = ReturnType<typeof inputSchema>
type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() => z.object({
  status: z.enum(['available', 'unavailable', 'unverified', 'generated', 'failed']),
  availability: z.enum(['available', 'unavailable', 'unverified']),
  model: z.string(),
  providerId: z.string().optional(),
  providerName: z.string().optional(),
  endpoint: z.string().optional(),
  message: z.string(),
  errorCode: z.string().optional(),
  imagePath: z.string().optional(),
  promptPath: z.string().optional(),
  reportPath: z.string().optional(),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
  bytes: z.number().optional(),
  fallback: z.object({
    required: z.literal(true),
    reason: z.string().min(1),
    errorCode: z.string().min(1),
    question: z.string().min(1),
    choices: z.array(z.object({
      id: z.enum(['python_programmatic_image', 'html_css_visual_artifact', 'no_fallback']),
      label: z.string().min(1),
      description: z.string().min(1),
    })).length(3),
    htmlCssWorkflow: z.object({
      requiredSkill: z.literal('hallmark'),
      requiredBrowserTool: z.literal('Playwright'),
      stages: z.array(z.enum(['design', 'render', 'audit', 'revise-and-rerender'])).length(4),
      deliveryEvidence: z.array(z.string().min(1)).min(3),
    }),
  }).optional(),
}))
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

function desktopServerUrl(): string | null {
  const value = getJiangxiaEnvValue('DESKTOP_SERVER_URL')?.trim()
  return value ? value.replace(/\/+$/, '') : null
}

function uiuxImageOnlyDelivery(): boolean {
  return getJiangxiaEnvValue('UIUX_IMAGE_ONLY_DELIVERY') === '1'
}

function imageToolResultText(output: Output): string {
  const lines = [
    `Image generation status: ${output.status}.`,
    `Model: ${output.model}.`,
    output.message,
  ]
  if (output.errorCode) lines.push(`Error code: ${output.errorCode}.`)
  if (output.imagePath) lines.push(`Image: ${output.imagePath}`)
  if (output.promptPath) lines.push(`Prompt record: ${output.promptPath}`)
  if (output.reportPath) lines.push(`Generation report: ${output.reportPath}`)
  if (uiuxImageOnlyDelivery() && (output.status === 'failed' || output.status === 'unavailable')) {
    lines.push('Real generation did not succeed. Explain this exact error and use AskUserQuestion for configure-then-retry, adjust the brief, or stop. The user has rejected substitute delivery; do not offer HTML or Python, and do not retry automatically.')
    return lines.join('\n')
  }
  if (output.fallback?.required) {
    lines.push(
      '',
      'REAL IMAGE GENERATION DID NOT SUCCEED. Do not claim that an image was generated.',
      `Reason: ${output.fallback.reason}`,
      `Error code: ${output.fallback.errorCode}.`,
      '',
      'MANDATORY NEXT ACTION: Call AskUserQuestion now. Do not start a Python or HTML/CSS fallback until the user selects one of the supplied choices.',
      'The AskUserQuestion card must state that Python output is programmatic (not model-generated) and HTML/CSS output is a browser-rendered visual artifact (not an image).',
      'If the user chooses HTML/CSS, call Skill with skill="hallmark" before writing UI. Then render the result with Playwright, invoke Hallmark audit on the rendered PNG, fix every critical/high-confidence named tell, and rerender before delivery.',
      `HTML/CSS delivery evidence: ${output.fallback.htmlCssWorkflow.deliveryEvidence.join('; ')}`,
      `Question id: image_generation_fallback. Prompt: ${output.fallback.question}`,
      ...output.fallback.choices.map((choice) => `- ${choice.id}: ${choice.label} — ${choice.description}`),
    )
  }
  return lines.join('\n')
}

function withRequiredFallback(input: Input, output: Output): Output {
  if (uiuxImageOnlyDelivery()) {
    const { fallback: _fallback, ...result } = output
    return result
  }
  if (input.operation !== 'generate' || (output.status !== 'unavailable' && output.status !== 'failed')) {
    return output
  }

  const errorCode = output.errorCode ?? 'IMAGE_GENERATION_FAILED'
  return {
    ...output,
    fallback: {
      required: true,
      reason: output.message,
      errorCode,
      question: `真实生图暂时不可用（原因：${output.message}；错误代码：${errorCode}）。是否选择替代交付？`,
      htmlCssWorkflow: {
        requiredSkill: 'hallmark',
        requiredBrowserTool: 'Playwright',
        stages: ['design', 'render', 'audit', 'revise-and-rerender'],
        deliveryEvidence: [
          'Hallmark visual register and named anti-pattern audit',
          'Rendered Playwright/Chromium PNG path(s)',
          'Concrete revision(s) made after the audit',
        ],
      },
      choices: [
        {
          id: 'python_programmatic_image',
          label: 'Python 程序化生成图',
          description: '使用程序化绘制生成图片；这不是 GPT 或其他模型生图。',
        },
        {
          id: 'html_css_visual_artifact',
          label: 'HTML/CSS 视觉稿',
          description: '创建可在浏览器渲染的视觉稿，并执行 Hallmark 反模板审查与 Playwright PNG 复核；这不是图片，也不是模型生图。',
        },
        {
          id: 'no_fallback',
          label: '不采用降级',
          description: '保留真实生图需求，等待可用的图片模型通道后再生成。',
        },
      ],
    },
  }
}

async function callDesktopImagesApi(input: Input, signal: AbortSignal): Promise<Output> {
  const serverUrl = desktopServerUrl()
  if (!serverUrl) {
    return {
      status: 'unavailable',
      availability: 'unavailable',
      model: 'unconfigured',
      message: 'The desktop image service is not connected for this session.',
      errorCode: 'IMAGE_DESKTOP_SERVER_UNAVAILABLE',
    }
  }

  const action = input.operation === 'preflight' ? 'preflight' : 'generate'
  const body = input.operation === 'preflight'
    ? {}
    : {
        prompt: input.prompt!,
        ...(input.size ? { size: input.size } : {}),
        ...(input.quality ? { quality: input.quality } : {}),
        ...(input.output_format ? { outputFormat: input.output_format } : {}),
        ...(input.file_name ? { fileName: input.file_name } : {}),
        workDir: getCwd(),
      }

  try {
    const response = await fetch(`${serverUrl}/api/images/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    const text = await response.text()
    let payload: unknown
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = null
    }
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const parsed = outputSchema().safeParse(payload)
      if (parsed.success) return parsed.data
      const message = typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : `Desktop image service returned HTTP ${response.status}.`
      return {
        status: 'failed',
        availability: 'unverified',
        model: 'unconfigured',
        message,
        errorCode: typeof (payload as { error?: unknown }).error === 'string'
          ? (payload as { error: string }).error
          : 'IMAGE_DESKTOP_SERVER_REJECTED_REQUEST',
      }
    }
    return {
      status: 'failed',
      availability: 'unverified',
      model: 'unconfigured',
      message: `Desktop image service returned an unreadable HTTP ${response.status} response.`,
      errorCode: 'IMAGE_DESKTOP_SERVER_INVALID_RESPONSE',
    }
  } catch (error) {
    if (signal.aborted) throw error
    return {
      status: 'failed',
      availability: 'unverified',
      model: 'unconfigured',
      message: 'Could not reach the desktop image service.',
      errorCode: 'IMAGE_DESKTOP_SERVER_NETWORK_ERROR',
    }
  }
}

export const ImageGenerationTool = buildTool({
  name: IMAGE_GENERATION_TOOL_NAME,
  searchHint: 'create a real raster image or check image-model availability',
  maxResultSizeChars: 20_000,
  alwaysLoad: true,
  async description(input) {
    const action = (input as Partial<Input>).operation
    return action === 'preflight' ? 'Claude wants to check image-generation availability' : 'Claude wants to generate a real image'
  },
  async prompt() {
    return uiuxImageOnlyDelivery()
      ? 'Generate real images with operation=generate through the independently configured image Provider/model. Read the returned Image path once for visual review. Preflight is diagnostic only. On failure, explain the error and call AskUserQuestion for configure-then-retry, brief adjustment, or stopping. This UIUX user rejected substitute deliverables; no automatic retries, Python drawings or HTML fallback.'
      : IMAGE_GENERATION_TOOL_PROMPT
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'Image generation'
  },
  getToolUseSummary(input) {
    return input?.operation === 'preflight' ? 'checking image capability' : 'generating image'
  },
  getActivityDescription(input) {
    return input?.operation === 'preflight' ? 'Checking image-generation capability' : 'Generating image'
  },
  isConcurrencySafe(input) {
    return input.operation === 'preflight'
  },
  isReadOnly(input) {
    return input.operation === 'preflight'
  },
  toAutoClassifierInput(input) {
    return input.operation === 'generate' ? input.prompt ?? '' : 'image generation preflight'
  },
  renderToolUseMessage() {
    return null
  },
  async call(input, context) {
    const output = await callDesktopImagesApi(input, context.abortController.signal)
    return { data: withRequiredFallback(input, output) }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    // Generated PNGs can be megabytes when Base64-encoded. Echoing that binary back
    // into the chat turn can overflow a chat model after the provider already
    // successfully wrote the image to disk. Keep the continuation compact and let
    // the user-facing response reference the verified image path instead.
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: imageToolResultText(output),
    }
  },
} satisfies ToolDef<InputSchema, Output>)
