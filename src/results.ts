import type { Arm } from './agents/types.js'
import type { CheckResult } from './checks.js'
import {
  bootstrapDiff,
  type Effect,
  effectOf,
  type Interval,
  mean,
  median,
  newcombe,
  wilson,
} from './stats.js'

export interface RunMetrics {
  durationMs: number
  costUsd?: number
  inputTokens?: number
  outputTokens?: number
  turns?: number
  filesChanged: number
  linesAdded: number
  linesRemoved: number
}

export interface RunRecord {
  task: string
  arm: Arm
  index: number
  ok: boolean
  error?: string
  score: number
  passed: boolean
  checks: CheckResult[]
  metrics: RunMetrics
  files: string[]
  finalMessage?: string
  logDir: string
}

export interface ArmSummary {
  runs: number
  errors: number
  passed: number
  passRate: number
  passRateCi: Interval
  meanScore: number
  medianCostUsd?: number
  medianDurationMs: number
  medianOutputTokens?: number
  medianFilesChanged: number
}

export interface Comparison {
  baseline: ArmSummary
  skill: ArmSummary
  passRateLift: Interval & { estimate: number }
  scoreLift: Interval & { estimate: number }
  costDelta?: number
  durationDelta: number
  effect: Effect
}

export interface TaskSummary extends Comparison {
  id: string
}

export interface TrialResults {
  tool: { name: string; version: string }
  createdAt: string
  finishedAt: string
  seed: number
  skill: { name: string; description?: string; path: string; hash: string }
  baselineSkill?: { name: string; path: string; hash: string }
  taskFile: { path: string; hash: string }
  agent: { type: string; model?: string; version?: string }
  runsPerArm: number
  runs: RunRecord[]
  summary: { overall: Comparison; tasks: TaskSummary[] }
}

function pick(xs: (number | undefined)[]): number[] {
  return xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
}

function armSummary(runs: RunRecord[]): ArmSummary {
  const passed = runs.filter((r) => r.passed).length
  const costs = pick(runs.map((r) => r.metrics.costUsd))
  const tokens = pick(runs.map((r) => r.metrics.outputTokens))
  return {
    runs: runs.length,
    errors: runs.filter((r) => !r.ok).length,
    passed,
    passRate: runs.length ? passed / runs.length : 0,
    passRateCi: wilson(passed, runs.length),
    meanScore: mean(runs.map((r) => r.score)),
    medianCostUsd: costs.length ? median(costs) : undefined,
    medianDurationMs: median(runs.map((r) => r.metrics.durationMs)),
    medianOutputTokens: tokens.length ? median(tokens) : undefined,
    medianFilesChanged: median(runs.map((r) => r.metrics.filesChanged)),
  }
}

function compare(
  groups: { skill: RunRecord[]; baseline: RunRecord[] }[],
  seed: number,
): Comparison {
  const skillRuns = groups.flatMap((g) => g.skill)
  const baseRuns = groups.flatMap((g) => g.baseline)
  const skill = armSummary(skillRuns)
  const baseline = armSummary(baseRuns)
  const passCi = newcombe(skill.passed, skill.runs, baseline.passed, baseline.runs)
  const scoreLift = bootstrapDiff(
    groups.map((g) => ({
      treatment: g.skill.map((r) => r.score),
      control: g.baseline.map((r) => r.score),
    })),
    { seed },
  )
  return {
    baseline,
    skill,
    passRateLift: { estimate: skill.passRate - baseline.passRate, ...passCi },
    scoreLift,
    costDelta:
      skill.medianCostUsd !== undefined && baseline.medianCostUsd !== undefined
        ? skill.medianCostUsd - baseline.medianCostUsd
        : undefined,
    durationDelta: skill.medianDurationMs - baseline.medianDurationMs,
    effect: effectOf(scoreLift),
  }
}

export function summarize(runs: RunRecord[], taskIds: string[], seed: number) {
  const groups = taskIds.map((id) => ({
    id,
    skill: runs.filter((r) => r.task === id && r.arm === 'skill'),
    baseline: runs.filter((r) => r.task === id && r.arm === 'baseline'),
  }))
  return {
    overall: compare(groups, seed),
    tasks: groups.map((g) => ({ id: g.id, ...compare([g], seed) })),
  }
}
