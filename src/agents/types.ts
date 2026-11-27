export type Arm = 'baseline' | 'skill'

export interface AgentRunInput {
  cwd: string
  prompt: string
  timeoutMs: number
  arm: Arm
  skillDir?: string
}

export interface AgentUsage {
  costUsd?: number
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  turns?: number
}

export interface AgentRunOutput extends AgentUsage {
  exitCode: number | null
  timedOut: boolean
  durationMs: number
  result?: string
  stdout: string
  stderr: string
  error?: string
}

export interface Agent {
  name: string
  model?: string
  skillPath: string
  version(): Promise<string | undefined>
  run(input: AgentRunInput): Promise<AgentRunOutput>
}

interface ClaudeResult {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
  num_turns?: number
  total_cost_usd?: number
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

export function parseClaudeOutput(
  stdout: string,
): (AgentUsage & { result?: string; isError?: boolean }) | undefined {
  const candidates: unknown[] = []
  const trimmed = stdout.trim()
  if (!trimmed) return undefined
  try {
    candidates.push(JSON.parse(trimmed))
  } catch {
    for (const line of trimmed.split('\n').reverse()) {
      const l = line.trim()
      if (!l.startsWith('{')) continue
      try {
        candidates.push(JSON.parse(l))
        break
      } catch {
        // not json
      }
    }
  }
  const flat = candidates.flatMap((c) => (Array.isArray(c) ? [...c].reverse() : [c]))
  const found = flat.find(
    (c): c is ClaudeResult =>
      !!c &&
      typeof c === 'object' &&
      ((c as ClaudeResult).type === 'result' || 'total_cost_usd' in c),
  )
  if (!found) return undefined
  const u = found.usage ?? {}
  return {
    result: found.result,
    isError: found.is_error,
    costUsd: found.total_cost_usd,
    inputTokens:
      u.input_tokens !== undefined
        ? u.input_tokens + (u.cache_creation_input_tokens ?? 0)
        : undefined,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens,
    turns: found.num_turns,
  }
}
