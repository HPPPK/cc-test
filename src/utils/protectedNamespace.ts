/** Namespace allowlist decisions require the unavailable internal implementation. */
export function isProtectedNamespaceDetectionAvailable(): false { return false }
export function checkProtectedNamespace(): boolean {
  throw new Error('Internal protected-namespace detection is unavailable in this build; no namespace safety decision can be inferred')
}
