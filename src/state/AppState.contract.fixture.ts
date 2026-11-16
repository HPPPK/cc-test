import { useAppState, useAppStateMaybeOutsideOfProvider } from './AppState.js'
const verbose: boolean = useAppState(state => state.verbose)
const maybeVerbose: boolean | undefined = useAppStateMaybeOutsideOfProvider(state => state.verbose)
// @ts-expect-error selected state slices preserve their real field types
const bad: number = useAppState(state => state.verbose)
// @ts-expect-error selectors cannot invent a state field
useAppState(state => state.nonexistentStateField)
void [verbose, maybeVerbose, bad]
