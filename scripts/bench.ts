// The server response benchmark: the p95 time to serve a published page of 50 blocks, from the rendered-page
// cache and with every cache off, on test/fixtures/routing (built first: `nuxi build`).
//   bun scripts/bench.ts [--history file] [--record]
// Fails over the budgets (cached ≤ 50 ms, uncached ≤ 200 ms p95), or when a p95 is more than 10% above the
// median of the last runs in `--history` (a JSON list; `--record` appends this run, for main's runs) and by
// more than 2 ms (below that it's the machine's noise). Every recorded run counts, a failing one too: a slowdown
// fails on the commits that bring it, then becomes the baseline, as runners' speed moves too. A run that seems slower is measured again, and the
// better of the two counts: one slow run on a shared runner isn't a regression.
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Result { cached: number, uncached: number, at: string }
export const BUDGET = { cached: 50, uncached: 200 }
const REGRESSION = 1.1
const NOISE_MS = 2
const RUNS_KEPT = 10

export const percentile = (samples: number[], p: number) => {
  const sorted = samples.toSorted((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!
}
const median = (values: number[]) => percentile(values, 0.5)

/** What's wrong with `result`: over budget, or more than 10% above the history's median. */
export function verdict(result: Result, history: Result[]): string[] {
  const problems: string[] = []
  for (const metric of ['cached', 'uncached'] as const) {
    if (result[metric] > BUDGET[metric])
      problems.push(`${metric} p95 ${result[metric].toFixed(1)} ms is over its ${BUDGET[metric]} ms budget`)
    const past = history.slice(-RUNS_KEPT).map(r => r[metric])
    if (past.length && result[metric] > median(past) * REGRESSION && result[metric] - median(past) > NOISE_MS)
      problems.push(`${metric} p95 ${result[metric].toFixed(1)} ms is more than 10% above the baseline median ${median(past).toFixed(1)} ms`)
  }
  return problems
}

const fixture = fileURLToPath(new URL('../test/fixtures/routing/', import.meta.url))

async function serve(port: number, env: Record<string, string>): Promise<ChildProcess> {
  const server = spawn(process.execPath.includes('bun') ? 'node' : process.execPath, [join(fixture, '.output/server/index.mjs')], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production', NUXT_APP_SECRET: 'a-benchmark-secret-that-is-long-enough-1', ...env },
    stdio: ['ignore', 'ignore', 'inherit'], // the server's errors, if a run fails
  })
  for (let i = 0; i < 100; i++) {
    if (await fetch(`http://127.0.0.1:${port}/api/_atelier/health/live`).then(r => r.ok, () => false))
      return server
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  server.kill()
  throw new Error('The fixture server did not start')
}

/** A published page of 50 blocks on a server with this database. */
async function seed(base: string) {
  await fetch(`${base}/api/test/users`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bench@example.com', role: 'admin', password: 'password 123' }) })
  const login = await fetch(`${base}/api/_atelier/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bench@example.com', password: 'password 123' }) })
  if (!login.ok)
    throw new Error(`Signing in to seed the page failed: ${login.status} ${await login.text()}`)
  const cookies = login.headers.getSetCookie().map(c => c.split(';')[0]!)
  const content = Array.from({ length: 50 }, (_, i) => ({ id: `b${i}`, type: 'Headline', props: { heading: `Block number ${i}` } }))
  const created = await fetch(`${base}/api/_atelier/collections/posts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cookie': cookies.join('; '), 'x-atelier-csrf': cookies.find(c => c.startsWith('atelier-csrf='))!.split('=')[1]! },
    body: JSON.stringify({ data: { title: 'Benchmark', slug: 'bench', content }, publish: true }),
  })
  if (!created.ok)
    throw new Error(`Seeding failed: ${created.status} ${await created.text()}`)
}

/** p95 of `count` sequential requests for the page, after a warm-up. */
async function measure(base: string, count: number): Promise<number> {
  const once = async () => {
    const started = performance.now()
    const response = await fetch(`${base}/blog/bench`)
    await response.text()
    if (!response.ok)
      throw new Error(`The page answered ${response.status}`)
    return performance.now() - started
  }
  for (let i = 0; i < 20; i++)
    await once()
  const samples = []
  for (let i = 0; i < count; i++)
    samples.push(await once())
  return percentile(samples, 0.95)
}

async function run(): Promise<Result> {
  if (!existsSync(join(fixture, '.output/server/index.mjs')))
    throw new Error('Build the fixture first: cd test/fixtures/routing && npx nuxi build')
  const database = `file:${join(mkdtempSync(join(tmpdir(), 'atelier-bench-')), 'db.sqlite')}`
  const delay: Record<string, string> = process.env.ATELIER_TEST_DELAY_MS ? { ATELIER_TEST_DELAY_MS: process.env.ATELIER_TEST_DELAY_MS } : {}
  const cachedServer = await serve(43211, { NUXT_ATELIER_DATABASE_URL: database, NUXT_ATELIER_CACHE_PAGES: '300', ...delay })
  try {
    await seed('http://127.0.0.1:43211')
    const cached = await measure('http://127.0.0.1:43211', 300)
    cachedServer.kill()
    const uncachedServer = await serve(43212, { NUXT_ATELIER_DATABASE_URL: database, NUXT_ATELIER_CACHE_PAGES: '0', NUXT_ATELIER_LIMITS_CACHE_SIZE: '0', ...delay })
    try {
      return { cached, uncached: await measure('http://127.0.0.1:43212', 200), at: new Date().toISOString() }
    }
    finally {
      uncachedServer.kill()
    }
  }
  finally {
    cachedServer.kill()
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const historyPath = args.includes('--history') ? args[args.indexOf('--history') + 1]! : undefined
  const history: Result[] = historyPath && existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, 'utf8')) : []
  let result = await run()
  if (verdict(result, history).length) {
    const again = await run()
    result = { cached: Math.min(result.cached, again.cached), uncached: Math.min(result.uncached, again.uncached), at: result.at }
  }
  console.log(`cached p95:   ${result.cached.toFixed(1)} ms (budget ${BUDGET.cached} ms)`)
  console.log(`uncached p95: ${result.uncached.toFixed(1)} ms (budget ${BUDGET.uncached} ms, 50 blocks)`)
  const problems = verdict(result, history)
  if (historyPath && args.includes('--record'))
    writeFileSync(historyPath, JSON.stringify([...history, result].slice(-RUNS_KEPT), null, 2))
  if (problems.length) {
    console.error(problems.map(p => `✗ ${p}`).join('\n'))
    process.exit(1)
  }
  console.log(history.length ? `✓ within budget and within 10% of the last ${Math.min(history.length, RUNS_KEPT)} runs` : '✓ within budget (no baseline yet)')
}
