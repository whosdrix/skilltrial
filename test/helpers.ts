import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const FIXTURES = resolve(import.meta.dirname, 'fixtures')

export async function tempDir(prefix = 'st-test-') {
  return mkdtemp(join(tmpdir(), prefix))
}

export async function writeTrial(dir: string, yaml: string) {
  const path = join(dir, 'skilltrial.yaml')
  await writeFile(path, yaml)
  return path
}
