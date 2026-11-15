<!-- An entry's history, opened on demand (nothing is fetched before): its versions newest first, with who
     saved each and when, and whether it went live; any two compared block by block; one restored as the
     next draft, the versions in between kept. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import type { Change } from '#atelier/shared/diff'
import { useQuery } from '@tanstack/vue-query'
import { computed, ref, watch } from 'vue'
import { diffEntries } from '#atelier/shared/diff'
import { atelierFetch } from '../composables/useAtelierAdmin'
import CnBadge from '../crystal-neuo/components/Badge.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnCheckbox from '../crystal-neuo/components/Checkbox.vue'
import { useAdminToast } from '../toast'
import { useAdminI18n } from '../i18n'

const props = defineProps<{
  /** The entry's API path (`/collections/posts/<id>`, `/singletons/home`), and its locale query. */
  url: string
  query: Record<string, string>
  /** The version being edited: a restore saves over it. */
  version: number | null
  /** Restoring needs the right to save, and no unsaved changes to lose. */
  canRestore: boolean
}>()
const emit = defineEmits<{ restored: [] }>()
const { t } = useAdminI18n()
const toast = useAdminToast()

interface Revision { version: number, createdAt: string, authorName: string | null, published: boolean }
const open = ref(false)
const history = useQuery({
  queryKey: computed(() => ['atelier', 'revisions', props.url, props.query]),
  queryFn: () => atelierFetch<Revision[]>(`${props.url}/revisions`, { query: props.query }),
  enabled: open,
})
watch(() => props.version, () => open.value && history.refetch())
const time = (at: string) => new Date(at).toLocaleString()

// comparing: the two versions ticked, older first
const picked = ref<number[]>([])
function pick(version: number, on: boolean) {
  picked.value = on ? [...picked.value.filter(v => v !== version), version].slice(-2) : picked.value.filter(v => v !== version)
}
const changes = ref<Change[] | null>(null)
watch(picked, async (versions) => {
  changes.value = null
  if (versions.length !== 2)
    return
  const [older, newer] = versions.toSorted((a, b) => a - b)
  const load = (v: number) => atelierFetch<{ data: Record<string, unknown> }>(`${props.url}/revisions/${v}`, { query: props.query })
  const [before, after] = await Promise.all([load(older!), load(newer!)])
  changes.value = diffEntries(before.data, after.data)
})
const short = (value: unknown) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '—'
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}
function describe(change: Change): string {
  switch (change.kind) {
    case 'field': return t('history.field', { path: change.path, before: short(change.before), after: short(change.after) })
    case 'added': return t('history.added', { type: change.type })
    case 'removed': return t('history.removed', { type: change.type })
    case 'moved': return t('history.moved', { type: change.type })
    case 'changed': return t('history.changed', { type: change.type, prop: change.prop, before: short(change.before), after: short(change.after) })
  }
}

const restoring = ref<number | null>(null)
async function restore(version: number) {
  restoring.value = version
  try {
    await atelierFetch(`${props.url}/revisions/${version}/restore`, { method: 'POST', query: props.query, body: { version: props.version } })
    toast.add({ color: 'success', title: t('history.restored', { version }) })
    emit('restored')
  }
  catch (e) {
    toast.add({ color: 'error', title: (e as AdminApiError).message })
  }
  finally {
    restoring.value = null
  }
}
</script>

<template>
  <details
    class="app-comments"
    data-history
    @toggle="open = ($event.target as HTMLDetailsElement).open"
  >
    <summary class="app-section__title">
      {{ t('history.title') }}
    </summary>
    <p v-if="history.data.value && !history.data.value.length">
      {{ t('history.empty') }}
    </p>
    <ol
      v-else
      class="app-list"
    >
      <li
        v-for="revision in history.data.value"
        :key="revision.version"
        class="app-row"
        :data-revision="revision.version"
      >
        <CnCheckbox
          :checked="picked.includes(revision.version)"
          :label="t('history.version', { version: revision.version })"
          @update:checked="pick(revision.version, $event)"
        />
        <span class="app-muted">{{ revision.authorName ? t('history.by', { time: time(revision.createdAt), author: revision.authorName }) : time(revision.createdAt) }}</span>
        <CnBadge
          v-if="revision.published"
          variant="success"
          size="sm"
        >
          {{ t('status.published') }}
        </CnBadge>
        <CnButton
          v-if="canRestore && revision.version !== version"
          variant="ghost"
          size="sm"
          :loading="restoring === revision.version"
          @click="restore(revision.version)"
        >
          {{ t('history.restore') }}
        </CnButton>
      </li>
    </ol>
    <p
      v-if="history.data.value?.length && picked.length < 2"
      class="app-muted"
    >
      {{ t('history.pick') }}
    </p>
    <section
      v-if="changes"
      data-changes
      :aria-label="t('history.compared', { a: Math.min(...picked), b: Math.max(...picked) })"
    >
      <p v-if="!changes.length">
        {{ t('history.same') }}
      </p>
      <ul v-else>
        <li
          v-for="(change, i) in changes"
          :key="i"
        >
          {{ describe(change) }}
        </li>
      </ul>
    </section>
  </details>
</template>
