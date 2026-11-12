// Production startup: refuse to run without a usable app secret (secret-check.ts). Nuxt makes one up in
// development; a production build has none unless it's set.
import { useRuntimeConfig } from 'nuxt/server'
import { appSecretProblem } from '../secret-check'

// A test run (TEST set, as vitest does and std-env's isTest reads) may go without: test servers are
// production builds. Read through a computed key, which the build doesn't replace.
const TEST = 'TEST'

export default () => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  // Cloudflare Workers hand secrets over per request (bindings): none is set yet at startup
  const workers = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent === 'Cloudflare-Workers'
  if (import.meta.dev || env?.[TEST] || workers)
    return
  const problem = appSecretProblem((useRuntimeConfig() as { appSecret?: unknown }).appSecret)
  if (problem)
    throw new Error(`[nuxt-atelier] ${problem}. It seals sessions and signs preview links: set NUXT_APP_SECRET to a random string of at least 32 characters (\`openssl rand -hex 32\`), the same on every server and deploy.`)
}
