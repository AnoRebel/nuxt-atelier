// What the deploy smoke tests share: an app made from a hosting guide's example files (scripts/standalone-app.ts),
// its .env.example filled with test values, free ports, servers started and stopped by PID, and the checks
// that a running app answers: the readiness endpoint and a rendered page.
import type { ChildProcess } from 'node:child_process'
import type { StandaloneOptions } from '../../scripts/standalone-app'
import { execFile, spawn } from 'node:child_process'
import { createReadStream, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect } from 'vitest'
import { createStandaloneApp } from '../../scripts/standalone-app'

export const ROOT = resolve(import.meta.dirname, '../..')
export const EXAMPLES = join(ROOT, 'examples', 'hosting')
/** Slow: run with ATELIER_DEPLOY=1 (a CI job of its own). */
export const enabled = !!process.env.ATELIER_DEPLOY
export const SECRET = 'a'.repeat(64)

export const run = promisify(execFile)

/** A temporary directory outside the workspace, removed by `cleanup`. */
export function tempDir(name: string): string {
  return mkdtempSync(join(tmpdir(), `atelier-deploy-${name}-`))
}

/** The app of a hosting guide, in a temporary directory outside the workspace. */
export async function exampleApp(name: string, options: StandaloneOptions = {}): Promise<string> {
  const dir = join(tempDir(name), 'my-site')
  await createStandaloneApp(dir, { example: name, ...options }).catch((error) => {
    cleanup(dir)
    throw error
  })
  return dir
}

/** `nuxt build` (the apps' `build` script), with the platform's environment. */
export async function build(dir: string, env: Record<string, string> = {}, command = ['npm', 'run', 'build']): Promise<void> {
  await run(command[0]!, command.slice(1), { cwd: dir, env: { ...process.env, NODE_ENV: 'production', ...env }, maxBuffer: 64 * 1024 * 1024 })
}

/** A port nothing listens on. */
export function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => done(port))
    }).on('error', fail)
  })
}

/** A .env.example's variables, the empty ones filled with test values (a secret, or a token). */
export function envExample(file: string, fill: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z_]\w*)=(.*)$/.exec(line.trim())
    if (match)
      env[match[1]!] = fill[match[1]!] ?? (match[2] || (match[1]!.endsWith('_SECRET') || match[1] === 'POSTGRES_PASSWORD' ? SECRET : 'test-token'))
  }
  return env
}

/** Serves .packs over HTTP, for a container build that installs from them. */
export async function servePacks(): Promise<{ url: string, close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const file = join(ROOT, '.packs', basename(decodeURIComponent(req.url ?? '')))
    createReadStream(file).on('error', () => res.writeHead(404).end()).once('open', () => res.writeHead(200, { 'content-type': 'application/gzip' })).pipe(res)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as { port: number }
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise(done => server.close(() => done())) }
}

/** A server started in the background; its output is kept for the failure message. */
export function start(command: string[], options: { cwd: string, env: Record<string, string> }): { child: ChildProcess, output: () => string } {
  let output = ''
  const child = spawn(command[0]!, command.slice(1), { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'] })
  const keep = (chunk: Buffer) => {
    output += chunk
  }
  child.stdout!.on('data', keep)
  child.stderr!.on('data', keep)
  return { child, output: () => output }
}

/** Stops a server started with `start`, by its PID. */
export async function stop(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode)
    return
  const exited = new Promise(done => child.once('exit', done))
  child.kill('SIGTERM')
  await Promise.race([exited, new Promise(done => setTimeout(done, 15_000))])
  if (child.exitCode === null && !child.signalCode)
    child.kill('SIGKILL')
}

/**
 * Waits until the readiness endpoint answers 200 (or the time is up), and checks a page renders and its script
 * is served. `storage: false` where no storage is reachable, `assets: false` where the platform serves them.
 */
export async function expectRunning(origin: string, logs: () => string | Promise<string> = () => '', { timeout = 90_000, storage = true, assets = true } = {}): Promise<void> {
  const deadline = Date.now() + timeout
  let last = 'no answer'
  while (Date.now() < deadline) {
    const response = await fetch(`${origin}/api/_atelier/health/ready`).catch(() => undefined)
    if (response?.status === 200)
      break
    if (response)
      last = `${response.status} ${await response.text()}`
    await new Promise(done => setTimeout(done, 1000))
  }
  const ready = await fetch(`${origin}/api/_atelier/health/ready`).catch(() => undefined)
  expect(ready?.status, `readiness: ${last}\n${await logs()}`).toBe(200)
  expect(await ready!.json()).toMatchObject({ status: 'ready', checks: { database: 'ok', migrations: { pending: 0 }, jobs: { failed: 0 }, ...storage && { storage: 'ok' } } })
  // the admin, a page of the app (the playground has no page at /): its HTML, and the script it loads
  const page = await fetch(`${origin}/admin`, { headers: { accept: 'text/html' } })
  expect(page.status).toBe(200)
  const html = await page.text()
  expect(html).toContain('<div id="__nuxt">')
  const entry = /<script type="module" src="([^"]+)"/.exec(html)?.[1]
  expect(entry).toBeDefined()
  if (assets)
    expect((await fetch(new URL(entry!, origin))).status).toBe(200)
}

/** A TOML or YAML file, parsed by Bun's own parsers (the workspace has neither as a dependency). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the platforms' config files, checked field by field
export async function parseConfig(file: string): Promise<any> {
  const parser = file.endsWith('.toml') ? 'TOML' : 'YAML'
  const { stdout } = await run('bun', ['-e', `console.log(JSON.stringify(Bun.${parser}.parse(await Bun.file(process.argv[1]).text())))`, file])
  return JSON.parse(stdout)
}

/** Removes a temporary app (the directory `exampleApp` made it in). */
export function cleanup(dir: string | undefined): void {
  if (dir)
    rmSync(resolve(dir, '..'), { recursive: true, force: true })
}

/** `docker build -t <tag> .` in the app, as the guides say; the host's network, to reach the served tarballs. */
export async function dockerBuild(dir: string, tag: string): Promise<void> {
  await run('docker', ['build', '--network', 'host', '-t', tag, '.'], { cwd: dir, maxBuffer: 64 * 1024 * 1024 }).catch((error) => {
    throw new Error(`docker build failed:\n${`${error.stdout}${error.stderr}`.slice(-4000)}`)
  })
}

/** The guides' `docker run -p 3000:3000 -v <volume>:/app/.data -e …`, on a free port; the container's id. */
export async function dockerRun(tag: string, port: number, volume: string, env: Record<string, string>): Promise<string> {
  const { stdout } = await run('docker', ['run', '-d', '-p', `127.0.0.1:${port}:3000`, '-v', `${volume}:/app/.data`, ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]), tag])
  return stdout.trim()
}

/** A container's logs, for failure messages. */
export async function dockerLogs(container: string): Promise<string> {
  const { stdout, stderr } = await run('docker', ['logs', container]).catch(() => ({ stdout: '', stderr: '' }))
  return stdout + stderr
}

/** Waits for the image's HEALTHCHECK to report the container healthy (it first runs 30 s after the start). */
export async function expectHealthy(container: string, timeout = 120_000): Promise<void> {
  const deadline = Date.now() + timeout
  let status = ''
  while (Date.now() < deadline && status !== 'healthy' && status !== 'unhealthy') {
    await new Promise(done => setTimeout(done, 2000))
    status = (await run('docker', ['inspect', '--format', '{{.State.Health.Status}}', container])).stdout.trim()
  }
  expect(status, await dockerLogs(container)).toBe('healthy')
}

/** Removes containers, volumes and images, ignoring those already gone. */
export async function dockerRemove(what: { containers?: string[], volumes?: string[], images?: string[] }): Promise<void> {
  for (const [command, names] of [['rm', what.containers], ['volume', what.volumes], ['rmi', what.images]] as const) {
    if (names?.length)
      await run('docker', command === 'volume' ? ['volume', 'rm', '-f', ...names] : [command, '-f', ...names]).catch(() => {})
  }
}

/** The bucket of ATELIER_TEST_S3_URL (MinIO), made when missing: a fresh MinIO has none. */
export async function ensureBucket(s3: URL): Promise<void> {
  const { AwsClient } = await import('aws4fetch')
  const client = new AwsClient({ accessKeyId: decodeURIComponent(s3.username), secretAccessKey: decodeURIComponent(s3.password), region: 'us-east-1', service: 's3' })
  for (let attempt = 0; attempt < 30 && !(await client.fetch(`${s3.origin}${s3.pathname}`, { method: 'PUT' }).then(r => r.ok || r.status === 409, () => false)); attempt++)
    await new Promise(done => setTimeout(done, 1000))
}
