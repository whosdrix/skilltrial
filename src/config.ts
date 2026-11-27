import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'

const duration = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?\s*(ms|s|m|h)?$/)])
  .transform((v) => (typeof v === 'number' ? v * 1000 : parseDuration(v)))

export function parseDuration(text: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/.exec(text.trim())
  if (!m) throw new Error(`Invalid duration: ${text}`)
  const n = Number(m[1])
  const unit = m[2] ?? 's'
  const factor = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[unit] ?? 1000
  return n * factor
}

const claudeAgent = z.object({
  type: z.literal('claude-code'),
  model: z.string().optional(),
  bin: z.string().default('claude'),
  args: z.array(z.string()).default([]),
})

const commandAgent = z.object({
  type: z.literal('command'),
  command: z.string().min(1),
  skillPath: z.string().default('.claude/skills'),
  model: z.string().optional(),
})

const agentSchema = z.discriminatedUnion('type', [claudeAgent, commandAgent])

const runCheck = z.object({
  name: z.string().optional(),
  weight: z.number().positive().default(1),
  run: z.string().min(1),
  timeout: duration.optional(),
})

const fileCheck = z
  .object({
    name: z.string().optional(),
    weight: z.number().positive().default(1),
    file: z.string().min(1),
    exists: z.boolean().optional(),
    contains: z.union([z.string(), z.array(z.string())]).optional(),
    matches: z.string().optional(),
    absent: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .refine((c) => c.exists !== undefined || c.contains || c.matches || c.absent, {
    message: 'a file check needs one of exists, contains, matches or absent',
  })

const judgeCheck = z.object({
  name: z.string().optional(),
  weight: z.number().positive().default(1),
  judge: z.string().min(1),
  files: z.array(z.string()).default(['**/*']),
  pass: z.number().min(0).max(10).default(7),
})

export const checkSchema = z.union([runCheck, fileCheck, judgeCheck])

const taskSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9._-]*$/i, 'task ids may use letters, digits, dot, dash and underscore'),
  prompt: z.string().min(1),
  fixture: z.string().optional(),
  setup: z.string().optional(),
  timeout: duration.optional(),
  runs: z.number().int().positive().optional(),
  checks: z.array(checkSchema).min(1),
})

const judgeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('claude-code'),
    model: z.string().optional(),
    bin: z.string().default('claude'),
  }),
  z.object({ type: z.literal('command'), command: z.string().min(1) }),
])

export const trialSchema = z.object({
  version: z.literal(1).default(1),
  agent: agentSchema.default({ type: 'claude-code', bin: 'claude', args: [] }),
  judge: judgeSchema.optional(),
  runs: z.number().int().positive().default(5),
  concurrency: z.number().int().positive().default(2),
  timeout: duration.default(600_000),
  seed: z.number().int().optional(),
  tasks: z.array(taskSchema).min(1),
})

export type TrialFile = z.infer<typeof trialSchema>
export type AgentConfig = z.infer<typeof agentSchema>
export type JudgeConfig = z.infer<typeof judgeSchema>
export type Task = z.infer<typeof taskSchema>
export type Check = z.infer<typeof checkSchema>

export interface LoadedTrial {
  path: string
  dir: string
  hash: string
  config: TrialFile
}

export async function loadTrial(path: string): Promise<LoadedTrial> {
  const full = resolve(path)
  let text: string
  try {
    text = await readFile(full, 'utf8')
  } catch {
    throw new Error(`Cannot read task file ${path}. Run "skilltrial init" to create one.`)
  }
  const raw = parse(text)
  const result = trialSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid task file ${path}:\n${issues}`)
  }
  const config = result.data
  const ids = new Set<string>()
  for (const task of config.tasks) {
    if (ids.has(task.id)) throw new Error(`Duplicate task id "${task.id}" in ${path}`)
    ids.add(task.id)
    if (task.fixture) {
      const fixture = resolve(dirname(full), task.fixture)
      const info = await stat(fixture).catch(() => null)
      if (!info?.isDirectory()) {
        throw new Error(`Task "${task.id}": fixture ${task.fixture} is not a directory`)
      }
    }
  }
  if (config.tasks.some((t) => t.checks.some((c) => 'judge' in c)) && !config.judge) {
    config.judge = { type: 'claude-code', bin: 'claude' }
  }
  return {
    path: full,
    dir: dirname(full),
    hash: createHash('sha256').update(text).digest('hex'),
    config,
  }
}

export function checkKind(check: Check): 'run' | 'file' | 'judge' {
  if ('run' in check) return 'run'
  if ('judge' in check) return 'judge'
  return 'file'
}

export function checkName(check: Check, index: number): string {
  if (check.name) return check.name
  if ('run' in check) return check.run
  if ('judge' in check) return `judge #${index + 1}`
  return `file ${check.file}`
}
