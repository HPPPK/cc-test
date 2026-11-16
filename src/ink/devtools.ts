/** This source distribution does not include a React developer-tools connector. */
export function isInkDevtoolsAvailable(): false { return false }
export function connectInkDevtools(): never {
  throw new Error('Ink developer-tools connection is unavailable in this build')
}
