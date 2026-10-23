import { afterEach, describe, expect, test } from 'bun:test'
import * as os from 'node:os'
import * as path from 'node:path'

import { validateWorkflowWorkspaceRoot } from './workflowWorkspacePolicy.js'

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR

afterEach(() => {
  if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = originalConfigDir
})

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
    const result = validateWorkflowWorkspaceRoot(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'cc-jiangxia'))

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.code).toBe('claude-config')
      expect(result.message).toContain('Claude config')
    }
  })

  test('protects every directory below the default Claude configuration root', () => {
    delete process.env.CLAUDE_CONFIG_DIR
    expect(validateWorkflowWorkspaceRoot(path.join(os.homedir(), '.claude', 'custom-state')))
      .toMatchObject({ valid: false, code: 'claude-config' })
  })

  test('protects managed state but permits project siblings under a custom config root', () => {
    const configRoot = path.join(os.tmpdir(), 'workflow-config-fixture')
    process.env.CLAUDE_CONFIG_DIR = configRoot
    for (const name of ['', 'cc-jiangxia', 'projects', 'plugins', 'skills']) {
      expect(validateWorkflowWorkspaceRoot(path.join(configRoot, name)))
        .toMatchObject({ valid: false, code: 'claude-config' })
    }
    expect(validateWorkflowWorkspaceRoot(path.join(configRoot, 'app-project'))).toEqual({ valid: true })
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
