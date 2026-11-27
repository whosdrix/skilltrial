import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCheck, scoreChecks } from '../src/checks.js'
import { checkSchema } from '../src/config.js'
import { FIXTURES, tempDir } from './helpers.js'

async function check(raw: unknown, dir: string) {
  const parsed = checkSchema.parse(raw)
  return runCheck(parsed, 0, {
    dir,
    judgeDir: dir,
    timeoutMs: 10_000,
    judge: { type: 'command', command: `node ${join(FIXTURES, 'fake-judge.mjs')}` },
  })
}

describe('checks', async () => {
  const dir = await tempDir()
  await writeFile(join(dir, 'out.txt'), 'hello world\nanswer: 42\n')

  it('runs shell commands', async () => {
    expect((await check({ run: 'grep -q 42 out.txt' }, dir)).passed).toBe(true)
    const bad = await check({ run: 'echo nope >&2; exit 3' }, dir)
    expect(bad.passed).toBe(false)
    expect(bad.detail).toContain('exit 3')
    expect(bad.detail).toContain('nope')
  })

  it('checks file contents', async () => {
    expect((await check({ file: 'out.txt', contains: ['hello', '42'] }, dir)).passed).toBe(true)
    expect((await check({ file: 'out.txt', matches: '^answer: \\d+$' }, dir)).passed).toBe(true)
    const bad = await check({ file: 'out.txt', contains: 'goodbye', absent: 'hello' }, dir)
    expect(bad.detail).toBe('missing "goodbye", contains "hello"')
    expect((await check({ file: 'missing.txt', exists: true }, dir)).passed).toBe(false)
    expect((await check({ file: 'missing.txt', exists: false }, dir)).passed).toBe(true)
  })

  it('refuses paths outside the workspace', async () => {
    const r = await check({ file: '../../etc/passwd', exists: true }, dir)
    expect(r.passed).toBe(false)
    expect(r.detail).toContain('outside the workspace')
  })

  it('asks the judge and scales its score', async () => {
    const r = await check({ judge: 'Is the answer 42?', files: ['*.txt'], pass: 8 }, dir)
    expect(r.score).toBeCloseTo(0.9)
    expect(r.passed).toBe(true)
    expect(r.detail).toContain('9/10')
  })

  it('weights scores', () => {
    const base = { kind: 'run' as const, detail: '', durationMs: 0, name: 'x' }
    const s = scoreChecks([
      { ...base, weight: 3, score: 1, passed: true },
      { ...base, weight: 1, score: 0, passed: false },
    ])
    expect(s).toEqual({ score: 0.75, passed: false })
  })
})
