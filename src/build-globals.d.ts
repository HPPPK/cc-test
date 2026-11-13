/** Values installed by preload.ts for the CLI and desktop sidecar. */
declare const MACRO: {
  readonly VERSION: string
  readonly PACKAGE_URL: string
  readonly NATIVE_PACKAGE_URL: string
  readonly BUILD_TIME: string
  readonly FEEDBACK_CHANNEL: string
  readonly VERSION_CHANGELOG: string
  readonly ISSUES_EXPLAINER: string
}

/** Bun loads these resources as UTF-8 strings (`with { type: 'text' }`). */
declare module '*.md' {
  const text: string
  export default text
}

declare module '*.txt' {
  const text: string
  export default text
}
