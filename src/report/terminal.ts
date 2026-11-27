import pc from 'picocolors'
import { interval, pct, points, seconds, signedSeconds, signedUsd, usd } from '../format.js'
import type { RunRecord, TrialResults } from '../results.js'
import { verdictLine } from './markdown.js'

function pad(s: string, n: number, right = false): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI codes for width
  const visible = s.replace(/\x1b\[[0-9;]*m/g, '').length
  const fill = ' '.repeat(Math.max(0, n - visible))
  return right ? fill + s : s + fill
}

export function runLine(r: RunRecord, done: number, total: number): string {
  const mark = r.passed ? pc.green('✓') : r.ok ? pc.yellow('✗') : pc.red('!')
  const arm = r.arm === 'skill' ? pc.cyan('skill   ') : pc.dim('baseline')
  const counter = pc.dim(`[${String(done).padStart(String(total).length)}/${total}]`)
  const extra = r.error ? pc.red(` ${r.error.split('\n')[0]?.slice(0, 80)}`) : ''
  return `${counter} ${mark} ${pad(r.task, 24)} ${arm} #${r.index + 1}  score ${pad(pct(r.score), 4, true)}  ${pc.dim(seconds(r.metrics.durationMs))}${extra}`
}

export function terminalSummary(results: TrialResults): string {
  const o = results.summary.overall
  const color = o.effect === 'helps' ? pc.green : o.effect === 'hurts' ? pc.red : pc.yellow
  const base = results.baselineSkill?.name ?? 'baseline'
  const rows: string[][] = [
    ['', base, results.skill.name, 'difference'],
    [
      'pass rate',
      pct(o.baseline.passRate),
      pct(o.skill.passRate),
      `${points(o.passRateLift.estimate)} pts`,
    ],
    [
      'mean score',
      pct(o.baseline.meanScore),
      pct(o.skill.meanScore),
      `${points(o.scoreLift.estimate)} pts`,
    ],
    [
      'median cost',
      usd(o.baseline.medianCostUsd),
      usd(o.skill.medianCostUsd),
      signedUsd(o.costDelta),
    ],
    [
      'median time',
      seconds(o.baseline.medianDurationMs),
      seconds(o.skill.medianDurationMs),
      signedSeconds(o.durationDelta),
    ],
  ]
  const widths = [
    12,
    Math.max(10, base.length + 2),
    Math.max(10, results.skill.name.length + 2),
    12,
  ]
  const table = rows.map((r, i) =>
    r
      .map((cell, j) => (i === 0 ? pc.dim(pad(cell, widths[j] ?? 10)) : pad(cell, widths[j] ?? 10)))
      .join(''),
  )
  const tasks = results.summary.tasks.map((t) => {
    const c = t.effect === 'helps' ? pc.green : t.effect === 'hurts' ? pc.red : pc.dim
    return `  ${pad(t.id, 26)}${pad(`${pct(t.baseline.passRate)} → ${pct(t.skill.passRate)}`, 14)}${c(pad(points(t.scoreLift.estimate), 6, true))}  ${pc.dim(interval(t.scoreLift))}`
  })
  return [
    '',
    color(pc.bold(verdictLine(o, results.skill.name, results.baselineSkill?.name))),
    '',
    ...table.map((l) => `  ${l}`),
    '',
    pc.dim('  task                      pass rate      lift  95% CI'),
    ...tasks,
    '',
  ].join('\n')
}
