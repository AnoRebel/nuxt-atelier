// Docker and Docker Compose (also what Dokploy and Coolify run, and Fly.io's image): the Docker guide's app
// started with `docker compose up -d --build` and its .env, PostgreSQL included; then its image alone, with
// SQLite on a volume, as `docker run`. Fly's fly.toml is checked against that same image.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, dockerLogs, dockerRemove, dockerRun, enabled, envExample, EXAMPLES, exampleApp, expectHealthy, expectRunning, freePort, parseConfig, run, SECRET, servePacks } from './deploy'

const PROJECT = `atelier-deploy-${process.pid}`
const IMAGE = `${PROJECT}-app` // the image compose builds for the service `app`

describe.skipIf(!enabled)('Docker and Docker Compose (examples/hosting/docker)', () => {
  let dir: string
  let packs: Awaited<ReturnType<typeof servePacks>>
  // the classic builder: Compose's Bake builder asks for a grant to build on the host network (compose.smoke.yml)
  const compose = (...args: string[]) => run('docker', ['compose', '-p', PROJECT, '-f', 'compose.yml', '-f', 'compose.smoke.yml', ...args], { cwd: dir, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, COMPOSE_BAKE: 'false' } })
  const volume = `${PROJECT}-sqlite`
  let container: string | undefined

  beforeAll(async () => {
    packs = await servePacks()
    dir = await exampleApp('docker', { packages: ['pg'], packsUrl: packs.url, dialects: ['sqlite', 'postgres'] })
  }, 900_000)
  afterAll(async () => {
    if (dir)
      await compose('down', '-v', '--remove-orphans').catch(() => {})
    await dockerRemove({ containers: container ? [container] : [], volumes: [volume], images: [IMAGE] })
    await packs?.close()
    cleanup(dir)
  }, 120_000)

  it('runs with PostgreSQL from `docker compose up -d --build` and the .env made from .env.example', async () => {
    const env = envExample(join(dir, '.env.example'))
    writeFileSync(join(dir, '.env'), Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n'))
    // compose.yml as it is, plus: the build on the host's network (it installs the served tarballs) and a free
    // host port in place of 3000
    const port = await freePort()
    writeFileSync(join(dir, 'compose.smoke.yml'), `services:\n  app:\n    build:\n      network: host\n    ports: !override\n      - "127.0.0.1:${port}:3000"\n`)
    const logs = async () => (await compose('logs').catch(error => error)).stdout as string
    // --wait: until the image's HEALTHCHECK and the database's report healthy
    await compose('up', '-d', '--build', '--wait').catch(async (error) => {
      throw new Error(`${error.message}\n${await logs()}`)
    })
    await expectRunning(`http://127.0.0.1:${port}`, logs)
    const { stdout } = await compose('exec', '-T', 'db', 'psql', '-U', 'atelier', '-d', 'atelier', '-tAc', 'select count(*) from atelier_jobs')
    expect(stdout.trim()).toBe('0') // the app's tables are in PostgreSQL
  }, 900_000)

  it('runs the image alone with SQLite on a volume, as `docker run`, and its HEALTHCHECK passes', async () => {
    const port = await freePort()
    container = await dockerRun(IMAGE, port, volume, { NUXT_APP_SECRET: SECRET, NUXT_PUBLIC_ATELIER_SITE_URL: 'https://example.com' })
    await expectRunning(`http://127.0.0.1:${port}`, () => dockerLogs(container!))
    await expectHealthy(container)
  }, 300_000)

  it('fly.toml: the Docker guide\'s Dockerfile, its port, the health check and the data volume', async () => {
    const fly = await parseConfig(join(EXAMPLES, 'fly/fly.toml'))
    const dockerfile = readFileSync(join(EXAMPLES, 'docker/Dockerfile'), 'utf8')
    expect(fly.build.dockerfile).toBe('Dockerfile')
    expect(dockerfile).toContain(`EXPOSE ${fly.http_service.internal_port}`)
    expect(dockerfile).toMatch(new RegExp(`PORT=${fly.http_service.internal_port}\\b`))
    expect(fly.http_service.checks).toContainEqual(expect.objectContaining({ method: 'GET', path: '/api/_atelier/health/ready' }))
    expect(fly.mounts.destination).toBe('/app/.data')
    expect(dockerfile).toContain('NUXT_ATELIER_DATABASE_URL=file:/app/.data/')
    // jobs run in the server process: the Machine must keep running
    expect(fly.http_service.auto_stop_machines).toBe('off')
    expect(fly.http_service.min_machines_running).toBeGreaterThanOrEqual(1)
  })
})
