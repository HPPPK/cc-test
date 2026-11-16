import { expect, test } from 'bun:test'
import type { NotebookCellSource } from './notebook.js'
import { mapNotebookCellsToToolResult } from '../utils/notebook.js'

test('processed notebook cells retain text and supported image output contracts', () => {
  const cells: NotebookCellSource[] = [{ cellType: 'code', cell_id: 'cell-0', source: 'print(1)', language: 'python', outputs: [{ output_type: 'stream', text: '1' }, { output_type: 'display_data', image: { media_type: 'image/png', image_data: 'png' } }] }]
  expect(mapNotebookCellsToToolResult(cells, 'tool')).toMatchObject({ type: 'tool_result', tool_use_id: 'tool', content: [{ type: 'text' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'png' } }] })
})
