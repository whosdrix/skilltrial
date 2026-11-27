import { exec } from '../exec.js'
import { type Agent, type AgentRunInput, type AgentRunOutput, parseClaudeOutput } from './types.js'

export interface ClaudeCodeOptions {
  bin: string
  model?: string
  args: string[]
}

export function claudeArgs(prompt: string, opts: ClaudeCodeOptions): string[] {
  return [
    '-p',
    prompt,
    '--output-format',
    'json',
    '--dangerously-skip-permissions',
    '--no-session-persistence',
    '--setting-sources',
    'project,local',
    ...(opts.model ? ['--model', opts.model] : []),
    ...opts.args,
  ]
}

export function claudeCode(opts: ClaudeCodeOptions): Agent {
  return {
    name: 'claude-code',
    model: opts.model,
    skillPath: '.claude/skills',
    async version() {
      try {
        const r = await exec(opts.bin, ['--version'], { cwd: process.cwd(), timeoutMs: 15_000 })
        return r.stdout.trim().split(/\s+/)[0] || undefined
      } catch {
        return undefined
      }
    },
    async run(input: AgentRunInput): Promise<AgentRunOutput> {
      const env = { ...process.env }
      delete env.CLAUDECODE
      delete env.CLAUDE_CODE_ENTRYPOINT
      let r: Awaited<ReturnType<typeof exec>>
      try {
        r = await exec(opts.bin, claudeArgs(input.prompt, opts), {
          cwd: input.cwd,
          env,
          timeoutMs: input.timeoutMs,
        })
      } catch (err) {
        const message =
          (err as NodeJS.ErrnoException).code === 'ENOENT'
            ? `"${opts.bin}" was not found. Install Claude Code or set agent.bin in the task file.`
            : String(err)
        return {
          exitCode: null,
          timedOut: false,
          durationMs: 0,
          stdout: '',
          stderr: '',
          error: message,
        }
      }
      const parsed = parseClaudeOutput(r.stdout)
      let error: string | undefined
      if (r.timedOut) error = `timed out after ${Math.round(input.timeoutMs / 1000)}s`
      else if (parsed?.isError) error = parsed.result ?? 'claude reported an error'
      else if (r.code !== 0) error = `claude exited with ${r.code}: ${r.stderr.trim().slice(-400)}`
      return {
        exitCode: r.code,
        timedOut: r.timedOut,
        durationMs: r.durationMs,
        stdout: r.stdout,
        stderr: r.stderr,
        error,
        ...parsed,
      }
    },
  }
}
