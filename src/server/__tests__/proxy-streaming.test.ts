/**
 * Unit tests for proxy streaming SSE transformation
 */

import { describe, test, expect } from 'bun:test'
import { withStreamIdleTimeout } from '../proxy/handler.js'
import { openaiChatStreamToAnthropic } from '../proxy/streaming/openaiChatStreamToAnthropic.js'
import { openaiResponsesStreamToAnthropic } from '../proxy/streaming/openaiResponsesStreamToAnthropic.js'

// ─── Helpers ────────────────────────────────────────────────────

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

async function collectSse(stream: ReadableStream<Uint8Array>): Promise<Array<{ event: string; data: Record<string, unknown> }>> {
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }

  const events: Array<{ event: string; data: Record<string, unknown> }> = []
  const blocks = text.split('\n\n').filter(Boolean)
  for (const block of blocks) {
    const lines = block.split('\n')
    let event = ''
    let data = ''
    for (const line of lines) {
      if (line.startsWith('event: ')) event = line.slice(7)
      if (line.startsWith('data: ')) data = line.slice(6)
    }
    if (event && data) {
      try {
        events.push({ event, data: JSON.parse(data) })
      } catch {
        // skip unparseable
      }
    }
  }
  return events
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── OpenAI Chat Completions SSE → Anthropic SSE ───────────────

describe('withStreamIdleTimeout', () => {
  test('passes through chunks when the stream stays active', async () => {
    const encoder = new TextEncoder()
    const upstream = new ReadableStream<Uint8Array>({
      async start(controller) {
        await delay(2)
        controller.enqueue(encoder.encode('a'))
        await delay(2)
        controller.enqueue(encoder.encode('b'))
        controller.close()
      },
    })

    const reader = withStreamIdleTimeout(upstream, 50).getReader()
    const first = await reader.read()
    const second = await reader.read()
    const done = await reader.read()

    expect(new TextDecoder().decode(first.value)).toBe('a')
    expect(new TextDecoder().decode(second.value)).toBe('b')
    expect(done.done).toBe(true)
  })

  test('fails when upstream stream is idle for too long', async () => {
    let canceled = false
    const upstream = new ReadableStream<Uint8Array>({
      cancel() {
        canceled = true
      },
    })

    const reader = withStreamIdleTimeout(upstream, 5).getReader()

    await expect(reader.read()).rejects.toThrow('Upstream stream idle timeout')
    expect(canceled).toBe(true)
  })
})

describe('openaiChatStreamToAnthropic', () => {
  test('basic text streaming', async () => {
    const sseChunks = [
      'data: {"id":"c1","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
      'data: {"id":"c1","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"id":"c1","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
      'data: {"id":"c1","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]

    const upstream = makeStream(sseChunks)
    const anthropicStream = openaiChatStreamToAnthropic(upstream, 'gpt-4')
    const events = await collectSse(anthropicStream)

    // Should have: message_start, content_block_start, content_block_delta x2, message_delta, content_block_stop, message_stop
    const eventTypes = events.map((e) => e.event)
    expect(eventTypes[0]).toBe('message_start')
    expect(eventTypes).toContain('content_block_start')
    expect(eventTypes).toContain('content_block_delta')
    expect(eventTypes).toContain('message_delta')
    expect(eventTypes).toContain('message_stop')

    // Check message_start
    const msgStart = events.find((e) => e.event === 'message_start')!
    expect((msgStart.data.message as Record<string, unknown>).model).toBe('gpt-4')
    expect((msgStart.data.message as Record<string, unknown>).role).toBe('assistant')

    // Check text deltas
    const textDeltas = events.filter((e) => e.event === 'content_block_delta')
    const texts = textDeltas.map((e) => (e.data.delta as Record<string, unknown>).text)
    expect(texts).toContain('Hello')
    expect(texts).toContain(' world')

    // Check stop reason
    const msgDelta = events.find((e) => e.event === 'message_delta')!
    expect((msgDelta.data.delta as Record<string, unknown>).stop_reason).toBe('end_turn')
  })

  test('tool call streaming', async () => {
    const sseChunks = [
      'data: {"id":"c2","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":null},"finish_reason":null}]}\n\n',
      'data: {"id":"c2","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_weather","arguments":""}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"c2","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"city\\""}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"c2","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"NYC\\"}"}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"c2","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ]

    const upstream = makeStream(sseChunks)
    const anthropicStream = openaiChatStreamToAnthropic(upstream, 'gpt-4')
    const events = await collectSse(anthropicStream)

    // Should have content_block_start with type tool_use
    const toolStart = events.find(
      (e) => e.event === 'content_block_start' && (e.data.content_block as Record<string, unknown>)?.type === 'tool_use',
    )
    expect(toolStart).toBeDefined()
    expect((toolStart!.data.content_block as Record<string, unknown>).name).toBe('get_weather')
    expect((toolStart!.data.content_block as Record<string, unknown>).id).toBe('call_1')

    // Should have input_json_delta
    const jsonDeltas = events.filter(
      (e) => e.event === 'content_block_delta' && (e.data.delta as Record<string, unknown>)?.type === 'input_json_delta',
    )
    expect(jsonDeltas.length).toBeGreaterThan(0)

    // Stop reason should be tool_use
    const msgDelta = events.find((e) => e.event === 'message_delta')!
    expect((msgDelta.data.delta as Record<string, unknown>).stop_reason).toBe('tool_use')
  })

  test('tool call streaming preserves object arguments from local proxies', async () => {
    const sseChunks = [
      'data: {"id":"c-write","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_write","type":"function","function":{"name":"Write","arguments":{"file_path":"/tmp/issue-288.txt","content":"ok"}}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"c-write","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ]

    const events = await collectSse(openaiChatStreamToAnthropic(makeStream(sseChunks), 'gpt-4'))
    const jsonDeltas = events.filter(
      (e) => e.event === 'content_block_delta' && (e.data.delta as Record<string, unknown>)?.type === 'input_json_delta',
    )
    expect(jsonDeltas).toHaveLength(1)
    expect((jsonDeltas[0].data.delta as Record<string, unknown>).partial_json).toBe(
      '{"file_path":"/tmp/issue-288.txt","content":"ok"}',
    )

    const blockStops = events.filter((e) => e.event === 'content_block_stop')
    expect(blockStops).toHaveLength(1)
    expect(blockStops[0].data.index).toBe(0)
  })

  test('empty stream (just DONE)', async () => {
    const upstream = makeStream(['data: [DONE]\n\n'])
    const anthropicStream = openaiChatStreamToAnthropic(upstream, 'gpt-4')
    const events = await collectSse(anthropicStream)
    // Should at least have message_stop
    expect(events.some((e) => e.event === 'message_stop')).toBe(true)
  })

  test('event ordering: content_block_stop before message_delta', async () => {
    const sseChunks = [
      'data: {"id":"c3","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
      'data: {"id":"c3","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}\n\n',
      'data: {"id":"c3","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]

    const upstream = makeStream(sseChunks)
    const events = await collectSse(openaiChatStreamToAnthropic(upstream, 'gpt-4'))
    const types = events.map((e) => e.event)

    // content_block_stop MUST appear before message_delta
    const stopIdx = types.indexOf('content_block_stop')
    const deltaIdx = types.indexOf('message_delta')
    expect(stopIdx).toBeGreaterThan(-1)
    expect(deltaIdx).toBeGreaterThan(-1)
    expect(stopIdx).toBeLessThan(deltaIdx)

    // message_delta before message_stop
    const msgStopIdx = types.indexOf('message_stop')
    expect(deltaIdx).toBeLessThan(msgStopIdx)
  })

  test('reasoning_content (DeepSeek, OpenRouter, XAI)', async () => {
    const sseChunks = [
      'data: {"id":"c4","object":"chat.completion.chunk","created":0,"model":"deepseek-chat","choices":[{"index":0,"delta":{"role":"assistant","content":"","reasoning_content":"Let me think"},"finish_reason":null}]}\n\n',
      'data: {"id":"c4","object":"chat.completion.chunk","created":0,"model":"deepseek-chat","choices":[{"index":0,"delta":{"reasoning_content":" about this..."},"finish_reason":null}]}\n\n',
      'data: {"id":"c4","object":"chat.completion.chunk","created":0,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"Hello!"},"finish_reason":null}]}\n\n',
      'data: {"id":"c4","object":"chat.completion.chunk","created":0,"model":"deepseek-chat","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]

    const upstream = makeStream(sseChunks)
    const events = await collectSse(openaiChatStreamToAnthropic(upstream, 'deepseek-chat'))

    // Should have thinking block
    const thinkingStart = events.find(
      (e) => e.event === 'content_block_start' && (e.data.content_block as Record<string, unknown>)?.type === 'thinking',
    )
    expect(thinkingStart).toBeDefined()

    // Should have thinking deltas
    const thinkingDeltas = events.filter(
      (e) => e.event === 'content_block_delta' && (e.data.delta as Record<string, unknown>)?.type === 'thinking_delta',
    )
    expect(thinkingDeltas.length).toBeGreaterThan(0)

    // Should have text block after thinking
    const textStart = events.find(
      (e) => e.event === 'content_block_start' && (e.data.content_block as Record<string, unknown>)?.type === 'text',
    )
    expect(textStart).toBeDefined()

    // Text should come after thinking in index order
    expect((textStart!.data as Record<string, unknown>).index).toBeGreaterThan(
      (thinkingStart!.data as Record<string, unknown>).index as number,
    )
  })

  test('moves a DeepSeek-style internal execution monologue out of visible streamed text', async () => {
    const sseChunks = [
      'data: {"id":"c-process","object":"chat.completion.chunk","created":0,"model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"role":"assistant","content":"Let me "},"finish_reason":null}]}\n\n',
      'data: {"id":"c-process","object":"chat.completion.chunk","created":0,"model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"content":"check the Playwright audit records and reconcile"},"finish_reason":null}]}\n\n',
      'data: {"id":"c-process","object":"chat.completion.chunk","created":0,"model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"content":" the researcher Markdown before I report the result."},"finish_reason":null}]}\n\n',
      'data: {"id":"c-process","object":"chat.completion.chunk","created":0,"model":"deepseek-v4-flash","choices":[{"index":0,"delta":{"content":"\\n\\n暂时收敛：真实来源已经保留，正在继续补齐审计回执。"},"finish_reason":null}]}\n\n',
      'data: {"id":"c-process","object":"chat.completion.chunk","created":0,"model":"deepseek-v4-flash","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]

    const events = await collectSse(openaiChatStreamToAnthropic(makeStream(sseChunks), 'deepseek-v4-flash'))
    const thinking = events
      .filter((event) => event.event === 'content_block_delta' && (event.data.delta as Record<string, unknown>)?.type === 'thinking_delta')
      .map((event) => (event.data.delta as Record<string, unknown>).thinking)
      .join('')
    const visible = events
      .filter((event) => event.event === 'content_block_delta' && (event.data.delta as Record<string, unknown>)?.type === 'text_delta')
      .map((event) => (event.data.delta as Record<string, unknown>).text)
      .join('')

    expect(thinking).toContain('Let me check the Playwright audit records')
    expect(thinking).toContain('before I report the result.')
    expect(visible).toContain('暂时收敛')
    expect(visible).not.toContain('Let me check')
  })

  test('reasoning field (GLM-5, Cerebras, Groq)', async () => {
    const sseChunks = [
      'data: {"id":"c5","object":"chat.completion.chunk","created":0,"model":"glm-5","choices":[{"index":0,"delta":{"role":"assistant","reasoning":"Thinking here"},"finish_reason":null}]}\n\n',
      'data: {"id":"c5","object":"chat.completion.chunk","created":0,"model":"glm-5","choices":[{"index":0,"delta":{"content":"Result"},"finish_reason":null}]}\n\n',
      'data: {"id":"c5","object":"chat.completion.chunk","created":0,"model":"glm-5","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]

    const upstream = makeStream(sseChunks)
    const events = await collectSse(openaiChatStreamToAnthropic(upstream, 'glm-5'))

    // Should produce thinking delta from "reasoning" field
    const thinkingDeltas = events.filter(
      (e) => e.event === 'content_block_delta' && (e.data.delta as Record<string, unknown>)?.type === 'thinking_delta',
    )
    expect(thinkingDeltas.length).toBe(1)
    expect((thinkingDeltas[0].data.delta as Record<string, unknown>).thinking).toBe('Thinking here')
  })

  test('thinking_blocks (OpenAI o-series)', async () => {
    const sseChunks = [
      'data: {"id":"c6","object":"chat.completion.chunk","created":0,"model":"o3","choices":[{"index":0,"delta":{"role":"assistant","thinking_blocks":[{"type":"thinking","thinking":"Deep thought"}]},"finish_reason":null}]}\n\n',
      'data: {"id":"c6","object":"chat.completion.chunk","created":0,"model":"o3","choices":[{"index":0,"delta":{"content":"Answer"},"finish_reason":null}]}\n\n',
      'data: {"id":"c6","object":"chat.completion.chunk","created":0,"model":"o3","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]

    const upstream = makeStream(sseChunks)
    const events = await collectSse(openaiChatStreamToAnthropic(upstream, 'o3'))

    const thinkingDeltas = events.filter(
      (e) => e.event === 'content_block_delta' && (e.data.delta as Record<string, unknown>)?.type === 'thinking_delta',
    )
    expect(thinkingDeltas.length).toBe(1)
    expect((thinkingDeltas[0].data.delta as Record<string, unknown>).thinking).toBe('Deep thought')
  })

  test('text + tool transition closes text block first', async () => {
    const sseChunks = [
      'data: {"id":"c7","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"Let me search"},"finish_reason":null}]}\n\n',
      'data: {"id":"c7","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_x","type":"function","function":{"name":"search","arguments":"{\\"q\\":\\"test\\"}"}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"c7","object":"chat.completion.chunk","created":0,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ]

    const upstream = makeStream(sseChunks)
    const events = await collectSse(openaiChatStreamToAnthropic(upstream, 'gpt-4'))
    const types = events.map((e) => e.event)

    // Should see: text block start, text delta, text block stop, tool block start, ...
    const firstBlockStop = types.indexOf('content_block_stop')
    const toolBlockStart = types.findIndex(
      (_, i) => events[i].event === 'content_block_start' && (events[i].data.content_block as Record<string, unknown>)?.type === 'tool_use',
    )
    expect(firstBlockStop).toBeLessThan(toolBlockStart)
  })
})

// ─── OpenAI Responses SSE → Anthropic SSE ──────────────────────

describe('openaiResponsesStreamToAnthropic', () => {
  const responseEvent = (event: string, data: Record<string, unknown>) =>
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

  for (const [label, deltas] of [
    ['done-only', []],
    ['partial delta', ['{"file_path":']],
    ['complete deltas', ['{"file_path":', '"/tmp/student.json"}']],
  ] as const) {
    test(`preserves finalized Read arguments with ${label}`, async () => {
      const args = '{"file_path":"/tmp/student.json"}'
      const events = await collectSse(openaiResponsesStreamToAnthropic(makeStream([
        responseEvent('response.output_item.added', {
          output_index: 0, item: { type: 'function_call', id: 'fc_read', call_id: 'call_read', name: 'Read' },
        }),
        ...deltas.map(delta => responseEvent('response.function_call_arguments.delta', { item_id: 'fc_read', delta })),
        responseEvent('response.function_call_arguments.done', { item_id: 'fc_read', arguments: args }),
      ]), 'test-model'))
      const json = events.filter(e => e.event === 'content_block_delta')
        .map(e => (e.data.delta as Record<string, unknown>).partial_json).join('')
      expect(json).toBe(args)
      expect(JSON.parse(json)).toEqual({ file_path: '/tmp/student.json' })
      expect(events.at(-1)?.event).toBe('content_block_stop')
    })
  }

  test('isolates interleaved calls and text and ignores events after arguments finish', async () => {
    const events = await collectSse(openaiResponsesStreamToAnthropic(makeStream([
      responseEvent('response.output_item.added', { item: { type: 'function_call', id: 'a', name: 'Read' } }),
      responseEvent('response.content_part.added', { output_index: 1, content_index: 0, part: { type: 'output_text' } }),
      responseEvent('response.output_item.added', { item: { type: 'function_call', id: 'b', name: 'Read' } }),
      responseEvent('response.function_call_arguments.delta', { item_id: 'a', delta: '{"file_path":' }),
      responseEvent('response.output_text.delta', { output_index: 1, content_index: 0, delta: 'Reading files' }),
      responseEvent('response.function_call_arguments.done', { item_id: 'b', arguments: '{"file_path":"b"}' }),
      responseEvent('response.function_call_arguments.done', { item_id: 'a', arguments: '{"file_path":"a"}' }),
      responseEvent('response.function_call_arguments.done', { item_id: 'a', arguments: '{"file_path":"a"}' }),
      responseEvent('response.function_call_arguments.delta', { item_id: 'a', delta: 'ignored' }),
    ]), 'test-model'))
    for (const [index, expected] of [[0, '{"file_path":"a"}'], [2, '{"file_path":"b"}']] as const) {
      expect(events.filter(e => e.event === 'content_block_delta' && e.data.index === index)
        .map(e => (e.data.delta as Record<string, unknown>).partial_json).join('')).toBe(expected)
      expect(events.filter(e => e.event === 'content_block_stop' && e.data.index === index)).toHaveLength(1)
    }
    expect(events.find(e => e.data.index === 1 && e.event === 'content_block_delta')?.data.delta)
      .toEqual({ type: 'text_delta', text: 'Reading files' })
  })

  test('rejects conflicting final arguments instead of mixing different tool inputs', async () => {
    const stream = openaiResponsesStreamToAnthropic(makeStream([
      responseEvent('response.output_item.added', { item: { type: 'function_call', id: 'a', name: 'Read' } }),
      responseEvent('response.function_call_arguments.delta', { item_id: 'a', delta: '{"file_path":"a"}' }),
      responseEvent('response.function_call_arguments.done', { item_id: 'a', arguments: '{"file_path":"b"}' }),
    ]), 'test-model')
    await expect(collectSse(stream)).rejects.toThrow('Conflicting finalized function-call arguments')
  })

  test('accepts semantically identical finalized JSON without repeating complete arguments', async () => {
    const emitted = '{"file_path":"a","offset":1.0}'
    const events = await collectSse(openaiResponsesStreamToAnthropic(makeStream([
      responseEvent('response.output_item.added', { item: { type: 'function_call', id: 'a', name: 'Read' } }),
      responseEvent('response.function_call_arguments.delta', { item_id: 'a', delta: emitted }),
      responseEvent('response.function_call_arguments.done', { item_id: 'a', arguments: ' { "offset": 1, "file_path": "a" } ' }),
    ]), 'test-model'))
    expect(events.filter(e => e.event === 'content_block_delta')
      .map(e => (e.data.delta as Record<string, unknown>).partial_json).join('')).toBe(emitted)
    expect(events.filter(e => e.event === 'content_block_stop')).toHaveLength(1)
  })

  test('rejects incompatible partial JSON even when the final arguments are valid', async () => {
    const stream = openaiResponsesStreamToAnthropic(makeStream([
      responseEvent('response.output_item.added', { item: { type: 'function_call', id: 'a', name: 'Read' } }),
      responseEvent('response.function_call_arguments.delta', { item_id: 'a', delta: '{"file_path":"a' }),
      responseEvent('response.function_call_arguments.done', { item_id: 'a', arguments: '{ "file_path": "a" }' }),
    ]), 'test-model')
    await expect(collectSse(stream)).rejects.toThrow('Conflicting finalized function-call arguments')
  })

  test('keeps legacy done events without arguments compatible with complete deltas', async () => {
    const events = await collectSse(openaiResponsesStreamToAnthropic(makeStream([
      responseEvent('response.output_item.added', { item: { type: 'function_call', id: 'a', name: 'Read' } }),
      responseEvent('response.function_call_arguments.delta', { item_id: 'a', delta: '{"file_path":"a"}' }),
      responseEvent('response.function_call_arguments.done', { item_id: 'a' }),
    ]), 'test-model'))
    expect(events.filter(e => e.event === 'content_block_delta')
      .map(e => (e.data.delta as Record<string, unknown>).partial_json).join('')).toBe('{"file_path":"a"}')
    expect(events.filter(e => e.event === 'content_block_stop')).toHaveLength(1)
  })

  test('basic text streaming', async () => {
    const sseChunks = [
      'event: response.created\ndata: {"id":"r1","model":"gpt-4o","status":"in_progress"}\n\n',
      'event: response.output_item.added\ndata: {"output_index":0,"item":{"type":"message","role":"assistant"}}\n\n',
      'event: response.content_part.added\ndata: {"output_index":0,"content_index":0,"part":{"type":"output_text","text":""}}\n\n',
      'event: response.output_text.delta\ndata: {"output_index":0,"content_index":0,"delta":"Hello"}\n\n',
      'event: response.output_text.delta\ndata: {"output_index":0,"content_index":0,"delta":" world"}\n\n',
      'event: response.output_text.done\ndata: {"output_index":0,"content_index":0,"text":"Hello world"}\n\n',
      'event: response.completed\ndata: {"response":{"id":"r1","model":"gpt-4o","status":"completed","usage":{"input_tokens":10,"output_tokens":5}}}\n\n',
    ]

    const upstream = makeStream(sseChunks)
    const anthropicStream = openaiResponsesStreamToAnthropic(upstream, 'gpt-4o')
    const events = await collectSse(anthropicStream)

    const eventTypes = events.map((e) => e.event)
    expect(eventTypes[0]).toBe('message_start')
    expect(eventTypes).toContain('content_block_start')
    expect(eventTypes).toContain('content_block_delta')
    expect(eventTypes).toContain('content_block_stop')
    expect(eventTypes).toContain('message_delta')
    expect(eventTypes).toContain('message_stop')

    // Check text deltas
    const textDeltas = events.filter((e) => e.event === 'content_block_delta')
    const texts = textDeltas.map((e) => (e.data.delta as Record<string, unknown>).text)
    expect(texts).toContain('Hello')
    expect(texts).toContain(' world')

    const msgDelta = events.find((e) => e.event === 'message_delta')!
    expect(msgDelta.data.usage).toEqual({
      input_tokens: 10,
      output_tokens: 5,
    })
  })

  test('function call streaming', async () => {
    const sseChunks = [
      'event: response.created\ndata: {"id":"r2","model":"gpt-4o","status":"in_progress"}\n\n',
      'event: response.output_item.added\ndata: {"output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"search"}}\n\n',
      'event: response.function_call_arguments.delta\ndata: {"item_id":"fc_1","delta":"{\\"q\\":"}\n\n',
      'event: response.function_call_arguments.delta\ndata: {"item_id":"fc_1","delta":"\\"test\\"}"}\n\n',
      'event: response.function_call_arguments.done\ndata: {"item_id":"fc_1","arguments":"{\\"q\\":\\"test\\"}"}\n\n',
      'event: response.completed\ndata: {"response":{"id":"r2","model":"gpt-4o","status":"completed","usage":{"input_tokens":10,"output_tokens":5}}}\n\n',
    ]

    const upstream = makeStream(sseChunks)
    const anthropicStream = openaiResponsesStreamToAnthropic(upstream, 'gpt-4o')
    const events = await collectSse(anthropicStream)

    // Should have tool_use content_block_start
    const toolStart = events.find(
      (e) => e.event === 'content_block_start' && (e.data.content_block as Record<string, unknown>)?.type === 'tool_use',
    )
    expect(toolStart).toBeDefined()
    expect((toolStart!.data.content_block as Record<string, unknown>).name).toBe('search')

    // Should have input_json_delta
    const jsonDeltas = events.filter(
      (e) => e.event === 'content_block_delta' && (e.data.delta as Record<string, unknown>)?.type === 'input_json_delta',
    )
    expect(jsonDeltas.length).toBeGreaterThan(0)

    // Stop reason should be tool_use
    const msgDelta = events.find((e) => e.event === 'message_delta')!
    expect((msgDelta.data.delta as Record<string, unknown>).stop_reason).toBe('tool_use')
  })
})
