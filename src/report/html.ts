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
  const low = x(ci.low)
  const width = Math.max(0.6, x(ci.high) - low)
  // The range grows outward from the estimate, so the origin has to sit on the dot.
  const origin = Math.max(0, Math.min(100, ((x(ci.estimate) - low) / width) * 100))
  return `<div class="ci ${effect}" role="img" aria-label="95% confidence interval ${e(interval(ci))}" title="95% CI ${e(interval(ci))}">
  <div class="axis"></div><div class="grid" style="left:25%"></div><div class="grid" style="left:75%"></div><div class="zero"></div>
  <div class="range" style="left:${low}%;width:${width}%;transform-origin:${origin}% 50%"></div>
  <div class="dot" style="left:${x(ci.estimate)}%"></div>
  <span class="tick l">−100</span><span class="tick m">0</span><span class="tick r">+100</span>
</div>`
}

function meter(a: number, b: number): string {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return ''
  const w = (v: number) => Math.max(0, Math.min(100, v * 100))
  return `<div class="meter"><i style="width:${w(a)}%"></i></div><div class="meter skill"><i style="width:${w(b)}%"></i></div>`
}

function stats(c: Comparison, base: string, skill: string): string {
  const cell = (label: string, a: string, b: string, d: string, bars = '') =>
    `<div class="stat"><div class="label">${label}</div><div class="pair"><span><small>${e(base)}</small>${a}</span><span class="arrow">→</span><span class="to"><small>${e(skill)}</small>${b}</span></div>${bars}<div class="delta">${d}</div></div>`
  const lift = (ci: Interval & { estimate: number }) =>
    `<b>${points(ci.estimate)} pts</b><span><span class="sep"> · </span>CI ${interval(ci)}</span>`
  return `<div class="stats">
${cell('Pass rate', pct(c.baseline.passRate), pct(c.skill.passRate), lift(c.passRateLift), meter(c.baseline.passRate, c.skill.passRate))}
${cell('Mean score', pct(c.baseline.meanScore), pct(c.skill.meanScore), lift(c.scoreLift), meter(c.baseline.meanScore, c.skill.meanScore))}
${cell('Median cost', usd(c.baseline.medianCostUsd), usd(c.skill.medianCostUsd), `<b>${signedUsd(c.costDelta)}</b>`)}
${cell('Median time', seconds(c.baseline.medianDurationMs), seconds(c.skill.medianDurationMs), `<b>${signedSeconds(c.durationDelta)}</b>`)}
</div>`
}

function runDots(runs: RunRecord[]): string {
  const passed = runs.filter((r) => r.passed).length
  const dots = runs
    .map((r) => `<i class="d ${r.passed ? 'pass' : r.ok ? 'partial' : 'fail'}"></i>`)
    .join('')
  return `<span class="dots">${dots}</span><span class="tally">${passed}/${runs.length} passed</span>`
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
<summary><span class="chev"></span><span class="badge">${r.passed ? 'pass' : r.ok ? 'partial' : 'error'}</span><b class="num">#${r.index + 1}</b><span class="score">${pct(r.score)}</span><span class="meta">${seconds(m.durationMs)} · ${usd(m.costUsd)} · ${m.filesChanged} ${m.filesChanged === 1 ? 'file' : 'files'}</span></summary>
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
    const col = async (arm: 'baseline' | 'skill', name: string) => {
      const mine = runs.filter((r) => r.arm === arm)
      const cards = await Promise.all(mine.map((r) => runCard(r, outDir)))
      return `<div><h4><span>${e(name)}</span>${runDots(mine)}</h4>${cards.join('\n')}</div>`
    }
    taskSections.push(`<section class="task">
<header><h3>${e(t.id)}</h3><span class="pill ${t.effect}">${t.effect}</span><span class="lift ${t.effect}">${points(t.scoreLift.estimate)} pts</span></header>
${ciBar(t.scoreLift, t.effect)}
${stats(t, base, skill)}
<div class="cols">${await col('baseline', base)}${await col('skill', skill)}</div>
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
:root{--bg:#09090b;--surface:#101014;--raised:#18181b;--line:#27272a;--text:#fafafa;--dim:#a1a1aa;--faint:#63636e;--blue:#5b8cff;--green:#4ade80;--red:#f87171;--amber:#fbbf24;--sans:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:radial-gradient(circle at 100% 0%,rgba(91,140,255,.2),transparent 55%) no-repeat top/100% 900px,var(--bg);color:var(--text);font:15px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
main{max-width:1040px;margin:0 auto;padding:56px 24px 72px}
.kicker{display:flex;align-items:center;gap:10px;font:600 14px var(--sans);color:var(--dim)}
.kicker::before{content:"";width:9px;height:9px;border-radius:50%;background:var(--blue)}
h1{font-size:56px;font-weight:800;line-height:1.05;margin:20px 0 12px;letter-spacing:-.04em;overflow-wrap:anywhere}
.desc{color:var(--dim);font-size:18px;line-height:1.5;max-width:680px;margin:0 0 18px}
.metarow{display:flex;flex-wrap:wrap;gap:8px;color:var(--dim);font:12px var(--mono)}
.metarow span{padding:4px 10px;border:1px solid var(--line);border-radius:999px;background:rgba(24,24,27,.6)}
.verdict{margin:36px 0 14px;padding:36px 36px 34px;border:1px solid var(--line);border-radius:20px;background:radial-gradient(circle at 100% 0%,rgba(91,140,255,.16),transparent 60%),var(--surface);position:relative;overflow:hidden}
.verdict::after{content:"";position:absolute;left:0;right:0;bottom:0;height:6px;background:var(--blue)}
.verdict .eyebrow{font:600 12px var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--dim)}
.verdict .big{margin-top:10px;font-size:84px;font-weight:800;letter-spacing:-.05em;line-height:1;font-variant-numeric:tabular-nums}
.verdict .big small{font-size:.34em;font-weight:600;letter-spacing:-.01em;color:var(--dim);margin-left:.3em}
.verdict.helps .big{color:var(--green)}.verdict.hurts .big{color:var(--red)}.verdict.unclear .big{color:var(--amber)}
.verdict p{margin:16px 0 0;font-size:19px;line-height:1.45;max-width:640px}
.ci{position:relative;height:40px;margin:20px 0 4px}
.ci .axis{position:absolute;top:11px;left:0;right:0;height:2px;border-radius:1px;background:var(--line)}
.ci .grid{position:absolute;top:8px;width:1px;height:8px;background:var(--line)}
.ci .zero{position:absolute;top:2px;left:50%;width:1px;height:20px;background:var(--faint)}
.ci .range{position:absolute;top:6px;height:12px;border-radius:6px;background:var(--amber);opacity:.5}
.ci.helps .range{background:var(--green)}.ci.hurts .range{background:var(--red)}
.ci .dot{position:absolute;top:4px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:var(--text);border:3px solid var(--surface);box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.ci .tick{position:absolute;top:26px;font:11px var(--mono);color:var(--faint)}
.ci .l{left:0}.ci .m{left:50%;transform:translateX(-50%)}.ci .r{right:0}
.verdict .ci{margin-top:30px}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:14px 0}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 16px 14px;min-width:0}
.stat .label{color:var(--dim);font:600 11px var(--sans);text-transform:uppercase;letter-spacing:.08em}
.stat .pair{display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px 10px;margin:12px 0 10px;font:600 19px/1.1 var(--mono);letter-spacing:-.02em;color:var(--dim)}
.stat .pair>span{min-width:0}
.stat .pair .to{color:var(--text)}
.stat .pair .arrow{color:var(--faint);font-weight:400;font-size:15px;line-height:23px}
.stat .pair small{display:block;margin-bottom:5px;font:500 11px var(--sans);letter-spacing:0;color:var(--faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meter{height:4px;border-radius:2px;background:var(--raised);margin-top:4px;overflow:hidden}
.meter i{display:block;height:100%;border-radius:2px;background:var(--faint);transform-origin:0 50%}
.meter.skill i{background:var(--blue)}
.stat .delta{margin-top:12px;font:12px var(--mono);color:var(--dim)}
.stat .delta b{font-weight:600;color:var(--text)}
h2{font-size:26px;font-weight:700;letter-spacing:-.02em;margin:52px 0 0}
.task{margin:18px 0 0;padding:24px;border:1px solid var(--line);border-radius:18px;background:rgba(16,16,20,.72)}
.task .stat{background:rgba(24,24,27,.55)}.task .stat .pair{font-size:17px}
.task .ci .dot{border-color:#0e0e12}
.task header{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px}
.task h3{margin:0;font:600 19px var(--mono);letter-spacing:-.02em;overflow-wrap:anywhere}
.pill{font:600 11px var(--mono);text-transform:uppercase;letter-spacing:.04em;padding:3px 9px;border-radius:999px}
.pill.helps{color:var(--green);background:rgba(74,222,128,.12)}.pill.hurts{color:var(--red);background:rgba(248,113,113,.12)}.pill.unclear{color:var(--amber);background:rgba(251,191,36,.12)}
.lift{margin-left:auto;font:700 21px var(--mono);letter-spacing:-.02em}
.lift.helps{color:var(--green)}.lift.hurts{color:var(--red)}.lift.unclear{color:var(--amber)}
.cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 20px;margin-top:6px}
.cols h4{display:flex;align-items:center;gap:10px;margin:12px 0 10px;font:600 13px var(--sans);color:var(--dim)}
.cols h4>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dots{display:flex;gap:4px;margin-left:auto}
.dots .d{width:8px;height:8px;border-radius:50%;background:var(--red)}
.dots .pass{background:var(--green)}.dots .partial{background:var(--amber)}
.tally{font:12px var(--mono);color:var(--faint);white-space:nowrap}
.run{background:var(--raised);border:1px solid var(--line);border-radius:10px;margin:6px 0;padding:0 12px;transition:border-color .15s}
.run:hover,.run[open]{border-color:#3a3a42}
.run>summary{cursor:pointer;display:flex;align-items:center;flex-wrap:wrap;gap:4px 10px;padding:10px 0;list-style:none;font:13px var(--mono);outline-offset:4px}
.run>summary::-webkit-details-marker{display:none}
.chev{width:6px;height:6px;margin:0 2px 0 1px;border-right:1.5px solid var(--faint);border-bottom:1.5px solid var(--faint);transform:rotate(-45deg);transition:transform .15s}
.run[open]>summary .chev{transform:rotate(45deg)}
.run .badge{font:600 10px var(--mono);text-transform:uppercase;letter-spacing:.04em;padding:2px 6px;border-radius:4px;background:var(--line)}
.run.pass .badge{background:rgba(74,222,128,.14);color:var(--green)}.run.fail .badge{background:rgba(248,113,113,.14);color:var(--red)}.run.partial .badge{background:rgba(251,191,36,.14);color:var(--amber)}
.run .num{color:var(--dim);font-weight:500}
.run .score{font-weight:600}.run .meta{margin-left:auto;color:var(--faint);font-size:12px}
.checks{list-style:none;margin:0;padding:8px 0 10px;border-top:1px solid var(--line)}
.checks li{padding:3px 0;font-size:13px;overflow-wrap:anywhere}
.checks .mark{display:inline-block;width:20px}.checks .pass .mark{color:var(--green)}.checks .fail .mark{color:var(--red)}
.checks .cname{font:12.5px var(--mono)}.checks .jscore{margin-left:8px;color:var(--blue);font:600 12px var(--mono)}
.checks .detail{margin:3px 0 5px 20px;color:var(--dim);white-space:pre-wrap;font:12px/1.5 var(--mono);max-height:160px;overflow:auto}
.error{color:var(--red);font:12px var(--mono);white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:8px}
.files{padding-bottom:10px}.files code{font:11px var(--mono);color:var(--dim);background:var(--bg);border:1px solid var(--line);padding:1px 6px;border-radius:5px;display:inline-block;margin:2px 0;overflow-wrap:anywhere}
.patch{padding-bottom:12px}.patch summary{cursor:pointer;color:var(--blue);font:12px var(--mono)}
.patch pre{max-height:420px;overflow:auto;margin:8px 0 0;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;font:11.5px/1.5 var(--mono);color:#d4d4d8;white-space:pre}
footer{margin-top:56px;color:var(--faint);font:12px/1.7 var(--mono);border-top:1px solid var(--line);padding-top:18px;overflow-wrap:anywhere}
footer .note{margin:0 0 8px;max-width:760px;font:13px/1.6 var(--sans);color:var(--dim)}
footer a{color:var(--blue);text-decoration:none}footer a:hover{text-decoration:underline}
:focus-visible{outline:2px solid var(--blue);border-radius:4px}
@media (max-width:1000px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:720px){main{padding:32px 16px 56px}h1{font-size:38px;margin-top:16px}.desc{font-size:16px}.verdict{padding:24px 20px 26px;border-radius:16px}.verdict .big{font-size:60px}.verdict p{font-size:17px}.stats{gap:10px}.stat{padding:14px 12px 12px}.stat .pair,.task .stat .pair{font-size:14px;gap:6px 8px}.stat .pair .arrow{display:none}.stat .delta>span{display:block;margin-top:2px}.stat .delta .sep{display:none}.task{padding:18px 14px}.cols{grid-template-columns:minmax(0,1fr)}h2{margin-top:40px}}
@media (prefers-reduced-motion:no-preference){
.verdict,.verdict+.stats{animation:rise .5s cubic-bezier(.2,.7,.2,1) both}
.verdict+.stats{animation-delay:.08s}
.verdict .range{animation:grow .7s .25s cubic-bezier(.2,.7,.2,1) both}
.verdict .dot{animation:fade .3s .2s both}
.verdict+.stats .meter i{animation:fill .7s .3s cubic-bezier(.2,.7,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(8px)}}
@keyframes grow{from{transform:scaleX(0)}}
@keyframes fill{from{transform:scaleX(0)}}
@keyframes fade{from{opacity:0}}
}
@media print{.run,.task,.stat,.verdict{break-inside:avoid}}
</style>
</head>
<body>
<main>
<div class="kicker">skilltrial report</div>
<h1>${e(skill)}</h1>
${results.skill.description ? `<p class="desc">${e(results.skill.description)}</p>` : ''}
<div class="metarow"><span>${e(agent)}</span><span>${results.runsPerArm} runs per arm</span><span>${results.summary.tasks.length} tasks</span><span>seed ${results.seed}</span><span>${e(results.createdAt.slice(0, 16).replace('T', ' '))} UTC</span></div>

<div class="verdict ${o.effect}">
<div class="eyebrow">Score lift</div>
<div class="big">${points(o.scoreLift.estimate)}<small>pts</small></div>
<p>${e(verdictLine(o, skill, base))}</p>
${ciBar(o.scoreLift, o.effect)}
</div>
${stats(o, base, skill)}

<h2>Tasks</h2>
${taskSections.join('\n')}

<footer>
<p class="note">Score is the weighted share of checks passed per run (judge checks count as score/10). Lift is skill minus ${e(base)}, averaged over tasks, with a 95% bootstrap interval. Pass rate intervals use Newcombe's method.</p>
skill ${results.skill.hash.slice(0, 16)} · tasks ${results.taskFile.hash.slice(0, 16)} · skilltrial ${e(results.tool.version)} · <a href="https://github.com/whosdrix/skilltrial">github.com/whosdrix/skilltrial</a>
</footer>
</main>
</body>
</html>
`
}
