import { describe, expect, it } from 'bun:test'
import { updateUiuxImageDeliveryPack } from './update-uiux-image-delivery.js'
import { ZipPackAdapter } from '../src/server/services/zipPackAdapter.js'

const adapter = new ZipPackAdapter()
const id = 'uiux-design-system-expert'
const skills = ['screenshot-ui-redesign', 'visual-concept-brief', 'interface-copy-craft', 'website-reference-research', 'visual-reference-lock', 'ui-ux-pro-max', 'taste-redesign', 'impeccable-visual-refinement', 'ui-craft-critique', 'ui-craft-audit', 'ui-craft-finalize', 'source-fidelity-final-pass', 'hallmark-anti-slop']
const originalSkill = (name: string) => '---\nname: ' + name + '\ndescription: Visual method\n---\nOriginal detailed method: typography, hierarchy and source observations.\n'
async function fixture(packId = id, expertId = id, version = '0.3.25') {
  return adapter.write({
    'manifest.json': JSON.stringify({ packId, version, schemaVersion: 1, name: 'UIUX设计系统专家', type: 'expert-pack', entrypoints: { experts: ['experts/' + id + '/expert.json'], skills }, customSetting: 'preserve' }),
    ['experts/' + id + '/expert.json']: JSON.stringify({ id: expertId, name: 'UIUX设计系统专家', profile: { customUserData: 'preserve' } }),
    ['experts/' + id + '/prompts/system.md']: 'Old HTML default instructions',
    ['experts/' + id + '/output-protocol.json']: JSON.stringify({ type: 'html' }),
    'third_party/license.txt': 'Original upstream license',
    ...Object.fromEntries(skills.map(name => ['skills/' + name + '/SKILL.md', originalSkill(name)])),
  })
}
describe('UIUX ZIP image-only upgrade', () => {
  it('preserves original real Skills and licenses while updating only the UIUX contract', async () => {
    const input = await fixture()
    const output = await updateUiuxImageDeliveryPack(input)
    const zip = await adapter.read(output)
    const manifest = await zip.readJson<any>('manifest.json')
    const expert = await zip.readJson<any>('experts/' + id + '/expert.json')
    const protocol = await zip.readJson<any>(expert.outputProtocolPath)
    expect(manifest.version).toBe('0.3.28')
    expect(manifest.customSetting).toBe('preserve')
    expect(expert.profile.customUserData).toBe('preserve')
    expect(manifest.runtimePolicy.allowedToolNames).toEqual(['AskUserQuestion', 'Read', 'Playwright', 'image_generation'])
    expect(protocol.deliveryMode).toBe('generated-image-only')
    expect(protocol.failurePolicy.automaticFallback).toBe(false)
    expect(await zip.readText('third_party/license.txt')).toBe('Original upstream license')
    for (const name of skills) {
      expect(await zip.readText('third_party/uiux-pre-image-only/skills/' + name + '/SKILL.md')).toBe(originalSkill(name))
      expect(await zip.readText('skills/' + name + '/SKILL.md')).not.toContain('Original detailed method')
      expect(await zip.readText('skills/' + name + '/SKILL.md')).toContain('generated-image-only applicability')
    }
    expect(await zip.readText('skills/uiux-image-art-direction/SKILL.md')).toContain('价格换算只是一个可选例子')
    expect(await updateUiuxImageDeliveryPack(output)).toBe(output)
  })
  it.each(['0.3.26', '0.3.27'])('upgrades installed %s without nesting headers or losing provenance', async (oldVersion) => {
    const initial = await adapter.read(await updateUiuxImageDeliveryPack(await fixture()))
    const entries: Record<string, Uint8Array | string> = {}
    for (const entry of initial.entries) entries[entry.path] = await initial.readBytes(entry.path)
    entries['manifest.json'] = JSON.stringify({ ...await initial.readJson<any>('manifest.json'), version: oldVersion })
    const protocolPath = 'experts/' + id + '/output-protocol.json'
    entries[protocolPath] = JSON.stringify({ ...await initial.readJson<any>(protocolPath), customProtocolField: 'retain' })
    const migrated = await adapter.read(await updateUiuxImageDeliveryPack(await adapter.write(entries)))
    expect((await migrated.readJson<any>('manifest.json')).version).toBe('0.3.28')
    expect((await migrated.readJson<any>(protocolPath)).customProtocolField).toBe('retain')
    expect(await migrated.readText('third_party/uiux-pre-image-only/skills/taste-redesign/SKILL.md')).toBe(originalSkill('taste-redesign'))
    expect((await migrated.readText('skills/taste-redesign/SKILL.md')).split('## UIUX generated-image-only applicability')).toHaveLength(2)
    const prompt = await migrated.readText('experts/' + id + '/prompts/system.md')
    for (const term of ['inspiration_sources', '当前视口', 'visual-reference-receipt', 'image-revision-brief', 'repair_preview_then_read', '不是模型不能生图', '家庭共享']) expect(prompt).toContain(term)
    expect((await migrated.readJson<any>(protocolPath)).failurePolicy.previewFailureChoices).toEqual(['repair_preview_then_read', 'stop'])
  })
  it('refuses prototype, commercialization, mismatched identity and unreviewed versions', async () => {
    for (const args of [['web-information-designer', id, '0.3.25'], ['commercialization-research-report', id, '0.3.25'], [id, 'other-expert', '0.3.25'], [id, id, '9.0.0']]) {
      await expect(updateUiuxImageDeliveryPack(await fixture(...args as [string, string, string]))).rejects.toThrow()
    }
  })
})


describe('UIUX active pack contract cleanup', () => {
  it('removes obsolete active entries, keeps archival licenses, and shares the executable contract', async () => {
    const original = await adapter.read(await fixture(id, id, '0.3.27'))
    const entries: Record<string, Uint8Array | string> = {}
    for (const e of original.entries) entries[e.path] = await original.readBytes(e.path)
    const m = await original.readJson<any>('manifest.json')
    m.entrypoints.skills.push('accessible-html-prototype')
    m.permissions = [{ id: 'write-expert-output', description: 'Write HTML prototype' }, { id: 'custom-permission', description: 'Keep me' }]
    entries['manifest.json'] = JSON.stringify(m)
    entries['skills/accessible-html-prototype/SKILL.md'] = originalSkill('accessible-html-prototype')
    entries['skills/taste-redesign/old-script.py'] = 'obsolete executable'
    const output = await adapter.read(await updateUiuxImageDeliveryPack(await adapter.write(entries)))
    const next = await output.readJson<any>('manifest.json')
    const expert = await output.readJson<any>('experts/' + id + '/expert.json')
    expect(next.entrypoints.skills).toEqual(expert.skillIds)
    expect(next.entrypoints.skills).not.toContain('accessible-html-prototype')
    expect(output.entries.some(e => e.path === 'skills/accessible-html-prototype/SKILL.md')).toBe(false)
    expect(output.entries.some(e => e.path === 'skills/taste-redesign/old-script.py')).toBe(false)
    expect(await output.readText('third_party/uiux-pre-image-only/skills/taste-redesign/old-script.py')).toBe('obsolete executable')
    expect(next.permissions[0].description).not.toContain('HTML')
    expect(next.permissions[1].description).toBe('Keep me')
    const { UIUX_IMAGE_ONLY_RUNTIME_INSTRUCTION, UIUX_REVIEW_INSTRUCTION } = await import('../src/services/tools/uiuxImageContract.js')
    expect(await output.readText(expert.promptPaths.system)).toContain(UIUX_IMAGE_ONLY_RUNTIME_INSTRUCTION)
    expect(await output.readText(expert.promptPaths.system)).toContain(UIUX_REVIEW_INSTRUCTION)
    for (const name of next.entrypoints.skills) {
      const body = await output.readText('skills/' + name + '/SKILL.md')
      expect(body).not.toMatch(/Use Bash once|Change HTML|修改完整?\s*HTML|重新渲染三端|必须.*Bash|context\.mjs|npx /i)
    }
  })
})
