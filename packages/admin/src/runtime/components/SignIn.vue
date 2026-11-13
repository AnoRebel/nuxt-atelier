<!-- Sign-in with email and password; with `auth.passkeys`, a passkey option whose code loads only when used. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import { useQueryClient } from '@tanstack/vue-query'
import { reactive, ref } from 'vue'
import { useAtelierAdmin } from '../composables/useAtelierAdmin'
import { useAtelierSession } from '../composables/useAtelierSession'
import CnAlert from '../crystal-neuo/components/Alert.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnInput from '../crystal-neuo/components/Input.vue'
import Icon from './Icon'
import { useAdminI18n } from '../i18n'

const { t } = useAdminI18n()

const { signIn, providers } = useAtelierSession()
// back to where the user was in the admin after signing in with a provider
const providerLink = (url: string) => `${url}${url.includes('?') ? '&' : '?'}redirect=${encodeURIComponent(location.pathname + location.search)}`
const { passkeys } = useAtelierAdmin()
const client = useQueryClient()
const form = reactive({ email: '', password: '' })
const error = ref('')
const passkeyPending = ref(false)

async function submit() {
  error.value = ''
  try {
    await signIn.mutateAsync(form)
  }
  catch (e) {
    const failure = e as AdminApiError
    error.value = failure.status === 429 ? t('signIn.tooMany') : failure.status === 401 ? t('signIn.wrong') : failure.message
  }
}

async function withPasskey() {
  error.value = ''
  passkeyPending.value = true
  try {
    const { signInWithPasskey } = await import('#atelier-admin-passkeys')
    await signInWithPasskey()
    await client.invalidateQueries({ queryKey: ['atelier'] })
  }
  catch (e) {
    error.value = (e as AdminApiError).message || t('signIn.passkeyFailed')
  }
  finally {
    passkeyPending.value = false
  }
}
</script>

<template>
  <h1 class="app-page__title">
    {{ t('signIn.title') }}
  </h1>
  <form
    class="app-form"
    @submit.prevent="submit"
  >
    <CnInput
      v-model="form.email"
      :label="t('common.email')"
      type="email"
      autocomplete="username webauthn"
      required
    />
    <CnInput
      v-model="form.password"
      :label="t('common.password')"
      type="password"
      autocomplete="current-password"
      required
    />
    <CnAlert
      v-if="error"
      variant="danger"
      live
    >
      {{ error }}
    </CnAlert>
    <div class="app-form__actions">
      <CnButton
        type="submit"
        :loading="signIn.isPending.value"
      >
        {{ t('signIn.title') }}
      </CnButton>
      <CnButton
        v-if="passkeys"
        variant="secondary"
        :loading="passkeyPending"
        @click="withPasskey"
      >
        <Icon name="key-round" />
        {{ t('signIn.passkey') }}
      </CnButton>
    </div>
  </form>
  <div
    v-if="providers.length"
    class="app-stack app-providers"
  >
    <p class="app-muted">
      {{ t('signIn.or') }}
    </p>
    <a
      v-for="p in providers"
      :key="p.id"
      :href="providerLink(p.url)"
      class="cn-button cn-button--secondary cn-button--size-md"
    >
      {{ p.name }}
    </a>
  </div>
</template>
