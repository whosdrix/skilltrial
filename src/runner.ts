import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { type Agent, type Arm, createAgent } from './agents/index.js'
import { type CheckResult, runCheck, scoreChecks } from './checks.js'
import type { LoadedTrial, Task } from './config.js'
import { type RunRecord, summarize, type TrialResults } from './results.js'
import { collectChanges, createSandbox, installSkill } from './sandbox.js'
import type { Skill } from './skill.js'
import { mulberry32, shuffle } from './stats.js'
import { VERSION } from './version.js'

export interface RunOptions {
  skill: Skill
  against?: Skill
  trial: LoadedTrial
  outDir: string
  runs?: number
  concurrency?: number
  model?: string
  seed?: number
  only?: string[]
  keepWorkdirs?: boolean
  agent?: Agent
  onEvent?: (event: TrialEvent) => void
}

export type TrialEvent =
  | { type: 'start'; total: number; tasks: number; runsPerArm: number }
  | { type: 'run-start'; task: string; arm: Arm; index: number }
  | { type: 'run-end'; record: RunRecord; done: number; total: number }

interface Job {
  task: Task
  arm: Arm
  index: number
}

export function planJobs(tasks: Task[], runs: number, seed: number): Job[] {
  const rand = mulberry32(seed)
  const pairs: Job[][] = []
  for (const task of tasks) {
    const n = task.runs ?? runs
    for (let index = 0; index < n; index++) {
      const pair: Job[] = [
        { task, arm: 'baseline', index },
        { task, arm: 'skill', index },
      ]
      pairs.push(rand() < 0.5 ? pair : pair.reverse())
    }
  }
  return shuffle(pairs, rand).flat()
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++] as T
      await fn(item)
    }
  })
  await Promise.all(workers)
}

export async function runTrial(opts: RunOptions): Promise<TrialResults> {
  const { trial, skill, against } = opts
  const config = trial.config
  const seed = opts.seed ?? config.seed ?? Math.floor(Math.random() * 2 ** 31)
  const runsPerArm = opts.runs ?? config.runs
  const tasks = opts.only?.length
    ? config.tasks.filter((t) => opts.only?.includes(t.id))
    : config.tasks
  if (!tasks.length) throw new Error(`No tasks match ${opts.only?.join(', ')}`)

  const agent = opts.agent ?? createAgent(config.agent, opts.model)
  const outDir = resolve(opts.outDir)
  await mkdir(outDir, { recursive: true })
  const workRoot = await mkdtemp(join(tmpdir(), 'skilltrial-'))
  const judgeDir = join(workRoot, '.judge')
  await mkdir(judgeDir, { recursive: true })

  const jobs = planJobs(tasks, runsPerArm, seed)
  const createdAt = new Date().toISOString()
  const records: RunRecord[] = []
  opts.onEvent?.({ type: 'start', total: jobs.length, tasks: tasks.length, runsPerArm })

  await pool(jobs, opts.concurrency ?? config.concurrency, async (job) => {
    opts.onEvent?.({ type: 'run-start', task: job.task.id, arm: job.arm, index: job.index })
    const record = await runJob(job)
    records.push(record)
    opts.onEvent?.({ type: 'run-end', record, done: records.length, total: jobs.length })
  })

  if (!opts.keepWorkdirs) await rm(workRoot, { recursive: true, force: true })

  async function runJob(job: Job): Promise<RunRecord> {
    const { task, arm, index } = job
    const name = `${arm}-${index + 1}`
    const logDir = join(outDir, 'runs', task.id, name)
    const workDir = join(workRoot, task.id, name)
    await mkdir(logDir, { recursive: true })
    const timeoutMs = task.timeout ?? config.timeout
    const record: RunRecord = {
      task: task.id,
      arm,
      index,
      ok: false,
      score: 0,
      passed: false,
      checks: [],
      metrics: { durationMs: 0, filesChanged: 0, linesAdded: 0, linesRemoved: 0 },
      files: [],
      logDir: join('runs', task.id, name),
    }

    try {
      const sandbox = await createSandbox({
        dir: workDir,
        fixture: task.fixture ? resolve(trial.dir, task.fixture) : undefined,
        setup: task.setup,
      })
      const installed = arm === 'skill' ? skill : against
      const skillDir = installed
        ? await installSkill(sandbox, installed.dir, agent.skillPath, installed.name)
        : undefined

      const out = await agent.run({
        cwd: sandbox.dir,
        prompt: task.prompt,
        timeoutMs,
        arm,
        skillDir,
      })
      await writeFile(join(logDir, 'agent.out'), out.stdout)
      if (out.stderr) await writeFile(join(logDir, 'agent.err'), out.stderr)

      const changes = await collectChanges(sandbox, agent.skillPath)
      await writeFile(join(logDir, 'changes.patch'), changes.patch)

      const checks: CheckResult[] = []
      for (const [i, check] of task.checks.entries()) {
        checks.push(
          await runCheck(check, i, {
            dir: sandbox.dir,
            judge: config.judge,
            judgeDir,
            finalMessage: out.result,
            timeoutMs: 300_000,
          }),
        )
      }
      const { score, passed } = scoreChecks(checks)
      Object.assign(record, {
        ok: !out.error,
        error: out.error,
        score,
        passed,
        checks,
        files: changes.files,
        finalMessage: out.result?.slice(0, 4000),
        metrics: {
          durationMs: out.durationMs,
          costUsd: out.costUsd,
          inputTokens: out.inputTokens,
          outputTokens: out.outputTokens,
          turns: out.turns,
          filesChanged: changes.files.length,
          linesAdded: changes.added,
          linesRemoved: changes.removed,
        },
      })
    } catch (err) {
      record.error = (err as Error).message
    }
    await writeFile(join(logDir, 'record.json'), `${JSON.stringify(record, null, 2)}\n`)
    if (!opts.keepWorkdirs) await rm(workDir, { recursive: true, force: true })
    return record
  }

  records.sort((a, b) =>
    a.task === b.task
      ? a.arm === b.arm
        ? a.index - b.index
        : a.arm < b.arm
          ? -1
          : 1
      : a.task < b.task
        ? -1
        : 1,
  )

  return {
    tool: { name: 'skilltrial', version: VERSION },
    createdAt,
    finishedAt: new Date().toISOString(),
    seed,
    skill: {
      name: skill.name,
      description: skill.description,
      path: relative(process.cwd(), skill.dir),
      hash: skill.hash,
    },
    baselineSkill: against
      ? { name: against.name, path: relative(process.cwd(), against.dir), hash: against.hash }
      : undefined,
    taskFile: { path: relative(process.cwd(), trial.path), hash: trial.hash },
    agent: { type: agent.name, model: agent.model, version: await agent.version() },
    runsPerArm,
    runs: records,
    summary: summarize(
      records,
      tasks.map((t) => t.id),
      seed,
    ),
  }
}
