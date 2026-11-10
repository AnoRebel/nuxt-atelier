// The `limits` options' ranges: checked when the app builds (options.ts) and again when the server starts,
// for values overridden at runtime (NUXT_ATELIER_LIMITS_*).
const MB = 1024 * 1024

export const LIMIT_RANGES = {
  maxBodySize: [1024, 100 * MB],
  maxUploadSize: [1024, 5 * 1024 * MB],
  maxPageSize: [1, 1000],
  maxRelationDepth: [0, 10],
  maxNestingDepth: [1, 50],
  jobConcurrency: [1, 64],
  writesPerMinute: [1, 100_000],
  cacheSize: [0, 1_000_000],
} as const satisfies Record<string, readonly [number, number]>

/** One line per limit that isn't a whole number in its range. */
export function limitProblems(limits: Record<string, unknown>): string[] {
  return Object.entries(LIMIT_RANGES).flatMap(([key, [min, max]]) => {
    const value = limits[key]
    if (value === undefined)
      return []
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
      ? []
      : [`limits.${key} = ${JSON.stringify(value)}: expected a whole number from ${min} to ${max}`]
  })
}
