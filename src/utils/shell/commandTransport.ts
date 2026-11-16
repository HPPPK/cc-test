/** Keep large scripts off the Windows/MSYS command-line conversion path. */
export function prepareShellTransport(platform: string, shell: string, args: string[], command: string): { args: string[]; stdin?: string } {
  if (platform !== 'win32' || shell !== 'bash' || command.length < 4000 || !args.includes('-c')) return { args }
  return { args: args.flatMap(arg => arg === command ? [] : arg === '-c' ? ['-s'] : [arg]), stdin: command }
}
