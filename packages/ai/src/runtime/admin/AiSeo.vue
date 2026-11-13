<!-- An SEO title and description written from the saved entry, to accept (editable) or discard. -->
<script setup lang="ts">
import { ref } from 'vue'
import { useAdminI18n, useAtelierAdmin } from '#imports'

const props = defineProps<{ type: string, id?: string, locale?: string }>()
const emit = defineEmits<{ apply: [value: { title: string, description: string }] }>()
const { t } = useAdminI18n()
const { api } = useAtelierAdmin()
const busy = ref(false)
const error = ref('')
const suggestion = ref<{ title: string, description: string } | null>(null)

async function ask() {
  busy.value = true
  error.value = ''
  try {
    suggestion.value = (await api<{ suggestion: { title: string, description: string } }>('/ai/suggest', { method: 'POST', body: { action: 'seo', type: props.type, id: props.id, locale: props.locale } })).suggestion
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
    data-ai-seo
  >
    <button
      v-if="!suggestion"
      type="button"
      class="cn-button cn-button--ghost cn-button--size-sm"
      :disabled="busy"
      @click="ask"
    >
      {{ busy ? t('ai.working') : t('ai.seo') }}
    </button>
    <div
      v-else
      class="app-ai__suggestion"
      data-ai-suggestion
    >
      <label class="cn-field">
        <span class="cn-field__label">{{ t('ai.seoTitle') }}</span>
        <input
          v-model="suggestion.title"
          class="cn-input cn-input--size-md"
        >
      </label>
      <label class="cn-field">
        <span class="cn-field__label">{{ t('ai.seoDescription') }}</span>
        <textarea
          v-model="suggestion.description"
          class="cn-textarea cn-input--size-md"
          rows="3"
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
