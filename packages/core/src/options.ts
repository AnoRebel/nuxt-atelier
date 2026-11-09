import * as v from 'valibot'

const DB_SCHEMES = ['file', 'libsql', 'd1', 'postgres', 'postgresql', 'mysql', 'mariadb']

const int = (min: number, max: number, fallback: number, description: string) => v.optional(
  v.pipe(
    v.number(`expected an integer from ${min} to ${max}`),
    v.integer(`expected an integer from ${min} to ${max}`),
    v.minValue(min, `expected an integer from ${min} to ${max}`),
    v.maxValue(max, `expected an integer from ${min} to ${max}`),
    v.description(description),
  ),
  fallback,
)

const MB = 1024 * 1024

/** The `atelier` options schema: validation, defaults and the generated config reference come from here. */
export const optionsSchema = v.strictObject({
  database: v.optional(v.strictObject({
    url: v.optional(v.pipe(
      v.string('expected a URL string'),
      v.check(url => DB_SCHEMES.includes(/^([a-z][a-z0-9]*):/.exec(url)?.[1] ?? ''),
        `unsupported scheme; accepted: ${DB_SCHEMES.map(s => `${s}:`).join(', ')}`),
      v.description('Database URL: `file:` (SQLite), `libsql:` (libSQL/Turso), `d1:<binding>` (Cloudflare D1), `postgres:`, `mysql:` or `mariadb:`. Override at runtime with `NUXT_ATELIER_DATABASE_URL`.'),
    ), 'file:.data/atelier.sqlite'),
  }), {}),
  migrations: v.optional(v.strictObject({
    autoApply: v.optional(v.pipe(v.boolean('expected true or false'), v.description('Apply pending migrations when the production server starts. When off, run `atelier migrate apply`; until then CMS writes are refused. Override at runtime with `NUXT_ATELIER_MIGRATIONS_AUTO_APPLY`.')), false),
  }), {}),
  storage: v.optional(v.strictObject({
    driver: v.optional(v.pipe(v.picklist(['local'], 'accepted: "local"'), v.description('Media storage driver.')), 'local'),
    dir: v.optional(v.pipe(v.string('expected a directory path'), v.nonEmpty('expected a directory path'), v.description('Upload directory, relative to the app root. Override at runtime with `NUXT_ATELIER_STORAGE_DIR`.')), '.data/uploads'),
  }), {}),
  auth: v.optional(v.strictObject({
    provider: v.optional(v.pipe(v.picklist(['builtin'], 'accepted: "builtin"'), v.description('Authentication provider.')), 'builtin'),
    signInAttempts: int(1, 1000, 10, 'Failed sign-ins allowed per IP address and email within `auth.signInWindow`; then 429 until it ends. An email alone allows five times as many, so rotating addresses doesn\'t help.'),
    signInWindow: int(60, 86_400, 900, 'The sign-in rate limit window, in seconds.'),
    trustProxy: v.optional(v.pipe(v.boolean('expected true or false'), v.description('Take the client IP from `X-Forwarded-For`. Turn on only behind a proxy that sets it, or clients could spoof their address.')), false),
    passkeys: v.optional(v.pipe(v.boolean('expected true or false'), v.description('Let users of the built-in provider register passkeys and sign in with them. Needs `@simplewebauthn/server`. The relying party is the public site URL (`NUXT_PUBLIC_ATELIER_SITE_URL`).')), false),
  }), {}),
  admin: v.optional(v.strictObject({
    base: v.optional(v.pipe(
      v.string('expected a path like "/admin"'),
      v.regex(/^(?:\/[\w-]+)+$/, 'expected a path like "/admin" or "/cms/admin": leading slash, no trailing slash, letters, digits, "-" and "_"'),
      v.check(base => !/^\/api(?:\/|$)/.test(base), 'must not be under "/api"'),
      v.description('Path the admin is served under: a leading slash, no trailing slash, not under `/api`.'),
    ), '/admin'),
  }), {}),
  revisions: v.optional(v.strictObject({
    keep: int(1, 100_000, 50, 'Revisions each entry keeps at least: its newest ones. Older ones are deleted once they\'re also older than `revisions.days`, except, in versioned types, those that were published. Checked daily, as a background job.'),
    days: int(0, 36_500, 30, 'Days every revision is kept, however many there are.'),
  }), {}),
  jobs: v.optional(v.strictObject({
    schedule: v.optional(v.pipe(
      v.union([v.pipe(v.string(), v.regex(/^\S+(?:\s+\S+){4,5}$/, 'expected a cron expression of 5 fields, or 6 with seconds first')), v.literal(false)], 'expected a cron expression like "* * * * *", or false'),
      v.description('When the server runs due background jobs, as a cron expression, with Nitro\'s scheduled tasks (Node, Bun, Deno; Vercel Cron and Cloudflare Cron Triggers at build, which take 5 fields). `false` leaves it to the trigger endpoint, for platforms without scheduled tasks.'),
    ), '* * * * *'),
    triggerBudget: int(1, 900, 25, 'Seconds the job trigger endpoint (`POST /api/_atelier/jobs/run`) keeps starting jobs; the rest stay queued for the next call. Its secret is `NUXT_ATELIER_JOBS_SECRET`.'),
  }), {}),
  webhooks: v.optional(v.strictObject({
    allow: v.optional(v.pipe(
      v.array(v.pipe(v.string(), v.nonEmpty()), 'expected a list of host names or IP addresses'),
      v.description('Hosts webhooks may reach even though they\'re internal (private, loopback or link-local addresses), e.g. a service on your own network. Override at runtime with `NUXT_ATELIER_WEBHOOKS_ALLOW` (a JSON list).'),
    ), []),
  }), {}),
  limits: v.optional(v.strictObject({
    maxBodySize: int(1024, 100 * MB, MB, 'Largest accepted JSON request body, in bytes.'),
    maxUploadSize: int(1024, 5 * 1024 * MB, 50 * MB, 'Largest accepted upload, in bytes.'),
    maxPageSize: int(1, 1000, 100, 'Most entries a single query returns.'),
    maxRelationDepth: int(0, 10, 3, 'How deep relations are populated.'),
    maxNestingDepth: int(1, 50, 10, 'How deep blocks can be nested.'),
    jobConcurrency: int(1, 64, 4, 'Background jobs run at the same time.'),
    dbPoolSize: int(1, 100, 10, 'Database connection pool size.'),
    writesPerMinute: int(1, 100_000, 120, 'Content writes (create, update, delete) one user or API token may make per minute; then 429.'),
    cacheSize: int(0, 1_000_000, 1000, 'Entries kept in the in-memory cache.'),
  }), {}),
})

export type ModuleOptions = v.InferInput<typeof optionsSchema>
export type ResolvedOptions = v.InferOutput<typeof optionsSchema>

/** Validates and fills defaults; throws one error listing every invalid option with its value. */
export function resolveOptions(options: unknown, configKey = 'atelier'): ResolvedOptions {
  const result = v.safeParse(optionsSchema, options)
  if (result.success)
    return result.output
  const lines = result.issues.map((issue) => {
    const path = [configKey, v.getDotPath(issue)].filter(Boolean).join('.')
    if (issue.type === 'strict_object' && issue.path) // an unknown key; without a path the value isn't an object
      return `  - ${path}: unknown option; accepted: ${siblingKeys(issue.path!).join(', ')}`
    return `  - ${path} = ${JSON.stringify(issue.input)}: ${issue.message}`
  })
  throw new Error(`[nuxt-atelier] Invalid module options:\n${lines.join('\n')}`)
}

type ObjectLike = { entries: Record<string, ObjectLike & { wrapped?: ObjectLike }> }

// Keys allowed next to an unknown key, by walking the schema along its path
function siblingKeys(path: NonNullable<v.BaseIssue<unknown>['path']>): string[] {
  let schema = optionsSchema as unknown as ObjectLike
  for (const item of path.slice(0, -1)) {
    const entry = schema.entries[item.key as string]!
    schema = entry.wrapped ?? entry
  }
  return Object.keys(schema.entries)
}
