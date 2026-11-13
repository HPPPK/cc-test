import { expect, test } from 'bun:test'
import { flushOnDateChange, writeSessionTranscriptSegment } from './sessionTranscript.js'

test('internal per-day transcript exporter fails closed without writing', async () => {
  await expect(writeSessionTranscriptSegment([])).rejects.toThrow('unavailable')
  expect(() => flushOnDateChange([], '2026-01-01')).toThrow('unavailable')
})
