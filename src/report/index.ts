import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TrialResults } from '../results.js'
import { badge } from './badge.js'
import { renderHtml } from './html.js'
import { markdownSummary } from './markdown.js'

export async function writeReports(results: TrialResults, outDir: string) {
  const b = badge(results)
  const files = {
    results: join(outDir, 'results.json'),
    html: join(outDir, 'report.html'),
    markdown: join(outDir, 'summary.md'),
    badge: join(outDir, 'badge.svg'),
    endpoint: join(outDir, 'badge.json'),
  }
  await writeFile(files.results, `${JSON.stringify(results, null, 2)}\n`)
  await writeFile(files.html, await renderHtml(results, outDir))
  await writeFile(files.markdown, markdownSummary(results))
  await writeFile(files.badge, b.svg)
  await writeFile(files.endpoint, `${JSON.stringify(b.endpoint)}\n`)
  return files
}
