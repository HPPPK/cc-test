import type { NotebookContent, NotebookCellSource } from './notebook.js'
import type { FileSuggestionCommandInput } from './fileSuggestion.js'
import type { StatusLineCommandInput } from './statusLine.js'
const notebook: NotebookContent = { nbformat: 4, nbformat_minor: 5, metadata: { language_info: { name: 'python' } }, cells: [{ cell_type: 'code', source: ['print(1)'], metadata: {}, execution_count: null, outputs: [{ output_type: 'stream', name: 'stdout', text: '1' }] }] }
const cell: NotebookCellSource = { cellType: 'code', cell_id: 'cell-0', source: 'print(1)' }
// @ts-expect-error notebook source is text, not arbitrary JSON
const invalidNotebook: NotebookContent = { nbformat: 4, nbformat_minor: 5, metadata: {}, cells: [{ cell_type: 'code', metadata: {}, source: 123 }] }
const suggestion: FileSuggestionCommandInput = { session_id: 's', transcript_path: '/transcript', cwd: '/project', query: 'src/' }
// @ts-expect-error suggestion query must be text
const invalidSuggestion: FileSuggestionCommandInput = { ...suggestion, query: 12 }
type Percentage = StatusLineCommandInput['context_window']['used_percentage']
const percentage: Percentage = null
const status: StatusLineCommandInput = { session_id: 's', transcript_path: '/transcript', cwd: '/project', model: { id: 'model', display_name: 'Model' }, workspace: { current_dir: '/project', project_dir: '/project', added_dirs: [] }, version: 'local', output_style: { name: 'default' }, cost: { total_cost_usd: 0, total_duration_ms: 0, total_api_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 }, context_window: { total_input_tokens: 0, total_output_tokens: 0, context_window_size: 200000, current_usage: null, used_percentage: null, remaining_percentage: null }, exceeds_200k_tokens: false }
// @ts-expect-error status percentages cannot contain labels
const invalidPercentage: Percentage = 'full'
void [notebook, cell, invalidNotebook, suggestion, invalidSuggestion, percentage, invalidPercentage, status]
