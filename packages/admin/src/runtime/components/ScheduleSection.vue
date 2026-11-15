<!-- Scheduling an entry's publish or unpublish, for those who may publish: what's scheduled (a publish pins
     the version saved when it was scheduled, and says which), a failure and why, cancelling, and scheduling
     at a date and time in the user's own time zone. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { atelierFetch } from '../composables/useAtelierAdmin'
import CnBadge from '../crystal-neuo/components/Badge.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnInput from '../crystal-neuo/components/Input.vue'
import CnSelect from '../crystal-neuo/components/Select.vue'
import { useAdminToast } from '../toast'
import { useAdminI18n } from '../i18n'

const props = defineProps<{
  /** The entry's API path (`/collections/posts/<id>`, `/singletons/home`), and its locale query. */
  url: string
  query: Record<string, string>
  /** The saved version: what a publish scheduled now goes live with. */
  version: number | null
  /** Unsaved changes aren't in that version: scheduling waits for a save. */
  dirty: boolean
}>()
const { t } = useAdminI18n()
const toast = useAdminToast()
const client = useQueryClient()

type Action = 'publish' | 'unpublish'
interface Schedule { action: Action, at: string, version?: number, status: string, lastError: string | null }
const queryKey = computed(() => ['atelier', 'schedule', props.url, props.query])
const schedules = useQuery({ queryKey, queryFn: () => atelierFetch<Schedule[]>(`${props.url}/schedule`, { query: props.query }) })
const refresh = () => client.invalidateQueries({ queryKey: queryKey.value })
const failed = (s: Schedule) => s.status === 'failed'

const action = ref<Action>('publish')
const at = ref('')
const actions = computed(() => [{ value: 'publish', label: t('schedule.publish') }, { value: 'unpublish', label: t('schedule.unpublish') }])
const schedule = useMutation({
  // datetime-local is the user's local time: Date reads it so, and sends it as UTC
  mutationFn: () => atelierFetch(`${props.url}/schedule`, { method: 'POST', query: props.query, body: { action: action.value, at: new Date(at.value).toISOString(), version: props.version } }),
  onSuccess: () => {
    toast.add({ color: 'success', title: t('schedule.done') })
    at.value = ''
    return refresh()
  },
  onError: (e: AdminApiError) => toast.add({ color: 'error', title: e.message }),
})
const cancel = useMutation({
  mutationFn: (which: Action) => atelierFetch(`${props.url}/schedule/${which}`, { method: 'DELETE', query: props.query }),
  onSuccess: refresh,
  onError: (e: AdminApiError) => toast.add({ color: 'error', title: e.message }),
})
const when = (iso: string) => new Date(iso).toLocaleString()
</script>

<template>
  <section
    class="app-comments"
    aria-labelledby="atelier-schedule"
    data-schedule
  >
    <h2
      id="atelier-schedule"
      class="app-section__title"
    >
      {{ t('schedule.title') }}
    </h2>
    <ul v-if="schedules.data.value?.length">
      <li
        v-for="s in schedules.data.value"
        :key="s.action"
        class="app-row"
        :data-scheduled="s.action"
      >
        <span>{{ s.action === 'publish' ? t('schedule.publishAt', { time: when(s.at), version: s.version ?? '' }) : t('schedule.unpublishAt', { time: when(s.at) }) }}</span>
        <CnBadge
          v-if="failed(s)"
          variant="danger"
          size="sm"
          :title="s.lastError ?? undefined"
        >
          {{ t('schedule.failed', { reason: s.lastError ?? '' }) }}
        </CnBadge>
        <CnButton
          variant="ghost"
          size="sm"
          :loading="cancel.isPending.value && cancel.variables.value === s.action"
          @click="cancel.mutate(s.action)"
        >
          {{ t('schedule.cancel') }}
        </CnButton>
      </li>
    </ul>
    <p
      v-else-if="schedules.data.value"
      class="app-muted"
    >
      {{ t('schedule.none') }}
    </p>
    <form
      class="app-row"
      @submit.prevent="schedule.mutate()"
    >
      <CnSelect
        v-model="action"
        :label="t('schedule.action')"
        :options="actions"
      />
      <CnInput
        v-model="at"
        :label="t('schedule.at')"
        type="datetime-local"
        required
      />
      <CnButton
        type="submit"
        variant="secondary"
        :disabled="dirty || !at"
        :loading="schedule.isPending.value"
      >
        {{ t('schedule.submit') }}
      </CnButton>
    </form>
    <p
      v-if="dirty"
      class="app-muted"
    >
      {{ t('schedule.saveFirst') }}
    </p>
  </section>
</template>
