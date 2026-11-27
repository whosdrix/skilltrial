#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, relative as rel, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import pc from 'picocolors'
import { loadTrial } from './config.js'
import { writeReports } from './report/index.js'
import { runLine, terminalSummary } from './report/terminal.js'
import type { TrialResults } from './results.js'
import { runTrial } from './runner.js'
import { loadSkill } from './skill.js'
import { VERSION } from './version.js'

const HELP = `${pc.bold('skilltrial')} ${VERSION}
Find out if an agent skill actually helps.

${pc.bold('Usage')}
  skilltrial run <skill-dir> [options]   run every task with and without the skill
  skilltrial report <results.json>       rebuild the HTML report from saved results
  skilltrial init [file]                 write a starter task file

${pc.bold('Run options')}
  -t, --tasks <file>        task file (default: ./skilltrial.yaml)
  -n, --runs <n>            runs per arm for each task
  -j, --concurrency <n>     runs in parallel
  -m, --model <model>       model for the agent
  -o, --out <dir>           output folder (default: .skilltrial/<time>-<skill>)
      --against <dir>       compare with another version of the skill instead of no skill
      --task <id>           only run this task (repeatable)
      --seed <n>            fix the run order for a reproducible trial
      --keep                keep the temporary workspaces
      --fail-on-regression  exit 1 if the skill makes scores worse
      --min-lift <points>   exit 1 if the score lift is below this many points

${pc.bold('Examples')}
  skilltrial init
  skilltrial run ./skills/frontend-design -n 8
  skilltrial run ./my-skill --against ./my-skill-main --fail-on-regression
`

function fail(message: string): never {
  console.error(pc.red(`error: ${message}`))
  process.exit(2)
}

function int(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) fail(`--${name} must be a positive whole number`)
  return n
}

function relative(from: string, to: string): string {
  const r = rel(from, to)
  return r.startsWith('..') ? to : r
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

function warnUserSkill(name: string) {
  const dir = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'skills', name)
  if (existsSync(dir)) {
    console.warn(
      pc.yellow(
        `warning: ${dir} exists, so Claude Code may load this skill in the baseline runs too.\n` +
          '         Move it aside while the trial runs, or the comparison will understate the effect.',
      ),
    )
  }
}

async function cmdRun(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      tasks: { type: 'string', short: 't' },
      runs: { type: 'string', short: 'n' },
      concurrency: { type: 'string', short: 'j' },
      model: { type: 'string', short: 'm' },
      out: { type: 'string', short: 'o' },
      against: { type: 'string' },
      task: { type: 'string', multiple: true },
      seed: { type: 'string' },
      keep: { type: 'boolean' },
      'fail-on-regression': { type: 'boolean' },
      'min-lift': { type: 'string' },
    },
  })
  const skillPath = positionals[0]
  if (!skillPath) fail('give the path to a skill folder, e.g. skilltrial run ./skills/my-skill')

  const skill = await loadSkill(skillPath)
  const against = values.against ? await loadSkill(values.against) : undefined
  const tasksPath =
    values.tasks ??
    [join(process.cwd(), 'skilltrial.yaml'), join(skill.dir, 'skilltrial.yaml')].find((p) =>
      existsSync(p),
    )
  if (!tasksPath) fail('no task file found. Pass --tasks or run "skilltrial init".')
  const trial = await loadTrial(tasksPath)
  if (trial.config.agent.type === 'claude-code') warnUserSkill(skill.name)

  const seed = values.seed !== undefined ? Number(values.seed) : undefined
  if (seed !== undefined && !Number.isInteger(seed)) fail('--seed must be a whole number')
  const minLift = values['min-lift'] !== undefined ? Number(values['min-lift']) : undefined
  if (minLift !== undefined && !Number.isFinite(minLift)) fail('--min-lift must be a number')

  const outDir = resolve(values.out ?? join('.skilltrial', `${stamp()}-${skill.name}`))
  console.log(
    `${pc.bold('skilltrial')} ${pc.dim(VERSION)}  ${pc.cyan(skill.name)} vs ${against ? pc.cyan(against.name) : 'no skill'}  ${pc.dim(`· ${relative(process.cwd(), trial.path)}`)}`,
  )

  const results = await runTrial({
    skill,
    against,
    trial,
    outDir,
    runs: int(values.runs, 'runs'),
    concurrency: int(values.concurrency, 'concurrency'),
    model: values.model,
    seed,
    only: values.task,
    keepWorkdirs: values.keep,
    onEvent(event) {
      if (event.type === 'start') {
        console.log(
          pc.dim(
            `${event.tasks} tasks × ${event.runsPerArm} runs × 2 arms = ${event.total} runs\n`,
          ),
        )
      } else if (event.type === 'run-end') {
        console.log(runLine(event.record, event.done, event.total))
      }
    },
  })

  const files = await writeReports(results, outDir)
  console.log(terminalSummary(results))
  console.log(`  ${pc.dim('report')}  ${relative(process.cwd(), files.html)}`)
  console.log(`  ${pc.dim('badge')}   ${relative(process.cwd(), files.badge)}`)
  console.log(`  ${pc.dim('results')} ${relative(process.cwd(), files.results)}\n`)

  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = await readFile(files.markdown, 'utf8')
    await writeFile(process.env.GITHUB_STEP_SUMMARY, md, { flag: 'a' })
  }

  const o = results.summary.overall
  const errors = results.runs.filter((r) => !r.ok).length
  if (errors === results.runs.length) {
    console.error(pc.red('Every run failed. Check runs/*/agent.err in the output folder.'))
    process.exit(1)
  }
  if (values['fail-on-regression'] && o.effect === 'hurts') process.exit(1)
  if (minLift !== undefined && o.scoreLift.estimate * 100 < minLift) {
    console.error(
      pc.red(
        `Score lift ${(o.scoreLift.estimate * 100).toFixed(1)} is below --min-lift ${minLift}`,
      ),
    )
    process.exit(1)
  }
}

async function cmdReport(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { out: { type: 'string', short: 'o' } },
  })
  const file = positionals[0] ?? fail('give the path to a results.json')
  const results = JSON.parse(await readFile(file, 'utf8')) as TrialResults
  const outDir = resolve(values.out ?? dirname(file))
  const files = await writeReports(results, outDir)
  console.log(terminalSummary(results))
  console.log(`  ${pc.dim('report')}  ${relative(process.cwd(), files.html)}\n`)
}

async function cmdInit(args: string[]) {
  const { TEMPLATE } = await import('./init.js')
  const file = args[0] ?? 'skilltrial.yaml'
  if (existsSync(file)) fail(`${file} already exists`)
  await writeFile(file, TEMPLATE)
  console.log(`Wrote ${file}. Edit the tasks, then run: skilltrial run <skill-dir>`)
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  switch (cmd) {
    case 'run':
      return cmdRun(rest)
    case 'report':
      return cmdReport(rest)
    case 'init':
      return cmdInit(rest)
    case '-v':
    case '--version':
      console.log(VERSION)
      return
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      console.log(HELP)
      return
    default:
      fail(`unknown command "${cmd}". Run skilltrial --help.`)
  }
}

main().catch((err: Error) => fail(err.message))
