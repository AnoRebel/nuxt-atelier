<!-- A new entry of a relation's target collection, created in a dialog from the relation field, so the
     form the field is in stays as it is, unsaved changes included. Emits the new entry's id. -->
<script setup lang="ts">
import type { AdminApiError } from '../types'
import { computed, ref } from 'vue'
import { useAtelierEntryForm } from '../composables/useAtelierEntryForm'
import { singularLabel } from '../composables/useAtelierNavigation'
import CnAlert from '../crystal-neuo/components/Alert.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnModal from '../crystal-neuo/components/Modal.vue'
import FieldInput from './FieldInput.vue'

const props = defineProps<{ collection: string }>()
const emit = defineEmits<{ created: [id: string] }>()
const open = defineModel<boolean>('open', { default: false })

const edit = useAtelierEntryForm(() => ({ kind: 'collection', name: props.collection }))
const { type, form } = edit
const values = form.useStore(s => s.values)
const error = ref('')
const singular = computed(() => singularLabel(type.value ?? { name: props.collection }))

async function create() {
  error.value = ''
  try {
    await edit.submit()
  }
  catch (e) {
    error.value = (e as AdminApiError).message
    return
  }
  if (!form.state.isSubmitSuccessful || !edit.save.data.value)
    return
  emit('created', edit.save.data.value.id)
  form.reset()
  open.value = false
}
function cancel() {
  edit.discardRecovery() // nothing to offer back later: the user chose not to create it
  form.reset()
  open.value = false
}
</script>

<template>
  <CnModal
    v-model:open="open"
    :title="`New ${singular.toLowerCase()}`"
    size="lg"
  >
    <!-- not a <form>: this sits inside the entry's own form -->
    <div
      v-if="type"
      class="app-form"
      @keydown.enter.prevent
    >
      <FieldInput
        v-for="(field, key) in type.fields"
        :key="key"
        :form="form"
        :name="String(key)"
        :field="field"
        :root="values"
        :sibling="values"
      />
      <CnAlert
        v-if="error"
        variant="danger"
        live
      >
        {{ error }}
      </CnAlert>
      <div class="cn-modal__actions">
        <CnButton
          variant="ghost"
          @click="cancel"
        >
          Cancel
        </CnButton>
        <CnButton
          :loading="edit.save.isPending.value"
          @click="create"
        >
          Create {{ singular.toLowerCase() }}
        </CnButton>
      </div>
    </div>
  </CnModal>
</template>
