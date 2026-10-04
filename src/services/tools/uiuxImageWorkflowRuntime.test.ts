import { describe, expect, test } from 'bun:test'
import { collectUiuxImageEvidence, uiuxImageToolViolation } from './uiuxImageWorkflowRuntime.js'
const assistant = (content: any) => ({ type: 'assistant', message: { role: 'assistant', content: typeof content === 'string' ? [{ type: 'text', text: content }] : content } })
const user = (content: any) => ({ type: 'user', message: { role: 'user', content } })
const pair = (id: string, name: string, input: any, content: any, is_error = false) => [assistant([{ type: 'tool_use', id, name, input }]), user([{ type: 'tool_result', tool_use_id: id, content, is_error }])]
const pixels = [{ type: 'image', source: { type: 'base64', data: 'aW1hZ2U=', media_type: 'image/png' } }]
const choice = (id: string, answer: string) => pair('q-' + id, 'AskUserQuestion', { questions: [{ id, choices: [{ id: answer, label: answer }] }] }, 'User has answered your questions: "' + id + '"="' + answer + '".')
const reference = (id: string, url: string, failed = false) => [
  ...pair(id, 'Playwright', {}, '<playwright-action-ledger encoding="base64">' + Buffer.from(JSON.stringify({ url, screenshotPath: '/tmp/' + id + '.png' })).toString('base64') + '</playwright-action-ledger>'),
  ...pair('r-' + id, 'Read', { file_path: '/tmp/' + id + '.png' }, failed ? 'resize failed' : pixels, failed),
]
const generate = (id = 'g', file = '/tmp/generated.png') => pair(id, 'image_generation', { operation: 'generate' }, 'Image generation status: generated.\nImage: ' + file + '\n')
const allowed = () => [...choice('inspiration_sources', 'no_external_reference'), ...choice('design_direction', 'calm')]
const check = (messages: any[], name = 'image_generation', input: any = { operation: 'generate' }) => uiuxImageToolViolation(name, input, messages, true)
describe('UIUX image workflow pre-execution guard', () => {
  test('does not affect ordinary experts, introductions, Read, or preflight', () => {
    expect(uiuxImageToolViolation('image_generation', { operation: 'generate' }, [], false)).toBeNull()
    expect(check([], 'Read', { file_path: '/x.png' })).toBeNull()
    expect(check([], 'image_generation', { operation: 'preflight' })).toBeNull()
    expect(check([], 'AskUserQuestion', { questions: [{ id: 'inspiration_sources' }] })).toBeNull()
  })
  test('blocks generation until source and direction choices are answered', () => {
    expect(check([])).toContain('UIUX_INSPIRATION_REQUIRED')
    expect(check(choice('inspiration_sources', 'no_external_reference'))).toContain('UIUX_DIRECTION_REQUIRED')
    expect(check(allowed())).toBeNull()
  })
  test('failed screenshots block direction selection before it happens', () => {
    const history = [...choice('inspiration_sources', 'extended_public_research'), ...reference('a', 'https://a.test', true), ...reference('b', 'https://b.test', true)]
    expect(check(history, 'AskUserQuestion', { questions: [{ id: 'design_direction' }] })).toContain('UIUX_REFERENCE_IMAGES_REQUIRED')
  })
  test('requires two unique visually read pages and observations before production', () => {
    const history = [...choice('inspiration_sources', 'extended_public_research'), ...choice('design_direction', 'calm'), ...reference('a', 'https://a.test'), ...reference('b', 'https://www.a.test/')]
    expect(check(history)).toContain('UIUX_REFERENCE_IMAGES_REQUIRED')
    history.push(...reference('c', 'https://b.test'))
    expect(check(history)).toContain('UIUX_REFERENCE_IMAGES_REQUIRED')
    history.push(assistant('<visual-reference-receipt>visible hierarchy and application</visual-reference-receipt>'))
    expect(check(history)).toBeNull()
  })
  test('preview failure and configure-then-retry never send a new image request', () => {
    const history = [...allowed(), ...generate(), ...pair('read', 'Read', { file_path: '/tmp/generated.png' }, 'Could not create a bounded preview', true), ...choice('image_read_failure', 'configure_then_retry')]
    expect(check(history)).toContain('UIUX_IMAGE_PREVIEW_REQUIRED')
    expect(collectUiuxImageEvidence(history)).toMatchObject({ latestImage: '/tmp/generated.png', latestImageRead: false, latestReadFailed: true })
  })
  test('only the latest image exact path and real image block satisfy Read', () => {
    const history = [...allowed(), ...generate(), ...pair('r', 'Read', { file_path: '/tmp/generated.png.bak' }, pixels)]
    expect(check(history)).toContain('UIUX_IMAGE_PREVIEW_REQUIRED')
    history.push(...pair('r2', 'Read', { file_path: '/tmp/generated.png' }, 'read successful'))
    expect(check(history)).toContain('UIUX_IMAGE_PREVIEW_REQUIRED')
    history.push(...pair('r3', 'Read', { file_path: '/tmp/generated.png' }, pixels))
    expect(check(history)).toContain('UIUX_PIXEL_REVIEW_REQUIRED')
    history.push(assistant('<image-revision-brief>/tmp/generated.png has two login labels; keep the account fact and remove the duplicate.</image-revision-brief>'))
    expect(check(history)).toBeNull()
    history.push(...generate('g2', '/tmp/latest.webp'))
    expect(collectUiuxImageEvidence(history).latestImage).toBe('/tmp/latest.webp')
    expect(check(history)).toContain('UIUX_IMAGE_PREVIEW_REQUIRED')
    history.push(...pair('r4', 'Read', { file_path: '/tmp/latest.webp' }, pixels))
    expect(check(history)).toContain('UIUX_REVISION_LIMIT')
  })
  test('respects explicit no-reference and delegated direction without repeated cards', () => {
    expect(check([user('不用外部参考，方向你来决定')])).toBeNull()
  })

  test('persisted server message entries retain paid image evidence across turns', () => {
    const h = [...allowed(), ...generate('g2', 'C:/tmp/final.webp'), ...pair('r', 'Read', { file_path: 'C:/tmp/final.webp' }, 'preview failed', true)]
    const persisted = h.flatMap(m => m.message.content.map((b: any) => ({ type: b.type === 'tool_use' || b.type === 'tool_result' ? b.type : m.type, content: b })))
    expect(collectUiuxImageEvidence(persisted)).toMatchObject({ latestImage: 'C:/tmp/final.webp', latestReadFailed: true })
    expect(check(persisted)).toContain('UIUX_IMAGE_PREVIEW_REQUIRED')
  })
  test('does not force inaccessible sources after an explicit limited-evidence choice', () => {
    const h = [user('只参考 https://one.test'), ...choice('inspiration_sources', 'user_provided_reference'), ...reference('one', 'https://one.test'), ...choice('reference_recovery', 'use_available_evidence'), assistant('<visual-reference-receipt>Only one visible page; other reference unavailable.</visual-reference-receipt>'), ...choice('design_direction', 'calm')]
    expect(check(h)).toBeNull()
    expect(check([...choice('reference_recovery', 'use_available_evidence')])).toContain('UIUX_INSPIRATION_REQUIRED')
    expect(check(choice('inspiration_sources', 'skip'))).toContain('UIUX_INSPIRATION_REQUIRED')
  })
  test('explicit new task resets prior image budget but a generic retry does not', () => {
    const h = [...allowed(), ...generate(), ...choice('design_task_action', 'start_new_design')]
    expect(collectUiuxImageEvidence(h).latestImage).toBeNull()
    expect(check(h)).toContain('UIUX_INSPIRATION_REQUIRED')
  })
  test('additional screenshots require task-boundary clarification without erasing paid-image evidence', () => {
    expect(check([...allowed(), user(pixels)])).toContain('UIUX_TASK_BOUNDARY_REQUIRED')
    const h = [...allowed(), ...generate(), user(pixels)]
    expect(collectUiuxImageEvidence(h).latestImage).toBe('/tmp/generated.png')
    expect(check([...h, ...choice('design_task_action', 'continue_current')])).toContain('UIUX_IMAGE_PREVIEW_REQUIRED')
  })
})


describe('UIUX explicit decisions and locked references', () => {
  test('honors a specified direction without making the user choose it twice', () => {
    expect(check([user('不用外部参考，使用方向 A：紧凑工具界面')])).toBeNull()
    expect(check([user('不用外部参考，不要选方向 A')])).toContain('UIUX_DIRECTION_REQUIRED')
  })
  test('stop and change_sources cannot silently continue or reuse stale receipts', () => {
    expect(check([...allowed(), ...choice('reference_recovery', 'stop')])).toContain('UIUX_STOPPED')
    const h = [...choice('inspiration_sources', 'extended_public_research'), ...reference('one', 'https://one.test'), ...reference('two', 'https://two.test'), assistant('<visual-reference-receipt>visible layout evidence</visual-reference-receipt>'), ...choice('design_direction', 'calm'), ...choice('reference_recovery', 'change_sources')]
    expect(check(h)).toContain('UIUX_INSPIRATION_REQUIRED')
    expect(collectUiuxImageEvidence(h).sources).toEqual([])
  })
  test('blocks research before scope, after rejection, and navigation outside locked URLs', () => {
    const nav = (url: string) => ({ actions: [{ type: 'navigate', url }], include_screenshot: true })
    expect(check([], 'Playwright', nav('https://one.test'))).toContain('UIUX_INSPIRATION_REQUIRED')
    expect(check(allowed(), 'Playwright', nav('https://one.test'))).toContain('UIUX_RESEARCH_DISABLED')
    const h = [user('只参考 https://one.test/ui 和 https://two.test/ui，方向你来决定')]
    expect(check(h, 'Playwright', nav('https://one.test/ui'))).toBeNull()
    expect(check(h, 'Playwright', nav('https://other.test/ui'))).toContain('UIUX_REFERENCE_SCOPE')
    expect(check(h, 'Playwright', { actions: [{ type: 'evaluate', script: 'location.href="https://other.test"' }] })).toContain('UIUX_REFERENCE_SCOPE')
    expect(collectUiuxImageEvidence([...h, ...reference('bad', 'https://other.test/ui')]).sources).toEqual([])
  })
  test('requires explicit URLs for a supplied-reference answer and accepts free-text custom direction', () => {
    expect(check(choice('inspiration_sources', 'user_provided_reference'), 'Playwright', { actions: [{ type: 'navigate', url: 'https://guess.test' }] })).toContain('UIUX_REFERENCE_URLS_REQUIRED')
    const h = [...choice('inspiration_sources', 'no_external_reference'), ...pair('custom', 'AskUserQuestion', { questions: [{ id: 'design_direction', choices: [{ id: 'calm', label: '冷静工具' }] }] }, 'User has answered your questions: "design_direction"="选冷静工具，但保留原有密度".')]
    expect(check(h)).toBeNull()
    expect(check([...choice('inspiration_sources', 'no_external_reference'), ...choice('design_direction', 'stop')])).toContain('UIUX_STOPPED')
  })
})


test('UIUX provider failure needs a recovery answer before another paid request; policy rejections do not masquerade as provider failure', () => {
  const failed = [...allowed(), ...pair('bad-generation', 'image_generation', { operation: 'generate' }, 'Image generation status: failed. Provider timeout', true)]
  expect(check(failed)).toContain('UIUX_GENERATION_RECOVERY_REQUIRED')
  expect(check([...failed, ...choice('image_generation_failure', 'adjust_brief')])).toBeNull()
  expect(check([...failed, ...choice('image_generation_failure', 'stop')])).toContain('UIUX_STOPPED')
  const rejected = [...allowed(), ...pair('denied', 'image_generation', { operation: 'generate' }, 'UIUX_INSPIRATION_REQUIRED: policy rejected before Provider', true)]
  expect(check(rejected)).toBeNull()
})
