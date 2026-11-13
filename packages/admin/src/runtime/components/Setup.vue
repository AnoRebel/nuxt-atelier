<!-- First-run setup: shown while no user exists. Creates the first administrator and signs them in. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import { reactive, ref } from 'vue'
import { useAtelierSession } from '../composables/useAtelierSession'
import CnAlert from '../crystal-neuo/components/Alert.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnInput from '../crystal-neuo/components/Input.vue'
import { useAdminI18n } from '../i18n'

const { t } = useAdminI18n()

const { createAdmin } = useAtelierSession()
const form = reactive({ name: '', email: '', password: '' })
const error = ref('')

async function submit() {
  error.value = ''
  try {
    await createAdmin.mutateAsync({ ...form, name: form.name || undefined })
  }
  catch (e) {
    error.value = (e as AdminApiError).errors?.map(x => x.message).join('. ') || (e as AdminApiError).message
  }
}
</script>

<template>
  <h1 class="app-page__title">
    {{ t('setup.title') }}
  </h1>
  <p class="app-muted">
    {{ t('setup.intro') }}
  </p>
  <form
    class="app-form"
    @submit.prevent="submit"
  >
    <CnInput
      v-model="form.name"
      :label="t('common.name')"
      autocomplete="name"
    />
    <CnInput
      v-model="form.email"
      :label="t('common.email')"
      type="email"
      autocomplete="email"
      required
    />
    <CnInput
      v-model="form.password"
      :label="t('common.password')"
      type="password"
      :hint="t('setup.passwordHint')"
      autocomplete="new-password"
      required
      minlength="8"
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
        :loading="createAdmin.isPending.value"
      >
        {{ t('setup.submit') }}
      </CnButton>
    </div>
  </form>
</template>
