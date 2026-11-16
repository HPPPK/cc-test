/** Lifecycle states passed to the spinner by stream and tool execution events. */
export type SpinnerMode = 'requesting' | 'responding' | 'tool-use' | 'tool-input' | 'thinking'

export type RGBColor = { r: number, g: number, b: number }
