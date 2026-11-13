<!-- The CMS users, for those who manage users: create, change (role, name, email, password) and delete. -->
<script setup lang="ts">
import type { UserInput } from '../composables/useAtelierUsers'
import type { AdminApiError, AdminUser } from '../types'
import { computed, reactive, ref } from 'vue'
import { atelierFetch } from '../composables/useAtelierAdmin'
import { useAtelierAdminSchema } from '../composables/useAtelierAdminSchema'
import { useAtelierPermissions } from '../composables/useAtelierPermissions'
import { useAtelierUsers } from '../composables/useAtelierUsers'
import CnAlert from '../crystal-neuo/components/Alert.vue'
import CnBadge from '../crystal-neuo/components/Badge.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnDialog from '../crystal-neuo/components/Dialog.vue'
import CnInput from '../crystal-neuo/components/Input.vue'
import CnModal from '../crystal-neuo/components/Modal.vue'
import CnSelect from '../crystal-neuo/components/Select.vue'
import { useAdminToast } from '../toast'
import Icon from './Icon'
import NotFound from './NotFound.vue'
import Page from './Page.vue'
import { useAdminI18n } from '../i18n'

const { t } = useAdminI18n()

const { manages } = useAtelierPermissions()
const { schema } = useAtelierAdminSchema()
const { users, loading, create, update, remove } = useAtelierUsers()
const toast = useAdminToast()

const roleOptions = computed(() => (schema.value?.roles ?? []).map(r => ({ value: r.name, label: r.label ?? r.name })))
const roleLabel = (name: string) => schema.value?.roles?.find(r => r.name === name)?.label ?? name

// one form for creating (no id) and editing (an id)
const editing = ref<string | null | undefined>(undefined) // undefined: closed, null: new user
const form = reactive({ email: '', name: '', role: '', password: '', sites: {} as Record<string, string> })
// with sites: a role per site (administrators reach every site)
const sites = computed(() => schema.value?.sites ?? [])
const siteRoleOptions = computed(() => [{ value: '', label: t('users.noAccess') }, ...roleOptions.value.filter(o => o.value !== 'admin')])
const error = ref('')
const open = computed({ get: () => editing.value !== undefined, set: (on: boolean) => !on && (editing.value = undefined) })
async function edit(user: AdminUser | null) {
  Object.assign(form, { email: user?.email ?? '', name: user?.name ?? '', role: user?.role ?? roleOptions.value.find(o => o.value !== 'admin')?.value ?? '', password: '', sites: {} })
  error.value = ''
  editing.value = user?.id ?? null
  if (user && sites.value.length)
    form.sites = await atelierFetch<Record<string, string>>(`/users/${encodeURIComponent(user.id)}/sites`).catch(() => ({}))
}
async function submit() {
  error.value = ''
  const body: UserInput = { email: form.email, name: form.name || null, role: form.role, ...form.password ? { password: form.password } : {} }
  try {
    const saved = editing.value ? await update.mutateAsync({ id: editing.value, ...body }) : await create.mutateAsync(body)
    if (sites.value.length && form.role !== 'admin') {
      const roles = Object.fromEntries(Object.entries(form.sites).filter(([, role]) => role))
      await atelierFetch(`/users/${encodeURIComponent((saved as AdminUser).id)}/sites`, { method: 'PUT', body: { sites: roles } })
    }
    toast.add({ color: 'success', title: editing.value ? t('users.saved') : t('users.created') })
    editing.value = undefined
  }
  catch (e) {
    error.value = (e as AdminApiError).errors?.map(x => x.message).join('. ') || (e as AdminApiError).message
  }
}

const deleting = ref<AdminUser | null>(null)
const confirmOpen = computed({ get: () => !!deleting.value, set: (on: boolean) => !on && (deleting.value = null) })
async function confirmDelete() {
  const user = deleting.value!
  try {
    await remove.mutateAsync(user.id)
    toast.add({ color: 'success', title: t('users.deleted', { email: user.email }) })
  }
  catch (e) {
    toast.add({ color: 'error', title: t('common.notDeleted'), description: (e as AdminApiError).message })
  }
}
</script>

<template>
  <NotFound
    v-if="!manages('users')"
    forbidden
  />
  <Page
    v-else
    :title="t('nav.users')"
    icon="users"
    :description="t('users.description')"
  >
    <template #actions>
      <CnButton @click="edit(null)">
        <Icon name="plus" />
        {{ t('users.new') }}
      </CnButton>
    </template>
    <div class="app-table-wrap">
      <table class="cn-table">
        <caption class="sr-only">
          {{ t('nav.users') }}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              {{ t('common.name') }}
            </th>
            <th scope="col">
              {{ t('common.email') }}
            </th>
            <th scope="col">
              {{ t('common.role') }}
            </th>
            <th scope="col">
              <span class="sr-only">{{ t('common.actions') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="4">
              {{ t('common.loading') }}
            </td>
          </tr>
          <tr
            v-for="user in users"
            :key="user.id"
          >
            <td>{{ user.name || '—' }}</td>
            <td>{{ user.email }}</td>
            <td>
              <CnBadge
                :variant="user.role === 'admin' ? 'primary' : 'neutral'"
                size="sm"
              >
                {{ roleLabel(user.role) }}
              </CnBadge>
            </td>
            <td class="app-actions-cell">
              <CnButton
                variant="ghost"
                size="sm"
                :aria-label="t('users.editOne', { email: user.email })"
                @click="edit(user)"
              >
                {{ t('common.edit') }}
              </CnButton>
              <CnButton
                variant="ghost"
                size="sm"
                :aria-label="t('users.deleteOne', { email: user.email })"
                @click="deleting = user"
              >
                <Icon name="trash-2" />
              </CnButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <CnModal
      v-model:open="open"
      :title="editing ? t('users.edit') : t('users.new')"
    >
      <form
        class="app-form"
        @submit.prevent="submit"
      >
        <CnInput
          v-model="form.email"
          :label="t('common.email')"
          type="email"
          required
          autocomplete="off"
        />
        <CnInput
          v-model="form.name"
          :label="t('common.name')"
          autocomplete="off"
        />
        <CnSelect
          v-model="form.role"
          :label="t('common.role')"
          :options="roleOptions"
        />
        <fieldset
          v-if="sites.length && form.role !== 'admin'"
          class="app-form"
          data-site-roles
        >
          <legend>{{ t('users.sites') }}</legend>
          <CnSelect
            v-for="site in sites"
            :key="site.name"
            v-model="form.sites[site.name]"
            :label="site.label"
            :options="siteRoleOptions"
          />
        </fieldset>
        <CnInput
          v-model="form.password"
          :label="t('common.password')"
          type="password"
          autocomplete="new-password"
          :hint="editing ? t('users.passwordKeep') : t('users.passwordNew')"
        />
        <CnAlert
          v-if="error"
          variant="danger"
          live
        >
          {{ error }}
        </CnAlert>
        <div class="cn-modal__actions">
          <CnButton
            variant="ghost"
            @click="editing = undefined"
          >
            {{ t('common.cancel') }}
          </CnButton>
          <CnButton
            type="submit"
            :loading="create.isPending.value || update.isPending.value"
          >
            {{ editing ? t('common.save') : t('users.create') }}
          </CnButton>
        </div>
      </form>
    </CnModal>
    <CnDialog
      v-model:open="confirmOpen"
      :title="t('users.deleteTitle', { email: deleting?.email })"
      :description="t('users.deleteBody')"
      :confirm-label="t('common.delete')"
      variant="destructive"
      @confirm="confirmDelete"
    />
  </Page>
</template>
