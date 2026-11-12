// The app secret production needs: it seals sessions and signs preview links (secrets.ts), so a missing or
// short one would leave them forgeable. Checked at startup (plugins/secret.ts).

/** Why `secret` can't be used, or undefined when it can. */
export function appSecretProblem(secret: unknown): string | undefined {
  if (typeof secret !== 'string' || !secret)
    return 'NUXT_APP_SECRET isn\'t set'
  if (secret.length < 32)
    return `NUXT_APP_SECRET is ${secret.length} characters; it needs at least 32`
  return undefined
}
