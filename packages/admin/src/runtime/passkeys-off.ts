// `auth.passkeys` is off: no passkey code in the admin.
export async function signInWithPasskey(): Promise<never> {
  throw new Error('Passkeys are turned off')
}
