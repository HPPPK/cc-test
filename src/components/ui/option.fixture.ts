import type { Option } from './option.js'
const option: Option<number> = { label: 'One', value: 1 }
// @ts-expect-error generic option values retain their actual value type
const invalid: Option<number> = { label: 'One', value: 'one' }
void [option, invalid]
