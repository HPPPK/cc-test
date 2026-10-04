import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { formatPrototypePreviewReceipt, type PrototypePreviewReceipt } from '../services/prototypePreviewService.js'
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import type { ServerWebSocket } from 'bun'
import { __resetWebSocketHandlerStateForTests, handleWebSocket, type WebSocketData } from '../ws/handler.js'
import { conversationService } from '../services/conversationService.js'
import { sessionService } from '../services/sessionService.js'

const receipt = [
  '<prototype-visual-review-receipt>',
  'Applied Skills: prototype-fidelity-workflow, prototype-visual-quality-gate, frontend-design',
  'Visual register: 档案修复室',
  '首轮问题：标题和工作台争抢注意力。实际 HTML 修订：缩小标题，调整移动端排列。',
  '1440 桌面：主 CTA 可见；1024 平板：两栏无重叠；390 手机：单列无横向溢出。',
  '事实与演示内容已区分。以上为视口 QA，不是真实设备测试。',
  '</prototype-visual-review-receipt>',
].join('\n')
const viewports = ['1440x1000', '1024x900', '390x844'] as const
const labels = ['desktop', 'tablet', 'mobile']
const image = [{ type: 'image', source: { type: 'base64', data: 'AA==' } }]
const activeIds: string[] = []

const fixtureDirs: string[] = []
function setup(options: { controlled?: boolean } = {}) {
  const workDir = options.controlled ? mkdtempSync(path.join(tmpdir(), 'prototype-gate-')) : 'C:/prototype'
  if (options.controlled) fixtureDirs.push(workDir)
  const id = 'prototype-regression-' + crypto.randomUUID()
  activeIds.push(id)
  const sent: string[] = []
  const ws = {
    data: { sessionId: id, channel: 'client', connectedAt: Date.now(), sdkToken: null, serverPort: 0, serverHost: '127.0.0.1' },
    send: (payload: string) => { sent.push(payload); return 1 }, close() {},
  } as unknown as ServerWebSocket<WebSocketData>
  const session = {
    proc: { kill() {}, exited: Promise.resolve(0) }, outputCallbacks: [] as Array<(msg: any) => void>,
    workDir, permissionMode: 'default', sdkToken: 'test', sdkSocket: null,
    pendingOutbound: [], startupPending: false, startupExitCode: null, stdoutLines: [], stderrLines: [],
    outputDrain: Promise.resolve(), sdkMessages: [], initMessage: null, pendingPermissionRequests: new Map(),
  }
  ;(conversationService as any).sessions.set(id, session)
  spyOn(sessionService, 'getSession').mockResolvedValue({
    id, workDir, expert: {
      mode: 'expert', expertId: 'web-information-designer', status: 'active',
      runtimeBinding: {
        schemaVersion: 1, active: true, expertId: 'web-information-designer', packId: 'web-information-designer',
        packVersion: options.controlled ? '1.5.1' : '1.3.2', promptSnapshot: 'Create prototypes', skills: [], hostTools: [], tools: [], permissions: [],
        runtimePolicy: { mode: 'prototype-visual-workflow', allowedToolNames: ['Read', 'Write', 'Bash', ...(options.controlled ? ['PrototypePreview'] : [])], requiredSkillIds: [] },
      },
    },
  } as any)
  const sendMessage = spyOn(conversationService, 'sendMessage').mockReturnValue(true)
  handleWebSocket.open(ws)
  const emit = session.outputCallbacks[0]!
  let sequence = 0
  const result = (toolId: string, content: unknown, error = false) => emit({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: toolId, is_error: error, content }] } })
  const use = (name: string, input: unknown) => {
    const toolId = 'tool-' + sequence++
    emit({ type: 'assistant', message: { content: [{ type: 'tool_use', id: toolId, name, input }] } })
    return toolId
  }
  const write = (file: string, content = '<main>prototype</main>', error = false) => {
    if (options.controlled && !error) writeFileSync(path.join(workDir, file), content)
    result(use('Write', { file_path: path.join(workDir, file), content }), error ? 'Write failed' : 'File updated successfully', error)
  }
  const initialize = () => { for (const file of ['01-low-fidelity.html', '02-mid-fidelity.html', '03-high-fidelity.html']) write(file) }
  const render = (pass: string, options: { error?: boolean; read?: boolean; batch?: boolean; noReceipt?: boolean; onlyDesktop?: boolean } = {}) => {
    const names = viewports.map((v, i) => 'high-' + (pass === 'canonical' ? labels[i] : pass) + '-' + v + '.png')
    const command = (i: number) => '"$CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE" --headless=new --window-size=' + viewports[i]!.replace('x', ',') + ' "--screenshot=C:/prototype/imgs/qa/' + names[i] + '" "file:///C:/prototype/03-high-fidelity.html"'
    if (options.batch) {
      const toolId = use('Bash', { command: names.map((_, i) => command(i)).join('; ') })
      result(toolId, options.noReceipt ? 'done' : names.filter((_, i) => !options.onlyDesktop || i === 0).map(n => '1234 bytes written to file C:/prototype/imgs/qa/' + n).join('\n'), options.error)
    } else {
      names.forEach((n, i) => result(use('Bash', { command: command(i) }), options.noReceipt ? 'done' : 'Screenshot written: C:/prototype/imgs/qa/' + n, options.error))
    }
    if (options.read !== false) names.forEach(n => result(use('Read', { file_path: 'C:/prototype/imgs/qa/' + n }), image))
    return names
  }
  const finish = async (text = receipt) => {
    emit({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
    emit({ type: 'result', is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })
    for (let i = 0; i < 100; i++) {
      if (sendMessage.mock.calls.length || sent.some(s => /message_complete|PROTOTYPE_VISUAL_/.test(s))) break
      await Bun.sleep(5)
    }
    return sent.map(s => JSON.parse(s))
  }
  return { id, workDir, emit, use, result, write, initialize, render, finish, sendMessage, sent }
}

afterEach(() => {
  for (const id of activeIds.splice(0)) conversationService.stopSession(id)
  __resetWebSocketHandlerStateForTests()
  mock.restore()
  for (const dir of fixtureDirs.splice(0)) {
    if (path.dirname(dir) !== path.resolve(tmpdir()) || !path.basename(dir).startsWith('prototype-gate-')) throw new Error('Unsafe test cleanup')
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('prototype visual QA real-session regressions', () => {
  it('accepts first/final batch screenshots and a successful evidence-file receipt without repeating it in chat', async () => {
    const run = setup()
    run.initialize()
    run.render('first', { batch: true })
    run.write('03-high-fidelity.html', '<main>revised layout</main>')
    run.render('final', { batch: true })
    run.write('prototype-evidence.md', receipt)
    const messages = await run.finish('已保存三档 HTML 和视觉检查记录。')
    expect(run.sendMessage).not.toHaveBeenCalled()
    expect(messages.some(m => m.type === 'message_complete')).toBe(true)
  })

  it('accepts the Chinese 首轮问题 receipt after a real revision and canonical screenshots', async () => {
    const run = setup()
    run.initialize()
    run.render('canonical')
    run.write('03-high-fidelity.html', '<main>revised</main>')
    run.render('canonical')
    expect((await run.finish()).some(m => m.type === 'message_complete')).toBe(true)
    expect(run.sendMessage).not.toHaveBeenCalled()
  })

  it('does not accept a failed HTML revision or a Markdown mention as a revision', async () => {
    const run = setup()
    run.initialize()
    run.render('canonical')
    run.write('03-high-fidelity.html', '<main>failed revision</main>', true)
    run.write('notes.md', 'I updated 03-high-fidelity.html today.')
    run.render('canonical')
    await run.finish(receipt.replace('首轮问题', '首版问题'))
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('03-high-fidelity.html was not revised')
  })

  it('does not accept a failed evidence-file Write', async () => {
    const run = setup()
    run.initialize(); run.render('canonical')
    run.write('03-high-fidelity.html', '<main>revised</main>'); run.render('canonical')
    run.write('prototype-evidence.md', receipt, true)
    await run.finish('已完成。')
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('receipt is incomplete')
  })

  it('does not count successful shell exit without screenshot output as viewport evidence', async () => {
    const run = setup()
    run.initialize(); run.render('canonical')
    run.write('03-high-fidelity.html', '<main>revised</main>')
    run.render('canonical', { noReceipt: true })
    await run.finish(receipt.replace('首轮问题', '首版问题'))
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('<prototype-visual-render-qa-recovery>')
  })

  it('requires actual successful outputs for every viewport in a batch', async () => {
    const run = setup()
    run.initialize(); run.render('first', { batch: true })
    run.write('03-high-fidelity.html', '<main>revised</main>')
    run.render('final', { batch: true, onlyDesktop: true })
    await run.finish()
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('<prototype-visual-render-qa-recovery>')
  })

  it('does not attach stale Read results to a newer HTML revision', async () => {
    const run = setup()
    run.initialize(); run.render('canonical')
    const pending = run.use('Read', { file_path: 'C:/prototype/imgs/qa/high-desktop-1440x1000.png' })
    run.write('03-high-fidelity.html', '<main>revised</main>')
    run.render('canonical', { read: false })
    for (const name of ['high-tablet-1024x900.png', 'high-mobile-390x844.png']) {
      run.result(run.use('Read', { file_path: 'C:/prototype/imgs/qa/' + name }), image)
    }
    run.result(pending, image)
    await run.finish()
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('<prototype-visual-render-qa-recovery>')
  })

  it('asks only for the missing receipt and does not misreport completed HTML revision as missing', async () => {
    const run = setup()
    run.initialize(); run.render('canonical')
    run.write('03-high-fidelity.html', '<main>revised</main>'); run.render('canonical')
    await run.finish('已生成，尚未写审查回执。')
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('receipt')
    expect(run.sendMessage.mock.calls[0]?.[1]).not.toContain('Modify 03-high-fidelity.html')
    run.sendMessage.mockClear()
    const messages = await run.finish('暂未补齐。')
    expect(messages.find(m => m.code === 'PROTOTYPE_VISUAL_REVIEW_REQUIRED')?.message).toContain('回执')
    expect(messages.find(m => m.code === 'PROTOTYPE_VISUAL_REVIEW_REQUIRED')?.message).not.toContain('没有在首版截图后完成真实 HTML 修订')
  })
  it('requires a PNG image payload rather than a successful text-only Read', async () => {
    const run = setup()
    run.initialize(); run.render('canonical')
    run.write('03-high-fidelity.html', '<main>revised</main>')
    const names = run.render('final', { read: false })
    for (const name of names) run.result(run.use('Read', { file_path: 'C:/prototype/imgs/qa/' + name }), 'image saved')
    await run.finish()
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('<prototype-visual-render-qa-recovery>')
  })

  it('does not reuse a receipt from before the latest HTML revision', async () => {
    const run = setup()
    run.initialize(); run.render('canonical')
    run.write('prototype-evidence.md', receipt)
    run.emit({ type: 'assistant', message: { content: [{ type: 'text', text: receipt }] } })
    run.write('03-high-fidelity.html', '<main>revised</main>'); run.render('final')
    await run.finish('新一版尚未写回执。')
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('Only the review receipt is missing')
  })

  it('does not pair first-render images with different final-render output paths', async () => {
    const run = setup()
    run.initialize(); run.render('canonical')
    run.write('03-high-fidelity.html', '<main>revised</main>'); run.render('final', { read: false })
    for (const size of viewports) run.result(run.use('Read', { file_path: 'C:/prototype/imgs/qa/high-first-' + size + '.png' }), image)
    await run.finish()
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('<prototype-visual-render-qa-recovery>')
  })

  it('keeps the revision requirement even when all screenshots and the receipt exist', async () => {
    const run = setup()
    run.initialize(); run.render('final', { batch: true })
    run.write('prototype-evidence.md', receipt)
    await run.finish('完成。')
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('03-high-fidelity.html was not revised')
  })

  it('accepts a successful Edit as a real revision', async () => {
    const run = setup()
    run.initialize(); run.render('first')
    run.result(run.use('Edit', { file_path: 'C:/prototype/03-high-fidelity.html', old_string: 'original', new_string: 'revised' }), 'Successfully edited')
    run.render('final')
    expect((await run.finish()).some(m => m.type === 'message_complete')).toBe(true)
  })

  it('accepts explicit successful shell HTML writes without mistaking report content for paths', async () => {
    const run = setup()
    run.initialize(); run.render('first')
    run.result(run.use('Bash', { command: 'Set-Content -LiteralPath "C:/prototype/03-high-fidelity.html" -Value "<main>revised</main>"' }), 'done')
    run.render('final')
    expect((await run.finish()).some(m => m.type === 'message_complete')).toBe(true)
  })

  it('does not turn duplicate Write results into a post-review revision', async () => {
    const run = setup()
    run.write('01-low-fidelity.html'); run.write('02-mid-fidelity.html')
    const writeId = run.use('Write', { file_path: 'C:/prototype/03-high-fidelity.html', content: '<main>original</main>' })
    run.result(writeId, 'written'); run.render('first')
    run.result(writeId, 'written'); run.render('final')
    await run.finish()
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('03-high-fidelity.html was not revised')
  })

  it('does not count a failed render or an output for a different screenshot path', async () => {
    const run = setup()
    run.initialize(); run.render('first')
    run.write('03-high-fidelity.html', '<main>revised</main>')
    run.render('final', { error: true })
    run.result(run.use('Bash', { command: '"$CC_JIANGXIA_VISUAL_QA_BROWSER_EXECUTABLE" --headless --window-size=1440,1000 --screenshot=C:/prototype/imgs/qa/high-final-1440x1000.png file:///C:/prototype/03-high-fidelity.html' }), 'Screenshot written: C:/other/high-final-1440x1000.png')
    await run.finish()
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('<prototype-visual-render-qa-recovery>')
  })

  it.each([
    'python -c "from pathlib import Path; source = Path(\'C:/prototype/03-high-fidelity.html\').read_text(); Path(\'C:/prototype/notes.md\').write_text(source)"',
    'python -c "source = open(\'C:/prototype/03-high-fidelity.html\', \'r\').read(); open(\'C:/prototype/notes.md\', \'w\').write(source)"',
  ])('does not count an HTML read followed by a Markdown write as a revision: %s', async command => {
    const run = setup()
    run.initialize(); run.render('first')
    run.result(run.use('Bash', { command }), 'done')
    run.render('final')
    await run.finish()
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('03-high-fidelity.html was not revised')
  })

  it('delivers completion over a real local WebSocket after the corrected evidence sequence', async () => {
    const run = setup()
    const received: Array<{ type: string; code?: string }> = []
    const server = Bun.serve<WebSocketData>({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request, server) {
        if (server.upgrade(request, { data: {
          sessionId: run.id, channel: 'client', connectedAt: Date.now(), sdkToken: null,
          serverPort: server.port ?? 0, serverHost: '127.0.0.1',
        } })) return undefined
        return new Response('WebSocket required', { status: 400 })
      },
      websocket: handleWebSocket,
    })
    const client = new WebSocket('ws://127.0.0.1:' + server.port)
    client.onmessage = event => received.push(JSON.parse(String(event.data)))
    try {
      await new Promise<void>((resolve, reject) => {
        client.onopen = () => resolve()
        client.onerror = () => reject(new Error('Isolated WebSocket failed to connect'))
      })
      run.initialize()
      run.render('first', { batch: true })
      run.write('03-high-fidelity.html', '<main>revised</main>')
      run.render('final', { batch: true })
      run.write('prototype-evidence.md', receipt)
      await run.finish('三档 HTML 已保存。')
      for (let i = 0; i < 100 && !received.some(message => message.type === 'message_complete'); i++) await Bun.sleep(5)
      expect(received.some(message => message.type === 'message_complete')).toBe(true)
      expect(received.some(message => message.code?.startsWith('PROTOTYPE_VISUAL_'))).toBe(false)
      expect(run.sendMessage).not.toHaveBeenCalled()
    } finally {
      client.close()
      server.stop(true)
    }
  })

})

// These are host-protocol fixtures, not claims about generated UI quality.
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
function controlledPreview(run: ReturnType<typeof setup>, options: { read?: boolean; issues?: string[]; staleImage?: boolean } = {}) {
  const runId = crypto.randomUUID()
  const dir = path.join(run.workDir, 'imgs/qa', runId)
  mkdirSync(dir, { recursive: true })
  const shots = viewports.map((size, i) => {
    const [width, height] = size.split('x').map(Number) as [number, number]
    const bytes = Buffer.from('host screenshot fixture ' + runId + size)
    const file = path.join(dir, 'high-' + labels[i] + '-' + size + '.png')
    writeFileSync(file, bytes)
    return { path: file, sha256: hash(bytes), viewport: labels[i] as 'desktop' | 'tablet' | 'mobile', width, height, innerWidth: width, innerHeight: height, issues: i === 2 ? options.issues || [] : [] }
  })
  const source = path.join(run.workDir, '03-high-fidelity.html')
  const evidence: PrototypePreviewReceipt = { schemaVersion: 1, runId, fidelity: 'high', source: { path: source, sha256: hash(readFileSync(source)) }, screenshots: shots, blockedResources: [], status: options.issues?.length ? 'needs-work' : 'rendered', evidenceBoundary: 'render-and-layout-only-not-visual-or-interaction-acceptance' }
  run.result(run.use('PrototypePreview', { fidelity: 'high' }), formatPrototypePreviewReceipt(evidence))
  if (options.read !== false) for (const shot of shots) {
    run.result(run.use('Read', { file_path: shot.path }), [{ type: 'image', source: { type: 'base64', data: options.staleImage ? 'AA==' : readFileSync(shot.path).toString('base64') } }])
  }
  return evidence
}

describe('PrototypePreview structured receipt terminal gate', () => {
  it('accepts completed first/revised renders and exact image reads without any shell stdout', async () => {
    const run = setup({ controlled: true })
    run.initialize(); controlledPreview(run)
    run.write('03-high-fidelity.html', '<main>final revision</main>'); controlledPreview(run)
    const messages = await run.finish(receipt)
    expect(run.sendMessage).not.toHaveBeenCalled()
    expect(messages.some(m => m.type === 'message_complete')).toBe(true)
  })
  it('rejects a matching path carrying stale image bytes and tells the user what is missing', async () => {
    const run = setup({ controlled: true })
    run.initialize(); controlledPreview(run)
    run.write('03-high-fidelity.html', '<main>final</main>'); controlledPreview(run, { staleImage: true })
    await run.finish(receipt)
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('匹配哈希')
  })
  it('does not let a passing prose receipt override measured mobile clipping', async () => {
    const run = setup({ controlled: true })
    run.initialize(); controlledPreview(run)
    run.write('03-high-fidelity.html', '<main>final</main>'); controlledPreview(run, { issues: ['h1: horizontally clipped'] })
    await run.finish(receipt)
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('mobile: h1: horizontally clipped')
    expect(run.sendMessage.mock.calls[0]?.[1]).not.toContain('Immediately use Bash')
  })
  it('rechecks final HTML even when a delayed or variable-based shell write escaped command parsing', async () => {
    const run = setup({ controlled: true })
    run.initialize(); controlledPreview(run)
    run.write('03-high-fidelity.html', '<main>final</main>'); controlledPreview(run)
    writeFileSync(path.join(run.workDir, '03-high-fidelity.html'), '<main>changed after screenshots</main>')
    await run.finish(receipt)
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('内容已变化')
  })
  it('rejects legacy renderer text for a pack that requires the controlled tool', async () => {
    const run = setup({ controlled: true })
    run.initialize(); run.render('first'); run.write('03-high-fidelity.html', '<main>final</main>'); run.render('final')
    await run.finish(receipt)
    expect(run.sendMessage.mock.calls[0]?.[1]).toContain('尚未登记当前 HTML 的 PrototypePreview 回执')
  })
})
