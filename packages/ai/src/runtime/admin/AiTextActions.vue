<!-- AI actions on a text field: rewrite, shorten, expand, or translate into another locale. The suggestion
     is shown to accept (editable first), or discard; an accepted one can be undone. -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAdminI18n, useAtelierAdmin } from '#imports'

const props = defineProps<{ type: string, field: string, value: string, locale?: string, locales?: string[] }>()
const emit = defineEmits<{ apply: [value: string] }>()
const { t } = useAdminI18n()
const { api } = useAtelierAdmin()
const busy = ref(false)
const error = ref('')
const suggestion = ref<string | null>(null)
const previous = ref<string | null>(null)
const others = computed(() => (props.locales ?? []).filter(code => code !== props.locale))

async function ask(action: 'rewrite' | 'shorten' | 'expand' | 'translate', to?: string) {
  busy.value = true
  error.value = ''
  previous.value = null
  try {
    const body = action === 'translate'
      ? { action, type: props.type, field: props.field, value: props.value, to, from: props.locale }
      : { action, type: props.type, field: props.field, text: props.value, locale: props.locale }
    suggestion.value = (await api<{ suggestion: string }>('/ai/suggest', { method: 'POST', body })).suggestion
  }
  catch (e) {
    error.value = (e as { message?: string }).message ?? t('ai.failed')
  }
  finally {
    busy.value = false
  }
}
function accept() {
  previous.value = props.value
  emit('apply', suggestion.value!)
  suggestion.value = null
}
function undo() {
  emit('apply', previous.value!)
  previous.value = null
}
</script>

<template>
  <div
    class="app-ai"
    data-ai-actions
  >
    <div
      v-if="suggestion === null"
      class="app-row"
    >
      <button
        v-for="action in (['rewrite', 'shorten', 'expand'] as const)"
        :key="action"
        type="button"
        class="cn-button cn-button--ghost cn-button--size-sm"
        :disabled="busy || !value"
        @click="ask(action)"
      >
        {{ t(`ai.${action}`) }}
      </button>
      <button
        v-for="code in others"
        :key="code"
        type="button"
        class="cn-button cn-button--ghost cn-button--size-sm"
        :disabled="busy || !value"
        @click="ask('translate', code)"
      >
        {{ t('ai.translateTo', { locale: code.toUpperCase() }) }}
      </button>
      <button
        v-if="previous !== null"
        type="button"
        class="cn-button cn-button--ghost cn-button--size-sm"
        @click="undo"
      >
        {{ t('ai.undo') }}
      </button>
      <span
        v-if="busy"
        role="status"
      >{{ t('ai.working') }}</span>
    </div>
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
          rows="4"
        />
      </label>
      <div class="app-row">
        <button
          type="button"
          class="cn-button cn-button--primary cn-button--size-sm"
          @click="accept"
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
      class="app-ai__error"
      role="alert"
    >
      {{ error }}
    </p>
  </div>
</template>
