import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  escapeHtml as e,
  interval,
  pct,
  points,
  seconds,
  signedSeconds,
  signedUsd,
  usd,
} from '../format.js'
import type { Comparison, RunRecord, TrialResults } from '../results.js'
import type { Interval } from '../stats.js'
import { verdictLine } from './markdown.js'

const MAX_PATCH = 30_000

function ciBar(ci: Interval & { estimate: number }, effect: string): string {
  if (!Number.isFinite(ci.low)) return ''
  const x = (v: number) => Math.max(0, Math.min(100, (v + 1) * 50))
  return `<div class="ci ${effect}" title="95% CI ${e(interval(ci))}">
  <div class="axis"></div><div class="zero"></div>
  <div class="range" style="left:${x(ci.low)}%;width:${Math.max(0.6, x(ci.high) - x(ci.low))}%"></div>
  <div class="dot" style="left:${x(ci.estimate)}%"></div>
  <span class="tick l">−100</span><span class="tick m">0</span><span class="tick r">+100</span>
</div>`
}

function stats(c: Comparison, base: string, skill: string): string {
  const cell = (label: string, a: string, b: string, d: string) =>
    `<div class="stat"><div class="label">${label}</div><div class="pair"><span><small>${e(base)}</small>${a}</span><span><small>${e(skill)}</small>${b}</span></div><div class="delta">${d}</div></div>`
  return `<div class="stats">
${cell('Pass rate', pct(c.baseline.passRate), pct(c.skill.passRate), `${points(c.passRateLift.estimate)} pts · CI ${interval(c.passRateLift)}`)}
${cell('Mean score', pct(c.baseline.meanScore), pct(c.skill.meanScore), `${points(c.scoreLift.estimate)} pts · CI ${interval(c.scoreLift)}`)}
${cell('Median cost', usd(c.baseline.medianCostUsd), usd(c.skill.medianCostUsd), signedUsd(c.costDelta))}
${cell('Median time', seconds(c.baseline.medianDurationMs), seconds(c.skill.medianDurationMs), signedSeconds(c.durationDelta))}
</div>`
}

async function runCard(r: RunRecord, outDir?: string): Promise<string> {
  let patch = ''
  if (outDir) {
    patch = await readFile(join(outDir, r.logDir, 'changes.patch'), 'utf8').catch(() => '')
    if (patch.length > MAX_PATCH)
      patch = `${patch.slice(0, MAX_PATCH)}\n… (truncated, see ${r.logDir}/changes.patch)`
  }
  const checks = r.checks
    .map(
      (c) =>
        `<li class="${c.passed ? 'pass' : 'fail'}"><span class="mark">${c.passed ? '✓' : '✗'}</span><span class="cname">${e(c.name)}</span>${c.kind === 'judge' ? `<span class="jscore">${Math.round(c.score * 10)}/10</span>` : ''}${c.detail && (c.kind === 'judge' || !c.passed) ? `<div class="detail">${e(c.detail.slice(0, 600))}</div>` : ''}</li>`,
    )
    .join('')
  const m = r.metrics
  return `<details class="run ${r.passed ? 'pass' : r.ok ? 'partial' : 'fail'}">
<summary><span class="badge">${r.passed ? 'pass' : r.ok ? 'partial' : 'error'}</span><b>#${r.index + 1}</b><span class="score">${pct(r.score)}</span><span class="meta">${seconds(m.durationMs)} · ${usd(m.costUsd)} · ${m.filesChanged} files</span></summary>
${r.error ? `<div class="error">${e(r.error.slice(0, 800))}</div>` : ''}
<ul class="checks">${checks}</ul>
${
  r.files.length
    ? `<div class="files">${r.files
        .slice(0, 30)
        .map((f) => `<code>${e(f)}</code>`)
        .join(' ')}${r.files.length > 30 ? ` +${r.files.length - 30}` : ''}</div>`
    : ''
}
${patch ? `<details class="patch"><summary>diff (+${m.linesAdded} −${m.linesRemoved})</summary><pre>${e(patch)}</pre></details>` : ''}
</details>`
}

export async function renderHtml(results: TrialResults, outDir?: string): Promise<string> {
  const o = results.summary.overall
  const base = results.baselineSkill?.name ?? 'no skill'
  const skill = results.skill.name
  const taskSections: string[] = []
  for (const t of results.summary.tasks) {
    const runs = results.runs.filter((r) => r.task === t.id)
    const col = async (arm: 'baseline' | 'skill') =>
      (await Promise.all(runs.filter((r) => r.arm === arm).map((r) => runCard(r, outDir)))).join(
        '\n',
      )
    taskSections.push(`<section class="task">
<header><h3>${e(t.id)}</h3><span class="pill ${t.effect}">${t.effect === 'unclear' ? 'unclear' : t.effect}</span><span class="lift">${points(t.scoreLift.estimate)} pts</span></header>
${ciBar(t.scoreLift, t.effect)}
${stats(t, base, skill)}
<div class="cols"><div><h4>${e(base)}</h4>${await col('baseline')}</div><div><h4>${e(skill)}</h4>${await col('skill')}</div></div>
</section>`)
  }

  const agent = `${results.agent.type}${results.agent.model ? ` · ${results.agent.model}` : ''}${results.agent.version ? ` · v${results.agent.version}` : ''}`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(skill)} · skilltrial</title>
<style>
:root{--bg:#0b1020;--panel:#111833;--line:#1f2a4d;--text:#e6ebff;--dim:#8d97bd;--blue:#4f8cff;--green:#3fb950;--red:#f85149;--amber:#d29922;--mono:ui-monospace,"JetBrains Mono",SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1200px 600px at 10% -10%,#1a2550 0%,transparent 60%),var(--bg);color:var(--text);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1080px;margin:0 auto;padding:40px 20px 80px}
.kicker{font:600 12px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--blue)}
h1{font-size:40px;line-height:1.1;margin:8px 0 6px;letter-spacing:-.02em}
.desc{color:var(--dim);max-width:720px;margin:0 0 14px}
.metarow{display:flex;flex-wrap:wrap;gap:8px 18px;color:var(--dim);font:13px var(--mono)}
.verdict{margin:28px 0;padding:24px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,#131c3d,#0f1630);position:relative;overflow:hidden}
.verdict::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:var(--blue)}
.verdict .big{font-size:56px;font-weight:700;letter-spacing:-.03em;line-height:1}
.verdict.helps .big{color:var(--green)}.verdict.hurts .big{color:var(--red)}.verdict.unclear .big{color:var(--amber)}
.verdict p{margin:10px 0 0;font-size:17px}
.ci{position:relative;height:34px;margin:18px 0 6px}
.ci .axis{position:absolute;top:12px;left:0;right:0;height:2px;background:var(--line)}
.ci .zero{position:absolute;top:4px;left:50%;width:1px;height:18px;background:var(--dim)}
.ci .range{position:absolute;top:8px;height:10px;border-radius:5px;background:var(--amber);opacity:.55}
.ci.helps .range{background:var(--green)}.ci.hurts .range{background:var(--red)}
.ci .dot{position:absolute;top:6px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:var(--text);border:3px solid var(--bg)}
.ci .tick{position:absolute;top:20px;font:11px var(--mono);color:var(--dim)}
.ci .l{left:0}.ci .m{left:50%;transform:translateX(-50%)}.ci .r{right:0}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}
.stat .label{color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.08em}
.stat .pair{display:flex;justify-content:space-between;gap:8px;margin:6px 0;font:600 20px var(--mono)}
.stat .pair small{display:block;font:500 11px Inter,system-ui,sans-serif;color:var(--dim);text-transform:none;letter-spacing:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px}
.stat .delta{font:12px var(--mono);color:var(--dim)}
h2{font-size:22px;margin:40px 0 4px}
.task{margin:22px 0;padding:20px;border:1px solid var(--line);border-radius:16px;background:rgba(17,24,51,.6)}
.task header{display:flex;align-items:center;gap:12px}
.task h3{margin:0;font:600 18px var(--mono)}
.pill{font:600 11px var(--mono);text-transform:uppercase;padding:3px 8px;border-radius:999px;border:1px solid currentColor}
.pill.helps{color:var(--green)}.pill.hurts{color:var(--red)}.pill.unclear{color:var(--amber)}
.lift{margin-left:auto;font:700 20px var(--mono)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.cols h4{margin:8px 0;color:var(--dim);font-weight:600}
.run{background:var(--panel);border:1px solid var(--line);border-radius:10px;margin:8px 0;padding:0 12px}
.run>summary{cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 0;list-style:none}
.run>summary::-webkit-details-marker{display:none}
.run .badge{font:600 10px var(--mono);text-transform:uppercase;padding:2px 6px;border-radius:4px;background:#2a334f}
.run.pass .badge{background:rgba(63,185,80,.18);color:var(--green)}.run.fail .badge{background:rgba(248,81,73,.18);color:var(--red)}.run.partial .badge{background:rgba(210,153,34,.18);color:var(--amber)}
.run .score{font:600 14px var(--mono)}.run .meta{margin-left:auto;color:var(--dim);font:12px var(--mono)}
.checks{list-style:none;margin:0;padding:0 0 10px}
.checks li{padding:3px 0;font-size:13px}
.checks .mark{display:inline-block;width:18px}.checks .pass .mark{color:var(--green)}.checks .fail .mark{color:var(--red)}
.checks .cname{font-family:var(--mono)}.checks .jscore{margin-left:8px;color:var(--blue);font:600 12px var(--mono)}
.checks .detail{margin:2px 0 4px 18px;color:var(--dim);white-space:pre-wrap;font:12px var(--mono);max-height:160px;overflow:auto}
.error{color:var(--red);font:12px var(--mono);white-space:pre-wrap;margin-bottom:8px}
.files{padding-bottom:10px}.files code{font-size:11px;background:#1a2242;padding:1px 5px;border-radius:4px;display:inline-block;margin:2px 0}
.patch{padding-bottom:10px}.patch summary{cursor:pointer;color:var(--blue);font:12px var(--mono)}
.patch pre{max-height:420px;overflow:auto;background:#070b18;border:1px solid var(--line);border-radius:8px;padding:10px;font:11.5px/1.45 var(--mono);white-space:pre}
footer{margin-top:48px;color:var(--dim);font:12px var(--mono);border-top:1px solid var(--line);padding-top:16px}
footer a{color:var(--blue)}
@media (max-width:760px){.stats{grid-template-columns:1fr 1fr}.cols{grid-template-columns:1fr}h1{font-size:30px}.verdict .big{font-size:42px}}
</style>
</head>
<body>
<main>
<div class="kicker">skilltrial report</div>
<h1>${e(skill)}</h1>
${results.skill.description ? `<p class="desc">${e(results.skill.description)}</p>` : ''}
<div class="metarow"><span>${e(agent)}</span><span>${results.runsPerArm} runs per arm</span><span>${results.summary.tasks.length} tasks</span><span>seed ${results.seed}</span><span>${e(results.createdAt.slice(0, 16).replace('T', ' '))} UTC</span></div>

<div class="verdict ${o.effect}">
<div class="big">${points(o.scoreLift.estimate)} pts</div>
<p>${e(verdictLine(o, skill, base))}</p>
${ciBar(o.scoreLift, o.effect)}
</div>
${stats(o, base, skill)}

<h2>Tasks</h2>
${taskSections.join('\n')}

<footer>
Score is the weighted share of checks passed per run (judge checks count as score/10). Lift is skill minus ${e(base)}, averaged over tasks, with a 95% bootstrap interval. Pass rate intervals use Newcombe's method.<br>
skill ${results.skill.hash.slice(0, 16)} · tasks ${results.taskFile.hash.slice(0, 16)} · skilltrial ${e(results.tool.version)} · <a href="https://github.com/whosdrix/skilltrial">github.com/whosdrix/skilltrial</a>
</footer>
</main>
</body>
</html>
`
}
