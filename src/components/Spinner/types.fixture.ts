import type { SpinnerMode } from './types.js'
const responding: SpinnerMode = 'responding'
// @ts-expect-error arbitrary strings cannot change the spinner lifecycle
const invalid: SpinnerMode = 'invented'
void [responding, invalid]
