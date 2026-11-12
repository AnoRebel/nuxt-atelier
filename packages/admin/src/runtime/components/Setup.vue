<!-- First-run setup: shown while no user exists. Creates the first administrator and signs them in. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import { reactive, ref } from 'vue'
import { useAtelierSession } from '../composables/useAtelierSession'
import CnAlert from '../crystal-neuo/components/Alert.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnInput from '../crystal-neuo/components/Input.vue'

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
    Welcome
  </h1>
  <p class="app-muted">
    Create the first administrator account.
  </p>
  <form
    class="app-form"
    @submit.prevent="submit"
  >
    <CnInput
      v-model="form.name"
      label="Name"
      autocomplete="name"
    />
    <CnInput
      v-model="form.email"
      label="Email"
      type="email"
      autocomplete="email"
      required
    />
    <CnInput
      v-model="form.password"
      label="Password"
      type="password"
      hint="At least 8 characters."
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
        Create administrator
      </CnButton>
    </div>
  </form>
</template>
