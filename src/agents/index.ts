import type { AgentConfig } from '../config.js'
import { claudeCode } from './claude-code.js'
import { commandAgent } from './command.js'
import type { Agent } from './types.js'

export function createAgent(config: AgentConfig, modelOverride?: string): Agent {
  const model = modelOverride ?? config.model
  if (config.type === 'command') {
    return commandAgent({ command: config.command, skillPath: config.skillPath, model })
  }
  return claudeCode({ bin: config.bin, model, args: config.args })
}

export type { Agent, AgentRunOutput, Arm } from './types.js'
