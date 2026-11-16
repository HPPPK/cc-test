import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe.skipIf(process.platform !== 'darwin')('isolated macOS folder picker', () => {
  it('contains helper crashes, preserves cancellation, and validates paths and arguments', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jiangxia-folder-test-'))
    try {
      const binary = join(dir, 'probe')
      const compile = Bun.spawnSync(['rustc', '--test', 'src-tauri/src/project_folder_picker.rs', '-o', binary])
      expect(compile.stderr.toString()).not.toContain('error:')
      expect(compile.exitCode).toBe(0)
      const result = Bun.spawnSync([binary])
      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain('0 failed')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)
})
