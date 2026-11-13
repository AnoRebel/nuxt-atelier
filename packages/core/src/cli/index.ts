#!/usr/bin/env node
// The `atelier` command
import type { AtelierDriver, Dialect } from '../runtime/server/db/driver'
import type { JobStatus } from '../runtime/server/jobs'
import { relative, resolve } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { connect } from '../runtime/server/db/driver'
import { allDrivers } from '../runtime/server/db/loaders'
import { applyProjectMigrations, generateMigration, loadProject, projectMigrationStatus, rehearseProjectMigrations, withMigrationLock } from './migrate'
import { createJobQueue } from '../runtime/server/jobs'
import { init } from './init'
import { exportToFile, importFromFile } from './transfer'
import { createAdmin, randomPassword, resetPassword } from './users'

const USAGE = `Usage: atelier <command> [options]

Commands:
  init                     add secrets to .env and a first collection, where missing
  migrate generate         write a migration for schema changes to server/atelier/migrations/<dialect>/
  migrate apply            apply pending migrations to the database (--dry-run: rehearse them, keeping nothing)
  migrate status           list applied and pending migrations
  export <file>            write all content to a portable archive (gzipped when <file> ends in .gz)
  import <file>            load an archive into an empty, migrated database (any engine)
  user create-admin        create an administrator (--email, --name; a password is generated unless --password-stdin)
  user reset-password      set a user's password and sign them out everywhere (--email; generated unless --password-stdin)
  jobs list                background jobs, newest first (--status queued|running|failed)
  jobs retry <id>          queue a failed job again
  jobs run                 run due jobs now, on the running site (--url, default NUXT_PUBLIC_ATELIER_SITE_URL;
                           sends NUXT_ATELIER_JOBS_SECRET)
  search rebuild           index all published content for site search again, on the running site (--url, as
                           jobs run)

Options:
  --root <dir>          the Nuxt app (default: current directory)
  --dialect <name>      generate for sqlite, postgres or mysql (default: from the database URL)
  --name <name>         migration name
  --drop <c>[.<field>]  confirm deleting a removed collection or field and its data (repeatable)
  --rename <c>.<old>=<new> | <old c>=<new c>
                        declare a renamed field or collection, keeping its data (repeatable)
  --email, --name       for the user commands
  --password-stdin      read the password from standard input instead of generating one
  --status, --url       for the jobs commands

The database URL comes from NUXT_ATELIER_DATABASE_URL or the atelier.database.url option.`

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      'root': { type: 'string', default: process.cwd() },
      'dialect': { type: 'string' },
      'name': { type: 'string' },
      'drop': { type: 'string', multiple: true },
      'rename': { type: 'string', multiple: true },
      'dry-run': { type: 'boolean' },
      'email': { type: 'string' },
      'password-stdin': { type: 'boolean' },
      'status': { type: 'string' },
      'url': { type: 'string' },
      'help': { type: 'boolean', short: 'h' },
    },
  })
  const [group, command, argument] = positionals
  if (group === 'init' && !values.help) {
    const done = init(resolve(values.root))
    console.log(done.length ? done.join('\n') : 'Nothing to do: .env has its secrets and there are collections.')
    console.log('Next: add \'nuxt-atelier\' to modules in nuxt.config.ts (npx nuxi module add nuxt-atelier), then run `atelier migrate generate`.')
    return 0
  }
  if (group === 'jobs' && command === 'run' && !values.help)
    return runJobs(values.url)
  if (group === 'search' && command === 'rebuild' && !values.help)
    return rebuildSearch(values.url)
  if (values.help || !command || !['migrate', 'export', 'import', 'user', 'jobs'].includes(group!)) {
    console.log(USAGE)
    return values.help ? 0 : 1
  }
  if (values.dialect && !['sqlite', 'postgres', 'mysql'].includes(values.dialect))
    throw new Error(`--dialect: expected sqlite, postgres or mysql`)

  const project = await loadProject(resolve(values.root))
  if (group === 'user' || group === 'jobs') {
    const driver = await connect(project.databaseUrl, { loaders: allDrivers })
    try {
      return await (group === 'user' ? userCommand(driver, command, values) : jobsCommand(driver, command, argument, values.status))
    }
    finally {
      await driver.close()
    }
  }
  if (group === 'export' || group === 'import') {
    const driver = await connect(project.databaseUrl, { loaders: allDrivers })
    try {
      const counts = group === 'export'
        ? await exportToFile(driver, project.schema, resolve(command))
        : await importFromFile(driver, project.schema, resolve(command))
      const total = Object.values(counts).reduce((a, b) => a + b, 0)
      console.log(`${group === 'export' ? 'Exported' : 'Imported'} ${total} rows:\n${Object.entries(counts).map(([t, n]) => `  ${t}: ${n}`).join('\n')}`)
    }
    finally {
      await driver.close()
    }
  }
  else if (command === 'generate') {
    const folder = await withMigrationLock(project.databaseUrl, () => generateMigration(project, { dialect: values.dialect as Dialect | undefined, name: values.name, drop: values.drop, rename: values.rename }))
    console.log(folder ? `Wrote ${relative(process.cwd(), folder)}/migration.sql: review it and commit it.` : 'No schema changes.')
  }
  else if (command === 'apply' && values['dry-run']) {
    const results = await withMigrationLock(project.databaseUrl, () => rehearseProjectMigrations(project, values.dialect as Dialect | undefined))
    if (!results.length) {
      console.log('Nothing to rehearse: the database is up to date.')
      return 0
    }
    for (const r of results)
      console.log(r.result === 'ok' ? `  ok       ${r.name}` : r.result === 'failed' ? `  FAILED   ${r.name}\n           ${r.error}` : `  not run  ${r.name} (after a failure)`)
    const failed = results.some(r => r.result === 'failed')
    console.log(failed ? 'Rehearsal failed: nothing was changed. Fix the migration before applying it.' : 'Rehearsal passed: nothing was changed. Apply with `atelier migrate apply`.')
    return failed ? 1 : 0
  }
  else if (command === 'apply') {
    const applied = await withMigrationLock(project.databaseUrl, () => applyProjectMigrations(project, values.dialect as Dialect | undefined))
    console.log(applied.length ? `Applied:\n${applied.map(n => `  ${n}`).join('\n')}` : 'Database is up to date.')
  }
  else if (command === 'status') {
    const { applied, pending } = await projectMigrationStatus(project)
    console.log(`Applied: ${applied.length}`)
    console.log(pending.length ? `Pending:\n${pending.map(n => `  ${n}`).join('\n')}` : 'Pending: none')
  }
  else {
    console.log(USAGE)
    return 1
  }
  return 0
}

async function readStdin(): Promise<string> {
  let text = ''
  for await (const chunk of process.stdin)
    text += chunk
  return text.replace(/\r?\n$/, '')
}

async function userCommand(driver: AtelierDriver, command: string, values: { 'email'?: string, 'name'?: string, 'password-stdin'?: boolean }): Promise<number> {
  if (command !== 'create-admin' && command !== 'reset-password') {
    console.log(USAGE)
    return 1
  }
  if (!values.email)
    throw new Error(`atelier user ${command} needs --email`)
  const generated = !values['password-stdin']
  const password = generated ? randomPassword() : await readStdin()
  if (command === 'create-admin') {
    const user = await createAdmin(driver, { email: values.email, name: values.name, password })
    console.log(`Created the administrator ${user.email}.`)
  }
  else {
    const { sessions } = await resetPassword(driver, { email: values.email, password })
    console.log(`Reset the password of ${values.email.trim().toLowerCase()} and signed out ${sessions} session${sessions === 1 ? '' : 's'}.`)
  }
  if (generated)
    console.log(`Password: ${password}\nShown only now: pass it on safely, and have them change it.`)
  return 0
}

async function jobsCommand(driver: AtelierDriver, command: string, id: string | undefined, status: string | undefined): Promise<number> {
  const queue = createJobQueue(driver)
  if (command === 'list') {
    if (status && !['queued', 'running', 'failed'].includes(status))
      throw new Error('--status: expected queued, running or failed')
    const jobs = await queue.list({ status: status as JobStatus | undefined, limit: 200 })
    console.log(jobs.length
      ? jobs.map(j => `${j.id}  ${j.status.padEnd(7)}  ${j.name}  due ${j.runAt}  attempts ${j.attempts}/${j.maxAttempts}${j.lastError ? `\n    ${j.lastError}` : ''}`).join('\n')
      : 'No jobs.')
    return 0
  }
  if (command === 'retry' && id) {
    if (!await queue.retry(id))
      throw new Error(`No failed job "${id}"`)
    console.log(`Queued ${id} again.`)
    return 0
  }
  console.log(USAGE)
  return 1
}

/** Job handlers live in the app's server: ask the running site to run due jobs. */
/** A POST to the running site, authorized with the jobs secret. */
async function callSite(command: string, path: string, url = process.env.NUXT_PUBLIC_ATELIER_SITE_URL): Promise<Response> {
  const secret = process.env.NUXT_ATELIER_JOBS_SECRET
  if (!url)
    throw new Error(`atelier ${command} needs the site: --url https://example.com, or NUXT_PUBLIC_ATELIER_SITE_URL`)
  if (!secret)
    throw new Error(`atelier ${command} needs NUXT_ATELIER_JOBS_SECRET, the same as the site's`)
  return fetch(new URL(path, url), { method: 'POST', headers: { authorization: `Bearer ${secret}` } })
}

async function rebuildSearch(url?: string): Promise<number> {
  const response = await callSite('search rebuild', '/api/_atelier/search/rebuild', url)
  if (!response.ok)
    throw new Error(`The site answered ${response.status}${response.status === 403 ? ': is NUXT_ATELIER_JOBS_SECRET set there, the same?' : ''}`)
  const { indexed } = await response.json() as { indexed: number }
  console.log(`Indexed ${indexed} entries.`)
  return 0
}

async function runJobs(url?: string): Promise<number> {
  const response = await callSite('jobs run', '/api/_atelier/jobs/run', url)
  if (!response.ok)
    throw new Error(`The site answered ${response.status}${response.status === 404 ? ': is NUXT_ATELIER_JOBS_SECRET set there?' : ''}`)
  const { ran, failed, remaining } = await response.json() as { ran: number, failed: number, remaining: number }
  console.log(`Ran ${ran}, failed ${failed}, ${remaining} due still queued.`)
  return 0
}

// exit explicitly: database pools and drizzle-kit keep handles open
main().then(code => process.exit(code), (error: Error) => {
  console.error(process.env.ATELIER_DEBUG ? error : error.message)
  process.exit(1)
})
