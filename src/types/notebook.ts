/** Notebook fields read, edited and serialized by the local notebook tools. */
export type NotebookCellType = 'code' | 'markdown' | 'raw'
export type NotebookOutputImage = { image_data: string, media_type: 'image/png' | 'image/jpeg' }
type MultilineText = string | string[]
export type NotebookCellOutput =
  | { output_type: 'stream', name?: string, text?: MultilineText }
  | { output_type: 'execute_result' | 'display_data', data?: Record<string, unknown> & { 'text/plain'?: MultilineText }, metadata?: Record<string, unknown>, execution_count?: number | null }
  | { output_type: 'error', ename: string, evalue: string, traceback: string[] }
export type NotebookCell = {
  cell_type: NotebookCellType
  id?: string
  source: MultilineText
  metadata: Record<string, unknown>
  execution_count?: number | null
  outputs?: NotebookCellOutput[]
}
export type NotebookContent = {
  nbformat: number
  nbformat_minor: number
  metadata: Record<string, unknown> & { language_info?: { name?: string } }
  cells: NotebookCell[]
}
export type NotebookCellSourceOutput = { output_type: NotebookCellOutput['output_type'], text?: string, image?: NotebookOutputImage }
export type NotebookCellSource = {
  cellType: NotebookCellType
  source: string
  cell_id: string
  execution_count?: number
  language?: string
  outputs?: NotebookCellSourceOutput[]
}
