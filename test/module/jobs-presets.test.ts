import { execFile } from 'node:child_process'
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, describe, expect, it } from 'vitest'

const rootDir = fileURLToPath(new URL('../fixtures/jobs-presets', import.meta.url))
const build = (preset: string) => promisify(execFile)('bunx', ['nuxi', 'build'], { cwd: rootDir, env: { ...process.env, NITRO_PRESET: preset }, maxBuffer: 64 * 1024 * 1024 })
const json = (path: string) => JSON.parse(readFileSync(join(rootDir, path), 'utf8'))

describe('the job schedule on serverless platforms', () => {
  afterAll(() => {
    for (const dir of ['.vercel', '.output', '.nuxt'])
      rmSync(join(rootDir, dir), { recursive: true, force: true })
  })

  it('becomes a Vercel cron calling the job trigger, and warns that local media storage won\'t last there', async () => {
    const { stdout, stderr } = await build('vercel')
    expect(stdout + stderr).toContain('Media uploads are stored on the server\'s disk (storage.driver "local"), which "vercel" doesn\'t keep between deploys')
    // one cron: the job trigger on Nitro 2, Nitro's own cron handler (running the atelier:jobs task) on Nitro 3
    const crons = json('.vercel/output/config.json').crons
    expect(crons).toHaveLength(1)
    expect(crons[0].schedule).toBe('*/5 * * * *')
    expect(['/api/_atelier/jobs/run', '/_vercel/cron']).toContain(crons[0].path)
  }, 300_000)

  it('becomes a Cloudflare cron trigger, which Nitro hands to the atelier:jobs task', async () => {
    await build('cloudflare_module')
    expect(json('.output/server/wrangler.json').triggers).toEqual({ crons: ['*/5 * * * *'] })
    // somewhere in the server bundle, however Nitro splits it
    const server = join(rootDir, '.output/server')
    const code = readdirSync(server, { recursive: true, encoding: 'utf8' }).filter(f => f.endsWith('.mjs')).map(f => readFileSync(join(server, f), 'utf8')).join('\n')
    expect(code).toContain('atelier:jobs')
  }, 300_000)
})
