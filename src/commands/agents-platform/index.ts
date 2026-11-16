import type { Command } from '../../types/command.js'

export function isAgentsPlatformAvailable(): false { return false }
export function getAgentsPlatformCommand(): Command {
  throw new Error('Internal agents-platform command is unavailable in this build; USER_TYPE=ant does not install its implementation')
}
