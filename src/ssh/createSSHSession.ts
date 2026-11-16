import type { ChildProcess } from 'child_process'
import type { SSHSessionCallbacks, SSHSessionManager } from './SSHSessionManager.js'
import { UnsupportedFeatureError } from '../utils/unsupportedFeature.js'

export interface SSHSession {
  remoteCwd: string
  proc: Pick<ChildProcess, 'exitCode' | 'signalCode'>
  proxy: { stop(): void }
  createManager(callbacks: SSHSessionCallbacks): SSHSessionManager
  getStderrTail(): string
}
export class SSHSessionError extends UnsupportedFeatureError {
  constructor() { super('ssh-remote') }
}
type LocalSSHOptions = { cwd?: string, permissionMode?: string, dangerouslySkipPermissions: boolean }
export function createLocalSSHSession(_options: LocalSSHOptions): SSHSession { throw new SSHSessionError() }
export function createSSHSession(_options: LocalSSHOptions & { host: string, localVersion: string, extraCliArgs: string[] }, _callbacks: { onProgress?: (message: string) => void }): Promise<SSHSession> { throw new SSHSessionError() }
