// `nuxt-atelier/project`: an app's content schema, migrations and jobs, for build-time and dev tooling
// (@nuxt-atelier/devtools). Node only; nothing here reaches the app's bundle.
import type { JobStatus } from './runtime/server/jobs'
import type { Project } from './cli/migrate'
import { connect } from './runtime/server/db/driver'
import { allDrivers } from './runtime/server/db/loaders'
import { createJobQueue } from './runtime/server/jobs'

export { applyProjectMigrations, projectFromNuxt, projectMigrationStatus, withMigrationLock } from './cli/migrate'
export type { Project } from './cli/migrate'
export { blockedSchemaChanges } from './cli/dev'
export { buildTables } from './runtime/server/db/tables'

/** Runs `fn` with the job queue of the project's database. */
async function withJobs<T>(project: Project, fn: (queue: ReturnType<typeof createJobQueue>) => Promise<T>): Promise<T> {
  const driver = await connect(project.databaseUrl, { loaders: allDrivers })
  try {
    return await fn(createJobQueue(driver))
  }
  finally {
    await driver.close()
  }
}

/** Background jobs, newest first (as `atelier jobs list`). */
export const listJobs = (project: Project, status?: JobStatus) => withJobs(project, queue => queue.list({ status, limit: 200 }))

/** Queues a failed job again (as `atelier jobs retry`): whether there was one. */
export const retryJob = (project: Project, id: string) => withJobs(project, queue => queue.retry(id))
