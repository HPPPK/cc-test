import { afterEach, expect, spyOn, test } from 'bun:test'
import * as fs from 'fs/promises'
import { getTaskOutputDir, getTaskOutputPath, initTaskOutputAsSymlink, persistAgentTaskOutput } from './diskOutput.js'

const paths = new Set<string>()
let symlinkMock: ReturnType<typeof spyOn> | undefined
afterEach(async () => {
  symlinkMock?.mockRestore()
  symlinkMock = undefined
  for (const path of paths) await fs.rm(path, { recursive: true, force: true })
  paths.clear()
})

function fallbackFixture() {
  const id = `fallback-${crypto.randomUUID()}`
  paths.add(getTaskOutputPath(id))
  symlinkMock = spyOn(fs, 'symlink').mockRejectedValue(Object.assign(new Error('symlink denied fixture'), { code: 'EPERM' }))
  return id
}

test('persists final text when Windows symlink creation falls back to a regular output file', async () => {
  const id = fallbackFixture()
  await initTaskOutputAsSymlink(id, 'unused-target')
  await persistAgentTaskOutput(id, 'real final answer')
  expect(await fs.readFile(getTaskOutputPath(id), 'utf8')).toBe('real final answer')
})

test('rejects replaced fallback paths and never overwrites the replacement target', async () => {
  const id = fallbackFixture()
  const path = await initTaskOutputAsSymlink(id, 'unused-target')
  const original = `${path}.original`
  paths.add(original)
  await fs.rename(path, original)
  await fs.writeFile(path, 'protected replacement')
  await expect(persistAgentTaskOutput(id, 'must not overwrite')).rejects.toThrow('replaced')
  expect(await fs.readFile(path, 'utf8')).toBe('protected replacement')
  expect(await fs.readFile(original, 'utf8')).toBe('')
})

test('propagates fallback initialization failure and rejects path traversal', async () => {
  const id = fallbackFixture()
  await fs.mkdir(getTaskOutputPath(id), { recursive: true })
  await expect(initTaskOutputAsSymlink(id, 'unused-target')).rejects.toThrow()
  await expect(persistAgentTaskOutput(id, 'answer')).rejects.toThrow()
  await expect(initTaskOutputAsSymlink('../escape', 'unused-target')).rejects.toThrow('Invalid')
  await expect(persistAgentTaskOutput('../escape', 'answer')).rejects.toThrow('Invalid')
  expect(getTaskOutputPath(id).startsWith(getTaskOutputDir())).toBe(true)
})

test('propagates final persistence errors and closes the registered fallback without retry loops', async () => {
  const id = fallbackFixture()
  const path = await initTaskOutputAsSymlink(id, 'unused-target')
  const missing = `${path}.moved`
  paths.add(missing)
  await fs.rename(path, missing)
  await expect(persistAgentTaskOutput(id, 'answer')).rejects.toThrow()
  await expect(persistAgentTaskOutput(id, 'failure notification')).resolves.toBeUndefined()
})
