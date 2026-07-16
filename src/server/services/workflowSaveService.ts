/**
 * Workflow Save Service
 *
 * 处理 workflow 的保存和更新逻辑
 * - 调用 packRegistryService 保存 workflow 为 ZIP
 * - 更新 workflowTemplateRegistryService 的内存缓存
 * - 返回保存结果
 */

import * as path from 'node:path'
import { PackRegistryService, getWorkflowPackStorageDir } from './packRegistryService.js'
import { resetWorkflowTemplateRegistryForTests } from './workflowTemplateRegistryService.js'
import type { WorkflowTemplateRegistryTemplate } from './workflowTemplateValidation.js'

export type SaveWorkflowResult = {
  success: boolean
  packId: string
  zipPath: string
  message?: string
}

export type UpdateWorkflowResult = {
  success: boolean
  message?: string
}

export class WorkflowSaveService {
  private packRegistryService = new PackRegistryService()

  /**
   * Save a new user workflow as a ZIP pack
   * Updates the in-memory cache of workflowTemplateRegistryService
   */
  async saveWorkflow(
    workflowId: string,
    workflow: WorkflowTemplateRegistryTemplate,
  ): Promise<SaveWorkflowResult> {
    try {
      // Save workflow as one canonical ZIP pack in the fixed workflow ZIP store.
      const result = await this.packRegistryService.saveUserWorkflowAsZip(workflow, workflowId)

      // Invalidate cache so next read picks up the new workflow
      resetWorkflowTemplateRegistryForTests()

      return {
        success: true,
        packId: result.packId,
        zipPath: result.zipPath,
        message: `Workflow '${workflow.name}' saved successfully`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        packId: '',
        zipPath: '',
        message: `Failed to save workflow: ${message}`,
      }
    }
  }

  /**
   * Update an existing user workflow
   * The zipPath comes from a previous save operation
   */
  async updateWorkflow(
    zipPath: string,
    workflow: WorkflowTemplateRegistryTemplate,
  ): Promise<UpdateWorkflowResult> {
    try {
      const storageDir = path.resolve(getWorkflowPackStorageDir())
      const resolvedZipPath = path.resolve(zipPath)
      const relativeToStorage = path.relative(storageDir, resolvedZipPath)
      if (
        !resolvedZipPath.toLowerCase().endsWith('.zip') ||
        relativeToStorage.startsWith('..') ||
        path.isAbsolute(relativeToStorage)
      ) {
        throw new Error('Workflow ZIP updates must target the fixed workflow ZIP store')
      }

      // Update the workflow ZIP in place without extracting it to a folder.
      await this.packRegistryService.updateWorkflowZip(resolvedZipPath, workflow)

      // Invalidate cache
      resetWorkflowTemplateRegistryForTests()

      return {
        success: true,
        message: `Workflow '${workflow.name}' updated successfully`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        message: `Failed to update workflow: ${message}`,
      }
    }
  }

  /**
   * Get the workflow directory where user workflows are stored
   */
  getWorkflowDirectory(): string {
    return getWorkflowPackStorageDir()
  }
}

export const workflowSaveService = new WorkflowSaveService()
