import { spawn } from 'node:child_process'

export interface ExecOptions {
  cwd: string
  env?: NodeJS.ProcessEnv
  input?: string
  timeoutMs?: number
  shell?: boolean
  maxOutput?: number
}

export interface ExecResult {
  code: number | null
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
}

const DEFAULT_MAX = 4 * 1024 * 1024

export function exec(command: string, args: string[], opts: ExecOptions): Promise<ExecResult> {
  const started = performance.now()
  const max = opts.maxOutput ?? DEFAULT_MAX
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      shell: opts.shell ?? false,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (d: string) => {
      if (stdout.length < max) stdout += d
    })
    child.stderr.on('data', (d: string) => {
      if (stderr.length < max) stderr += d
    })

    const kill = () => {
      if (child.pid === undefined) return
      try {
        if (process.platform === 'win32') child.kill('SIGKILL')
        else process.kill(-child.pid, 'SIGKILL')
      } catch {
        // already gone
      }
    }

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          kill()
        }, opts.timeoutMs)
      : undefined

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({ code, stdout, stderr, durationMs: performance.now() - started, timedOut })
    })

    child.stdin.on('error', () => {})
    child.stdin.end(opts.input ?? '')
  })
}

export function sh(script: string, opts: ExecOptions): Promise<ExecResult> {
  if (process.platform === 'win32') return exec(script, [], { ...opts, shell: true })
  return exec('/bin/sh', ['-c', script], opts)
}

export function tail(text: string, chars = 4000): string {
  return text.length > chars ? `…${text.slice(-chars)}` : text
}
