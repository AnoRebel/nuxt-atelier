<!-- Media tiles: a thumbnail (images) or the kind's icon, the title or file name; a click chooses one. -->
<script setup lang="ts">
import type { MediaItem } from '../composables/useAtelierMediaLibrary'
import { useAdminI18n } from '../i18n'
import Icon from './Icon'

defineProps<{ items: MediaItem[], selected?: string | null, pickLabel?: boolean }>()
defineEmits<{ choose: [item: MediaItem] }>()
const { t } = useAdminI18n()
const icon = (mime: string) => mime.startsWith('video/') ? 'film' : mime.startsWith('audio/') ? 'music' : 'file'
</script>

<template>
  <ul class="app-media-grid">
    <li
      v-for="item in items"
      :key="item.id"
    >
      <button
        type="button"
        class="app-media-tile"
        :aria-pressed="selected === undefined ? undefined : selected === item.id"
        :aria-label="pickLabel ? t('media.select', { name: item.title || item.filename }) : undefined"
        @click="$emit('choose', item)"
      >
        <span class="app-media-tile__thumb">
          <img
            v-if="item.mime.startsWith('image/')"
            :src="`${item.url}?w=320`"
            alt=""
            loading="lazy"
          >
          <Icon
            v-else
            :name="icon(item.mime)"
          />
        </span>
        <span class="app-media-tile__name">
          <Icon
            v-if="item.private"
            name="lock"
          />
          {{ item.title || item.filename }}
        </span>
      </button>
    </li>
  </ul>
</template>
