import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, writeFile, rm, symlink, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { validatePrototypePreviewFiles } from './prototypePreviewEvidence.js'
import type { PrototypePreviewReceipt } from './prototypePreviewService.js'
const dirs: string[] = []
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
afterEach(async () => { for (const dir of dirs.splice(0)) { if (path.dirname(dir) !== path.resolve(tmpdir()) || !path.basename(dir).startsWith('preview-evidence-')) throw new Error('unsafe cleanup'); await rm(dir, { recursive: true, force: true }) } })
describe('final prototype evidence identity', () => {
  it('rejects changed HTML, image or local assets after a render', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'preview-evidence-')); dirs.push(root)
    const source = { path: path.join(root, '03-high-fidelity.html'), sha256: hash('html') }
    const shot = { path: path.join(root, 'image.png'), sha256: hash('png') }
    const asset = { path: path.join(root, 'style.css'), sha256: hash('css') }
    await writeFile(source.path, 'html'); await writeFile(shot.path, 'png'); await writeFile(asset.path, 'css')
    const receipt = { source, screenshots: [shot], assets: [asset] } as PrototypePreviewReceipt
    expect(await validatePrototypePreviewFiles(receipt, root)).toEqual([])
    for (const file of [source, shot, asset]) await writeFile(file.path, 'changed')
    expect(await validatePrototypePreviewFiles(receipt, root)).toHaveLength(3)
  })
  it('rejects evidence symlinks pointing outside the session root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'preview-evidence-')); dirs.push(root)
    const outside = path.join(root, 'outside'); const work = path.join(root, 'work')
    await mkdir(outside); await mkdir(work); await writeFile(path.join(outside, 'source.html'), 'html')
    await symlink(outside, path.join(work, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
    const receipt = { source: { path: path.join(work, 'link/source.html'), sha256: hash('html') }, screenshots: [] } as unknown as PrototypePreviewReceipt
    expect((await validatePrototypePreviewFiles(receipt, work)).join()).toContain('超出当前会话目录')
  })
})
