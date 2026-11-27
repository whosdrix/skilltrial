import { describe, expect, it } from 'vitest'
import { bootstrapDiff, effectOf, mulberry32, newcombe, shuffle, wilson } from '../src/stats.js'

describe('wilson', () => {
  it('matches the textbook example', () => {
    const ci = wilson(81, 263)
    expect(ci.low).toBeCloseTo(0.2553, 3)
    expect(ci.high).toBeCloseTo(0.3662, 3)
  })

  it('stays inside [0, 1] at the edges', () => {
    expect(wilson(0, 5).low).toBe(0)
    expect(wilson(5, 5).high).toBe(1)
    expect(wilson(0, 5).high).toBeGreaterThan(0.4)
  })
})

describe('newcombe', () => {
  it('reproduces example (a) from Newcombe 1998', () => {
    const ci = newcombe(56, 70, 48, 80)
    expect(ci.low).toBeCloseTo(0.0524, 3)
    expect(ci.high).toBeCloseTo(0.3339, 3)
  })

  it('gives a wide interval for tiny samples', () => {
    const ci = newcombe(3, 3, 0, 3)
    expect(ci.low).toBeGreaterThan(0)
    expect(ci.low).toBeLessThan(0.5)
    expect(ci.high).toBeLessThanOrEqual(1)
  })
})

describe('bootstrapDiff', () => {
  it('is deterministic for a seed', () => {
    const g = [{ treatment: [0.8, 0.9, 1, 0.7], control: [0.5, 0.6, 0.4, 0.7] }]
    expect(bootstrapDiff(g, { seed: 7 })).toEqual(bootstrapDiff(g, { seed: 7 }))
  })

  it('finds a clear effect', () => {
    const g = [{ treatment: [0.9, 1, 0.95, 1, 0.9], control: [0.2, 0.3, 0.25, 0.1, 0.3] }]
    const ci = bootstrapDiff(g)
    expect(ci.estimate).toBeCloseTo(0.72, 2)
    expect(effectOf(ci)).toBe('helps')
  })

  it('calls noise unclear', () => {
    const g = [{ treatment: [0.2, 0.9, 0.5, 0.1], control: [0.8, 0.3, 0.4, 0.6] }]
    expect(effectOf(bootstrapDiff(g))).toBe('unclear')
  })

  it('weights tasks equally', () => {
    const g = [
      { treatment: [1, 1, 1, 1, 1, 1, 1, 1], control: [0, 0, 0, 0, 0, 0, 0, 0] },
      { treatment: [0, 0], control: [0, 0] },
    ]
    expect(bootstrapDiff(g).estimate).toBeCloseTo(0.5)
  })
})

describe('shuffle', () => {
  it('keeps every element', () => {
    const out = shuffle([1, 2, 3, 4, 5, 6], mulberry32(3))
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })
})
