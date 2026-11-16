import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { prepareShellTransport } from './commandTransport.js'

test('long Windows bash scripts use stdin without changing the command or other shell arguments', () => {
  const command = "eval 'cat <<EOF\n" + '中文 $12 "许可" '.repeat(2000) + "\nEOF'"
  expect(prepareShellTransport('win32', 'bash', ['-c', '-l', command], command)).toEqual({ args: ['-s', '-l'], stdin: command })
  for (const [platform, shell] of [['linux', 'bash'], ['win32', 'powershell']] as const) {
    expect(prepareShellTransport(platform, shell, ['-c', command], command)).toEqual({ args: ['-c', command] })
  }
  expect(prepareShellTransport('win32', 'bash', ['-c', 'true'], 'true')).toEqual({ args: ['-c', 'true'] })
})

test('real Git Bash receives a long quoted Chinese JSON payload byte for byte', () => {
  const bash = 'desktop/src-tauri/binaries/git-runtime/portable-git/bin/bash.exe'
  if (process.platform !== 'win32' || !existsSync(bash)) return
  const payload = JSON.stringify({ description: '中文 "任务" $12 \\ 路径\n'.repeat(1800) })
  const command = "cat <<'PAYLOAD'\n" + payload + '\nPAYLOAD'
  const transport = prepareShellTransport('win32', 'bash', ['--noprofile', '--norc', '-c', command], command)
  const result = spawnSync(bash, transport.args, { input: transport.stdin, encoding: 'utf8', timeout: 10000, windowsHide: true })
  expect(result.status).toBe(0)
  expect(result.stdout).toBe(payload + '\n')
})
