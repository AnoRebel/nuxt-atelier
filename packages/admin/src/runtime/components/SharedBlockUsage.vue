<!-- On a shared block: where it's placed, and letting go of it everywhere (detached copies, or removed),
     which it needs before it can be deleted. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'
import { NuxtLink } from '#components'
import { atelierFetch, useAtelierAdmin } from '../composables/useAtelierAdmin'
import { useAtelierAdminSchema } from '../composables/useAtelierAdminSchema'
import { humanize } from '../composables/useAtelierNavigation'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnDialog from '../crystal-neuo/components/Dialog.vue'
import { useAdminToast } from '../toast'
import { useAdminI18n } from '../i18n'

const props = defineProps<{ id: string, canDelete: boolean }>()
const { t } = useAdminI18n()
const { to } = useAtelierAdmin()
const { schema } = useAtelierAdminSchema()
const toast = useAdminToast()
const client = useQueryClient()
const queryKey = computed(() => ['atelier', 'shared-blocks', props.id, 'usage'])
const usage = useQuery({ queryKey, queryFn: () => atelierFetch<{ type: string, id: string, field: string }[]>(`/shared-blocks/${encodeURIComponent(props.id)}/usage`) })
const places = computed(() => [...new Map((usage.data.value ?? []).map(u => [`${u.type}:${u.id}`, u])).values()])
const isSingleton = (type: string) => !!schema.value?.singletons.some(s => s.name === type)
const label = (type: string) => (schema.value?.collections.find(c => c.name === type) as { labels?: { singular?: string } } | undefined)?.labels?.singular ?? humanize(type)

const asking = ref<'detach' | 'remove' | null>(null)
const open = computed({ get: () => !!asking.value, set: (value: boolean) => !value && (asking.value = null) })
const release = useMutation({
  mutationFn: (mode: 'detach' | 'remove') => atelierFetch(`/shared-blocks/${encodeURIComponent(props.id)}/release`, { method: 'POST', body: { mode } }),
  onSuccess: () => client.invalidateQueries({ queryKey: queryKey.value }),
  onError: (e: AdminApiError) => toast.add({ color: 'error', title: e.message }),
})
</script>

<template>
  <section
    class="app-comments"
    aria-labelledby="atelier-shared-usage"
    data-shared-usage
  >
    <h2
      id="atelier-shared-usage"
      class="app-section__title"
    >
      {{ t('shared.usage') }}
    </h2>
    <p v-if="!usage.isPending.value && !places.length">
      {{ t('shared.unused') }}
    </p>
    <ul
      v-else
      class="app-comments__list"
    >
      <li
        v-for="place in places"
        :key="`${place.type}:${place.id}`"
      >
        <NuxtLink :to="isSingleton(place.type) ? to('singletons', place.type) : to('collections', place.type, place.id)">
          {{ label(place.type) }} {{ isSingleton(place.type) ? '' : place.id }}
        </NuxtLink>
      </li>
    </ul>
    <div
      v-if="canDelete && places.length"
      class="app-row"
    >
      <CnButton
        variant="secondary"
        size="sm"
        @click="asking = 'detach'"
      >
        {{ t('shared.detachAll') }}
      </CnButton>
      <CnButton
        variant="ghost"
        size="sm"
        @click="asking = 'remove'"
      >
        {{ t('shared.removeAll') }}
      </CnButton>
    </div>
    <CnDialog
      v-model:open="open"
      :title="asking === 'remove' ? t('shared.removeTitle') : t('shared.detachTitle')"
      :description="asking === 'remove' ? t('shared.removeBody', { count: places.length }) : t('shared.detachBody', { count: places.length })"
      :confirm-label="asking === 'remove' ? t('shared.removeAll') : t('shared.detachAll')"
      :variant="asking === 'remove' ? 'destructive' : undefined"
      @confirm="asking && release.mutate(asking)"
    />
  </section>
</template>
