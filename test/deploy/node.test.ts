// Node servers: the VPS guide's app built and run as its systemd unit says (migrations applied before the
// server starts, settings from its .env.example), and what Render's and Railway's files add to that same
// Node build: their build and start commands, preset, health check path and disk.
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build, cleanup, enabled, envExample, EXAMPLES, exampleApp, expectRunning, freePort, parseConfig, run, start, stop, tempDir } from './deploy'

const HEALTH = '/api/_atelier/health/ready'
const START = 'node .output/server/index.mjs'

/** The [Service] settings of a systemd unit. */
function unit(file: string): Record<string, string> {
  const section = readFileSync(file, 'utf8').split(/^\[Service\]$/m)[1]!.split(/^\[/m)[0]!
  return Object.fromEntries(section.split('\n').map(line => /^(\w+)=(.*)$/.exec(line)).filter(m => !!m).map(m => [m[1]!, m[2]!]))
}

describe.skipIf(!enabled)('Node on a VPS (examples/hosting/vps)', () => {
  let dir: string
  let server: { child: ChildProcess, output: () => string } | undefined
  beforeAll(async () => {
    dir = await exampleApp('vps')
    await build(dir) // the guide: npm ci, npm run build
  }, 900_000)
  afterAll(async () => {
    await stop(server?.child)
    cleanup(dir)
  })

  it('runs as the systemd unit says: migrations applied before the server starts, settings from .env', async () => {
    const service = unit(join(dir, 'atelier.service'))
    expect(service.WorkingDirectory).toBe('/srv/atelier')
    expect(service.EnvironmentFile).toBe('/srv/atelier/.env')
    const here = (value: string) => value.replaceAll('/srv/atelier', dir)
    const port = await freePort()
    const example = envExample(join(dir, '.env.example'))
    // Caddy proxies to where .env.example has the server listen
    expect(readFileSync(join(dir, 'Caddyfile'), 'utf8')).toContain(`reverse_proxy ${example.HOST}:${example.PORT}`)
    const env = Object.fromEntries(Object.entries({ ...example, PORT: String(port) }).map(([key, value]) => [key, here(value)]))
    mkdirSync(join(dir, '.data'), { recursive: true })

    const [pre, ...preArgs] = here(service.ExecStartPre!).split(' ')
    const applied = await run(pre!, preArgs, { cwd: dir, env: { ...process.env, ...env } })
    expect(applied.stdout).toMatch(/Applied/)
    const [node, ...args] = service.ExecStart!.split(' ')
    expect(node).toBe('/usr/bin/node')
    server = start([process.execPath, ...args], { cwd: dir, env })
    await expectRunning(`http://127.0.0.1:${port}`, server.output)
  })

  it('render.yaml: the same Node build and start, a preset that is Node\'s server, the health check and the disk', async () => {
    const blueprint = await parseConfig(join(EXAMPLES, 'render/render.yaml'))
    const web = blueprint.services.find((s: { type: string }) => s.type === 'web')
    expect(web).toMatchObject({ runtime: 'node', startCommand: START, healthCheckPath: HEALTH })
    expect(web.buildCommand).toMatch(/\bnpm run build$/)
    const env = Object.fromEntries(web.envVars.map((v: { key: string }) => [v.key, v]))
    expect(env.NUXT_ATELIER_STORAGE_DIR.value.startsWith(`${web.disk.mountPath}/`)).toBe(true)
    expect(env.NUXT_ATELIER_MIGRATIONS_AUTO_APPLY.value).toBe('true')
    expect(blueprint.databases.map((d: { name: string }) => d.name)).toContain(env.NUXT_ATELIER_DATABASE_URL.fromDatabase.name)
    for (const key of ['NUXT_APP_SECRET', 'NUXT_PUBLIC_ATELIER_SITE_URL'])
      expect(env[key], key).toBeDefined()
    // the preset Render's build picks: Nitro knows it, and it is the Node server built above
    const { stdout } = await run('node', ['-e', `import('nitropack/presets').then(async m => console.log((await m.resolvePreset(${JSON.stringify(env.SERVER_PRESET.value)}, {}))?.extends))`], { cwd: dir })
    expect(stdout.trim()).toBe('node-server')
  })

  it('railway.ts: the same Node build and start, the health check, PostgreSQL and the volume', async () => {
    // railway/iac stood in for: the config is evaluated, not deployed
    const sandbox = tempDir('railway')
    try {
      mkdirSync(join(sandbox, 'node_modules/railway'), { recursive: true })
      writeFileSync(join(sandbox, 'node_modules/railway/package.json'), JSON.stringify({ name: 'railway', type: 'module', exports: { './iac': './iac.js' } }))
      writeFileSync(join(sandbox, 'node_modules/railway/iac.js'), [
        'export const defineRailway = fn => fn',
        'export const postgres = name => ({ kind: \'postgres\', name, env: { DATABASE_URL: `${name}.DATABASE_URL` } })',
        'export const volume = (name, options) => ({ kind: \'volume\', name, ...options })',
        'export const service = (name, options) => ({ kind: \'service\', name, ...options })',
        'export const preserve = () => \'(preserved)\'',
        'export const project = (name, options) => ({ kind: \'project\', name, ...options })',
      ].join('\n'))
      writeFileSync(join(sandbox, 'railway.ts'), readFileSync(join(EXAMPLES, 'railway/.railway/railway.ts')))
      const { stdout } = await run('bun', ['-e', `console.log(JSON.stringify((await import(${JSON.stringify(join(sandbox, 'railway.ts'))})).default()))`], { cwd: sandbox })
      const { resources } = JSON.parse(stdout)
      const web = resources.find((r: { kind: string }) => r.kind === 'service')
      const db = resources.find((r: { kind: string }) => r.kind === 'postgres')
      expect(web).toMatchObject({ build: 'npm run build', start: START, healthcheck: HEALTH })
      expect(web.env.NUXT_ATELIER_DATABASE_URL).toBe(db.env.DATABASE_URL)
      const [mount] = Object.keys(web.volumeMounts)
      expect(web.env.NUXT_ATELIER_STORAGE_DIR.startsWith(`${mount}/`)).toBe(true)
      expect(resources).toContainEqual(web.volumeMounts[mount!])
    }
    finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  })
})
