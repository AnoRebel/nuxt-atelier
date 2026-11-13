<!-- The top bar's notifications: mentions, replies and lock takeovers, newest first. Choosing one opens
     the entry and marks it read. -->
<script setup lang="ts">
import type { AdminNotification } from '../composables/useAtelierNotifications'
import { computed } from 'vue'
import { navigateTo } from '#imports'
import { useAtelierAdmin } from '../composables/useAtelierAdmin'
import { useAtelierAdminSchema } from '../composables/useAtelierAdminSchema'
import { humanize } from '../composables/useAtelierNavigation'
import { useAtelierNotifications } from '../composables/useAtelierNotifications'
import CnMenu from '../crystal-neuo/components/Menu.vue'
import Icon from './Icon'
import { useAdminI18n } from '../i18n'

const { t } = useAdminI18n()
const { to } = useAtelierAdmin()
const { schema } = useAtelierAdminSchema()
const { items, unread, markRead } = useAtelierNotifications()

const typeLabel = (type: string) => {
  const collection = schema.value?.collections.find(c => c.name === type) as { labels?: { plural?: string } } | undefined
  const singleton = schema.value?.singletons.find(s => s.name === type) as { label?: string } | undefined
  return collection?.labels?.plural ?? singleton?.label ?? humanize(type)
}
const isSingleton = (type: string) => !!schema.value?.singletons.some(s => s.name === type)

async function open(n: AdminNotification) {
  if (!n.readAt)
    markRead.mutate([n.id])
  await navigateTo(isSingleton(n.data.type) ? to('singletons', n.data.type) : to('collections', n.data.type, n.data.entry))
}

const entries = computed(() => [
  ...items.value.length
    ? items.value.map(n => ({ label: `${n.readAt ? '' : '● '}${t(`notifications.${n.kind}`, { name: n.data.byName, type: typeLabel(n.data.type) })}`, onSelect: () => void open(n) }))
    : [{ label: t('notifications.empty'), disabled: true }],
  ...unread.value ? [{ separator: true as const }, { label: t('notifications.markAllRead'), onSelect: () => markRead.mutate(undefined) }] : [],
])
</script>

<template>
  <CnMenu
    :items="entries"
    trigger-variant="ghost"
    class="app-notifications"
  >
    <template #trigger>
      <span
        class="app-notifications__trigger"
        data-notifications
      >
        <Icon name="bell" />
        <span class="sr-only">{{ unread ? `${t('notifications.title')}, ${t('notifications.unread', { count: unread })}` : t('notifications.title') }}</span>
        <span
          v-if="unread"
          class="app-notifications__count"
          aria-hidden="true"
        >{{ unread > 99 ? '99+' : unread }}</span>
      </span>
    </template>
  </CnMenu>
</template>
