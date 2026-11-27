import { describe, expect, it } from 'vitest'
import { claudeArgs } from '../src/agents/claude-code.js'
import { parseClaudeOutput } from '../src/agents/types.js'
import { parseDuration } from '../src/config.js'
import { points } from '../src/format.js'
import { parseVerdict } from '../src/judge.js'
import { frontmatter } from '../src/skill.js'

describe('parseClaudeOutput', () => {
  const result = {
    type: 'result',
    is_error: false,
    result: 'done',
    num_turns: 4,
    total_cost_usd: 0.031,
    usage: { input_tokens: 10, cache_creation_input_tokens: 90, output_tokens: 300 },
  }

  it('reads a json result', () => {
    expect(parseClaudeOutput(JSON.stringify(result))).toMatchObject({
      result: 'done',
      costUsd: 0.031,
      inputTokens: 100,
      outputTokens: 300,
      turns: 4,
    })
  })

  it('reads the result out of a verbose array', () => {
    const out = JSON.stringify([{ type: 'system' }, { type: 'assistant' }, result])
    expect(parseClaudeOutput(out)?.turns).toBe(4)
  })

  it('reads the last json line after other output', () => {
    expect(parseClaudeOutput(`npm warn something\n${JSON.stringify(result)}`)?.result).toBe('done')
  })

  it('returns undefined for plain text', () => {
    expect(parseClaudeOutput('hello')).toBeUndefined()
  })
})

describe('parseVerdict', () => {
  it('finds the score object in chatter', () => {
    expect(parseVerdict('Sure.\n{"score": 7.5, "reason": "ok"}')).toEqual({
      score: 7.5,
      reason: 'ok',
    })
  })

  it('clamps out of range scores', () => {
    expect(parseVerdict('{"score": 14}').score).toBe(10)
  })

  it('throws without a score', () => {
    expect(() => parseVerdict('I think it is good')).toThrow(/did not return a score/)
  })
})

describe('parseDuration', () => {
  it.each([
    ['90', 90_000],
    ['90s', 90_000],
    ['10m', 600_000],
    ['1.5h', 5_400_000],
    ['250ms', 250],
  ])('%s', (input, ms) => expect(parseDuration(input)).toBe(ms))
})

describe('points', () => {
  it('signs the number', () => {
    expect(points(0.314)).toBe('+31')
    expect(points(-0.05)).toBe('−5')
    expect(points(0.001)).toBe('±0')
  })
})

describe('frontmatter', () => {
  it('reads name and description', () => {
    expect(frontmatter('---\nname: x\ndescription: y\n---\nbody')).toEqual({
      name: 'x',
      description: 'y',
    })
  })
  it('ignores files without it', () => {
    expect(frontmatter('# just markdown')).toEqual({})
  })
})

describe('claudeArgs', () => {
  it('runs headless and skips user settings', () => {
    const args = claudeArgs('do it', {
      bin: 'claude',
      model: 'sonnet',
      args: ['--max-turns', '20'],
    })
    expect(args.slice(0, 2)).toEqual(['-p', 'do it'])
    expect(args).toContain('--dangerously-skip-permissions')
    expect(args.join(' ')).toContain('--setting-sources project,local')
    expect(args.join(' ')).toContain('--model sonnet')
    expect(args.slice(-2)).toEqual(['--max-turns', '20'])
  })
})
