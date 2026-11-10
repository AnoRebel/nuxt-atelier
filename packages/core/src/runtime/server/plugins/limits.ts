// Startup: the `limits` as the server runs with them, runtime overrides (NUXT_ATELIER_LIMITS_*) included,
// checked against their ranges. A wrong one stops the server rather than leaving an endpoint unbounded.
import { useRuntimeConfig } from 'nuxt/server'
import { limitProblems } from '../../shared/limits'

export default () => {
  const problems = limitProblems((useRuntimeConfig().atelier as { limits?: Record<string, unknown> }).limits ?? {})
  if (problems.length)
    throw new Error(`[nuxt-atelier] Invalid limits (check your NUXT_ATELIER_LIMITS_* variables):\n${problems.map(p => `  - ${p}`).join('\n')}`)
}
