export function bunCommand(args: string[]): string[] {
  return [process.execPath, ...args]
}
