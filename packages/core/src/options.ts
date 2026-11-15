import * as v from 'valibot'
import { LIMIT_RANGES } from './runtime/shared/limits'
import { LOCALE_CODE } from './runtime/shared/locales'

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
  media: v.optional(v.strictObject({
    accept: v.optional(v.pipe(
      v.array(v.pipe(v.string(), v.regex(/^[a-z]+\/(?:\*|[\w.+-]+)$/, 'expected MIME types like "image/*" or "application/pdf"')), 'expected a list of MIME types'),
      v.description('File types that may be uploaded, judged by their content: MIME types, with `type/*` for a whole family. Types only recognisable by name (SVG, plain text) can\'t be checked, so aren\'t accepted.'),
    ), ['image/*', 'video/*', 'audio/*', 'application/pdf']),
    widths: v.optional(v.pipe(
      v.array(v.pipe(v.number(), v.integer(), v.minValue(16), v.maxValue(8192)), 'expected a list of widths in pixels'),
      v.minLength(1),
      v.description('The widths image variants are made at (with `sharp` installed), and the only ones served: other sizes would let anyone fill your storage with variants.'),
    ), [320, 640, 960, 1280, 1920, 2560]),
    provider: v.optional(v.pipe(
      v.string('expected a URL template'),
      v.check(t => t.includes('{src}') && t.includes('{w}'), 'expected a URL template with {src} and {w}'),
      v.description('An image service that makes the variants instead of this server, for hosts without `sharp`: a URL template with `{src}` (the file\'s absolute URL), `{w}`, and optionally `{h}` (for a ratio), `{fx}` and `{fy}` (the focal point, 0–1). Cloudflare: `/cdn-cgi/image/width={w},height={h},fit=cover,gravity={fx}x{fy},format=auto/{src}`.'),
    )),
  }), {}),
  locales: v.optional(v.pipe(
    v.strictObject({
      codes: v.optional(v.pipe(
        v.array(v.pipe(v.string(), v.regex(LOCALE_CODE, 'expected locale codes like "en" or "pt-br"')), 'expected a list of locale codes'),
        v.minLength(1, 'expected at least one locale'),
        v.check(codes => new Set(codes).size === codes.length, 'expected each locale once'),
        v.description('The content locales. Types declared `localized` keep one version of each entry per locale. With one locale, the admin shows no translation controls.'),
      ), ['en']),
      default: v.optional(v.pipe(v.string('expected a locale code'), v.description('The default locale: new entries\' locale when none is given, and the last fallback. The first of `locales.codes` when omitted.'))),
      fallback: v.optional(v.pipe(
        v.record(v.string(), v.array(v.string())),
        v.description('Where reads look when an entry or a translated field is missing in the requested locale, per locale: `{ "de-at": ["de", "en"] }`. Every other locale falls back to the default locale.'),
      ), {}),
    }),
    v.check(l => l.default === undefined || l.codes.includes(l.default), 'locales.default must be one of locales.codes'),
    v.check(l => Object.entries(l.fallback).every(([from, to]) => [from, ...to].every(code => l.codes.includes(code))), 'locales.fallback may only name locales in locales.codes'),
  ), {}),
  sites: v.optional(v.pipe(
    v.record(
      v.pipe(v.string(), v.regex(/^[a-z][a-z0-9-]{0,31}$/, 'expected site names of lowercase letters, digits and "-", starting with a letter')),
      v.strictObject({
        hosts: v.pipe(
          v.array(v.pipe(v.string(), v.toLowerCase(), v.regex(/^[a-z0-9.-]+(?::\d+)?$/, 'expected host names like "shop.example.com"')), 'expected a list of host names'),
          v.minLength(1, 'expected at least one host name'),
        ),
        label: v.optional(v.string()),
        locales: v.optional(v.pipe(v.array(v.pipe(v.string(), v.regex(LOCALE_CODE, 'expected locale codes'))), v.minLength(1))),
        defaultLocale: v.optional(v.pipe(v.string(), v.regex(LOCALE_CODE, 'expected a locale code'))),
      }),
    ),
    v.check(sites => new Set(Object.values(sites).flatMap(s => s.hosts)).size === Object.values(sites).flatMap(s => s.hosts).length, 'a host name belongs to one site only'),
    v.description('Several sites from one deployment: each with its host names (the `Host` a request arrives with picks its site), a label, and optionally its own locales (some of `locales.codes`) and default locale. Content types are site-scoped unless they set `scope: \'shared\'`. Without it, there\'s one site and nothing is scoped.'),
  )),
  fallbackSite: v.optional(v.pipe(v.string(), v.description('The site serving requests whose host isn\'t any site\'s (local development, health checks). Without it they answer 404.'))),
  seo: v.optional(v.strictObject({
    titleTemplate: v.optional(v.pipe(
      v.string('expected a template like "%s · My site"'),
      v.check(t => t.includes('%s'), 'expected %s where the page title goes, like "%s · My site"'),
      v.description('The title of CMS pages, `%s` standing for the page\'s own: `"%s · My site"`.'),
    ), '%s'),
    jsonLd: v.optional(v.pipe(
      v.record(v.string(), v.unknown(), 'expected a JSON-LD object'),
      v.description('Structured data on every CMS page, like your organization: `{ "@type": "Organization", "name": "…", "url": "…" }`. `@context` is added.'),
    )),
    robots: v.optional(v.pipe(
      v.strictObject({
        indexable: v.optional(v.boolean('expected true or false'), true),
        rules: v.optional(v.array(v.strictObject({
          userAgent: v.optional(v.array(v.string()), ['*']),
          allow: v.optional(v.array(v.string()), []),
          disallow: v.optional(v.array(v.string()), []),
        }), 'expected a list of { userAgent, allow, disallow }'), []),
      }),
      v.description('robots.txt rules: `indexable: false` asks crawlers to stay away from the whole site (a staging site), `rules` adds groups of `{ userAgent, allow, disallow }`. Administrators can change them in the admin, which then overrides this. The admin and API paths are always disallowed.'),
    )),
  }), {}),
  i18n: v.optional(v.strictObject({
    module: v.optional(v.pipe(
      v.union([v.picklist(['auto', 'nuxt-i18n-micro', '@nuxtjs/i18n']), v.literal(false)], 'accepted: "auto", "nuxt-i18n-micro", "@nuxtjs/i18n", false'),
      v.description('The i18n module whose locales and URL strategy the site\'s pages follow: `/de/produkte/stuhl` is the German entry at `/produkte/stuhl`. `auto` uses nuxt-i18n-micro when it\'s installed, otherwise @nuxtjs/i18n, otherwise none: locales then come from the `locale` query parameter only.'),
    ), 'auto'),
  }), {}),
  storage: v.optional(v.strictObject({
    driver: v.optional(v.pipe(v.picklist(['local', 's3', 'vercel-blob'], 'accepted: "local", "s3", "vercel-blob"'), v.description('Where media files are stored: `local` (the server\'s disk, `storage.dir`), `s3` (S3-compatible storage and Cloudflare R2: install `@nuxt-atelier/storage-s3`) or `vercel-blob` (install `@nuxt-atelier/storage-vercel-blob`).')), 'local'),
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
  collaboration: v.optional(v.strictObject({
    lockTimeout: int(15, 3600, 60, 'Seconds an edit lock lasts without being renewed: the admin renews it every 20 seconds while its holder has the entry open, so a closed browser frees it after this.'),
    idleTimeout: int(60, 86_400, 900, 'Seconds without any typing or clicking after which the admin stops renewing a lock, so someone who walked away doesn\'t keep others out.'),
    realtime: v.optional(v.pipe(
      v.union([v.literal('auto'), v.literal(false)], 'accepted: "auto", false'),
      v.description('How the admin hears about locks, presence, comments and notifications: `auto` uses WebSocket on servers that support it (Node, Bun, Deno, Cloudflare), with polling every 20 seconds when it isn\'t available or drops; `false` polls only.'),
    ), 'auto'),
  }), {}),
  forms: v.optional(v.strictObject({
    minFillTime: int(0, 600, 3, 'Seconds a visitor takes at least to fill in a form: faster submissions are taken for spam and dropped (while answering as if they were sent).'),
    submissionsPerHour: int(1, 100_000, 20, 'Submissions accepted per IP address and form within an hour; then 429. Turnstile (`NUXT_ATELIER_FORMS_TURNSTILE_SITE_KEY` and `NUXT_ATELIER_FORMS_TURNSTILE_SECRET`) adds a challenge.'),
  }), {}),
  mail: v.optional(v.strictObject({
    from: v.optional(v.pipe(v.string(), v.description('The sender of the CMS\'s email (notifications), e.g. `"Atelier <cms@example.com>"`. Override with `NUXT_ATELIER_MAIL_FROM`. Where email goes out through is a secret: set `NUXT_ATELIER_MAIL_URL` (`smtp://…`, `resend://<key>`, `postmark://<token>`).')), ''),
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
  demo: v.optional(v.strictObject({
    enabled: v.optional(v.pipe(v.boolean('expected true or false'), v.description('A public demo: each visitor who starts one (`/api/_atelier/demo/start`) edits a copy of the site of their own, deleted when they leave; the site itself takes no changes. Needs an SQLite database and the built-in auth.')), false),
    idleTimeout: int(10, 86_400, 1800, 'Seconds a demo stays without a request before its copy is deleted.'),
    maxSessions: int(1, 10_000, 100, 'Demos at once; the oldest idle ones end to make room.'),
    perAddress: int(1, 1000, 5, 'Demos at once from one IP address.'),
    frameAncestors: v.optional(v.pipe(
      v.array(v.pipe(v.string(), v.url('expected an origin like https://docs.example.com')), 'expected a list of origins'),
      v.description('Sites allowed to show the demo\'s admin in a frame (your docs), besides the site itself.'),
    ), []),
  }), {}),
  cache: v.optional(v.strictObject({
    pages: int(0, 86_400, 0, 'Seconds a rendered page is kept in memory and served to visitors again (0: not at all). Only anonymous GET requests are cached, never signed-in, preview or draft ones, and any content change clears it. Override at runtime with `NUXT_ATELIER_CACHE_PAGES`.'),
  }), {}),
  limits: v.optional(v.strictObject({
    maxBodySize: int(...LIMIT_RANGES.maxBodySize, MB, 'Largest accepted JSON request body, in bytes.'),
    maxUploadSize: int(...LIMIT_RANGES.maxUploadSize, 50 * MB, 'Largest accepted upload, in bytes.'),
    maxPageSize: int(...LIMIT_RANGES.maxPageSize, 100, 'Most entries a single query returns.'),
    maxRelationDepth: int(...LIMIT_RANGES.maxRelationDepth, 3, 'How deep relations are populated.'),
    maxNestingDepth: int(...LIMIT_RANGES.maxNestingDepth, 10, 'How deep blocks can be nested.'),
    jobConcurrency: int(...LIMIT_RANGES.jobConcurrency, 4, 'Background jobs run at the same time.'),
    dbPoolSize: int(1, 100, 10, 'Database connection pool size.'),
    writesPerMinute: int(...LIMIT_RANGES.writesPerMinute, 120, 'Content writes (create, update, delete) one user or API token may make per minute; then 429.'),
    cacheSize: int(...LIMIT_RANGES.cacheSize, 1000, 'Entries kept in the in-memory cache.'),
  }), {}),
})

export type ModuleOptions = v.InferInput<typeof optionsSchema>
export type ResolvedOptions = v.InferOutput<typeof optionsSchema>

/** Validates and fills defaults; throws one error listing every invalid option with its value. */
export function resolveOptions(options: unknown, configKey = 'atelier'): ResolvedOptions {
  const result = v.safeParse(optionsSchema, options)
  if (result.success) {
    const { sites, fallbackSite, locales } = result.output
    const problems = [
      ...fallbackSite !== undefined && !sites?.[fallbackSite] ? [`  - ${configKey}.fallbackSite = ${JSON.stringify(fallbackSite)}: expected one of the sites (${Object.keys(sites ?? {}).join(', ') || 'none defined'})`] : [],
      ...Object.entries(sites ?? {}).flatMap(([name, site]) => [
        ...(site.locales ?? []).filter(code => !locales.codes.includes(code)).map(code => `  - ${configKey}.sites.${name}.locales: "${code}" isn't one of locales.codes`),
        ...site.defaultLocale && !(site.locales ?? locales.codes).includes(site.defaultLocale) ? [`  - ${configKey}.sites.${name}.defaultLocale: "${site.defaultLocale}" isn't one of the site's locales`] : [],
      ]),
    ]
    if (problems.length)
      throw new Error(`[nuxt-atelier] Invalid module options:\n${problems.join('\n')}`)
    return result.output
  }
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
