<!-- Alt text for an image, suggested from the image itself, to accept (editable) or discard. -->
<script setup lang="ts">
import { ref } from 'vue'
import { useAdminI18n, useAtelierAdmin } from '#imports'

const props = defineProps<{ media: string, locale?: string }>()
const emit = defineEmits<{ apply: [value: string] }>()
const { t } = useAdminI18n()
const { api } = useAtelierAdmin()
const busy = ref(false)
const error = ref('')
const suggestion = ref<string | null>(null)

async function ask() {
  busy.value = true
  error.value = ''
  try {
    suggestion.value = (await api<{ suggestion: string }>('/ai/suggest', { method: 'POST', body: { action: 'alt', media: props.media, locale: props.locale } })).suggestion
  }
  catch (e) {
    error.value = (e as { message?: string }).message ?? t('ai.failed')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    class="app-ai"
    data-ai-alt
  >
    <button
      v-if="suggestion === null"
      type="button"
      class="cn-button cn-button--ghost cn-button--size-sm"
      :disabled="busy"
      @click="ask"
    >
      {{ busy ? t('ai.working') : t('ai.altText') }}
    </button>
    <div
      v-else
      class="app-ai__suggestion"
      data-ai-suggestion
    >
      <label class="cn-field">
        <span class="cn-field__label">{{ t('ai.suggestion') }}</span>
        <textarea
          v-model="suggestion"
          class="cn-textarea cn-input--size-md"
          rows="2"
        />
      </label>
      <div class="app-row">
        <button
          type="button"
          class="cn-button cn-button--primary cn-button--size-sm"
          @click="emit('apply', suggestion!), suggestion = null"
        >
          {{ t('ai.accept') }}
        </button>
        <button
          type="button"
          class="cn-button cn-button--ghost cn-button--size-sm"
          @click="suggestion = null"
        >
          {{ t('ai.discard') }}
        </button>
      </div>
    </div>
    <p
      v-if="error"
      role="alert"
    >
      {{ error }}
    </p>
  </div>
</template>
