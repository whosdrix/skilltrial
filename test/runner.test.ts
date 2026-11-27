import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadTrial } from '../src/config.js'
import { writeReports } from '../src/report/index.js'
import { planJobs, runTrial } from '../src/runner.js'
import { loadSkill } from '../src/skill.js'
import { FIXTURES, tempDir, writeTrial } from './helpers.js'

const TRIAL = `
agent:
  type: command
  command: node ${join(FIXTURES, 'fake-agent.mjs')}
judge:
  type: command
  command: node ${join(FIXTURES, 'fake-judge.mjs')}
runs: 4
concurrency: 4
tasks:
  - id: sum
    fixture: ${join(FIXTURES, 'app')}
    prompt: Write 40 + 2 to answer.txt
    checks:
      - name: answer is right
        file: answer.txt
        contains: "42"
      - name: readme untouched
        run: grep -q '# app' README.md
      - judge: Is the answer correct?
        files: [answer.txt]
`

describe('planJobs', () => {
  it('pairs every run and is reproducible', async () => {
    const dir = await tempDir()
    const trial = await loadTrial(await writeTrial(dir, TRIAL))
    const a = planJobs(trial.config.tasks, 6, 1)
    expect(a).toHaveLength(12)
    expect(a.filter((j) => j.arm === 'skill')).toHaveLength(6)
    expect(planJobs(trial.config.tasks, 6, 1)).toEqual(a)
    const firstArms = new Set(
      [0, 1, 2, 3, 4, 5].map((i) => a.findIndex((j) => j.index === i && j.arm === 'skill') % 2),
    )
    expect(firstArms.size).toBe(2)
  })
})

describe('runTrial', () => {
  it('measures a skill that helps', async () => {
    const dir = await tempDir()
    const trial = await loadTrial(await writeTrial(dir, TRIAL))
    const skill = await loadSkill(join(FIXTURES, 'skill-good'))
    const outDir = join(dir, 'out')
    const results = await runTrial({ skill, trial, outDir, seed: 5 })

    expect(results.runs).toHaveLength(8)
    expect(results.runs.every((r) => r.ok)).toBe(true)
    const o = results.summary.overall
    expect(o.skill.passRate).toBe(1)
    expect(o.baseline.passRate).toBe(0)
    expect(o.effect).toBe('helps')
    expect(o.scoreLift.estimate).toBeCloseTo(2.9 / 3 - 1.3 / 3, 5)
    expect(o.skill.medianCostUsd).toBeCloseTo(0.012)
    expect(results.runs[0]?.files).toEqual(['answer.txt'])

    const patch = await readFile(
      join(outDir, results.runs[0]?.logDir ?? '', 'changes.patch'),
      'utf8',
    )
    expect(patch).toContain('+41')
    expect(patch).not.toContain('SKILL.md')

    const files = await writeReports(results, outDir)
    const html = await readFile(files.html, 'utf8')
    expect(html).toContain('careful-math')
    expect(html).toContain('answer is right')
    expect(await readFile(files.badge, 'utf8')).toContain('skilltrial')
    expect(JSON.parse(await readFile(files.endpoint, 'utf8')).message).toMatch(/^\+\d+ pts$/)
    expect(await readFile(files.markdown, 'utf8')).toContain('careful-math helps')
  })

  it('compares two versions of a skill', async () => {
    const dir = await tempDir()
    const trial = await loadTrial(await writeTrial(dir, TRIAL))
    const results = await runTrial({
      skill: await loadSkill(join(FIXTURES, 'skill-bad')),
      against: await loadSkill(join(FIXTURES, 'skill-good')),
      trial,
      outDir: join(dir, 'out'),
      runs: 3,
      seed: 1,
    })
    expect(results.baselineSkill?.name).toBe('careful-math')
    expect(results.summary.overall.effect).toBe('hurts')
  })

  it('records setup failures instead of crashing', async () => {
    const dir = await tempDir()
    const trial = await loadTrial(
      await writeTrial(dir, TRIAL.replace('    prompt:', '    setup: exit 9\n    prompt:')),
    )
    const results = await runTrial({
      skill: await loadSkill(join(FIXTURES, 'skill-good')),
      trial,
      outDir: join(dir, 'out'),
      runs: 1,
    })
    expect(results.runs.every((r) => !r.ok && r.error?.includes('setup'))).toBe(true)
  })
})
