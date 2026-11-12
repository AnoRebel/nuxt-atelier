// Passkey sign-in, loaded only when the user chooses it, and only built in with `auth.passkeys` (the module
// points `#atelier-admin-passkeys` here then, and at passkeys-off.ts otherwise).
import { startAuthentication } from '@simplewebauthn/browser'
import { atelierFetch } from './composables/useAtelierAdmin'

export async function signInWithPasskey() {
  const optionsJSON = await atelierFetch<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/auth/passkeys/login-options', { method: 'POST' })
  return atelierFetch('/auth/passkeys/login', { method: 'POST', body: { response: await startAuthentication({ optionsJSON }) } })
}
