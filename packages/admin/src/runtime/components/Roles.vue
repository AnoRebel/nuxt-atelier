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
import { useAdminI18n } from '../i18n'

const { t } = useAdminI18n()

const { to } = useAtelierAdmin()
const { manages } = useAtelierPermissions()
const { roles, loading, remove } = useAtelierRoles()
const toast = useAdminToast()
const SOURCE = { builtin: 'roles.builtin', code: 'roles.code', database: 'roles.database' } as const

const deleting = ref<RoleEntry | null>(null)
const confirmOpen = computed({ get: () => !!deleting.value, set: (on: boolean) => !on && (deleting.value = null) })
async function confirmDelete() {
  const role = deleting.value!
  try {
    await remove.mutateAsync(role.name)
    toast.add({ color: 'success', title: t('roles.deleted', { name: role.role.label ?? role.name }) })
  }
  catch (e) {
    toast.add({ color: 'error', title: t('common.notDeleted'), description: (e as AdminApiError).message })
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
    :title="t('nav.roles')"
    icon="shield"
    :description="t('roles.description')"
  >
    <template #actions>
      <NuxtLink
        :to="to('roles', 'new')"
        class="cn-button cn-button--primary cn-button--size-md"
      >
        <Icon name="plus" />
        {{ t('roles.new') }}
      </NuxtLink>
    </template>
    <div class="app-table-wrap">
      <table class="cn-table">
        <caption class="sr-only">
          {{ t('nav.roles') }}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              {{ t('common.role') }}
            </th>
            <th scope="col">
              {{ t('common.name') }}
            </th>
            <th scope="col">
              {{ t('roles.source') }}
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
                {{ t(SOURCE[entry.source]) }}
              </CnBadge>
            </td>
            <td class="app-actions-cell">
              <CnButton
                v-if="entry.source === 'database'"
                variant="ghost"
                size="sm"
                :aria-label="t('roles.deleteOne', { name: entry.name })"
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
      :title="t('roles.deleteTitle', { name: deleting?.role.label ?? deleting?.name })"
      :description="t('roles.deleteBody')"
      :confirm-label="t('common.delete')"
      variant="destructive"
      @confirm="confirmDelete"
    />
  </Page>
</template>
