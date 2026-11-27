import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { glob } from 'tinyglobby'
import { parseClaudeOutput } from './agents/types.js'
import type { JudgeConfig } from './config.js'
import { exec, sh, tail } from './exec.js'

export interface Verdict {
  score: number
  reason: string
  costUsd?: number
}

const MAX_FILE = 40_000
const MAX_TOTAL = 160_000
const SKIP = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.claude/**',
  '**/dist/**',
  '**/*.lock',
  '**/package-lock.json',
]

export async function gatherFiles(dir: string, patterns: string[]): Promise<string> {
  const files = (await glob(patterns, { cwd: dir, dot: true, ignore: SKIP })).sort()
  let total = 0
  const parts: string[] = []
  for (const file of files) {
    if (total >= MAX_TOTAL) {
      parts.push(`(${files.length - parts.length} more files not shown)`)
      break
    }
    const buf = await readFile(join(dir, file))
    if (buf.includes(0)) continue
    let text = buf.toString('utf8')
    if (text.length > MAX_FILE) text = `${text.slice(0, MAX_FILE)}\n… (truncated)`
    total += text.length
    parts.push(`<file path="${file}">\n${text}\n</file>`)
  }
  return parts.length ? parts.join('\n\n') : '(no matching files were produced)'
}

export function judgePrompt(rubric: string, files: string, answer?: string): string {
  return [
    'You are grading the output of a coding agent. You do not know how it was produced, and you should not guess.',
    'Grade only against the rubric. Be strict and consistent: 10 means it fully meets the rubric, 5 means it is half there, 0 means it is missing or broken.',
    '',
    '<rubric>',
    rubric.trim(),
    '</rubric>',
    '',
    answer ? `<final_message>\n${tail(answer, 4000)}\n</final_message>\n` : '',
    '<files>',
    files,
    '</files>',
    '',
    'Reply with only a JSON object on one line: {"score": <number 0-10>, "reason": "<one or two sentences>"}',
  ].join('\n')
}

export function parseVerdict(text: string): Verdict {
  const matches = text.match(/\{[^{}]*"score"[^{}]*\}/g) ?? []
  for (const m of matches.reverse()) {
    try {
      const v = JSON.parse(m) as { score?: unknown; reason?: unknown }
      const score = Number(v.score)
      if (Number.isFinite(score)) {
        return {
          score: Math.max(0, Math.min(10, score)),
          reason: typeof v.reason === 'string' ? v.reason : '',
        }
      }
    } catch {
      // keep looking
    }
  }
  throw new Error(`judge did not return a score: ${tail(text.trim(), 300)}`)
}

export async function runJudge(config: JudgeConfig, prompt: string, cwd: string): Promise<Verdict> {
  if (config.type === 'command') {
    const r = await sh(config.command, { cwd, input: prompt, timeoutMs: 300_000 })
    if (r.code !== 0) throw new Error(`judge command exited with ${r.code}: ${tail(r.stderr, 300)}`)
    const parsed = parseClaudeOutput(r.stdout)
    const verdict = parseVerdict(parsed?.result ?? r.stdout)
    return { ...verdict, costUsd: parsed?.costUsd }
  }
  const env = { ...process.env }
  delete env.CLAUDECODE
  const args = [
    '-p',
    '--output-format',
    'json',
    '--tools',
    '',
    '--no-session-persistence',
    '--setting-sources',
    'project',
    ...(config.model ? ['--model', config.model] : []),
  ]
  const r = await exec(config.bin, args, { cwd, env, input: prompt, timeoutMs: 300_000 })
  const parsed = parseClaudeOutput(r.stdout)
  if (!parsed?.result)
    throw new Error(`judge failed (${r.code}): ${tail(r.stderr || r.stdout, 300)}`)
  return { ...parseVerdict(parsed.result), costUsd: parsed.costUsd }
}
