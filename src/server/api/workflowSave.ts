/**
 * Workflow Save API Handler
 *
 * 处理 workflow 保存相关的 API 请求
 * Routes:
 *   POST   /api/workflows/save       — 保存 workflow 为 ZIP
 *   POST   /api/workflows/import     — 导入 workflow ZIP
 *   POST   /api/workflows/export     — 导出 workflow 为 ZIP
 */

import { WorkflowSaveService } from '../services/workflowSaveService.js'
import { PackRegistryService } from '../services/packRegistryService.js'
import { WorkflowTemplateRegistryService } from '../services/workflowTemplateRegistryService.js'
import type { WorkflowTemplateRegistryTemplate } from '../services/workflowTemplateValidation.js'

const workflowSaveService = new WorkflowSaveService()
const packRegistryService = new PackRegistryService()
const workflowTemplateRegistryService = new WorkflowTemplateRegistryService()

export async function handleWorkflowSaveApi(
  req: Request,
  url: URL,
  segments: string[]
): Promise<Response> {
  try {
    // segments: ['api', 'workflows', 'save', ...]
    const action = segments[3] // e.g. 'import', 'export' (or undefined for just 'save')

    if (action === 'import') {
      if (req.method !== 'POST') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await importWorkflow(req)
    }

    if (action === 'export') {
      if (req.method !== 'POST') {
        return Response.json(
          { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
          { status: 405 }
        )
      }
      return await exportWorkflow(req)
    }

    // Default: POST /api/workflows/save
    if (req.method !== 'POST') {
      return Response.json(
        { error: 'METHOD_NOT_ALLOWED', message: `Method ${req.method} not allowed` },
        { status: 405 }
      )
    }
    return await saveWorkflow(req)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json(
      { error: 'INTERNAL_SERVER_ERROR', message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/workflows/save
 * Save a workflow as a ZIP pack
 * Body: { workflowId: string, workflow: WorkflowTemplateRegistryTemplate }
 */
async function saveWorkflow(req: Request): Promise<Response> {
  try {
    const body = await req.json() as Record<string, unknown>
    const workflowId = body.workflowId as string
    const workflow = body.workflow as WorkflowTemplateRegistryTemplate

    if (!workflowId || typeof workflowId !== 'string') {
      return Response.json(
        { error: 'INVALID_REQUEST', message: 'workflowId is required and must be a string' },
        { status: 400 }
      )
    }

    if (!workflow || typeof workflow !== 'object') {
      return Response.json(
        { error: 'INVALID_REQUEST', message: 'workflow is required and must be an object' },
        { status: 400 }
      )
    }

    const result = await workflowSaveService.saveWorkflow(workflowId, workflow)

    if (!result.success) {
      return Response.json(
        { error: 'SAVE_FAILED', message: result.message },
        { status: 400 }
      )
    }

    return Response.json({
      success: true,
      packId: result.packId,
      zipPath: result.zipPath,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json(
      { error: 'SAVE_ERROR', message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/workflows/save/import
 * Import a workflow from ZIP file
 * Body: FormData with 'file' field containing ZIP data
 */
async function importWorkflow(req: Request): Promise<Response> {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return Response.json(
        { error: 'INVALID_REQUEST', message: 'file field is required' },
        { status: 400 }
      )
    }

    const zipData = new Uint8Array(await file.arrayBuffer())
    const result = await packRegistryService.importWorkflowPackZip(zipData)

    return Response.json({
      success: true,
      pack: result.pack,
      workflows: result.workflows,
      invalidTemplates: result.invalidTemplates,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json(
      { error: 'IMPORT_ERROR', message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/workflows/save/export
 * Export workflows as ZIP pack
 * Body: { workflowIds: string[], packName: string }
 */
async function exportWorkflow(req: Request): Promise<Response> {
  try {
    const body = await req.json() as Record<string, unknown>
    const workflowIds = body.workflowIds as string[] | undefined
    const packName = body.packName as string | undefined

    if (!workflowIds || !Array.isArray(workflowIds) || workflowIds.length === 0) {
      return Response.json(
        { error: 'INVALID_REQUEST', message: 'workflowIds is required and must be a non-empty array' },
        { status: 400 }
      )
    }

    if (!packName || typeof packName !== 'string') {
      return Response.json(
        { error: 'INVALID_REQUEST', message: 'packName is required and must be a string' },
        { status: 400 }
      )
    }

    // Get all templates
    const templates = await workflowTemplateRegistryService.listTemplates()
    const workflowsToExport = templates.templates.filter(
      (t) => workflowIds.includes(t.id)
    )

    if (workflowsToExport.length === 0) {
      return Response.json(
        { error: 'NOT_FOUND', message: 'No matching workflows found' },
        { status: 404 }
      )
    }

    // Export as ZIP
    const zipData = await packRegistryService.exportWorkflowPackZip({
      packId: `export-${Date.now()}`,
      name: packName,
      version: '1.0.0',
      workflows: workflowsToExport,
      selfContained: true,
    })

    // Return as downloadable ZIP
    return new Response(zipData, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${packName}.zip"`,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json(
      { error: 'EXPORT_ERROR', message },
      { status: 500 }
    )
  }
}
