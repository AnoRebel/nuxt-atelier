// Bun and Deno: each guide's app built with its preset and started with the guide's command on the host
// (migrations applied first, as the VPS guide's unit does), then built and run as the guide's container,
// whose HEALTHCHECK must pass.
import type { ChildProcess } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { build, cleanup, dockerBuild, dockerLogs, dockerRemove, dockerRun, enabled, EXAMPLES, exampleApp, expectHealthy, expectRunning, freePort, run, SECRET, servePacks, start, stop } from './deploy'

const RUNTIMES = [
  // the guides' build and start commands
  { name: 'bun', build: ['bun', 'run', 'build'], start: ['bun', '.output/server/index.mjs'] },
  { name: 'deno', build: ['npm', 'run', 'build'], start: ['deno', 'run', '--allow-net', '--allow-read', '--allow-write', '--allow-env', '--allow-sys', '--allow-ffi', '--unstable-byonm', '--unstable-node-globals', '.output/server/index.mjs'] },
]

describe.skipIf(!enabled).each(RUNTIMES)('$name (examples/hosting/$name)', (runtime) => {
  const tag = `atelier-deploy-${runtime.name}-${process.pid}`
  let dir: string
  let packs: Awaited<ReturnType<typeof servePacks>>
  let server: { child: ChildProcess, output: () => string } | undefined
  let container: string | undefined

  beforeAll(async () => {
    packs = await servePacks()
    dir = await exampleApp(runtime.name, { packsUrl: packs.url })
  }, 900_000)
  afterAll(async () => {
    await stop(server?.child)
    await dockerRemove({ containers: container ? [container] : [], volumes: [tag], images: [tag] })
    await packs?.close()
    cleanup(dir)
  }, 120_000)

  it('runs on the host with the guide\'s build and start commands', async () => {
    await build(dir, {}, runtime.build)
    const port = await freePort()
    mkdirSync(join(dir, '.data'), { recursive: true })
    const env = {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      NUXT_APP_SECRET: SECRET,
      NUXT_PUBLIC_ATELIER_SITE_URL: 'https://example.com',
      NUXT_ATELIER_DATABASE_URL: `file:${dir}/.data/atelier.sqlite`,
      NUXT_ATELIER_STORAGE_DIR: `${dir}/.data/uploads`,
    }
    await run(join(dir, 'node_modules/.bin/atelier'), ['migrate', 'apply'], { cwd: dir, env: { ...process.env, ...env } })
    server = start(runtime.start, { cwd: dir, env })
    await expectRunning(`http://127.0.0.1:${port}`, server.output)
  }, 600_000)

  it('runs as the guide\'s container, with the Docker guide\'s .dockerignore', async () => {
    copyFileSync(join(EXAMPLES, 'docker/.dockerignore'), join(dir, '.dockerignore'))
    await dockerBuild(dir, tag)
    const port = await freePort()
    container = await dockerRun(tag, port, tag, { NUXT_APP_SECRET: SECRET, NUXT_PUBLIC_ATELIER_SITE_URL: 'https://example.com' })
    await expectRunning(`http://127.0.0.1:${port}`, () => dockerLogs(container!))
    await expectHealthy(container)
  }, 900_000)
})
