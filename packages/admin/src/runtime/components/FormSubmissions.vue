<!-- On a form: its submissions (for roles that manage `forms`), searched and filtered by date, exported as CSV
     or JSON, deleted one by one; and erasing everything someone sent, by their email. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { atelierFetch } from '../composables/useAtelierAdmin'
import { refDebounced } from '../composables/debounced'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnDialog from '../crystal-neuo/components/Dialog.vue'
import CnInput from '../crystal-neuo/components/Input.vue'
import { useAdminToast } from '../toast'
import { useAdminI18n } from '../i18n'

interface FileInfo { name: string, size: number }
interface Page { fields: { name: string, label: string, type: string }[], items: { id: string, createdAt: string, locale: string, data: Record<string, unknown> }[], total: number }

const props = defineProps<{ id: string }>()
const { t } = useAdminI18n()
const toast = useAdminToast()
const client = useQueryClient()
const PAGE = 50
const q = ref('')
const from = ref('')
const to = ref('')
const offset = ref(0)
const search = refDebounced(q, 300)
const base = computed(() => `/api/_atelier/forms/${encodeURIComponent(props.id)}/submissions`)
const filters = computed(() => ({ ...search.value ? { q: search.value } : {}, ...from.value ? { from: from.value } : {}, ...to.value ? { to: to.value } : {} }))
const queryKey = computed(() => ['atelier', 'form-submissions', props.id, filters.value, offset.value])
const page = useQuery({
  queryKey,
  queryFn: () => atelierFetch<Page>(`/forms/${encodeURIComponent(props.id)}/submissions`, { query: { ...filters.value, limit: PAGE, offset: offset.value } }),
})
const columns = computed(() => (page.data.value?.fields ?? []).filter(f => f.type !== 'hidden').slice(0, 4))
const exportUrl = (format: 'csv' | 'json') => `${base.value}?${new URLSearchParams({ ...filters.value, format })}`
const shown = (value: unknown) => value && typeof value === 'object' ? (value as FileInfo).name : value === true ? '✓' : value === false ? '' : String(value ?? '')
const isFile = (value: unknown) => !!value && typeof value === 'object' && 'name' in (value as object)

const refresh = () => client.invalidateQueries({ queryKey: ['atelier', 'form-submissions', props.id] })
const remove = useMutation({
  mutationFn: (submission: string) => atelierFetch(`/forms/${encodeURIComponent(props.id)}/submissions/${encodeURIComponent(submission)}`, { method: 'DELETE' }),
  onSuccess: refresh,
  onError: (e: AdminApiError) => toast.add({ color: 'error', title: e.message }),
})

const erasing = ref(false)
const email = ref('')
async function erase() {
  try {
    const { deleted } = await atelierFetch<{ deleted: number }>('/forms/erase', { method: 'POST', body: { email: email.value } })
    toast.add({ color: 'success', title: t('forms.erased', { count: deleted }) })
    email.value = ''
    await refresh()
  }
  catch (e) {
    toast.add({ color: 'error', title: (e as AdminApiError).message })
  }
}
</script>

<template>
  <section
    class="app-comments"
    aria-labelledby="atelier-form-submissions"
    data-form-submissions
  >
    <h2
      id="atelier-form-submissions"
      class="app-section__title"
    >
      {{ t('forms.submissions') }} <span v-if="page.data.value">({{ page.data.value.total }})</span>
    </h2>
    <div class="app-row">
      <CnInput
        v-model="q"
        type="search"
        :label="t('list.search')"
      />
      <CnInput
        v-model="from"
        type="date"
        :label="t('forms.from')"
      />
      <CnInput
        v-model="to"
        type="date"
        :label="t('forms.to')"
      />
    </div>
    <div class="app-row">
      <a
        class="cn-button cn-button--secondary cn-button--size-sm"
        :href="exportUrl('csv')"
        download
      >{{ t('forms.exportCsv') }}</a>
      <a
        class="cn-button cn-button--ghost cn-button--size-sm"
        :href="exportUrl('json')"
        download
      >{{ t('forms.exportJson') }}</a>
      <CnButton
        variant="ghost"
        size="sm"
        @click="erasing = true"
      >
        {{ t('forms.erase') }}
      </CnButton>
    </div>
    <p v-if="page.data.value && !page.data.value.items.length">
      {{ t('forms.none') }}
    </p>
    <div
      v-else-if="page.data.value"
      class="app-table-wrap"
    >
      <table class="cn-table cn-table--default cn-table--size-sm">
        <thead>
          <tr>
            <th scope="col">
              {{ t('forms.submitted') }}
            </th>
            <th
              v-for="column in columns"
              :key="column.name"
              scope="col"
            >
              {{ column.label }}
            </th>
            <th scope="col">
              <span class="sr-only">{{ t('common.actions') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in page.data.value.items"
            :key="item.id"
          >
            <td>
              <time :datetime="item.createdAt">{{ new Date(item.createdAt).toLocaleString() }}</time>
            </td>
            <td
              v-for="column in columns"
              :key="column.name"
            >
              <a
                v-if="isFile(item.data[column.name])"
                :href="`${base}/${encodeURIComponent(item.id)}/files/${encodeURIComponent(column.name)}`"
                download
              >{{ shown(item.data[column.name]) }}</a>
              <template v-else>
                {{ shown(item.data[column.name]) }}
              </template>
            </td>
            <td>
              <CnButton
                variant="ghost"
                size="sm"
                @click="remove.mutate(item.id)"
              >
                {{ t('common.delete') }}
              </CnButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="page.data.value && page.data.value.total > PAGE"
      class="app-row"
    >
      <CnButton
        variant="ghost"
        size="sm"
        :disabled="offset === 0"
        @click="offset = Math.max(0, offset - PAGE)"
      >
        {{ t('forms.previous') }}
      </CnButton>
      <CnButton
        variant="ghost"
        size="sm"
        :disabled="offset + PAGE >= page.data.value.total"
        @click="offset += PAGE"
      >
        {{ t('forms.next') }}
      </CnButton>
    </div>
    <CnDialog
      v-model:open="erasing"
      :title="t('forms.eraseTitle')"
      :description="t('forms.eraseBody')"
      :confirm-label="t('forms.erase')"
      variant="destructive"
      @confirm="erase"
    >
      <CnInput
        v-model="email"
        type="email"
        :label="t('common.email')"
      />
    </CnDialog>
  </section>
</template>
