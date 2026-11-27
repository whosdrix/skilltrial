import { escapeHtml, points } from '../format.js'
import type { TrialResults } from '../results.js'

const COLORS = { helps: '#2ea043', hurts: '#cf222e', unclear: '#6e7781' }

export function badgeMessage(results: TrialResults): { message: string; color: string } {
  const { scoreLift, effect } = results.summary.overall
  const lift = `${points(scoreLift.estimate)} pts`
  const message = effect === 'unclear' ? `${lift}, unclear` : lift
  return { message, color: COLORS[effect] }
}

function textWidth(text: string): number {
  let w = 0
  for (const ch of text) {
    if ("il.,:;!|'".includes(ch)) w += 3.2
    else if ('mwMW'.includes(ch)) w += 9.5
    else if (ch === ' ') w += 3.6
    else if (/[A-Z0-9+−]/.test(ch)) w += 7.4
    else w += 6.3
  }
  return Math.ceil(w)
}

export function badgeSvg(label: string, message: string, color: string): string {
  const lw = textWidth(label) + 12
  const mw = textWidth(message) + 12
  const w = lw + mw
  const l = escapeHtml(label)
  const m = escapeHtml(message)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${l}: ${m}">
<title>${l}: ${m}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#0f172a"/><rect x="${lw}" width="${mw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${l}</text><text x="${lw / 2}" y="14">${l}</text>
<text x="${lw + mw / 2}" y="15" fill="#010101" fill-opacity=".3">${m}</text><text x="${lw + mw / 2}" y="14">${m}</text>
</g>
</svg>
`
}

export function badge(results: TrialResults) {
  const { message, color } = badgeMessage(results)
  return {
    svg: badgeSvg('skilltrial', message, color),
    endpoint: { schemaVersion: 1, label: 'skilltrial', message, color: color.slice(1) },
  }
}
