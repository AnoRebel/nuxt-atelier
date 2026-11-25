// Passkey sign-in and registration, loaded only when the user chooses them, and only built in with
// `auth.passkeys` (the module points `#atelier-admin-passkeys` here then, and at passkeys-off.ts otherwise).
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { atelierFetch } from './composables/useAtelierAdmin'

export async function signInWithPasskey() {
  const optionsJSON = await atelierFetch<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/auth/passkeys/login-options', { method: 'POST' })
  return atelierFetch('/auth/passkeys/login', { method: 'POST', body: { response: await startAuthentication({ optionsJSON }) } })
}

/** Creates a passkey on this device for the signed-in user. */
export async function addPasskey(name?: string) {
  const optionsJSON = await atelierFetch<Parameters<typeof startRegistration>[0]['optionsJSON']>('/auth/passkeys/register-options', { method: 'POST' })
  return atelierFetch<{ id: string }>('/auth/passkeys/register', { method: 'POST', body: { response: await startRegistration({ optionsJSON }), name: name || undefined } })
}
