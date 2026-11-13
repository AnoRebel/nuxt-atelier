// Site settings administrators change in the admin (capability `settings`), stored in `atelier_settings` and
// overriding the module options; removing one goes back to the option. Each setting has a schema.
import type { SiteContext } from './sites'
import type { AtelierDriver } from './db/driver'
import type { Db } from './db/entries'
import { eq } from 'drizzle-orm'
import * as v from 'valibot'
import { buildTables } from './db/tables'
import { apiError } from './errors'

const Paths = v.array(v.pipe(v.string(), v.maxLength(500), v.check(p => !/[\r\n]/.test(p), 'one path per entry, no line breaks')))

/** robots.txt: whether the site may be indexed at all, and groups of rules. */
const RobotsSchema = v.strictObject({
  indexable: v.optional(v.boolean('indexable: expected true or false'), true),
  rules: v.optional(v.array(v.strictObject({
    userAgent: v.optional(v.pipe(Paths, v.minLength(1, 'userAgent: at least one, `*` for every crawler')), ['*']),
    allow: v.optional(Paths, []),
    disallow: v.optional(Paths, []),
  }), 'rules: expected a list of { userAgent, allow, disallow }'), []),
})
export type RobotsSettings = v.InferOutput<typeof RobotsSchema>

const SETTINGS = { robots: RobotsSchema } as const
export type SettingKey = keyof typeof SETTINGS
export type SettingValue<K extends SettingKey> = v.InferOutput<(typeof SETTINGS)[K]>

export const isSettingKey = (key: string): key is SettingKey => key in SETTINGS

export function createSettingsStore(driver: AtelierDriver, defaults: { [K in SettingKey]?: unknown }, site: SiteContext) {
  const { atelier_settings: table } = buildTables(driver.dialect, { collections: {}, singletons: {} })
  const db = driver.db as Db
  // with sites, each site's settings are its own: `shop:robots`
  const stored = (key: SettingKey) => site.scoped ? `${site.name}:${key}` : key
  // runtime config turns an unset (null) option into "": anything but an object is no option
  const option = (key: SettingKey) => typeof defaults[key] === 'object' && defaults[key] !== null ? defaults[key] : {}
  const fallback = <K extends SettingKey>(key: K) => v.parse(SETTINGS[key], option(key)) as SettingValue<K>

  return {
    /** The setting in effect, and where it comes from: the admin (`database`) or the module options (`config`). */
    async get<K extends SettingKey>(key: K): Promise<{ value: SettingValue<K>, source: 'database' | 'config', config: SettingValue<K> }> {
      const [row] = await db.select().from(table).where(eq(table.key, stored(key)))
      const config = fallback(key)
      // a stored value the schema no longer accepts (after an upgrade) falls back to the options
      const saved = row ? v.safeParse(SETTINGS[key], row.value) : undefined
      return saved?.success ? { value: saved.output as SettingValue<K>, source: 'database', config } : { value: config, source: 'config', config }
    },
    /** Stores a setting, overriding the module option. 422 with field errors when it's invalid. */
    async set<K extends SettingKey>(key: K, value: unknown, by: string | null): Promise<SettingValue<K>> {
      const result = v.safeParse(SETTINGS[key], value)
      if (!result.success)
        throw apiError(422, `Invalid ${key} setting`, { errors: result.issues.map(i => ({ path: v.getDotPath(i) ?? '', message: i.message })) })
      const row = { value: result.output, updatedAt: new Date().toISOString(), updatedBy: by }
      const [existing] = await db.select({ key: table.key }).from(table).where(eq(table.key, stored(key)))
      if (existing)
        await db.update(table).set(row).where(eq(table.key, stored(key)))
      else
        await db.insert(table).values({ key: stored(key), ...row })
      return result.output as SettingValue<K>
    },
    /** Goes back to the module option. */
    async reset(key: SettingKey): Promise<void> {
      await db.delete(table).where(eq(table.key, stored(key)))
    },
  }
}

export type SettingsStore = ReturnType<typeof createSettingsStore>
