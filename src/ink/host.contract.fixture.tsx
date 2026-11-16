import type { Cursor } from './cursor.js'
const cursor: Cursor = { x: 0, y: 1, visible: true }
const valid = <ink-box tabIndex={1}><ink-text>text</ink-text><ink-link href="https://example.com">link</ink-link></ink-box>
// @ts-expect-error Host tags must reject unknown properties.
const invalid = <ink-box randomUnknownProperty="value" />
// @ts-expect-error Raw ANSI is a concrete render payload.
const incomplete = <ink-raw-ansi rawText="text" />
void [cursor, valid, invalid, incomplete]
