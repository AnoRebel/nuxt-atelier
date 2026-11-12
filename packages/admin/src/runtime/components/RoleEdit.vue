<!-- A database role: its label, the admin areas it manages, and per content type what it may do (only on
     its own entries, if chosen) and which fields it can only read or can't see. `*` covers every type
     without its own rule. -->
<script setup lang="ts">
import type { AdminApiError, Capability, ContentAction, ContentPermission, Role } from '../types'
import { computed, reactive, ref, watch } from 'vue'
import { navigateTo } from '#imports'
import { useAtelierAdmin } from '../composables/useAtelierAdmin'
import { useAtelierAdminSchema } from '../composables/useAtelierAdminSchema'
import { humanize } from '../composables/useAtelierNavigation'
import { useAtelierPermissions } from '../composables/useAtelierPermissions'
import { useAtelierRoles } from '../composables/useAtelierRoles'
import CnAlert from '../crystal-neuo/components/Alert.vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnCheckbox from '../crystal-neuo/components/Checkbox.vue'
import CnInput from '../crystal-neuo/components/Input.vue'
import CnSelect from '../crystal-neuo/components/Select.vue'
import { useAdminToast } from '../toast'
import NotFound from './NotFound.vue'
import Page from './Page.vue'

const props = defineProps<{ name?: string }>()
const { to } = useAtelierAdmin()
const { manages } = useAtelierPermissions()
const { schema } = useAtelierAdminSchema()
const { roles, save } = useAtelierRoles()
const toast = useAdminToast()

const ACTIONS: ContentAction[] = ['create', 'read', 'update', 'delete', 'publish']
const CAPABILITIES: { value: Capability, label: string }[] = [
  { value: 'users', label: 'Users' },
  { value: 'roles', label: 'Roles' },
  { value: 'media', label: 'Media' },
  { value: 'redirects', label: 'Redirects' },
  { value: 'settings', label: 'Settings' },
]

const existing = computed(() => props.name ? roles.value.find(r => r.name === props.name) : undefined)
const form = reactive<{ name: string, label: string, capabilities: Capability[], content: Record<string, ContentPermission> }>({ name: '', label: '', capabilities: [], content: {} })
const error = ref('')
watch(existing, (entry) => {
  if (!entry)
    return
  form.name = entry.name
  form.label = entry.role.label ?? ''
  form.capabilities = [...entry.role.capabilities ?? []]
  form.content = JSON.parse(JSON.stringify(entry.role.content ?? {}))
}, { immediate: true })

const types = computed(() => [
  { name: '*', label: 'Every other type', fields: {} },
  ...(schema.value?.collections ?? []).map(c => ({ name: c.name, label: c.labels?.plural ?? humanize(c.name), fields: c.fields })),
  ...(schema.value?.singletons ?? []).map(s => ({ name: s.name, label: s.label ?? humanize(s.name), fields: s.fields })),
])
const rule = (type: string) => form.content[type] ??= { actions: [] }
const has = (type: string, action: ContentAction) => form.content[type]?.actions.includes(action) ?? false
function toggle(type: string, action: ContentAction, on: boolean) {
  const r = rule(type)
  r.actions = on ? [...new Set([...r.actions, action])] : r.actions.filter(a => a !== action)
  if (!r.actions.length)
    form.content = Object.fromEntries(Object.entries(form.content).filter(([name]) => name !== type))
  else if (r.ownOnly?.length)
    r.ownOnly = r.actions.filter(a => a !== 'create')
}
const ownOnly = (type: string) => !!form.content[type]?.ownOnly?.length
function setOwnOnly(type: string, on: boolean) {
  const r = rule(type)
  r.ownOnly = on ? r.actions.filter(a => a !== 'create') : undefined
}
const fieldAccess = (type: string, field: string) => form.content[type]?.hidden?.includes(field) ? 'hidden' : form.content[type]?.readOnly?.includes(field) ? 'readOnly' : ''
function setFieldAccess(type: string, field: string, access: string) {
  const r = rule(type)
  r.hidden = (r.hidden ?? []).filter(f => f !== field)
  r.readOnly = (r.readOnly ?? []).filter(f => f !== field)
  if (access === 'hidden')
    r.hidden.push(field)
  if (access === 'readOnly')
    r.readOnly.push(field)
}
const ACCESS = [{ value: '', label: 'Can change' }, { value: 'readOnly', label: 'Read only' }, { value: 'hidden', label: 'Hidden' }]

async function submit() {
  error.value = ''
  // drop empty lists, so the stored role stays readable
  const content = Object.fromEntries(Object.entries(form.content).map(([type, r]) => [type, {
    actions: r.actions,
    ...r.ownOnly?.length ? { ownOnly: r.ownOnly } : {},
    ...r.hidden?.length ? { hidden: r.hidden } : {},
    ...r.readOnly?.length ? { readOnly: r.readOnly } : {},
  }]))
  const role: Role = { ...form.label ? { label: form.label } : {}, capabilities: form.capabilities, content }
  try {
    await save.mutateAsync({ name: form.name, role })
    toast.add({ color: 'success', title: 'Role saved' })
    if (!props.name)
      await navigateTo(to('roles', form.name), { replace: true })
  }
  catch (e) {
    error.value = (e as AdminApiError).errors?.map(x => `${x.path}: ${x.message}`).join('. ') || (e as AdminApiError).message
  }
}
</script>

<template>
  <NotFound
    v-if="!manages('roles') || (name && roles.length && existing?.source !== 'database')"
    :forbidden="manages('roles')"
  />
  <Page
    v-else
    :title="name ? `Role: ${form.label || name}` : 'New role'"
    :breadcrumb="[{ label: 'Roles', to: to('roles') }, { label: name ?? 'New role' }]"
  >
    <form
      class="app-form"
      @submit.prevent="submit"
    >
      <CnInput
        v-if="!name"
        v-model="form.name"
        label="Name"
        hint="Lowercase letters, digits and “-”, like “editor”. It can't be changed later."
        required
        pattern="[a-z][a-z0-9-]*"
      />
      <CnInput
        v-model="form.label"
        label="Label"
        hint="Shown in the admin, like “Editor”."
      />

      <fieldset class="app-fieldset">
        <legend class="cn-label">
          Manages
        </legend>
        <CnCheckbox
          v-for="c in CAPABILITIES"
          :key="c.value"
          :label="c.label"
          :checked="form.capabilities.includes(c.value)"
          @update:checked="(on: boolean) => form.capabilities = on ? [...form.capabilities, c.value] : form.capabilities.filter(x => x !== c.value)"
        />
      </fieldset>

      <div class="app-table-wrap">
        <table class="cn-table app-permissions">
          <caption class="cn-label">
            Content
          </caption>
          <thead>
            <tr>
              <th scope="col">
                Type
              </th>
              <th
                v-for="a in ACTIONS"
                :key="a"
                scope="col"
              >
                {{ humanize(a) }}
              </th>
              <th scope="col">
                Own entries only
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in types"
              :key="t.name"
            >
              <th scope="row">
                {{ t.label }}
              </th>
              <td
                v-for="a in ACTIONS"
                :key="a"
              >
                <CnCheckbox
                  :label="`${humanize(a)} ${t.label}`"
                  class="app-check"
                  :checked="has(t.name, a)"
                  @update:checked="(on: boolean) => toggle(t.name, a, on)"
                />
              </td>
              <td>
                <CnCheckbox
                  :label="`Only their own ${t.label}`"
                  class="app-check"
                  :disabled="!form.content[t.name]"
                  :checked="ownOnly(t.name)"
                  @update:checked="(on: boolean) => setOwnOnly(t.name, on)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <template
        v-for="t in types"
        :key="t.name"
      >
        <details
          v-if="form.content[t.name] && Object.keys(t.fields).length"
          class="app-fieldset"
        >
          <summary class="cn-label">
            Fields of {{ t.label }}
          </summary>
          <CnSelect
            v-for="(field, key) in t.fields"
            :key="key"
            :label="field.label ?? humanize(String(key))"
            :options="ACCESS"
            :model-value="fieldAccess(t.name, String(key))"
            @update:model-value="(v: string) => setFieldAccess(t.name, String(key), v)"
          />
        </details>
      </template>

      <CnAlert
        v-if="error"
        variant="danger"
        live
      >
        {{ error }}
      </CnAlert>
      <div class="app-form__actions">
        <CnButton
          type="submit"
          :loading="save.isPending.value"
        >
          Save role
        </CnButton>
      </div>
    </form>
  </Page>
</template>
