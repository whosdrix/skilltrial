import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { type Check, checkKind, checkName, type JudgeConfig } from './config.js'
import { sh, tail } from './exec.js'
import { gatherFiles, judgePrompt, runJudge } from './judge.js'

export interface CheckResult {
  name: string
  kind: 'run' | 'file' | 'judge'
  weight: number
  score: number
  passed: boolean
  detail: string
  durationMs: number
  costUsd?: number
}

export interface CheckContext {
  dir: string
  judge?: JudgeConfig
  judgeDir: string
  finalMessage?: string
  timeoutMs: number
}

function insideDir(dir: string, file: string): string {
  const full = resolve(dir, file)
  const rel = relative(dir, full)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${file} is outside the workspace`)
  return full
}

function asList(v: string | string[] | undefined): string[] {
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

export async function runCheck(
  check: Check,
  index: number,
  ctx: CheckContext,
): Promise<CheckResult> {
  const started = performance.now()
  const base = {
    name: checkName(check, index),
    kind: checkKind(check),
    weight: check.weight,
  }
  const done = (
    passed: boolean,
    detail: string,
    score = passed ? 1 : 0,
    costUsd?: number,
  ): CheckResult => ({
    ...base,
    score,
    passed,
    detail,
    durationMs: performance.now() - started,
    costUsd,
  })

  try {
    if ('run' in check) {
      const r = await sh(check.run, { cwd: ctx.dir, timeoutMs: check.timeout ?? ctx.timeoutMs })
      if (r.timedOut) return done(false, 'timed out')
      const out = tail(`${r.stdout}${r.stderr ? `\n${r.stderr}` : ''}`.trim(), 1500)
      return done(r.code === 0, r.code === 0 ? out : `exit ${r.code}\n${out}`)
    }

    if ('judge' in check) {
      if (!ctx.judge) throw new Error('no judge configured')
      const files = await gatherFiles(ctx.dir, check.files)
      const verdict = await runJudge(
        ctx.judge,
        judgePrompt(check.judge, files, ctx.finalMessage),
        ctx.judgeDir,
      )
      return done(
        verdict.score >= check.pass,
        `${verdict.score}/10. ${verdict.reason}`.trim(),
        verdict.score / 10,
        verdict.costUsd,
      )
    }

    const path = insideDir(ctx.dir, check.file)
    const content = await readFile(path, 'utf8').catch(() => undefined)
    if (check.exists === false) {
      return done(
        content === undefined,
        content === undefined ? 'absent' : 'file exists but should not',
      )
    }
    if (content === undefined) return done(false, `${check.file} was not created`)
    const problems: string[] = []
    for (const needle of asList(check.contains)) {
      if (!content.includes(needle)) problems.push(`missing "${needle}"`)
    }
    for (const needle of asList(check.absent)) {
      if (content.includes(needle)) problems.push(`contains "${needle}"`)
    }
    if (check.matches && !new RegExp(check.matches, 'm').test(content)) {
      problems.push(`does not match /${check.matches}/`)
    }
    return done(problems.length === 0, problems.length ? problems.join(', ') : 'ok')
  } catch (err) {
    return done(false, `error: ${(err as Error).message}`)
  }
}

export function scoreChecks(results: CheckResult[]): { score: number; passed: boolean } {
  const totalWeight = results.reduce((s, r) => s + r.weight, 0)
  const score = totalWeight ? results.reduce((s, r) => s + r.score * r.weight, 0) / totalWeight : 0
  return { score, passed: results.length > 0 && results.every((r) => r.passed) }
}
