<!-- The signed-in user's passkeys (with `auth.passkeys`): list, add one on this device, remove one.
     Opened from the account menu; the password stays the recovery path. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import { ref, watch } from 'vue'
import { atelierFetch } from '../composables/useAtelierAdmin'
import CnAlert from '../crystal-neuo/components/Alert.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnDialog from '../crystal-neuo/components/Dialog.vue'
import CnInput from '../crystal-neuo/components/Input.vue'
import CnModal from '../crystal-neuo/components/Modal.vue'
import { useAdminToast } from '../toast'
import Icon from './Icon'
import { useAdminI18n } from '../i18n'

interface Passkey { id: string, name: string | null, createdAt: string, lastUsedAt: string | null }

const open = defineModel<boolean>('open', { default: false })
const { t } = useAdminI18n()
const toast = useAdminToast()

const passkeys = ref<Passkey[] | null>(null)
const error = ref('')
const name = ref('')
const adding = ref(false)
const time = (at: string) => new Date(at).toLocaleString()

async function load() {
  error.value = ''
  try {
    passkeys.value = await atelierFetch<Passkey[]>('/auth/passkeys')
  }
  catch (e) {
    error.value = (e as AdminApiError).message
  }
}
watch(open, (on) => {
  if (on)
    void load()
}, { immediate: true })

async function add() {
  error.value = ''
  adding.value = true
  try {
    const { addPasskey } = await import('#atelier-admin-passkeys')
    await addPasskey(name.value.trim())
    name.value = ''
    toast.add({ color: 'success', title: t('passkeys.added') })
    await load()
  }
  catch (e) {
    // the browser's own prompt was dismissed: NotAllowedError, nothing to report
    if ((e as Error).name !== 'NotAllowedError')
      error.value = (e as AdminApiError).message || t('passkeys.notAdded')
  }
  finally {
    adding.value = false
  }
}

const removing = ref<Passkey | null>(null)
const confirmOpen = ref(false)
watch(removing, p => (confirmOpen.value = !!p))
watch(confirmOpen, on => !on && (removing.value = null))
async function remove() {
  const passkey = removing.value!
  try {
    await atelierFetch(`/auth/passkeys/${encodeURIComponent(passkey.id)}`, { method: 'DELETE' })
    toast.add({ color: 'success', title: t('passkeys.removed') })
    await load()
  }
  catch (e) {
    toast.add({ color: 'error', title: t('common.notDeleted'), description: (e as AdminApiError).message })
  }
}
</script>

<template>
  <CnModal
    v-model:open="open"
    :title="t('passkeys.title')"
  >
    <p class="app-muted">
      {{ t('passkeys.intro') }}
    </p>
    <CnAlert
      v-if="error"
      variant="danger"
      live
    >
      {{ error }}
    </CnAlert>
    <p
      v-if="passkeys && !passkeys.length"
      class="app-muted"
    >
      {{ t('passkeys.none') }}
    </p>
    <ul
      v-else-if="passkeys"
      class="app-list"
    >
      <li
        v-for="passkey in passkeys"
        :key="passkey.id"
        class="app-row app-row--between"
      >
        <span>
          {{ passkey.name || t('passkeys.unnamed') }}
          <br>
          <span class="app-muted">{{ passkey.lastUsedAt ? t('passkeys.lastUsed', { time: time(passkey.lastUsedAt) }) : t('passkeys.createdAt', { time: time(passkey.createdAt) }) }}</span>
        </span>
        <CnButton
          variant="ghost"
          size="sm"
          :aria-label="t('passkeys.removeOne', { name: passkey.name || t('passkeys.unnamed') })"
          @click="removing = passkey"
        >
          <Icon name="trash-2" />
        </CnButton>
      </li>
    </ul>
    <form
      class="app-row"
      @submit.prevent="add"
    >
      <CnInput
        v-model="name"
        :label="t('common.name')"
        :placeholder="t('passkeys.namePlaceholder')"
        autocomplete="off"
      />
      <CnButton
        type="submit"
        :loading="adding"
      >
        <Icon name="plus" />
        {{ t('passkeys.add') }}
      </CnButton>
    </form>

    <CnDialog
      v-model:open="confirmOpen"
      :title="t('passkeys.removeTitle', { name: removing?.name || t('passkeys.unnamed') })"
      :description="t('passkeys.removeBody')"
      :confirm-label="t('common.delete')"
      variant="destructive"
      @confirm="remove"
    />
  </CnModal>
</template>
