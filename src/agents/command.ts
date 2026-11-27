import { sh } from '../exec.js'
import { type Agent, type AgentRunInput, type AgentRunOutput, parseClaudeOutput } from './types.js'

export interface CommandAgentOptions {
  command: string
  skillPath: string
  model?: string
}

export function commandAgent(opts: CommandAgentOptions): Agent {
  return {
    name: 'command',
    model: opts.model,
    skillPath: opts.skillPath,
    async version() {
      return undefined
    },
    async run(input: AgentRunInput): Promise<AgentRunOutput> {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        SKILLTRIAL_PROMPT: input.prompt,
        SKILLTRIAL_ARM: input.arm,
        SKILLTRIAL_SKILL_DIR: input.skillDir ?? '',
        SKILLTRIAL_MODEL: opts.model ?? '',
      }
      const r = await sh(opts.command, {
        cwd: input.cwd,
        env,
        input: input.prompt,
        timeoutMs: input.timeoutMs,
      })
      const parsed = parseClaudeOutput(r.stdout)
      let error: string | undefined
      if (r.timedOut) error = `timed out after ${Math.round(input.timeoutMs / 1000)}s`
      else if (r.code !== 0) error = `command exited with ${r.code}: ${r.stderr.trim().slice(-400)}`
      return {
        exitCode: r.code,
        timedOut: r.timedOut,
        durationMs: r.durationMs,
        stdout: r.stdout,
        stderr: r.stderr,
        error,
        ...parsed,
        result: parsed?.result ?? r.stdout.trim().slice(-2000),
      }
    },
  }
}
