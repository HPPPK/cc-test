import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const config = readFileSync(path.resolve(import.meta.dirname, '../vitest.config.ts'), 'utf8')

const packageJson = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf8'))

describe('desktop test runner boundaries', () => {
  it.each(['bundled-image-runtime', 'tauri-audited'])('runs %s with Bun and excludes it from Vitest', (name) => {
    expect(config).toContain(`'scripts/${name}.test.ts'`)
    expect(packageJson.scripts['test:scripts']).toContain(`./scripts/${name}.test.ts`)
  })

  it('checks the packaged updater endpoint on the normal desktop test path', () => {
    expect(packageJson.scripts['test:scripts']).toContain('./src-tauri/tauri-config.test.ts')
  })

  it('keeps script regressions on the normal desktop check path', () => {
    expect(packageJson.scripts.test).toBe('bun run test:scripts && vitest')
    expect(config).not.toContain("'scripts/**'")
  })
})
