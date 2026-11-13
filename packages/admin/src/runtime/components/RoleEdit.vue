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
import { useAdminI18n } from '../i18n'

const { t } = useAdminI18n()

const props = defineProps<{ name?: string }>()
const { to } = useAtelierAdmin()
const { manages } = useAtelierPermissions()
const { schema } = useAtelierAdminSchema()
const { roles, save } = useAtelierRoles()
const toast = useAdminToast()

const ACTIONS: ContentAction[] = ['create', 'read', 'update', 'delete', 'publish', 'comment']
const CAPABILITIES: { value: Capability, label: string }[] = [
  { value: 'users', label: 'capability.users' },
  { value: 'roles', label: 'capability.roles' },
  { value: 'media', label: 'capability.media' },
  { value: 'redirects', label: 'capability.redirects' },
  { value: 'settings', label: 'capability.settings' },
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
  { name: '*', label: t('roles.everyOther'), fields: {} },
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
const ACCESS = computed(() => [{ value: '', label: t('roles.canChange') }, { value: 'readOnly', label: t('roles.readOnly') }, { value: 'hidden', label: t('roles.hidden') }])

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
    toast.add({ color: 'success', title: t('roles.saved') })
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
    :title="name ? t('roles.title', { name: form.label || name }) : t('roles.new')"
    :breadcrumb="[{ label: t('nav.roles'), to: to('roles') }, { label: name ?? t('roles.new') }]"
  >
    <form
      class="app-form"
      @submit.prevent="submit"
    >
      <CnInput
        v-if="!name"
        v-model="form.name"
        :label="t('common.name')"
        :hint="t('roles.nameHint')"
        required
        pattern="[a-z][a-z0-9-]*"
      />
      <CnInput
        v-model="form.label"
        :label="t('roles.label')"
        :hint="t('roles.labelHint')"
      />

      <fieldset class="app-fieldset">
        <legend class="cn-label">
          {{ t('roles.manages') }}
        </legend>
        <CnCheckbox
          v-for="c in CAPABILITIES"
          :key="c.value"
          :label="t(c.label)"
          :checked="form.capabilities.includes(c.value)"
          @update:checked="(on: boolean) => form.capabilities = on ? [...form.capabilities, c.value] : form.capabilities.filter(x => x !== c.value)"
        />
      </fieldset>

      <div class="app-table-wrap">
        <table class="cn-table app-permissions">
          <caption class="cn-label">
            {{ t('roles.content') }}
          </caption>
          <thead>
            <tr>
              <th scope="col">
                {{ t('roles.type') }}
              </th>
              <th
                v-for="a in ACTIONS"
                :key="a"
                scope="col"
              >
                {{ t(`action.${a}`) }}
              </th>
              <th scope="col">
                {{ t('roles.ownOnly') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="ty in types"
              :key="ty.name"
            >
              <th scope="row">
                {{ ty.label }}
              </th>
              <td
                v-for="a in ACTIONS"
                :key="a"
              >
                <CnCheckbox
                  :label="t('roles.actionOn', { action: t(`action.${a}`), type: ty.label })"
                  class="app-check"
                  :checked="has(ty.name, a)"
                  @update:checked="(on: boolean) => toggle(ty.name, a, on)"
                />
              </td>
              <td>
                <CnCheckbox
                  :label="t('roles.ownOnlyOf', { type: ty.label })"
                  class="app-check"
                  :disabled="!form.content[ty.name]"
                  :checked="ownOnly(ty.name)"
                  @update:checked="(on: boolean) => setOwnOnly(ty.name, on)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <template
        v-for="ty in types"
        :key="ty.name"
      >
        <details
          v-if="form.content[ty.name] && Object.keys(ty.fields).length"
          class="app-fieldset"
        >
          <summary class="cn-label">
            {{ t('roles.fieldsOf', { type: ty.label }) }}
          </summary>
          <CnSelect
            v-for="(field, key) in ty.fields"
            :key="key"
            :label="field.label ?? humanize(String(key))"
            :options="ACCESS"
            :model-value="fieldAccess(ty.name, String(key))"
            @update:model-value="(v: string) => setFieldAccess(ty.name, String(key), v)"
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
          {{ t('roles.save') }}
        </CnButton>
      </div>
    </form>
  </Page>
</template>
