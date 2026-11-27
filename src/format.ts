import type { Interval } from './stats.js'

export function pct(x: number, digits = 0): string {
  if (!Number.isFinite(x)) return '–'
  return `${(x * 100).toFixed(digits)}%`
}

export function points(x: number, digits = 0): string {
  if (!Number.isFinite(x)) return '–'
  const rounded = Number((x * 100).toFixed(digits))
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
  return `${sign}${Math.abs(rounded).toFixed(digits)}`
}

export function interval(ci: Interval, digits = 0): string {
  if (!Number.isFinite(ci.low)) return '–'
  return `${points(ci.low, digits)} to ${points(ci.high, digits)}`
}

export function usd(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return '–'
  if (Math.abs(x) < 0.01 && x !== 0) return `$${x.toFixed(4)}`
  return `$${x.toFixed(2)}`
}

export function signedUsd(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return '–'
  return `${x >= 0 ? '+' : '−'}${usd(Math.abs(x))}`
}

export function seconds(ms: number): string {
  if (!Number.isFinite(ms)) return '–'
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

export function signedSeconds(ms: number): string {
  if (!Number.isFinite(ms)) return '–'
  return `${ms >= 0 ? '+' : '−'}${seconds(Math.abs(ms))}`
}

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c)
}
