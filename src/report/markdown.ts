import { interval, pct, points, seconds, signedSeconds, signedUsd, usd } from '../format.js'
import type { Comparison, TrialResults } from '../results.js'

export function verdictLine(c: Comparison, skillName: string, baselineName = 'no skill'): string {
  if (!Number.isFinite(c.scoreLift.low)) {
    return `Score ${points(c.scoreLift.estimate)} points, from too few runs to say anything. Use 5 or more runs per arm.`
  }
  const lift = `${points(c.scoreLift.estimate)} points (95% CI ${interval(c.scoreLift)})`
  if (c.effect === 'helps') return `${skillName} helps: score ${lift} over ${baselineName}.`
  if (c.effect === 'hurts')
    return `${skillName} makes things worse: score ${lift} against ${baselineName}.`
  return `No clear effect yet: score ${lift}. Run more trials to narrow it down.`
}

const EFFECT = { helps: 'helps', hurts: 'hurts', unclear: 'unclear' }

export function markdownSummary(results: TrialResults): string {
  const o = results.summary.overall
  const base = results.baselineSkill?.name ?? 'no skill'
  const lines = [
    `### skilltrial: ${results.skill.name}`,
    '',
    `**${verdictLine(o, results.skill.name, base)}**`,
    '',
    `| | ${base} | ${results.skill.name} | difference |`,
    '|---|---|---|---|',
    `| Pass rate | ${pct(o.baseline.passRate)} | ${pct(o.skill.passRate)} | ${points(o.passRateLift.estimate)} pts (${interval(o.passRateLift)}) |`,
    `| Mean score | ${pct(o.baseline.meanScore)} | ${pct(o.skill.meanScore)} | ${points(o.scoreLift.estimate)} pts (${interval(o.scoreLift)}) |`,
    `| Median cost | ${usd(o.baseline.medianCostUsd)} | ${usd(o.skill.medianCostUsd)} | ${signedUsd(o.costDelta)} |`,
    `| Median time | ${seconds(o.baseline.medianDurationMs)} | ${seconds(o.skill.medianDurationMs)} | ${signedSeconds(o.durationDelta)} |`,
    '',
    '| Task | pass rate | score lift | 95% CI | effect |',
    '|---|---|---|---|---|',
    ...results.summary.tasks.map(
      (t) =>
        `| ${t.id} | ${pct(t.baseline.passRate)} → ${pct(t.skill.passRate)} | ${points(t.scoreLift.estimate)} | ${interval(t.scoreLift)} | ${EFFECT[t.effect]} |`,
    ),
    '',
    `<sub>${results.runsPerArm} runs per arm · ${results.agent.type}${results.agent.model ? ` (${results.agent.model})` : ''}${results.agent.version ? ` ${results.agent.version}` : ''} · seed ${results.seed} · skill ${results.skill.hash.slice(0, 12)}</sub>`,
    '',
  ]
  return lines.join('\n')
}
