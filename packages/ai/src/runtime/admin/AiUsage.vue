<!-- AI usage: requests and tokens per user and action over a period, for those who manage users. -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAdminI18n, useAtelierAdmin } from '#imports'

interface Row { userId: string, name: string, action: string, requests: number, inputTokens: number, outputTokens: number }

const { t } = useAdminI18n()
const { api } = useAtelierAdmin()
const today = new Date().toISOString().slice(0, 10)
const from = ref(new Date(Date.now() - 30 * 24 * 3600_000).toISOString().slice(0, 10))
const to = ref(today)
const rows = ref<Row[] | null>(null)
const error = ref('')
watch([from, to], async () => {
  try {
    rows.value = await api<Row[]>('/ai/usage', { query: { from: from.value, to: to.value } })
    error.value = ''
  }
  catch (e) {
    error.value = (e as { message?: string }).message ?? t('ai.failed')
  }
}, { immediate: true })
</script>

<template>
  <section
    class="app-section"
    data-ai-usage
  >
    <h1 class="app-section__title">
      {{ t('ai.usage') }}
    </h1>
    <div class="app-row">
      <label class="cn-field">
        <span class="cn-field__label">{{ t('forms.from') }}</span>
        <input
          v-model="from"
          type="date"
          class="cn-input cn-input--size-md"
        >
      </label>
      <label class="cn-field">
        <span class="cn-field__label">{{ t('forms.to') }}</span>
        <input
          v-model="to"
          type="date"
          class="cn-input cn-input--size-md"
        >
      </label>
    </div>
    <p
      v-if="error"
      role="alert"
    >
      {{ error }}
    </p>
    <p v-else-if="rows && !rows.length">
      {{ t('ai.noUsage') }}
    </p>
    <table
      v-else-if="rows"
      class="cn-table cn-table--default cn-table--size-sm"
    >
      <thead>
        <tr>
          <th scope="col">
            {{ t('common.name') }}
          </th>
          <th scope="col">
            {{ t('ai.action') }}
          </th>
          <th scope="col">
            {{ t('ai.requests') }}
          </th>
          <th scope="col">
            {{ t('ai.tokens') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="`${row.userId}:${row.action}`"
        >
          <td>{{ row.name }}</td>
          <td>{{ row.action }}</td>
          <td>{{ row.requests }}</td>
          <td>{{ row.inputTokens + row.outputTokens }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
