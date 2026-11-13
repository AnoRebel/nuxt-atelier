<!-- <AtelierForm form="<id>" />: a published form (the atelier-forms collection), as plain, accessible markup
     with `atelier-form…` classes and no styles of its own. The browser checks the same rules as the server,
     which checks again. Replace it with your own <AtelierForm> component, on the same API. -->
<script setup lang="ts">
import type { FormField } from '../../shared/forms'
import { useForm } from '@tanstack/vue-form'
import { computed, onMounted, ref, useId } from 'vue'
import { navigateTo, useFetch } from '#imports'
import { optionsOf, submissionSchema } from '../../shared/forms'

interface PublicForm { id: string, version: number, title: string, submitLabel: string | null, fields: FormField[], token: string, challenge: { name: string, siteKey: string } | null }

const props = defineProps<{ form: string, locale?: string }>()
const uid = useId()
const { data: definition, error: loadError } = await useFetch<PublicForm>(() => `/api/_atelier/forms/${encodeURIComponent(props.form)}`, {
  query: computed(() => props.locale ? { locale: props.locale } : {}),
  key: `atelier-form:${props.form}:${props.locale ?? ''}`,
})
const fields = computed(() => (definition.value?.fields ?? []).filter(f => f.type !== 'hidden'))
const idOf = (field: FormField) => `${uid}-${field.name}`

const sent = ref<string | null>(null)
const failure = ref('')
const honeypot = ref('')
const element = ref<HTMLFormElement | null>(null)

const form = useForm({
  defaultValues: Object.fromEntries((definition.value?.fields ?? []).map(f => [f.name, f.type === 'checkbox' || f.type === 'consent' ? false : f.type === 'file' ? null : ''])) as Record<string, unknown>,
  validators: { onSubmit: submissionSchema({ fields: definition.value?.fields ?? [] }) },
  onSubmit: async ({ value }) => {
    failure.value = ''
    const extra: Record<string, string> = { _token: definition.value!.token, _hp: honeypot.value, ...props.locale ? { _locale: props.locale } : {} }
    // the challenge widget leaves its answer in the form (Turnstile: cf-turnstile-response)
    const answer = element.value?.querySelector<HTMLInputElement>('[name="cf-turnstile-response"], [name="atelier-challenge"]')?.value
    if (answer)
      extra._challenge = answer
    const withFiles = Object.values(value).some(v => v instanceof File)
    let body: BodyInit
    if (withFiles) {
      const data = new FormData()
      for (const [key, v] of [...Object.entries(value), ...Object.entries(extra)]) {
        if (v instanceof File)
          data.append(key, v)
        else if (v !== null && v !== undefined)
          data.append(key, typeof v === 'boolean' ? String(v) : String(v))
      }
      body = data
    }
    else {
      body = JSON.stringify({ ...value, ...extra })
    }
    const response = await fetch(`/api/_atelier/forms/${encodeURIComponent(props.form)}/submit`, { method: 'POST', body, headers: withFiles ? {} : { 'content-type': 'application/json' } })
    const result = await response.json().catch(() => ({})) as { message?: string, redirect?: string, data?: { errors?: { path: string, message: string }[] } }
    if (response.status === 422 && result.data?.errors) {
      for (const { path, message } of result.data.errors)
        form.setFieldMeta(path as never, meta => ({ ...meta, errorMap: { ...meta?.errorMap, onServer: message } }) as never)
      return
    }
    if (!response.ok) {
      failure.value = result.message ?? 'Your message couldn\'t be sent: try again.'
      return
    }
    if (result.redirect)
      return navigateTo(result.redirect, { external: /^https?:/.test(result.redirect) })
    sent.value = result.message ?? 'Thank you, your message was sent.'
  },
})

const errorOf = (meta: { errors?: unknown[], errorMap?: Record<string, unknown> } | undefined) => {
  const all = [...meta?.errors ?? [], meta?.errorMap?.onServer].filter(Boolean)
  const first = all[0] as string | { message?: string } | undefined
  return typeof first === 'string' ? first : first?.message
}

// Turnstile's widget, when the site uses it
onMounted(() => {
  if (definition.value?.challenge?.name !== 'turnstile' || document.querySelector('script[data-atelier-turnstile]'))
    return
  const script = document.createElement('script')
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
  script.async = true
  script.dataset.atelierTurnstile = ''
  document.head.append(script)
})
</script>

<template>
  <p
    v-if="loadError"
    class="atelier-form__unavailable"
  >
    This form isn't available.
  </p>
  <div
    v-else-if="sent"
    class="atelier-form__sent"
    role="status"
  >
    {{ sent }}
  </div>
  <form
    v-else-if="definition"
    ref="element"
    class="atelier-form"
    :aria-label="definition.title"
    novalidate
    @submit.prevent="form.handleSubmit()"
  >
    <!-- people don't see or fill this; bots do -->
    <div
      class="atelier-form__hp"
      aria-hidden="true"
      style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden"
    >
      <label :for="`${uid}-hp`">Leave this empty</label>
      <input
        :id="`${uid}-hp`"
        v-model="honeypot"
        name="website"
        type="text"
        tabindex="-1"
        autocomplete="off"
      >
    </div>
    <form.Field
      v-for="field in fields"
      :key="field.name"
      :name="field.name"
    >
      <template #default="{ field: f }">
        <div
          class="atelier-form__field"
          :data-type="field.type"
          :data-invalid="errorOf(f.state.meta) ? '' : undefined"
        >
          <fieldset
            v-if="field.type === 'radio'"
            class="atelier-form__group"
            :aria-describedby="`${idOf(field)}-help ${idOf(field)}-error`"
          >
            <legend class="atelier-form__label">
              {{ field.label }}<span
                v-if="field.required"
                class="atelier-form__required"
                aria-hidden="true"
              > *</span>
            </legend>
            <label
              v-for="option in optionsOf(field)"
              :key="option.value"
              class="atelier-form__option"
            >
              <input
                type="radio"
                :name="field.name"
                :value="option.value"
                :checked="f.state.value === option.value"
                :required="!!field.required"
                @change="f.handleChange(option.value)"
              >
              {{ option.label }}
            </label>
          </fieldset>
          <label
            v-else-if="field.type === 'checkbox' || field.type === 'consent'"
            class="atelier-form__option"
          >
            <input
              :id="idOf(field)"
              type="checkbox"
              :name="field.name"
              :checked="!!f.state.value"
              :required="!!field.required"
              :aria-invalid="errorOf(f.state.meta) ? 'true' : undefined"
              :aria-describedby="`${idOf(field)}-help ${idOf(field)}-error`"
              @change="f.handleChange(($event.target as HTMLInputElement).checked)"
            >
            {{ field.label }}<span
              v-if="field.required"
              class="atelier-form__required"
              aria-hidden="true"
            > *</span>
          </label>
          <template v-else>
            <label
              class="atelier-form__label"
              :for="idOf(field)"
            >
              {{ field.label }}<span
                v-if="field.required"
                class="atelier-form__required"
                aria-hidden="true"
              > *</span>
            </label>
            <textarea
              v-if="field.type === 'textarea'"
              :id="idOf(field)"
              :name="field.name"
              :value="String(f.state.value ?? '')"
              :placeholder="field.placeholder ?? undefined"
              :required="!!field.required"
              :maxlength="field.max ?? undefined"
              :aria-invalid="errorOf(f.state.meta) ? 'true' : undefined"
              :aria-describedby="`${idOf(field)}-help ${idOf(field)}-error`"
              @input="f.handleChange(($event.target as HTMLTextAreaElement).value)"
              @blur="f.handleBlur"
            />
            <select
              v-else-if="field.type === 'select'"
              :id="idOf(field)"
              :name="field.name"
              :value="String(f.state.value ?? '')"
              :required="!!field.required"
              :aria-invalid="errorOf(f.state.meta) ? 'true' : undefined"
              :aria-describedby="`${idOf(field)}-help ${idOf(field)}-error`"
              @change="f.handleChange(($event.target as HTMLSelectElement).value)"
            >
              <option value="">
                {{ field.placeholder ?? '—' }}
              </option>
              <option
                v-for="option in optionsOf(field)"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <input
              v-else-if="field.type === 'file'"
              :id="idOf(field)"
              type="file"
              :name="field.name"
              :accept="field.accept ?? undefined"
              :required="!!field.required"
              :aria-invalid="errorOf(f.state.meta) ? 'true' : undefined"
              :aria-describedby="`${idOf(field)}-help ${idOf(field)}-error`"
              @change="f.handleChange(($event.target as HTMLInputElement).files?.[0] ?? null)"
            >
            <input
              v-else
              :id="idOf(field)"
              :type="field.type"
              :name="field.name"
              :value="String(f.state.value ?? '')"
              :placeholder="field.placeholder ?? undefined"
              :required="!!field.required"
              :min="field.type === 'number' ? field.min ?? undefined : undefined"
              :max="field.type === 'number' ? field.max ?? undefined : undefined"
              :autocomplete="field.type === 'email' ? 'email' : undefined"
              :aria-invalid="errorOf(f.state.meta) ? 'true' : undefined"
              :aria-describedby="`${idOf(field)}-help ${idOf(field)}-error`"
              @input="f.handleChange(field.type === 'number' && ($event.target as HTMLInputElement).value !== '' ? ($event.target as HTMLInputElement).valueAsNumber : ($event.target as HTMLInputElement).value)"
              @blur="f.handleBlur"
            >
          </template>
          <p
            v-if="field.help"
            :id="`${idOf(field)}-help`"
            class="atelier-form__help"
          >
            {{ field.help }}
          </p>
          <p
            :id="`${idOf(field)}-error`"
            class="atelier-form__error"
            aria-live="polite"
          >
            {{ errorOf(f.state.meta) }}
          </p>
        </div>
      </template>
    </form.Field>
    <div
      v-if="definition.challenge?.name === 'turnstile'"
      class="cf-turnstile atelier-form__challenge"
      :data-sitekey="definition.challenge.siteKey"
    />
    <slot
      v-else-if="definition.challenge"
      name="challenge"
      :challenge="definition.challenge"
    />
    <p
      v-if="failure"
      class="atelier-form__failure"
      role="alert"
    >
      {{ failure }}
    </p>
    <form.Subscribe>
      <template #default="{ isSubmitting }">
        <button
          type="submit"
          class="atelier-form__submit"
          :disabled="isSubmitting"
        >
          {{ definition.submitLabel || 'Send' }}
        </button>
      </template>
    </form.Subscribe>
  </form>
</template>
