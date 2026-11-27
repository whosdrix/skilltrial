import { describe, expect, it } from 'vitest'
import { loadTrial } from '../src/config.js'
import { tempDir, writeTrial } from './helpers.js'

describe('loadTrial', () => {
  it('fills in defaults', async () => {
    const dir = await tempDir()
    const path = await writeTrial(
      dir,
      `tasks:\n  - id: a\n    prompt: hi\n    checks:\n      - run: "true"\n`,
    )
    const trial = await loadTrial(path)
    expect(trial.config.runs).toBe(5)
    expect(trial.config.timeout).toBe(600_000)
    expect(trial.config.agent).toEqual({ type: 'claude-code', bin: 'claude', args: [] })
    expect(trial.config.judge).toBeUndefined()
    expect(trial.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('adds a default judge when a task needs one', async () => {
    const dir = await tempDir()
    const path = await writeTrial(
      dir,
      `tasks:\n  - id: a\n    prompt: hi\n    checks:\n      - judge: is it good\n`,
    )
    expect((await loadTrial(path)).config.judge).toEqual({ type: 'claude-code', bin: 'claude' })
  })

  it('reports schema problems with their path', async () => {
    const dir = await tempDir()
    const path = await writeTrial(
      dir,
      `runs: 0\ntasks:\n  - id: a\n    prompt: hi\n    checks: []\n`,
    )
    await expect(loadTrial(path)).rejects.toThrow(/runs[\s\S]*tasks\.0\.checks/)
  })

  it('rejects a file check with nothing to check', async () => {
    const dir = await tempDir()
    const path = await writeTrial(
      dir,
      `tasks:\n  - id: a\n    prompt: hi\n    checks:\n      - file: x\n`,
    )
    await expect(loadTrial(path)).rejects.toThrow(/exists, contains, matches or absent/)
  })

  it('rejects duplicate ids and missing fixtures', async () => {
    const dir = await tempDir()
    const dup = await writeTrial(
      dir,
      `tasks:\n  - {id: a, prompt: x, checks: [{run: "true"}]}\n  - {id: a, prompt: y, checks: [{run: "true"}]}\n`,
    )
    await expect(loadTrial(dup)).rejects.toThrow(/Duplicate task id "a"/)
    const missing = await writeTrial(
      dir,
      `tasks:\n  - {id: a, prompt: x, fixture: ./nope, checks: [{run: "true"}]}\n`,
    )
    await expect(loadTrial(missing)).rejects.toThrow(/not a directory/)
  })
})
