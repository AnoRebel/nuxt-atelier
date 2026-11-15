<!-- Editing an entry or a singleton: the form generated from its fields, save (a draft, in versioned types),
     publish and unpublish, delete. Fields the role can only read are shown disabled. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { ai } from '#atelier-admin-ai'
import { useQuery } from '@tanstack/vue-query'
import { NuxtLink } from '#components'
import { navigateTo, onBeforeRouteLeave, onBeforeRouteUpdate, useRuntimeConfig } from '#imports'
import { atelierFetch, useAtelierAdmin } from '../composables/useAtelierAdmin'
import { useAtelierAdminSchema } from '../composables/useAtelierAdminSchema'
import { useAtelierEntryForm } from '../composables/useAtelierEntryForm'
import { useAtelierPresence } from '../composables/useAtelierPresence'
import { humanize } from '../composables/useAtelierNavigation'
import CnAlert from '../crystal-neuo/components/Alert.vue'
import CnAvatar from '../crystal-neuo/components/Avatar.vue'
import CnBadge from '../crystal-neuo/components/Badge.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnDialog from '../crystal-neuo/components/Dialog.vue'
import CnInput from '../crystal-neuo/components/Input.vue'
import CnSelect from '../crystal-neuo/components/Select.vue'
import { useAdminToast } from '../toast'
import CommentsPanel from './CommentsPanel.vue'
import RevisionHistory from './RevisionHistory.vue'
import FieldInput from './FieldInput.vue'
import NotFound from './NotFound.vue'
import Page from './Page.vue'
import SeoPanel from './SeoPanel.vue'
import SharedBlockUsage from './SharedBlockUsage.vue'
import FormSubmissions from './FormSubmissions.vue'
import { useAtelierPermissions } from '../composables/useAtelierPermissions'
import { useAdminI18n } from '../i18n'

const props = defineProps<{ kind: 'collection' | 'singleton', name: string, id?: string, locale?: string }>()
const { t } = useAdminI18n()
const { to } = useAtelierAdmin()
const toast = useAdminToast()
const edit = useAtelierEntryForm(() => ({ kind: props.kind, name: props.name, id: props.id, locale: props.locale }))
const { type, form } = edit
const values = form.useStore(s => s.values)
const dirty = edit.dirty
const submitting = form.useStore(s => s.isSubmitting)
const error = ref('')

// localized collections: this version's locale, links to the others, and adding the missing ones
const { schema } = useAtelierAdminSchema()
const { manages } = useAtelierPermissions()
const otherLocales = computed(() => (schema.value?.locales.codes ?? []).filter(code => code !== edit.locale.value))
async function addTranslation(locale: string) {
  try {
    const created = await edit.translate.mutateAsync(locale)
    toast.add({ color: 'success', title: t('entry.translationAdded', { locale: locale.toUpperCase() }) })
    await navigateTo(to('collections', props.name, created.id))
  }
  catch (e) {
    toast.add({ color: 'error', title: (e as AdminApiError).message })
  }
}

// unsaved changes: asked before leaving for another admin page, and warned by the browser on closing
const leaving = ref<((leave: boolean) => void) | null>(null)
const leaveOpen = computed({ get: () => !!leaving.value, set: (open: boolean) => !open && answer(false) })
function answer(leave: boolean) {
  leaving.value?.(leave)
  leaving.value = null
}
// every admin path is the same route (its catch-all), so moving within the admin is an update
const guard = () => !dirty.value || form.state.isSubmitting || new Promise<boolean>(resolve => leaving.value = resolve)
onBeforeRouteLeave(guard)
onBeforeRouteUpdate(guard)
const onUnload = (e: BeforeUnloadEvent) => {
  if (dirty.value)
    e.preventDefault()
}
onMounted(() => addEventListener('beforeunload', onUnload))
onBeforeUnmount(() => removeEventListener('beforeunload', onUnload))
const savedAt = computed(() => edit.recovery.value ? new Date(edit.recovery.value.savedAt).toLocaleString() : '')
const confirmDelete = ref(false)

const typeLabel = computed(() => props.kind === 'collection'
  ? (type.value as { labels?: { plural?: string } } | undefined)?.labels?.plural ?? humanize(props.name)
  : (type.value as { label?: string } | undefined)?.label ?? humanize(props.name))
const title = computed(() => props.kind === 'singleton' ? typeLabel.value : edit.isNew.value ? t('entry.new') : t('entry.edit'))
const breadcrumb = computed(() => props.kind === 'collection' ? [{ label: typeLabel.value, to: to('collections', props.name) }, { label: title.value }] : undefined)
const mayEdit = computed(() => !!type.value && (edit.isNew.value ? type.value.can.create : type.value.can.update))

// collaboration: who else is here, and the edit lock (a singleton's id is its name)
// (none for an adapter's content: locks, presence and comments are kept in the database)
const target = computed(() => !type.value || edit.isNew.value || type.value.adapter ? null : { type: props.name, id: props.kind === 'singleton' ? props.name : props.id! })
const presence = useAtelierPresence(target, mayEdit)
// for fields' AI actions: which entry, and its locales
provide('atelier-entry', computed(() => type.value ? { type: props.name, locale: edit.locale.value, locales: type.value.localized ? schema.value?.locales.codes ?? [] : [] } : null))
const aiOn = ai ? ai.enabled() : ref(false)
// the visual editor, when @nuxt-atelier/editor is installed
const visualEditor = !!useRuntimeConfig().public.atelierEditor
function applySeo(value: { title: string, description: string }) {
  form.setFieldValue('seo.title' as never, value.title as never)
  form.setFieldValue('seo.description' as never, value.description as never)
}
const hasSeoFields = computed(() => {
  const seo = type.value?.fields.seo as { type?: string, fields?: Record<string, unknown> } | undefined
  return seo?.type === 'object' && !!seo.fields?.title && !!seo.fields?.description
})
const takenBy = ref('')
watch(presence.lock, (lock, before) => {
  if (before?.mine && lock && !lock.mine) {
    takenBy.value = lock.name
    void edit.shelve()
  }
  else if (lock?.mine) {
    takenBy.value = ''
    // they may have saved while it was theirs
    if (before && !before.mine)
      void edit.reload()
  }
})
watch(target, () => (takenBy.value = ''))

// templates: a new entry can start from one; an entry can be saved as one
const templates = useQuery({
  queryKey: computed(() => ['atelier', 'templates', props.name]),
  queryFn: () => atelierFetch<{ id: string, label: string, data: Record<string, unknown> }[]>(`/templates/${encodeURIComponent(props.name)}`),
  enabled: computed(() => props.kind === 'collection' && edit.isNew.value && !!type.value?.can.create && !type.value.adapter),
})
const template = ref('')
const templateOptions = computed(() => [{ value: '', label: t('templates.blank') }, ...(templates.data.value ?? []).map(x => ({ value: x.id, label: x.label }))])
watch(template, id => edit.startFrom(templates.data.value?.find(x => x.id === id)?.data ?? null))
const canSaveTemplate = computed(() => props.kind === 'collection' && !edit.isNew.value && !!schema.value?.collections.find(c => c.name === 'atelier-templates')?.can.create)
const savingTemplate = ref(false)
const entryName = computed(() => (typeof values.value.title === 'string' && values.value.title) || typeLabel.value)
const templateName = ref('')
async function saveTemplate() {
  try {
    await atelierFetch('/collections/atelier-templates', { method: 'POST', body: { data: { title: templateName.value || entryName.value, type: props.name, data: values.value } } })
    toast.add({ color: 'success', title: t('templates.saved') })
    templateName.value = ''
  }
  catch (e) {
    toast.add({ color: 'error', title: (e as AdminApiError).message })
  }
}
const canSave = computed(() => mayEdit.value && !presence.lockedByOther.value)
const readOnly = (key: string) => !canSave.value || (type.value?.readOnly.includes(key) ?? false)

async function save() {
  error.value = ''
  try {
    await edit.submit()
  }
  catch (e) {
    const failure = e as AdminApiError
    error.value = failure.status === 409 ? t('entry.conflict') : failure.message
    return
  }
  if (!form.state.isSubmitSuccessful)
    return // invalid: the fields show why
  toast.add({ color: 'success', title: type.value?.versioned ? t('entry.draftSaved') : t('entry.saved') })
  if (edit.isNew.value && edit.save.data.value)
    await navigateTo(to('collections', props.name, edit.save.data.value.id), { replace: true })
}
async function run(action: 'publish' | 'unpublish') {
  try {
    await edit[action].mutateAsync()
    toast.add({ color: 'success', title: action === 'publish' ? t('entry.published') : t('entry.unpublished') })
  }
  catch (e) {
    toast.add({ color: 'error', title: action === 'publish' ? t('entry.notPublished') : t('entry.notUnpublished'), description: (e as AdminApiError).message })
  }
}
async function remove() {
  try {
    await edit.remove.mutateAsync()
    toast.add({ color: 'success', title: t('entry.deleted') })
    await navigateTo(to('collections', props.name))
  }
  catch (e) {
    toast.add({ color: 'error', title: t('common.notDeleted'), description: (e as AdminApiError).message })
  }
}
</script>

<template>
  <NotFound v-if="!type || edit.loadError.value?.status === 404" />
  <NotFound
    v-else-if="edit.loadError.value?.status === 403"
    forbidden
  />
  <Page
    v-else
    :title="title"
    :breadcrumb="breadcrumb"
  >
    <template #actions>
      <span
        v-if="presence.others.value.length"
        class="app-presence"
        :title="t('collab.viewing', { names: presence.others.value.map(v => v.name).join(', ') })"
        data-presence
      >
        <CnAvatar
          v-for="viewer in presence.others.value"
          :key="viewer.userId"
          :name="viewer.name"
          size="sm"
        />
        <span class="sr-only">{{ t('collab.viewing', { names: presence.others.value.map(v => v.name).join(', ') }) }}</span>
      </span>
      <CnBadge
        v-if="type.versioned && !edit.isNew.value"
        :variant="edit.unpublished.value ? 'warning' : 'success'"
        size="sm"
      >
        {{ edit.entry.value?.publishedVersion === null ? t('status.draft') : edit.unpublished.value ? t('status.unpublishedChanges') : t('status.published') }}
      </CnBadge>
      <CnButton
        v-if="type.versioned && type.can.publish && !edit.isNew.value && edit.unpublished.value"
        variant="secondary"
        :disabled="dirty || presence.lockedByOther.value"
        :loading="edit.publish.isPending.value"
        @click="run('publish')"
      >
        {{ t('entry.publish') }}
      </CnButton>
      <CnButton
        v-if="type.versioned && type.can.publish && edit.entry.value?.publishedVersion"
        variant="ghost"
        :disabled="presence.lockedByOther.value"
        :loading="edit.unpublish.isPending.value"
        @click="run('unpublish')"
      >
        {{ t('entry.unpublish') }}
      </CnButton>
      <NuxtLink
        v-if="visualEditor && type.routable && !edit.isNew.value"
        :to="{ path: to('edit'), query: { type: name, ...kind === 'collection' ? { id } : {} } }"
        class="cn-button cn-button--secondary cn-button--size-md"
        data-visual-editor
      >
        {{ t('editor.open') }}
      </NuxtLink>
      <CnButton
        v-if="canSaveTemplate"
        variant="ghost"
        @click="savingTemplate = true"
      >
        {{ t('templates.save') }}
      </CnButton>
      <CnButton
        v-if="kind === 'collection' && !edit.isNew.value && type.can.delete"
        variant="danger"
        :disabled="presence.lockedByOther.value"
        @click="confirmDelete = true"
      >
        {{ t('common.delete') }}
      </CnButton>
    </template>

    <nav
      v-if="type.localized && otherLocales.length && !edit.isNew.value && edit.locale.value"
      class="app-row app-translations"
      :aria-label="t('entry.translations')"
    >
      <CnBadge
        variant="primary"
        size="sm"
      >
        {{ t('entry.inLocale', { locale: edit.locale.value.toUpperCase() }) }}
      </CnBadge>
      <template
        v-for="code in otherLocales"
        :key="code"
      >
        <NuxtLink
          v-if="kind === 'singleton'"
          :to="`${to('singletons', name)}?locale=${code}`"
          class="cn-button cn-button--ghost cn-button--size-sm"
          :hreflang="code"
        >
          {{ code.toUpperCase() }}
        </NuxtLink>
        <NuxtLink
          v-else-if="edit.translations.value[code]"
          :to="to('collections', name, edit.translations.value[code]!)"
          class="cn-button cn-button--ghost cn-button--size-sm"
          :hreflang="code"
        >
          {{ code.toUpperCase() }}
        </NuxtLink>
        <CnButton
          v-else-if="type.can.create"
          variant="ghost"
          size="sm"
          :loading="edit.translate.isPending.value"
          @click="addTranslation(code)"
        >
          {{ t('entry.addTranslation', { locale: code.toUpperCase() }) }}
        </CnButton>
      </template>
    </nav>
    <div
      v-if="edit.loading.value"
      class="app-loading"
      role="status"
    >
      <span class="sr-only">Loading</span>
    </div>
    <form
      v-else
      class="app-form"
      novalidate
      @submit.prevent="save"
    >
      <CnSelect
        v-if="edit.isNew.value && (templates.data.value?.length ?? 0) > 0"
        v-model="template"
        :label="t('templates.startFrom')"
        :options="templateOptions"
        data-template-picker
      />
      <CnAlert
        v-if="takenBy"
        variant="warning"
        :title="t('collab.takenTitle', { name: takenBy })"
        live
        data-taken-over
      >
        {{ t('collab.taken') }}
      </CnAlert>
      <CnAlert
        v-else-if="presence.lockedByOther.value"
        variant="info"
        :title="t('collab.lockedTitle', { name: presence.lock.value!.name })"
        live
        data-locked
      >
        {{ t('collab.locked') }}
        <span
          v-if="type.can.publish"
          class="app-row"
        >
          <CnButton
            size="sm"
            :loading="presence.takingOver.value"
            @click="presence.takeover()"
          >{{ t('collab.takeover') }}</CnButton>
        </span>
      </CnAlert>
      <CnAlert
        v-if="edit.recovery.value"
        variant="warning"
        :title="t('entry.recoveryTitle')"
        data-recovery
      >
        {{ t('entry.recovery', { time: savedAt }) }}
        <span class="app-row">
          <CnButton
            size="sm"
            :disabled="!canSave"
            @click="edit.restoreRecovery()"
          >{{ t('entry.restore') }}</CnButton>
          <CnButton
            size="sm"
            variant="ghost"
            @click="edit.discardRecovery()"
          >{{ t('entry.discard') }}</CnButton>
        </span>
      </CnAlert>
      <FieldInput
        v-for="(field, key) in type.fields"
        :key="key"
        :form="form"
        :name="String(key)"
        :field="field"
        :root="values"
        :sibling="values"
        :read-only="readOnly(String(key))"
      />
      <component
        :is="ai.Seo"
        v-if="ai && aiOn && hasSeoFields && !edit.isNew.value && canSave"
        :id="kind === 'collection' ? id : undefined"
        :type="name"
        :locale="edit.locale.value"
        @apply="applySeo"
      />
      <SeoPanel
        v-if="kind === 'collection' && type.routable && !type.adapter"
        :input="{ collection: name, id, data: values, path: edit.entry.value?.path, media: edit.entry.value?.media, locale: edit.locale.value }"
      />
      <CnAlert
        v-if="error"
        variant="danger"
        live
      >
        {{ error }}
      </CnAlert>
      <div
        v-if="canSave"
        class="app-form__actions"
      >
        <CnButton
          type="submit"
          :loading="submitting"
        >
          {{ type.versioned ? t('entry.saveDraft') : t('common.save') }}
        </CnButton>
      </div>
    </form>
    <FormSubmissions
      v-if="kind === 'collection' && name === 'atelier-forms' && id && !edit.isNew.value && manages('forms')"
      :id="id"
    />
    <SharedBlockUsage
      v-if="kind === 'collection' && name === 'atelier-shared-blocks' && id && !edit.isNew.value"
      :id="id"
      :can-delete="!!type.can.delete"
    />
    <RevisionHistory
      v-if="!edit.isNew.value && !edit.loading.value && type.can.update && type.revisions !== false"
      :url="edit.url.value"
      :query="edit.localeQuery.value"
      :version="edit.entry.value?.version ?? null"
      :can-restore="canSave && !dirty && !type.adapter"
      @restored="edit.reload()"
    />
    <CommentsPanel
      v-if="target && !edit.loading.value"
      :id="target.id"
      :type="target.type"
      :data="values"
      :can-comment="!!type.can.comment"
    />

    <CnDialog
      v-model:open="leaveOpen"
      :title="t('entry.leaveTitle')"
      :description="t('entry.leaveBody')"
      :confirm-label="t('entry.leave')"
      :cancel-label="t('entry.stay')"
      variant="destructive"
      @confirm="answer(true)"
    />
    <CnDialog
      v-model:open="savingTemplate"
      :title="t('templates.saveTitle')"
      :description="t('templates.saveBody')"
      :confirm-label="t('templates.save')"
      @confirm="saveTemplate"
    >
      <CnInput
        v-model="templateName"
        :label="t('templates.name')"
        :placeholder="entryName"
      />
    </CnDialog>
    <CnDialog
      v-model:open="confirmDelete"
      :title="t('entry.deleteTitle')"
      :confirm-label="t('common.delete')"
      variant="destructive"
      :description="t('entry.deleteBody')"
      @confirm="remove"
    />
  </Page>
</template>
