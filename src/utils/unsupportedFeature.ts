/** A build-disabled integration must never masquerade as a successful operation. */
export class UnsupportedFeatureError extends Error {
  constructor(readonly feature: string) {
    super(`${feature} is unavailable in this build`)
    this.name = 'UnsupportedFeatureError'
  }
}
export function unsupportedFeature(feature: string): never {
  throw new UnsupportedFeatureError(feature)
}
