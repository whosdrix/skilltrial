import { appendFile, cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { exec, sh, tail } from './exec.js'

export interface Sandbox {
  dir: string
  base: string
}

const IGNORED = ['node_modules/', '.venv/', '__pycache__/', 'target/', '.DS_Store']

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'skilltrial',
  GIT_AUTHOR_EMAIL: 'skilltrial@localhost',
  GIT_COMMITTER_NAME: 'skilltrial',
  GIT_COMMITTER_EMAIL: 'skilltrial@localhost',
  GIT_CONFIG_NOSYSTEM: '1',
}

async function git(dir: string, args: string[]): Promise<string> {
  const r = await exec('git', args, { cwd: dir, env: gitEnv })
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${tail(r.stderr, 500)}`)
  return r.stdout
}

export interface CreateSandboxOptions {
  dir: string
  fixture?: string
  setup?: string
  setupTimeoutMs?: number
}

export async function createSandbox(opts: CreateSandboxOptions): Promise<Sandbox> {
  await rm(opts.dir, { recursive: true, force: true })
  await mkdir(opts.dir, { recursive: true })
  if (opts.fixture) {
    await cp(opts.fixture, opts.dir, {
      recursive: true,
      filter: (src) => basename(src) !== '.git',
    })
  }
  if (opts.setup) {
    const r = await sh(opts.setup, { cwd: opts.dir, timeoutMs: opts.setupTimeoutMs ?? 600_000 })
    if (r.code !== 0) {
      throw new Error(
        `setup "${opts.setup}" failed (${r.code}): ${tail(r.stderr || r.stdout, 800)}`,
      )
    }
  }
  await git(opts.dir, ['init', '-q', '-b', 'main'])
  await writeFile(
    join(opts.dir, '.git', 'info', 'exclude'),
    `${[...IGNORED, '.claude/skills/'].join('\n')}\n`,
  )
  await git(opts.dir, ['add', '-A'])
  await git(opts.dir, ['commit', '-q', '--allow-empty', '--no-verify', '-m', 'skilltrial base'])
  const base = (await git(opts.dir, ['rev-parse', 'HEAD'])).trim()
  return { dir: opts.dir, base }
}

export async function installSkill(
  sandbox: Sandbox,
  skillDir: string,
  skillPath: string,
  name: string,
) {
  const target = join(sandbox.dir, skillPath, name)
  await appendFile(
    join(sandbox.dir, '.git', 'info', 'exclude'),
    `${skillPath.replace(/\/$/, '')}/\n`,
  )
  await mkdir(target, { recursive: true })
  await cp(skillDir, target, {
    recursive: true,
    filter: (src) =>
      !['.git', 'node_modules', 'skilltrial.yaml', '.skilltrial'].includes(basename(src)),
  })
  return target
}

export interface Changes {
  files: string[]
  added: number
  removed: number
  patch: string
}

export async function collectChanges(sandbox: Sandbox, skillPath: string): Promise<Changes> {
  const exclude = `:(exclude)${skillPath.replace(/\/$/, '')}`
  await git(sandbox.dir, ['add', '-A'])
  const numstat = await git(sandbox.dir, [
    'diff',
    '--cached',
    '--numstat',
    sandbox.base,
    '--',
    '.',
    exclude,
  ])
  let added = 0
  let removed = 0
  const files: string[] = []
  for (const line of numstat.split('\n')) {
    if (!line.trim()) continue
    const [a, r, ...rest] = line.split('\t')
    added += Number(a) || 0
    removed += Number(r) || 0
    files.push(rest.join('\t'))
  }
  const patch = await git(sandbox.dir, [
    'diff',
    '--cached',
    '--no-color',
    sandbox.base,
    '--',
    '.',
    exclude,
  ])
  return { files, added, removed, patch }
}
