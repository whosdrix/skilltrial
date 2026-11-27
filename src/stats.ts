export interface Interval {
  low: number
  high: number
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN
}

export function median(xs: number[]): number {
  if (!xs.length) return Number.NaN
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2
}

const Z95 = 1.959963984540054

/** Wilson score interval for a binomial proportion. */
export function wilson(successes: number, n: number, z = Z95): Interval {
  if (n === 0) return { low: 0, high: 1 }
  const p = successes / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) }
}

/**
 * Newcombe's hybrid score interval for p1 - p2 (method 10 in Newcombe 1998).
 * Behaves well at small n and at 0% or 100%, where the Wald interval collapses.
 */
export function newcombe(s1: number, n1: number, s2: number, n2: number, z = Z95): Interval {
  const p1 = n1 ? s1 / n1 : 0
  const p2 = n2 ? s2 / n2 : 0
  const a = wilson(s1, n1, z)
  const b = wilson(s2, n2, z)
  const d = p1 - p2
  return {
    low: d - Math.sqrt((p1 - a.low) ** 2 + (b.high - p2) ** 2),
    high: d + Math.sqrt((a.high - p1) ** 2 + (p2 - b.low) ** 2),
  }
}

/**
 * Percentile bootstrap interval for mean(treatment) - mean(control).
 * With groups, each group is resampled on its own and the per-group
 * differences are averaged, so every task counts the same.
 */
export function bootstrapDiff(
  groups: { treatment: number[]; control: number[] }[],
  opts: { iterations?: number; seed?: number; level?: number } = {},
): Interval & { estimate: number } {
  const usable = groups.filter((g) => g.treatment.length && g.control.length)
  if (!usable.length) return { estimate: Number.NaN, low: Number.NaN, high: Number.NaN }
  const estimate = mean(usable.map((g) => mean(g.treatment) - mean(g.control)))
  if (usable.some((g) => g.treatment.length < 2 || g.control.length < 2)) {
    return { estimate, low: Number.NaN, high: Number.NaN }
  }
  const iterations = opts.iterations ?? 4000
  const rand = mulberry32(opts.seed ?? 1)
  const level = opts.level ?? 0.95
  const draws = new Float64Array(iterations)
  const resampleMean = (xs: number[]) => {
    let sum = 0
    for (let i = 0; i < xs.length; i++) sum += xs[Math.floor(rand() * xs.length)] as number
    return sum / xs.length
  }
  for (let it = 0; it < iterations; it++) {
    let total = 0
    for (const g of usable) total += resampleMean(g.treatment) - resampleMean(g.control)
    draws[it] = total / usable.length
  }
  draws.sort()
  const lo = Math.floor(((1 - level) / 2) * (iterations - 1))
  const hi = Math.ceil((1 - (1 - level) / 2) * (iterations - 1))
  return { estimate, low: draws[lo] as number, high: draws[hi] as number }
}

export type Effect = 'helps' | 'hurts' | 'unclear'

export function effectOf(ci: Interval, threshold = 0): Effect {
  if (Number.isNaN(ci.low)) return 'unclear'
  if (ci.low > threshold) return 'helps'
  if (ci.high < -threshold) return 'hurts'
  return 'unclear'
}
