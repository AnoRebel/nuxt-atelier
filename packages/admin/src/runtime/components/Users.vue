<!-- The CMS users, for those who manage users: create, change (role, name, email, password) and delete. -->
<script setup lang="ts">
import type { UserInput } from '../composables/useAtelierUsers'
import type { AdminApiError, AdminUser } from '../types'
import { computed, reactive, ref } from 'vue'
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

const { manages } = useAtelierPermissions()
const { schema } = useAtelierAdminSchema()
const { users, loading, create, update, remove } = useAtelierUsers()
const toast = useAdminToast()

const roleOptions = computed(() => (schema.value?.roles ?? []).map(r => ({ value: r.name, label: r.label ?? r.name })))
const roleLabel = (name: string) => schema.value?.roles?.find(r => r.name === name)?.label ?? name

// one form for creating (no id) and editing (an id)
const editing = ref<string | null | undefined>(undefined) // undefined: closed, null: new user
const form = reactive({ email: '', name: '', role: '', password: '' })
const error = ref('')
const open = computed({ get: () => editing.value !== undefined, set: (on: boolean) => !on && (editing.value = undefined) })
function edit(user: AdminUser | null) {
  Object.assign(form, { email: user?.email ?? '', name: user?.name ?? '', role: user?.role ?? roleOptions.value.find(o => o.value !== 'admin')?.value ?? '', password: '' })
  error.value = ''
  editing.value = user?.id ?? null
}
async function submit() {
  error.value = ''
  const body: UserInput = { email: form.email, name: form.name || null, role: form.role, ...form.password ? { password: form.password } : {} }
  try {
    if (editing.value)
      await update.mutateAsync({ id: editing.value, ...body })
    else
      await create.mutateAsync(body)
    toast.add({ color: 'success', title: editing.value ? 'User saved' : 'User created' })
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
    toast.add({ color: 'success', title: `${user.email} deleted` })
  }
  catch (e) {
    toast.add({ color: 'error', title: 'Not deleted', description: (e as AdminApiError).message })
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
    title="Users"
    icon="users"
    description="Everyone who can sign in to the admin, and their role."
  >
    <template #actions>
      <CnButton @click="edit(null)">
        <Icon name="plus" />
        New user
      </CnButton>
    </template>
    <div class="app-table-wrap">
      <table class="cn-table">
        <caption class="sr-only">
          Users
        </caption>
        <thead>
          <tr>
            <th scope="col">
              Name
            </th>
            <th scope="col">
              Email
            </th>
            <th scope="col">
              Role
            </th>
            <th scope="col">
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="4">
              Loading…
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
                :aria-label="`Edit ${user.email}`"
                @click="edit(user)"
              >
                Edit
              </CnButton>
              <CnButton
                variant="ghost"
                size="sm"
                :aria-label="`Delete ${user.email}`"
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
      :title="editing ? 'Edit user' : 'New user'"
    >
      <form
        class="app-form"
        @submit.prevent="submit"
      >
        <CnInput
          v-model="form.email"
          label="Email"
          type="email"
          required
          autocomplete="off"
        />
        <CnInput
          v-model="form.name"
          label="Name"
          autocomplete="off"
        />
        <CnSelect
          v-model="form.role"
          label="Role"
          :options="roleOptions"
        />
        <CnInput
          v-model="form.password"
          label="Password"
          type="password"
          autocomplete="new-password"
          :hint="editing ? 'Leave empty to keep it. A new password signs them out everywhere.' : 'At least 8 characters. Leave empty if they sign in another way.'"
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
            Cancel
          </CnButton>
          <CnButton
            type="submit"
            :loading="create.isPending.value || update.isPending.value"
          >
            {{ editing ? 'Save' : 'Create user' }}
          </CnButton>
        </div>
      </form>
    </CnModal>
    <CnDialog
      v-model:open="confirmOpen"
      :title="`Delete ${deleting?.email}?`"
      description="They can't sign in any more. Their entries stay."
      confirm-label="Delete"
      variant="destructive"
      @confirm="confirmDelete"
    />
  </Page>
</template>
