<!-- Editing an entry or a singleton: the form generated from its fields, save (a draft, in versioned types),
     publish and unpublish, delete. Fields the role can only read are shown disabled. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { NuxtLink } from '#components'
import { navigateTo, onBeforeRouteLeave, onBeforeRouteUpdate } from '#imports'
import { useAtelierAdmin } from '../composables/useAtelierAdmin'
import { useAtelierAdminSchema } from '../composables/useAtelierAdminSchema'
import { useAtelierEntryForm } from '../composables/useAtelierEntryForm'
import { humanize } from '../composables/useAtelierNavigation'
import CnAlert from '../crystal-neuo/components/Alert.vue'
import CnBadge from '../crystal-neuo/components/Badge.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnDialog from '../crystal-neuo/components/Dialog.vue'
import { useAdminToast } from '../toast'
import FieldInput from './FieldInput.vue'
import NotFound from './NotFound.vue'
import Page from './Page.vue'
import SeoPanel from './SeoPanel.vue'
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
const canSave = computed(() => !!type.value && (edit.isNew.value ? type.value.can.create : type.value.can.update))
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
        :disabled="dirty"
        :loading="edit.publish.isPending.value"
        @click="run('publish')"
      >
        {{ t('entry.publish') }}
      </CnButton>
      <CnButton
        v-if="type.versioned && type.can.publish && edit.entry.value?.publishedVersion"
        variant="ghost"
        :loading="edit.unpublish.isPending.value"
        @click="run('unpublish')"
      >
        {{ t('entry.unpublish') }}
      </CnButton>
      <CnButton
        v-if="kind === 'collection' && !edit.isNew.value && type.can.delete"
        variant="danger"
        @click="confirmDelete = true"
      >
        {{ t('common.delete') }}
      </CnButton>
    </template>

    <nav
      v-if="type.localized && !edit.isNew.value && edit.locale.value"
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
          v-if="edit.translations.value[code]"
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
      <SeoPanel
        v-if="kind === 'collection' && type.routable"
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
      v-model:open="confirmDelete"
      :title="t('entry.deleteTitle')"
      :confirm-label="t('common.delete')"
      variant="destructive"
      :description="t('entry.deleteBody')"
      @confirm="remove"
    />
  </Page>
</template>
