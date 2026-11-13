/** Context surfaces declared by DEFAULT_BINDINGS, including feature-gated surfaces. */
export type KeybindingContextName =
  | 'Global' | 'Chat' | 'Autocomplete' | 'Settings' | 'Confirmation' | 'Tabs'
  | 'Transcript' | 'HistorySearch' | 'Task' | 'ThemePicker' | 'Scroll' | 'Help'
  | 'Attachments' | 'Footer' | 'MessageSelector' | 'MessageActions' | 'DiffDialog'
  | 'ModelPicker' | 'Select' | 'Plugin'

/** The user-config validator accepts action strings, including command:<custom-name>. */
export type KeybindingAction = string
export type ParsedKeystroke = {
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  super: boolean
}
export type Chord = ParsedKeystroke[]
export type KeybindingBlock = {
  context: KeybindingContextName
  bindings: Record<string, KeybindingAction | null>
}
export type ParsedBinding = { chord: Chord, action: KeybindingAction | null, context: KeybindingContextName }
