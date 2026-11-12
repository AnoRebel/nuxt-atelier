<!-- Editing an entry or a singleton: the form generated from its fields, save (a draft, in versioned types),
     publish and unpublish, delete. Fields the role can only read are shown disabled. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import { computed, ref } from 'vue'
import { navigateTo } from '#imports'
import { useAtelierAdmin } from '../composables/useAtelierAdmin'
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

const props = defineProps<{ kind: 'collection' | 'singleton', name: string, id?: string }>()
const { to } = useAtelierAdmin()
const toast = useAdminToast()
const edit = useAtelierEntryForm(() => ({ kind: props.kind, name: props.name, id: props.id }))
const { type, form } = edit
const values = form.useStore(s => s.values)
const dirty = form.useStore(s => s.isDirty)
const submitting = form.useStore(s => s.isSubmitting)
const error = ref('')
const confirmDelete = ref(false)

const typeLabel = computed(() => props.kind === 'collection'
  ? (type.value as { labels?: { plural?: string } } | undefined)?.labels?.plural ?? humanize(props.name)
  : (type.value as { label?: string } | undefined)?.label ?? humanize(props.name))
const title = computed(() => props.kind === 'singleton' ? typeLabel.value : edit.isNew.value ? 'New entry' : 'Edit entry')
const breadcrumb = computed(() => props.kind === 'collection' ? [{ label: typeLabel.value, to: to('collections', props.name) }, { label: title.value }] : undefined)
const canSave = computed(() => !!type.value && (edit.isNew.value ? type.value.can.create : type.value.can.update))
const readOnly = (key: string) => !canSave.value || (type.value?.readOnly.includes(key) ?? false)

async function save() {
  error.value = ''
  await form.handleSubmit()
  if (edit.save.error.value) {
    const failure = edit.save.error.value as unknown as AdminApiError
    error.value = failure.status === 409 ? 'Someone saved this entry after you opened it. Reload to see their changes.' : failure.message
    return
  }
  if (!form.state.isValid)
    return
  toast.add({ color: 'success', title: type.value?.versioned ? 'Draft saved' : 'Saved' })
  if (edit.isNew.value && edit.save.data.value)
    await navigateTo(to('collections', props.name, edit.save.data.value.id), { replace: true })
}
async function run(action: 'publish' | 'unpublish') {
  try {
    await edit[action].mutateAsync()
    toast.add({ color: 'success', title: action === 'publish' ? 'Published' : 'Unpublished' })
  }
  catch (e) {
    toast.add({ color: 'error', title: action === 'publish' ? 'Not published' : 'Not unpublished', description: (e as AdminApiError).message })
  }
}
async function remove() {
  try {
    await edit.remove.mutateAsync()
    toast.add({ color: 'success', title: 'Deleted' })
    await navigateTo(to('collections', props.name))
  }
  catch (e) {
    toast.add({ color: 'error', title: 'Not deleted', description: (e as AdminApiError).message })
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
        {{ edit.entry.value?.publishedVersion === null ? 'Draft' : edit.unpublished.value ? 'Unpublished changes' : 'Published' }}
      </CnBadge>
      <CnButton
        v-if="type.versioned && type.can.publish && !edit.isNew.value && edit.unpublished.value"
        variant="secondary"
        :disabled="dirty"
        :loading="edit.publish.isPending.value"
        @click="run('publish')"
      >
        Publish
      </CnButton>
      <CnButton
        v-if="type.versioned && type.can.publish && edit.entry.value?.publishedVersion"
        variant="ghost"
        :loading="edit.unpublish.isPending.value"
        @click="run('unpublish')"
      >
        Unpublish
      </CnButton>
      <CnButton
        v-if="kind === 'collection' && !edit.isNew.value && type.can.delete"
        variant="danger"
        @click="confirmDelete = true"
      >
        Delete
      </CnButton>
    </template>

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
          {{ type.versioned ? 'Save draft' : 'Save' }}
        </CnButton>
      </div>
    </form>

    <CnDialog
      v-model:open="confirmDelete"
      title="Delete this entry?"
      confirm-label="Delete"
      variant="destructive"
      description="It can't be undone. Its history is deleted too."
      @confirm="remove"
    />
  </Page>
</template>
