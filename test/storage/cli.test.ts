import type { AtelierDriver } from '../../packages/core/src/runtime/server/db/driver'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { verifyPassword } from '../../packages/core/src/runtime/server/auth/password'
import { createJobQueue } from '../../packages/core/src/runtime/server/jobs'
import { connectEngine, query } from './env'

const cli = fileURLToPath(new URL('../../packages/core/dist/cli/index.mjs', import.meta.url))
const root = fileURLToPath(new URL('../fixtures/routing', import.meta.url))
const url = `file:${join(mkdtempSync(join(tmpdir(), 'atelier-cli-')), 'db.sqlite')}`

/** Runs the CLI: its exit code and output, with `input` on stdin. */
function atelier(args: string[], options: { input?: string, env?: Record<string, string> } = {}): Promise<{ code: number, stdout: string, stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', [cli, ...args], { env: { ...process.env, NUXT_ATELIER_DATABASE_URL: url, ...options.env } })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }))
    child.stdin.end(options.input ?? '')
  })
}

describe('the atelier CLI', () => {
  let driver: AtelierDriver

  beforeAll(async () => {
    expect((await atelier(['migrate', 'apply', '--root', root])).code).toBe(0)
    driver = await connectEngine(url)
  }, 180_000)
  afterAll(() => driver?.close())

  it('creates an administrator, and refuses a taken email', async () => {
    const created = await atelier(['user', 'create-admin', '--email', 'Ops@Example.com', '--password-stdin', '--root', root], { input: 'correct horse battery\n' })
    expect(created).toMatchObject({ code: 0, stdout: 'Created the administrator ops@example.com.\n' })
    const [user] = await query(driver, sql`select role, password_hash from atelier_users where email = ${'ops@example.com'}`)
    expect(user.role).toBe('admin')
    expect((await verifyPassword('correct horse battery', user.password_hash)).valid).toBe(true)

    const again = await atelier(['user', 'create-admin', '--email', 'ops@example.com', '--root', root])
    expect(again.code).toBe(1)
    expect(again.stderr).toContain('A user with the email ops@example.com already exists')
  }, 120_000)

  it('resets a password and signs the user out of every session', async () => {
    const [{ _id: id }] = await query(driver, sql`select _id from atelier_users where email = ${'ops@example.com'}`)
    for (const session of ['s1', 's2'])
      await query(driver, sql`insert into atelier_sessions (_id, user_id, method, _created_at, expires_at) values (${session}, ${id}, ${'password'}, ${'2026-11-10T00:00:00.000Z'}, ${'2099-01-01T00:00:00.000Z'})`)

    const reset = await atelier(['user', 'reset-password', '--email', 'ops@example.com', '--root', root])
    expect(reset.code).toBe(0)
    expect(reset.stdout).toContain('Reset the password of ops@example.com and signed out 2 sessions.')
    const password = /Password: (\S+)/.exec(reset.stdout)![1]!
    expect(await query(driver, sql`select _id from atelier_sessions where user_id = ${id}`)).toEqual([])
    const [{ password_hash: hash }] = await query(driver, sql`select password_hash from atelier_users where _id = ${id}`)
    expect((await verifyPassword(password, hash)).valid).toBe(true)
    expect((await verifyPassword('correct horse battery', hash)).valid).toBe(false)

    expect((await atelier(['user', 'reset-password', '--email', 'nobody@example.com', '--root', root])).stderr).toContain('No user with the email nobody@example.com')
  }, 120_000)

  it('lists failed jobs and queues one again', async () => {
    const queue = createJobQueue(driver)
    const id = await queue.enqueue('test:cli', {}, { maxAttempts: 1 })
    await query(driver, sql`update atelier_jobs set status = ${'failed'}, last_error = ${'boom'} where _id = ${id}`)
    const listed = await atelier(['jobs', 'list', '--status', 'failed', '--root', root])
    expect(listed.stdout).toMatch(new RegExp(`^${id}  failed   test:cli .*\\n {4}boom`, 'm'))
    expect((await atelier(['jobs', 'retry', id, '--root', root])).stdout).toBe(`Queued ${id} again.\n`)
    expect((await queue.get(id))!.status).toBe('queued')
  }, 120_000)

  it('runs due jobs on the running site through its trigger endpoint', async () => {
    let authorization: string | undefined
    const site = createServer((req, res) => {
      authorization = req.headers.authorization
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(req.url === '/api/_atelier/jobs/run' && req.method === 'POST' ? { ran: 2, failed: 0, remaining: 1 } : {}))
    })
    await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve))
    try {
      const run = await atelier(['jobs', 'run', '--url', `http://127.0.0.1:${(site.address() as { port: number }).port}`], { env: { NUXT_ATELIER_JOBS_SECRET: 'the-secret' } })
      expect(run).toMatchObject({ code: 0, stdout: 'Ran 2, failed 0, 1 due still queued.\n' })
      expect(authorization).toBe('Bearer the-secret')
      expect((await atelier(['jobs', 'run', '--url', 'http://127.0.0.1:1'], { env: { NUXT_ATELIER_JOBS_SECRET: '' } })).stderr).toContain('needs NUXT_ATELIER_JOBS_SECRET')
    }
    finally {
      site.close()
    }
  })

  it('sets up a project without overwriting anything', async () => {
    const project = mkdtempSync(join(tmpdir(), 'atelier-init-'))
    const first = await atelier(['init', '--root', project])
    expect(first.stdout).toContain('Added NUXT_APP_SECRET and NUXT_ATELIER_JOBS_SECRET to .env')
    const env = readFileSync(join(project, '.env'), 'utf8')
    expect(env).toMatch(/^NUXT_APP_SECRET=[\w+/=]{44}$/m)
    expect(existsSync(join(project, 'server/atelier/collections/pages.ts'))).toBe(true)
    expect((await atelier(['init', '--root', project])).stdout).toContain('Nothing to do')
    expect(readFileSync(join(project, '.env'), 'utf8')).toBe(env)
  })
})
