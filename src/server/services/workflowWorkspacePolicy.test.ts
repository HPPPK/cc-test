import { describe, expect, test } from 'bun:test'
import * as os from 'node:os'
import * as path from 'node:path'

import { validateWorkflowWorkspaceRoot } from './workflowWorkspacePolicy.js'

describe('workflow workspace policy', () => {
  test('rejects the user home directory as a workflow workspace', () => {
    const result = validateWorkflowWorkspaceRoot(os.homedir())

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.code).toBe('home-directory')
      expect(result.message).toContain('project workspace')
    }
  })

  test('rejects Claude configuration directories as workflow workspaces', () => {
    const result = validateWorkflowWorkspaceRoot(path.join(os.homedir(), '.claude', 'cc-jiangxia'))

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.code).toBe('claude-config')
      expect(result.message).toContain('Claude config')
    }
  })

  test('rejects broad user folders as workflow workspaces', () => {
    const result = validateWorkflowWorkspaceRoot(path.join(os.homedir(), 'Desktop'))

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.code).toBe('broad-user-directory')
      expect(result.message).toContain('specific repository or app folder')
    }
  })

  test('allows a nested project directory', () => {
    const result = validateWorkflowWorkspaceRoot(path.join(os.tmpdir(), 'cc-jiangxia-project'))

    expect(result).toEqual({ valid: true })
  })

  test('allows a project inside a broad user folder', () => {
    const result = validateWorkflowWorkspaceRoot(path.join(os.homedir(), 'Desktop', 'student-management'))

    expect(result).toEqual({ valid: true })
  })
})
