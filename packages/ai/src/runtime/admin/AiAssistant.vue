<!-- The assistant: a plain-language request becomes proposed content API requests, each shown to approve
     or skip. Approved ones are sent from here, with the user's own session, one after another: the server
     answers them exactly as if the user had made them, so the assistant can't do more than they may. -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAdminI18n, useAtelierAdmin } from '#imports'

interface Proposal { method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, summary: string }
interface Step extends Proposal { approved: boolean, status?: 'done' | 'failed', result?: string }

const props = defineProps<{ request: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useAdminI18n()
const { api } = useAtelierAdmin()
const thinking = ref(true)
const running = ref(false)
const error = ref('')
const steps = ref<Step[]>([])

onMounted(async () => {
  try {
    const { proposals } = await api<{ proposals: Proposal[] }>('/ai/assistant', { method: 'POST', body: { request: props.request } })
    steps.value = proposals.map(p => ({ ...p, approved: false }))
  }
  catch (e) {
    error.value = (e as { message?: string }).message ?? t('ai.failed')
  }
  finally {
    thinking.value = false
  }
})

/** Sends the approved requests, in order, through the admin's own client: the user's session and CSRF token. */
async function run() {
  running.value = true
  for (const step of steps.value.filter(s => s.approved && !s.status)) {
    try {
      const [path, search] = step.path.replace(/^\/api\/_atelier/, '').split('?')
      const query = Object.fromEntries(new URLSearchParams(search ?? ''))
      const answer = await api<unknown>(path!, { method: step.method, body: step.body, query })
      step.status = 'done'
      step.result = JSON.stringify(answer, null, 2).slice(0, 2000)
    }
    catch (e) {
      step.status = 'failed'
      step.result = (e as { message?: string }).message
    }
  }
  running.value = false
}
</script>

<template>
  <section
    class="app-ai app-ai__assistant"
    data-ai-assistant
    :aria-label="t('ai.assistant')"
  >
    <p><strong>{{ t('ai.asked') }}</strong> {{ request }}</p>
    <p
      v-if="thinking"
      role="status"
    >
      {{ t('ai.working') }}
    </p>
    <p
      v-else-if="error"
      role="alert"
    >
      {{ error }}
    </p>
    <p v-else-if="!steps.length">
      {{ t('ai.noProposals') }}
    </p>
    <ol
      v-else
      class="app-ai__steps"
    >
      <li
        v-for="(step, i) in steps"
        :key="i"
        :data-step="i"
        :data-status="step.status"
      >
        <label class="app-row">
          <input
            v-model="step.approved"
            type="checkbox"
            :disabled="!!step.status || running"
          >
          <span>{{ step.summary }}</span>
        </label>
        <code>{{ step.method }} {{ step.path }}</code>
        <pre v-if="step.body !== undefined">{{ JSON.stringify(step.body, null, 2) }}</pre>
        <p
          v-if="step.status"
          :role="step.status === 'failed' ? 'alert' : 'status'"
        >
          {{ step.status === 'done' ? t('ai.done') : t('ai.refused', { reason: step.result ?? '' }) }}
        </p>
      </li>
    </ol>
    <div class="app-row">
      <button
        v-if="steps.length"
        type="button"
        class="cn-button cn-button--primary cn-button--size-sm"
        :disabled="running || !steps.some(s => s.approved && !s.status)"
        @click="run"
      >
        {{ t('ai.runApproved') }}
      </button>
      <button
        type="button"
        class="cn-button cn-button--ghost cn-button--size-sm"
        @click="emit('close')"
      >
        {{ t('ai.close') }}
      </button>
    </div>
  </section>
</template>
