import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const expertServerFiles = [
  'src/server/api/experts.ts',
  'src/server/services/expertPackRegistryService.ts',
  'src/server/services/expertSessionService.ts',
  'src/server/services/expertRuntimeService.ts',
  'src/server/services/expertPackRegistryService.test.ts',
  'src/server/services/expertSessionService.test.ts',
  'src/server/services/expertRuntimeService.test.ts',
]

const mojibakePatterns = [
  /\?\?\?\?/,
  /�/,
  /涓撳/,
  /鎬庝箞/,
  /銆/,
  /锛/,
  /鈥/,
]

describe('expert server Chinese copy encoding', () => {
  it('keeps expert package and material copy as valid UTF-8 Chinese', () => {
    const failures: string[] = []

    for (const file of expertServerFiles) {
      const text = readFileSync(path.join(process.cwd(), file), 'utf-8')
      for (const pattern of mojibakePatterns) {
        if (pattern.test(text)) failures.push(`${file} matches ${pattern}`)
      }
    }

    expect(failures).toEqual([])
    expect(readFileSync(path.join(process.cwd(), 'src/server/services/expertSessionService.ts'), 'utf-8')).toContain('专家')
  })
})
