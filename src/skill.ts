import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, join, relative, resolve } from 'node:path'
import { glob } from 'tinyglobby'
import { parse } from 'yaml'

export interface Skill {
  name: string
  description?: string
  dir: string
  hash: string
  files: number
}

export async function loadSkill(path: string): Promise<Skill> {
  const dir = resolve(path)
  const info = await stat(dir).catch(() => null)
  if (!info?.isDirectory()) throw new Error(`Skill path ${path} is not a directory`)

  let skillMd: string
  try {
    skillMd = await readFile(join(dir, 'SKILL.md'), 'utf8')
  } catch {
    throw new Error(`No SKILL.md in ${path}. Point skilltrial at the folder that holds SKILL.md.`)
  }

  const meta = frontmatter(skillMd)
  const name = typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : basename(dir)
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    throw new Error(`Skill name "${name}" can't be used as a folder name`)
  }

  const files = (
    await glob('**/*', { cwd: dir, dot: true, ignore: ['**/node_modules/**', '**/.git/**'] })
  ).sort()
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(relative(dir, join(dir, file)))
    hash.update('\0')
    hash.update(await readFile(join(dir, file)))
    hash.update('\0')
  }

  return {
    name,
    description: typeof meta.description === 'string' ? meta.description : undefined,
    dir,
    hash: hash.digest('hex'),
    files: files.length,
  }
}

export function frontmatter(text: string): Record<string, unknown> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m?.[1]) return {}
  try {
    const value = parse(m[1])
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
