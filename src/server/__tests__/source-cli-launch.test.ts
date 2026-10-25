import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

test.skipIf(process.platform === 'win32')('desktop can directly execute the repository CLI from a session directory', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'cc-source-cli-launch-'))
  try {
    const cliPath = resolve(import.meta.dir, '../../../bin/claude-jiangxia')
    const child = Bun.spawnSync([cliPath, '--version'], {
      cwd: workDir,
      env: { ...process.env, CLAUDE_CONFIG_DIR: workDir, CC_JIANGXIA_SKIP_DOTENV: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    expect(child.exitCode).toBe(0)
    expect(child.stdout.toString()).toContain('(Claude Code)')
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
})
