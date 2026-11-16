/** The public build does not include the assistant runtime or entitlement path. */
export function isKairosEnabled(): Promise<boolean> { return Promise.resolve(false) }
