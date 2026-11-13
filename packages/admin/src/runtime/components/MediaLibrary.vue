<!-- The media library: search, filters (kind, folder, tag), uploading (the button, or dropping files),
     the files as tiles, and each file's details. Uploading takes the `media` capability. -->
<script setup lang="ts">
import type { MediaItem } from '../composables/useAtelierMediaLibrary'
import type { AdminApiError } from '../types'
import { computed, ref } from 'vue'
import { useRoute } from '#imports'
import { useAtelierMediaLibrary } from '../composables/useAtelierMediaLibrary'
import { useAtelierPermissions } from '../composables/useAtelierPermissions'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnInput from '../crystal-neuo/components/Input.vue'
import CnPagination from '../crystal-neuo/components/Pagination.vue'
import CnProgress from '../crystal-neuo/components/Progress.vue'
import CnSelect from '../crystal-neuo/components/Select.vue'
import { useAdminI18n } from '../i18n'
import { useAdminToast } from '../toast'
import Icon from './Icon'
import MediaDetails from './MediaDetails.vue'
import MediaGrid from './MediaGrid.vue'
import Page from './Page.vue'

const props = defineProps<{ picking?: boolean, selected?: string | null }>()
const emit = defineEmits<{ choose: [item: MediaItem] }>()
const { t } = useAdminI18n()
const { manages } = useAtelierPermissions()
// opened from the global search: already searching for the file
const route = useRoute()
const library = useAtelierMediaLibrary(!props.picking && typeof route.query.search === 'string' ? { search: route.query.search } : {})
const { state } = library
const toast = useAdminToast()
const open = ref<MediaItem | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

const kinds = computed(() => [
  { value: '', label: t('media.kind.all') },
  { value: 'image/', label: t('media.kind.image') },
  { value: 'video/', label: t('media.kind.video') },
  { value: 'audio/', label: t('media.kind.audio') },
  { value: 'application/pdf', label: t('media.kind.pdf') },
])

async function upload(files: FileList | File[] | null | undefined) {
  if (!files?.length || !manages('media'))
    return
  let done = 0
  for (const file of files) {
    try {
      const item = await library.upload(file, state.folder ? { folder: state.folder } : {})
      done++
      if (props.picking && files.length === 1)
        emit('choose', item)
    }
    catch (e) {
      toast.add({ color: 'error', title: t('media.notUploaded', { name: file.name }), description: (e as AdminApiError).message })
    }
  }
  if (done)
    toast.add({ color: 'success', title: t('media.uploaded', { count: done }) })
}
function onDrop(e: DragEvent) {
  dragging.value = false
  void upload(e.dataTransfer?.files)
}
const choose = (item: MediaItem) => props.picking ? emit('choose', item) : (open.value = item)
</script>

<template>
  <component
    :is="picking ? 'div' : Page"
    v-bind="picking ? {} : { title: t('media.title'), icon: 'image', description: t('media.description') }"
  >
    <div
      class="app-stack app-media-drop"
      :data-dragging="dragging || undefined"
      @dragover.prevent="dragging = manages('media')"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <div class="app-page__toolbar">
        <CnInput
          v-model="state.search"
          :label="t('media.search')"
          type="search"
        />
        <CnSelect
          v-model="state.kind"
          :label="t('media.kind')"
          :options="kinds"
        />
        <CnInput
          v-model="state.folder"
          :label="t('media.folder')"
        />
        <CnInput
          v-model="state.tag"
          :label="t('media.tag')"
        />
        <template v-if="manages('media')">
          <CnButton @click="fileInput?.click()">
            <Icon name="upload" />
            {{ t('media.upload') }}
          </CnButton>
          <input
            ref="fileInput"
            type="file"
            multiple
            hidden
            data-media-upload
            @change="upload(($event.target as HTMLInputElement).files)"
          >
        </template>
      </div>
      <p
        v-if="manages('media')"
        class="app-muted"
      >
        {{ t('media.drop') }}
      </p>
      <CnProgress
        v-for="(share, name) in library.progress.value"
        :key="name"
        :value="Math.round(share * 100)"
        :max="100"
        :label="t('media.uploading', { name, percent: Math.round(share * 100) })"
      />
      <MediaGrid
        :items="library.items.value"
        :selected="picking ? selected ?? null : undefined"
        :pick-label="picking"
        @choose="choose"
      />
      <div
        v-if="!library.loading.value && !library.items.value.length"
        class="app-empty"
      >
        <Icon name="image" />
        <p class="app-empty__title">
          {{ state.search || state.folder || state.tag || state.kind ? t('media.noMatches') : t('media.empty') }}
        </p>
      </div>
      <div class="app-row app-row--between">
        <span class="app-muted">{{ library.total.value === 1 ? t('media.countOne') : t('media.count', { count: library.total.value }) }}</span>
        <CnPagination
          v-if="library.pages.value > 1"
          v-model:page="state.page"
          :page-count="library.pages.value"
        />
      </div>
    </div>
    <MediaDetails
      v-if="!picking"
      :item="open"
      @close="open = null"
    />
  </component>
</template>
