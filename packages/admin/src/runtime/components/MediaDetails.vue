<!-- One file's details: alt text (per locale on a site in several), title, caption, credits, folder, tags,
     focal point (click the image) and private; where it's used, and deleting it. Read-only without the
     `media` capability. -->
<script setup lang="ts">
import type { MediaChanges, MediaItem, MediaUsage } from '../composables/useAtelierMediaLibrary'
import type { AdminApiError } from '../types'
import { computed, reactive, ref, watch } from 'vue'
import { ai } from '#atelier-admin-ai'
import { useAtelierAdminSchema } from '../composables/useAtelierAdminSchema'
import { useAtelierMediaLibrary } from '../composables/useAtelierMediaLibrary'
import { useAtelierPermissions } from '../composables/useAtelierPermissions'
import CnAlert from '../crystal-neuo/components/Alert.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnDialog from '../crystal-neuo/components/Dialog.vue'
import CnDrawer from '../crystal-neuo/components/Drawer.vue'
import CnInput from '../crystal-neuo/components/Input.vue'
import CnTextarea from '../crystal-neuo/components/Textarea.vue'
import CnToggle from '../crystal-neuo/components/Toggle.vue'
import { useAdminI18n } from '../i18n'
import { useAdminToast } from '../toast'

const props = defineProps<{ item: MediaItem | null }>()
const aiOn = ai ? ai.enabled() : ref(false)
const emit = defineEmits<{ close: [] }>()
const { t } = useAdminI18n()
const { manages } = useAtelierPermissions()
const { schema } = useAtelierAdminSchema()
const { update, remove, usage } = useAtelierMediaLibrary()
const toast = useAdminToast()
const canEdit = computed(() => manages('media'))
const open = computed({ get: () => !!props.item, set: (on: boolean) => !on && emit('close') })

// alt text: one per content locale on a site in several, else one for all ('')
const locales = computed(() => (schema.value?.locales.codes.length ?? 0) > 1 ? schema.value!.locales.codes : [''])
const form = reactive({ title: '', caption: '', credits: '', folder: '', tags: '', private: false, alt: {} as Record<string, string>, focal: null as { x: number, y: number } | null })
const usages = ref<MediaUsage[]>([])
const error = ref('')
watch(() => props.item, async (item) => {
  if (!item)
    return
  Object.assign(form, { title: item.title ?? '', caption: item.caption ?? '', credits: item.credits ?? '', folder: item.folder, tags: item.tags.join(', '), private: item.private, alt: { ...item.alt }, focal: item.focal })
  error.value = ''
  usages.value = await usage(item.id).catch(() => [])
}, { immediate: true })

const isImage = computed(() => props.item?.mime.startsWith('image/'))
function setFocal(e: MouseEvent) {
  if (!canEdit.value)
    return
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000
  form.focal = { x: round((e.clientX - box.left) / box.width), y: round((e.clientY - box.top) / box.height) }
}
const size = (bytes: number) => bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`

async function save() {
  error.value = ''
  const alt = Object.fromEntries(Object.entries(form.alt).filter(([, v]) => v.trim()))
  const changes: MediaChanges = {
    title: form.title || null,
    caption: form.caption || null,
    credits: form.credits || null,
    folder: form.folder.trim(),
    tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
    private: form.private,
    alt: Object.keys(alt).length ? alt : null,
    focal: form.focal,
  }
  try {
    await update.mutateAsync({ id: props.item!.id, changes })
    toast.add({ color: 'success', title: t('media.saved') })
  }
  catch (e) {
    error.value = (e as AdminApiError).errors?.map(x => `${x.path}: ${x.message}`).join('. ') || (e as AdminApiError).message
  }
}

const deleting = ref(false)
async function confirmDelete() {
  try {
    await remove.mutateAsync({ id: props.item!.id, force: usages.value.length > 0 })
    toast.add({ color: 'success', title: t('media.deleted') })
    emit('close')
  }
  catch (e) {
    toast.add({ color: 'error', title: t('common.notDeleted'), description: (e as AdminApiError).message })
  }
}
</script>

<template>
  <CnDrawer
    v-model:open="open"
    :title="t('media.details')"
    placement="end"
    size="lg"
  >
    <div
      v-if="item"
      class="app-stack"
      data-media-details
    >
      <button
        v-if="isImage"
        type="button"
        class="app-media-focal"
        :disabled="!canEdit"
        :aria-label="t('media.focalHint')"
        @click="setFocal"
      >
        <img
          :src="`${item.url}?w=640`"
          :alt="item.alt?.[''] ?? ''"
          class="app-media-focal__image"
        >
        <span
          v-if="form.focal"
          class="app-media-focal__point"
          :style="{ left: `${form.focal.x * 100}%`, top: `${form.focal.y * 100}%` }"
          aria-hidden="true"
        />
      </button>
      <p class="app-muted">
        {{ item.filename }} · {{ t('media.size', { size: size(item.size), width: item.width ?? '–', height: item.height ?? '–' }) }}
        · <a
          :href="item.url"
          target="_blank"
          rel="noopener"
        >{{ t('media.open') }}</a>
      </p>
      <p
        v-if="isImage && canEdit"
        class="app-muted"
      >
        {{ t('media.focalHint') }}
      </p>
      <form
        class="app-form"
        @submit.prevent="save"
      >
        <template v-if="isImage">
          <template
            v-for="locale in locales"
            :key="locale"
          >
            <CnTextarea
              :model-value="form.alt[locale] ?? ''"
              :label="locale ? t('media.altIn', { locale: locale.toUpperCase() }) : t('media.alt')"
              :hint="t('media.altHint')"
              :rows="2"
              :disabled="!canEdit"
              @update:model-value="(v: string) => form.alt[locale] = v"
            />
            <component
              :is="ai.AltText"
              v-if="ai && aiOn && canEdit && item"
              :media="item.id"
              :locale="locale || undefined"
              @apply="(v: string) => form.alt[locale] = v"
            />
          </template>
        </template>
        <CnInput
          v-model="form.title"
          :label="t('media.titleField')"
          :disabled="!canEdit"
        />
        <CnTextarea
          v-model="form.caption"
          :label="t('media.caption')"
          :rows="2"
          :disabled="!canEdit"
        />
        <CnInput
          v-model="form.credits"
          :label="t('media.credits')"
          :disabled="!canEdit"
        />
        <CnInput
          v-model="form.folder"
          :label="t('media.folder')"
          :disabled="!canEdit"
        />
        <CnInput
          v-model="form.tags"
          :label="t('media.tags')"
          :hint="t('media.tagsHint')"
          :disabled="!canEdit"
        />
        <CnToggle
          v-model:checked="form.private"
          :label="t('media.privateLabel')"
          :disabled="!canEdit"
        />
        <p class="app-muted">
          {{ usages.length === 1 ? t('media.usedInOne') : usages.length ? t('media.usedIn', { count: usages.length }) : t('media.unused') }}
        </p>
        <CnAlert
          v-if="error"
          variant="danger"
          live
        >
          {{ error }}
        </CnAlert>
        <div
          v-if="canEdit"
          class="app-form__actions"
        >
          <CnButton
            variant="danger"
            @click="deleting = true"
          >
            {{ t('common.delete') }}
          </CnButton>
          <CnButton
            type="submit"
            :loading="update.isPending.value"
          >
            {{ t('common.save') }}
          </CnButton>
        </div>
      </form>
      <CnDialog
        v-model:open="deleting"
        :title="t('media.deleteTitle')"
        :description="usages.length === 1 ? t('media.deleteUsedOne') : usages.length ? t('media.deleteUsed', { count: usages.length }) : t('media.deleteBody')"
        :confirm-label="t('common.delete')"
        variant="destructive"
        @confirm="confirmDelete"
      />
    </div>
  </CnDrawer>
</template>
