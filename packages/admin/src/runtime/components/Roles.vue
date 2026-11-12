<!-- Roles, for those who manage roles: the built-in administrator, roles defined in code (read-only here) and
     roles kept in the database, which can be edited and deleted. -->
<script setup lang="ts">
import type { AdminApiError, RoleEntry } from '../types'
import { computed, ref } from 'vue'
import { NuxtLink } from '#components'
import { useAtelierAdmin } from '../composables/useAtelierAdmin'
import { useAtelierPermissions } from '../composables/useAtelierPermissions'
import { useAtelierRoles } from '../composables/useAtelierRoles'
import CnBadge from '../crystal-neuo/components/Badge.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnDialog from '../crystal-neuo/components/Dialog.vue'
import { useAdminToast } from '../toast'
import Icon from './Icon'
import NotFound from './NotFound.vue'
import Page from './Page.vue'

const { to } = useAtelierAdmin()
const { manages } = useAtelierPermissions()
const { roles, loading, remove } = useAtelierRoles()
const toast = useAdminToast()
const SOURCE = { builtin: 'Built in', code: 'In code', database: 'Editable' } as const

const deleting = ref<RoleEntry | null>(null)
const confirmOpen = computed({ get: () => !!deleting.value, set: (on: boolean) => !on && (deleting.value = null) })
async function confirmDelete() {
  const role = deleting.value!
  try {
    await remove.mutateAsync(role.name)
    toast.add({ color: 'success', title: `Role "${role.role.label ?? role.name}" deleted` })
  }
  catch (e) {
    toast.add({ color: 'error', title: 'Not deleted', description: (e as AdminApiError).message })
  }
}
</script>

<template>
  <NotFound
    v-if="!manages('roles')"
    forbidden
  />
  <Page
    v-else
    title="Roles"
    icon="shield"
    description="What each role may read, change and publish. Roles defined in code are changed in code."
  >
    <template #actions>
      <NuxtLink
        :to="to('roles', 'new')"
        class="cn-button cn-button--primary cn-button--size-md"
      >
        <Icon name="plus" />
        New role
      </NuxtLink>
    </template>
    <div class="app-table-wrap">
      <table class="cn-table">
        <caption class="sr-only">
          Roles
        </caption>
        <thead>
          <tr>
            <th scope="col">
              Role
            </th>
            <th scope="col">
              Name
            </th>
            <th scope="col">
              Source
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
            v-for="entry in roles"
            :key="entry.name"
          >
            <td>
              <NuxtLink
                v-if="entry.source === 'database'"
                :to="to('roles', entry.name)"
              >
                {{ entry.role.label ?? entry.name }}
              </NuxtLink>
              <template v-else>
                {{ entry.role.label ?? entry.name }}
              </template>
            </td>
            <td><code>{{ entry.name }}</code></td>
            <td>
              <CnBadge
                :variant="entry.source === 'database' ? 'success' : 'neutral'"
                size="sm"
              >
                {{ SOURCE[entry.source] }}
              </CnBadge>
            </td>
            <td class="app-actions-cell">
              <CnButton
                v-if="entry.source === 'database'"
                variant="ghost"
                size="sm"
                :aria-label="`Delete ${entry.name}`"
                @click="deleting = entry"
              >
                <Icon name="trash-2" />
              </CnButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <CnDialog
      v-model:open="confirmOpen"
      :title="`Delete the role ${deleting?.role.label ?? deleting?.name}?`"
      description="Only a role no user has can be deleted."
      confirm-label="Delete"
      variant="destructive"
      @confirm="confirmDelete"
    />
  </Page>
</template>
