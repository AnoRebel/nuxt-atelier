<script setup lang="ts">
// Test page: exposes password sign-in and the passkey flows for the e2e test to call (the admin is at /admin)
onMounted(async () => {
  const { startAuthentication, startRegistration } = await import('@simplewebauthn/browser')
  function post<T>(path: string, body?: object) {
    const csrf = /(?:^|; )atelier-csrf=([^;]+)/.exec(document.cookie)?.[1]
    return $fetch<T>(`/api/_atelier/auth${path}`, { method: 'POST', body, headers: csrf ? { 'x-atelier-csrf': csrf } : {} })
  }
  Object.assign(window, {
    atelier: {
      signIn: (email: string, password: string) => post('/login', { email, password }),
      signOut: () => post('/logout'),
      me: () => $fetch('/api/_atelier/auth/me'),
      async registerPasskey() {
        const optionsJSON = await post<Parameters<typeof startRegistration>[0]['optionsJSON']>('/passkeys/register-options')
        return post('/passkeys/register', { response: await startRegistration({ optionsJSON }), name: 'Test key' })
      },
      async signInWithPasskey() {
        const optionsJSON = await post<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/passkeys/login-options')
        return post('/passkeys/login', { response: await startAuthentication({ optionsJSON }) })
      },
    },
  })
  document.body.dataset.ready = 'true'
})
</script>

<template>
  <main>passkeys fixture</main>
</template>
