<!-- A media field's input: the chosen file's preview, choosing (or uploading) one in a dialog over the
     library, removing it. -->
<script setup lang="ts">
import type { MediaItem } from '../composables/useAtelierMediaLibrary'
import { ref } from 'vue'
import { useAtelierMediaItem } from '../composables/useAtelierMediaLibrary'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnModal from '../crystal-neuo/components/Modal.vue'
import { useAdminI18n } from '../i18n'
import Icon from './Icon'
import MediaLibrary from './MediaLibrary.vue'

const props = defineProps<{ modelValue?: string | null, label: string, error?: string, disabled?: boolean, hint?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()
const { t } = useAdminI18n()
const item = useAtelierMediaItem(() => props.modelValue)
const picking = ref(false)

function choose(chosen: MediaItem) {
  emit('update:modelValue', chosen.id)
  picking.value = false
}
</script>

<template>
  <fieldset
    class="app-fieldset"
    data-media-field
  >
    <legend class="cn-label">
      {{ label }}
    </legend>
    <div class="app-media-field">
      <img
        v-if="item.data.value?.mime.startsWith('image/')"
        :src="`${item.data.value.url}?w=160`"
        :alt="item.data.value.alt?.[''] ?? ''"
        class="app-media-field__thumb"
      >
      <span
        v-else-if="item.data.value"
        class="app-media-field__thumb"
      ><Icon name="file" /></span>
      <span class="app-muted">{{ item.data.value ? (item.data.value.title || item.data.value.filename) : t('media.noFile') }}</span>
      <template v-if="!disabled">
        <CnButton
          variant="secondary"
          size="sm"
          @click="picking = true"
        >
          {{ modelValue ? t('media.change') : t('media.choose') }}
        </CnButton>
        <CnButton
          v-if="modelValue"
          variant="ghost"
          size="sm"
          @click="emit('update:modelValue', null)"
        >
          {{ t('media.remove') }}
        </CnButton>
      </template>
    </div>
    <span
      v-if="error"
      class="cn-field__message"
      role="alert"
    >{{ error }}</span>
    <span
      v-else-if="hint"
      class="cn-field__hint"
    >{{ hint }}</span>
    <CnModal
      v-model:open="picking"
      :title="t('media.pick')"
      size="lg"
    >
      <MediaLibrary
        v-if="picking"
        picking
        :selected="modelValue"
        @choose="choose"
      />
    </CnModal>
  </fieldset>
</template>
