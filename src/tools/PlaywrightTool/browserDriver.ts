/** Process-level escape hatch for managed research only; never rewrites user settings. */
export function selectManagedChromium<T>(
  drivers: { playwright: T; patchright: T },
  env: NodeJS.ProcessEnv = process.env,
): T {
  const driver = env.CC_JIANGXIA_BROWSER_DRIVER ?? 'patchright'
  if (driver !== 'patchright' && driver !== 'playwright') {
    throw new Error('CC_JIANGXIA_BROWSER_DRIVER must be patchright or playwright. Restart the browser runner after changing it.')
  }
  return drivers[driver]
}

/** Keep rollback usable even if the candidate package cannot be loaded. */
export async function loadManagedChromium(
  original: typeof import('playwright').chromium,
  env: NodeJS.ProcessEnv = process.env,
): Promise<typeof original> {
  return selectManagedChromium({
    playwright: async () => original,
    patchright: async () => (await import('patchright')).chromium as unknown as typeof original,
  }, env)()
}
