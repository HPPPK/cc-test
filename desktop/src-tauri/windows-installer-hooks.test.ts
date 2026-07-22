import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))

function readInstallerHooks() {
  return readFileSync(join(currentDir, 'windows-installer-hooks.nsh'), 'utf8')
}

describe('Windows installer workflow payload hook', () => {
  it('installs staged workflow ZIPs into the canonical user store without overwriting edits', () => {
    const source = readInstallerHooks()

    expect(source).toContain('!macro NSIS_HOOK_POSTINSTALL')
    expect(source).toContain('$INSTDIR\\resources\\binaries\\packs')
    expect(source).toContain('$PROFILE\\.claude\\cc-jiangxia\\workflows\\packs')
    expect(source).toContain('IfFileExists "$WorkflowPackTarget\\$WorkflowPackFile" workflow_packs_next')
  })

  it('removes only the staged application payload after installation', () => {
    expect(readInstallerHooks()).toContain('RMDir /r "$WorkflowPackSource"')
  })
})
