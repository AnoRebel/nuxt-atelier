// The panel page DevTools frames: the app's content schema, its migrations and its background jobs, read
// when the page loads. Plain HTML, escaped, with no script: actions are DevTools' own (see module.ts).
import type { Project } from 'nuxt-atelier/project'
import { blockedSchemaChanges, buildTables, listJobs, projectMigrationStatus } from 'nuxt-atelier/project'

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
const list = (items: string[], empty: string) => items.length ? `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` : `<p class="muted">${empty}</p>`

type Fields = Record<string, { type: string, required?: boolean }>

function typeRows(kind: string, types: Record<string, { fields: Fields, route?: unknown, versioned?: boolean }>, tables: string[]) {
  return Object.entries(types).map(([name, definition]) => {
    const table = tables.find(t => t === `atelier_c_${name.replaceAll('-', '_')}`)
    const fields = Object.entries(definition.fields).map(([key, field]) => `<code>${escape(key)}</code> ${escape(field.type)}${field.required ? ' <span class="muted">required</span>' : ''}`).join(', ')
    return `<tr><td><strong>${escape(name)}</strong><br><span class="muted">${kind}${definition.versioned ? ', versioned' : ''}${definition.route ? ', routable' : ''}</span></td><td>${fields || '<span class="muted">none</span>'}</td><td>${table ? `<code>${escape(table)}</code>` : '<span class="muted">shared tables</span>'}</td></tr>`
  }).join('')
}

export async function renderPanel(project: Project, section: 'schema' | 'migrations' | 'jobs'): Promise<string> {
  let body: string
  if (section === 'schema') {
    const tables = Object.keys(buildTables(project.databaseUrl.startsWith('postgres') ? 'postgres' : project.databaseUrl.startsWith('mysql') || project.databaseUrl.startsWith('mariadb') ? 'mysql' : 'sqlite', project.schema))
    body = `<h1>Schema</h1>
<table><thead><tr><th>Type</th><th>Fields</th><th>Table</th></tr></thead><tbody>
${typeRows('collection', project.schema.collections as never, tables)}${typeRows('singleton', project.schema.singletons as never, tables)}
</tbody></table>
<h2>Tables</h2>${list(tables.map(t => `<code>${escape(t)}</code>`), 'None.')}`
  }
  else if (section === 'migrations') {
    const status = await projectMigrationStatus(project).catch((error: Error) => error)
    const blocked = blockedSchemaChanges()
    body = `<h1>Migrations</h1>
<p class="muted">Database: <code>${escape(project.databaseUrl.replace(/\/\/[^@/]*@/, '//…@'))}</code></p>
${status instanceof Error
  ? `<p class="error">${escape(status.message)}</p>`
  : `<h2>Pending</h2>${list(status.pending.map(n => `<code>${escape(n)}</code>`), 'None: the database is up to date.')}
<h2>Applied</h2>${list(status.applied.toReversed().map(n => `<code>${escape(n)}</code>`), 'None yet.')}`}
<h2>Waiting for you</h2>${blocked.length
  ? `<p>A schema change would delete data, so <code>nuxt dev</code> didn't apply it. Confirm it with <code>npx atelier migrate generate</code> and the flag it needs:</p>${list(blocked.map(escape), '')}`
  : '<p class="muted">Nothing: every schema change is applied.</p>'}
<p class="muted">Apply pending migrations from the <strong>Atelier: actions</strong> tab.</p>`
  }
  else {
    const jobs = await listJobs(project).catch((error: Error) => error)
    body = `<h1>Jobs</h1>${jobs instanceof Error
      ? `<p class="error">${escape(jobs.message)}</p>`
      : jobs.length
        ? `<table><thead><tr><th>Job</th><th>Status</th><th>Due</th><th>Attempts</th></tr></thead><tbody>${jobs.map(j => `<tr><td><code>${escape(j.name)}</code><br><span class="muted">${escape(j.id)}</span>${j.lastError ? `<br><span class="error">${escape(j.lastError)}</span>` : ''}</td><td>${escape(j.status)}</td><td>${escape(j.runAt)}</td><td>${j.attempts}/${j.maxAttempts}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">No jobs.</p>'}
<p class="muted">Retry a failed one from the <strong>Atelier: actions</strong> tab.</p>`
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Nuxt Atelier: ${section}</title><style>
:root{color-scheme:light dark;font:14px/1.5 system-ui,sans-serif}body{margin:1.5rem}h1{font-size:1.25rem}h2{font-size:1rem;margin-top:1.5rem}
table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;padding:.4rem .6rem;border-bottom:1px solid #8884}
code{font-size:.9em}.muted{opacity:.65}.error{color:#d33}ul{padding-left:1.2rem}
</style></head><body>${body}</body></html>`
}
