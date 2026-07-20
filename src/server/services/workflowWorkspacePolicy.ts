import * as os from 'node:os'
import * as path from 'node:path'

type WorkflowWorkspaceValidationValid = {
  valid: true
}

type WorkflowWorkspaceValidationInvalid = {
  valid: false
  code: 'empty' | 'root-directory' | 'home-directory' | 'broad-user-directory' | 'claude-config'
  message: string
}

export type WorkflowWorkspaceValidation =
  | WorkflowWorkspaceValidationValid
  | WorkflowWorkspaceValidationInvalid

function normalize(input: string): string {
  return path.resolve(input)
}

function isSameOrChild(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function claudeConfigDir(): string {
  return normalize(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'))
}

function isClaudeConfigWorkspace(workspaceRoot: string): boolean {
  const configRoot = claudeConfigDir()
  if (configRoot === normalize(path.join(os.homedir(), '.claude'))) {
    return isSameOrChild(workspaceRoot, configRoot)
  }
  if (workspaceRoot === configRoot) return true

  const relative = path.relative(configRoot, workspaceRoot).split(path.sep).filter(Boolean)
  return relative.length > 0 && ['cc-jiangxia', 'projects', 'plugins', 'skills'].includes(relative[0]!)
}

function isBroadUserDirectory(workspaceRoot: string): boolean {
  const home = normalize(os.homedir())
  return ['Desktop', 'Downloads', 'Documents'].some((name) =>
    workspaceRoot === normalize(path.join(home, name)),
  )
}

export function validateWorkflowWorkspaceRoot(workDir: string | undefined): WorkflowWorkspaceValidation {
  if (!workDir || workDir.trim().length === 0) {
    return {
      valid: false,
      code: 'empty',
      message: 'Workflow sessions require a project workspace. Select the repository or app folder before starting.',
    }
  }

  const workspaceRoot = normalize(workDir)
  const root = path.parse(workspaceRoot).root
  if (workspaceRoot === root) {
    return {
      valid: false,
      code: 'root-directory',
      message: 'Workflow sessions require a project workspace. Select a repository or app folder instead of the filesystem root.',
    }
  }

  const home = normalize(os.homedir())
  if (workspaceRoot === home || workspaceRoot === path.dirname(home)) {
    return {
      valid: false,
      code: 'home-directory',
      message: 'Workflow sessions require a project workspace. Select the repository or app folder instead of your home directory.',
    }
  }

  if (isBroadUserDirectory(workspaceRoot)) {
    return {
      valid: false,
      code: 'broad-user-directory',
      message: 'Workflow sessions require a project workspace. Select a specific repository or app folder inside Desktop, Downloads, or Documents instead of the top-level folder.',
    }
  }

  if (isClaudeConfigWorkspace(workspaceRoot)) {
    return {
      valid: false,
      code: 'claude-config',
      message: 'Workflow sessions require a project workspace. Select a repository or app folder instead of a Claude config directory.',
    }
  }

  return { valid: true }
}
