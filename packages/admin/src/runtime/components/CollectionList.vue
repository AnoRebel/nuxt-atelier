<!-- A collection's entries: search, sortable columns the viewer picks, bulk publish, unpublish, delete and
     export (failures reported per entry), and pages. -->
<script setup lang="ts">
import type { BulkResult } from '../composables/useAtelierCollection'
import type { Entry } from '../types'
import { computed, ref, watch } from 'vue'
import { NuxtLink } from '#components'
import { useAtelierAdmin } from '../composables/useAtelierAdmin'
import { useAtelierCollection } from '../composables/useAtelierCollection'
import { humanize } from '../composables/useAtelierNavigation'
import CnBadge from '../crystal-neuo/components/Badge.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnCheckbox from '../crystal-neuo/components/Checkbox.vue'
import CnInput from '../crystal-neuo/components/Input.vue'
import CnMenu from '../crystal-neuo/components/Menu.vue'
import CnModal from '../crystal-neuo/components/Modal.vue'
import CnPagination from '../crystal-neuo/components/Pagination.vue'
import CnSkeleton from '../crystal-neuo/components/Skeleton.vue'
import { useAdminToast } from '../toast'
import Icon from './Icon'
import NotFound from './NotFound.vue'
import Page from './Page.vue'

const props = defineProps<{ name: string }>()
const { to } = useAtelierAdmin()
const toast = useAdminToast()
const list = useAtelierCollection(() => props.name)
const { type, state } = list
const selection = ref(new Set<string>())
const columnsOpen = ref(false)
watch(() => list.entries.value, () => selection.value = new Set())

const label = (key: string) => type.value?.fields[key]?.label ?? humanize(key)
const title = computed(() => type.value?.labels?.plural ?? humanize(props.name))
const selected = computed(() => list.entries.value.filter(e => selection.value.has(e.id)))
const allSelected = computed(() => list.entries.value.length > 0 && selected.value.length === list.entries.value.length)
function toggle(id: string, on: boolean) {
  const next = new Set(selection.value)
  if (on)
    next.add(id)
  else
    next.delete(id)
  selection.value = next
}
const toggleAll = (on: boolean) => selection.value = new Set(on ? list.entries.value.map(e => e.id) : [])

const status = (e: Entry) => e.publishedVersion === null
  ? { label: 'Draft', variant: 'neutral' as const }
  : e.publishedVersion === e.version ? { label: 'Published', variant: 'success' as const } : { label: 'Changed', variant: 'warning' as const }
const text = (value: unknown) => value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
const sortBy = (key: string) => state.sort = state.sort === key ? `-${key}` : key
const sortState = (key: string) => state.sort === key ? 'ascending' : state.sort === `-${key}` ? 'descending' : undefined
const columnChoices = computed(() => Object.entries(type.value?.fields ?? {})
  .filter(([, f]) => !['blocks', 'richText', 'object', 'repeater', 'json'].includes(f.type))
  .map(([key]) => key))
const setColumn = (key: string, on: boolean) => state.columns = on ? [...state.columns, key] : state.columns.filter(c => c !== key)

function report(action: string, result: BulkResult) {
  selection.value = new Set()
  if (result.failed.length)
    toast.add({ color: 'error', title: `${action}: ${result.failed.length} of ${result.failed.length + result.succeeded.length} failed`, description: result.failed.map(f => f.error.message).join('\n') })
  else
    toast.add({ color: 'success', title: `${action}: ${result.succeeded.length} done` })
}
function download(format: 'json' | 'csv') {
  const blob = new Blob([list.exportEntries(selected.value.length ? selected.value : list.entries.value, format)], { type: format === 'json' ? 'application/json' : 'text/csv' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${props.name}.${format}` })
  a.click()
  URL.revokeObjectURL(a.href)
}
const bulk = computed(() => [
  ...type.value?.can.publish && type.value.versioned
    ? [
        { label: 'Publish', onSelect: async () => report('Publish', await list.publish.mutateAsync(selected.value)) },
        { label: 'Unpublish', onSelect: async () => report('Unpublish', await list.unpublish.mutateAsync(selected.value)) },
      ]
    : [],
  { label: 'Export JSON', onSelect: () => download('json') },
  { label: 'Export CSV', onSelect: () => download('csv') },
  ...type.value?.can.delete ? [{ separator: true as const }, { label: 'Delete', danger: true, onSelect: async () => report('Delete', await list.remove.mutateAsync(selected.value)) }] : [],
])
</script>

<template>
  <NotFound v-if="!type" />
  <Page
    v-else
    :title="title"
    :icon="type.admin?.icon"
  >
    <template #actions>
      <NuxtLink
        v-if="type.can.create"
        :to="to('collections', name, 'new')"
        class="cn-button cn-button--primary cn-button--size-md"
      >
        <Icon name="plus" />
        New
      </NuxtLink>
    </template>
    <template #toolbar>
      <CnInput
        v-model="state.search"
        label="Search"
        type="search"
        placeholder="Search"
      />
      <div class="app-row">
        <CnMenu
          v-if="selected.length"
          :items="bulk"
          trigger-variant="secondary"
        >
          <template #trigger>
            {{ selected.length }} selected
            <Icon name="chevron-down" />
          </template>
        </CnMenu>
        <CnButton
          variant="secondary"
          @click="columnsOpen = true"
        >
          Columns
        </CnButton>
      </div>
    </template>

    <div class="app-table-wrap">
      <table class="cn-table">
        <caption class="sr-only">
          {{ title }}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <CnCheckbox
                :checked="allSelected"
                :indeterminate="!!selected.length && !allSelected"
                label="Select all"
                class="app-check"
                @update:checked="toggleAll"
              />
            </th>
            <th
              v-for="key in state.columns"
              :key="key"
              scope="col"
              :aria-sort="sortState(key)"
            >
              <button
                type="button"
                class="app-sort"
                @click="sortBy(key)"
              >
                {{ label(key) }}
                <Icon
                  v-if="sortState(key)"
                  :name="sortState(key) === 'ascending' ? 'chevron-up' : 'chevron-down'"
                />
              </button>
            </th>
            <th scope="col">
              Status
            </th>
            <th
              scope="col"
              :aria-sort="sortState('_updatedAt')"
            >
              <button
                type="button"
                class="app-sort"
                @click="sortBy('_updatedAt')"
              >
                Updated
                <Icon
                  v-if="sortState('_updatedAt')"
                  :name="sortState('_updatedAt') === 'ascending' ? 'chevron-up' : 'chevron-down'"
                />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="list.loading.value">
            <td :colspan="state.columns.length + 3">
              <div
                class="app-stack"
                aria-busy="true"
              >
                <CnSkeleton
                  v-for="i in 5"
                  :key="i"
                  variant="block"
                />
              </div>
            </td>
          </tr>
          <tr v-else-if="!list.entries.value.length">
            <td :colspan="state.columns.length + 3">
              <div class="app-empty">
                <Icon name="files" />
                <p class="app-empty__title">
                  {{ state.search ? 'No matches' : 'No entries yet' }}
                </p>
              </div>
            </td>
          </tr>
          <tr
            v-for="entry in list.entries.value"
            v-else
            :key="entry.id"
            :aria-selected="selection.has(entry.id)"
          >
            <td>
              <CnCheckbox
                :checked="selection.has(entry.id)"
                label="Select"
                class="app-check"
                @update:checked="(on: boolean) => toggle(entry.id, on)"
              />
            </td>
            <td
              v-for="(key, i) in state.columns"
              :key="key"
            >
              <NuxtLink
                v-if="i === 0"
                :to="to('collections', name, entry.id)"
              >
                {{ text(entry.data[key]) || '(untitled)' }}
              </NuxtLink>
              <template v-else>
                {{ text(entry.data[key]) }}
              </template>
            </td>
            <td>
              <CnBadge
                :variant="status(entry).variant"
                size="sm"
              >
                {{ status(entry).label }}
              </CnBadge>
            </td>
            <td>
              <time :datetime="entry.updatedAt">{{ new Date(entry.updatedAt).toLocaleString() }}</time>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="app-row app-row--between">
      <span class="app-muted">{{ list.total.value }} {{ list.total.value === 1 ? 'entry' : 'entries' }}</span>
      <CnPagination
        v-if="list.pages.value > 1"
        v-model:page="state.page"
        :page-count="list.pages.value"
      />
    </div>

    <CnModal
      v-model:open="columnsOpen"
      title="Columns"
      size="sm"
    >
      <div class="app-stack">
        <CnCheckbox
          v-for="key in columnChoices"
          :key="key"
          :checked="state.columns.includes(key)"
          :label="label(key)"
          @update:checked="(on: boolean) => setColumn(key, on)"
        />
      </div>
      <div class="cn-modal__actions">
        <CnButton @click="columnsOpen = false">
          Done
        </CnButton>
      </div>
    </CnModal>
  </Page>
</template>
