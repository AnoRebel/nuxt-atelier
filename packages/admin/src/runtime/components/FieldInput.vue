<!-- One field's input, chosen by its type, bound to the entry form (TanStack Form) at `name` (a dot path).
     Objects and repeaters render their own fields; a field whose `when` doesn't hold is hidden. A custom
     field type renders its `input` component (a global component name) with v-model. Rich text, media and
     blocks get plain inputs until the editor and media library land (tasks 14.6, 12, 14). -->
<script setup lang="ts">
import type { Field } from '../types'
import { useQuery } from '@tanstack/vue-query'
import { computed, ref, resolveComponent } from 'vue'
import { applies } from '#atelier/shared/fields'
import { atelierFetch } from '../composables/useAtelierAdmin'
import { titleField } from '../composables/useAtelierCollection'
import { useAtelierAdminSchema } from '../composables/useAtelierAdminSchema'
import { humanize, singularLabel } from '../composables/useAtelierNavigation'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnCheckbox from '../crystal-neuo/components/Checkbox.vue'
import CnInput from '../crystal-neuo/components/Input.vue'
import CnSelect from '../crystal-neuo/components/Select.vue'
import CnTextarea from '../crystal-neuo/components/Textarea.vue'
import CnToggle from '../crystal-neuo/components/Toggle.vue'
import { pascal, useOverrides } from '../overrides'
import Icon from './Icon'
import RelatedCreate from './RelatedCreate.vue'

defineOptions({ name: 'AtelierAdminFieldInput' })

const props = defineProps<{
  // TanStack Form's form API; its generics depend on the entry type, unknown here
  form: any // eslint-disable-line @typescript-eslint/no-explicit-any
  name: string
  field: Field
  /** The whole entry's values and this field's siblings, for `when` conditions. */
  root: Record<string, unknown>
  sibling: Record<string, unknown>
  readOnly?: boolean
}>()

const label = computed(() => (props.field.label ?? humanize(props.name.split('.').pop()!)) + (props.field.required ? ' *' : ''))
const visible = computed(() => applies(props.field, props.sibling ?? {}, props.root ?? {}))
const options = (list: readonly (string | { value: string, label?: string })[]) =>
  list.map(o => typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value })
const errorOf = (field: { state: { meta: { errors: unknown[], errorMap?: Record<string, unknown> } } }) => {
  const all = [...field.state.meta.errors, field.state.meta.errorMap?.onServer].filter(Boolean)
  const first = all[0] as string | { message?: string } | undefined
  return typeof first === 'string' ? first : first?.message
}

// datetime: stored as ISO UTC, edited in the browser's time zone
const toLocal = (iso: unknown) => {
  if (typeof iso !== 'string' || !iso)
    return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const fromLocal = (local: string) => local ? new Date(local).toISOString().replace(/\.\d{3}Z$/, 'Z') : null

// rich text, until the editor: paragraphs of plain text
const docText = (doc: unknown) => ((doc as { content?: { content?: { text?: string }[] }[] } | null)?.content ?? [])
  .map(p => (p.content ?? []).map(t => t.text ?? '').join('')).join('\n\n')
const textDoc = (text: string) => text.trim()
  ? { type: 'doc', content: text.split(/\n{2,}/).map(p => ({ type: 'paragraph', content: p ? [{ type: 'text', text: p }] : [] })) }
  : null

const json = (value: unknown) => value === undefined || value === null ? '' : JSON.stringify(value, null, 2)
function parseJson(text: string, set: (v: unknown) => void) {
  try {
    set(text.trim() ? JSON.parse(text) : null)
  }
  catch {
    // not JSON yet: the field keeps its last valid value until the text parses
  }
}

// relations: the target collection's entries to choose from
const { schema } = useAtelierAdminSchema()
const target = computed(() => props.field.type === 'relation' ? schema.value?.collections.find(c => c.name === (props.field as { to: string }).to) : undefined)
const related = useQuery({
  queryKey: ['atelier', 'collections', computed(() => target.value?.name ?? ''), 'choices'],
  queryFn: () => atelierFetch<{ items: { id: string, data: Record<string, unknown> }[] }>(`/collections/${encodeURIComponent(target.value!.name)}`, { query: { limit: 100, draft: 'true' } }),
  enabled: computed(() => !!target.value),
})
const creating = ref(false)
const relatedOptions = computed(() => {
  const key = titleField(target.value)
  return (related.data.value?.items ?? []).map(e => ({ value: e.id, label: String((key && e.data[key]) || e.id) }))
})
// the app's input for this field type (app/atelier-admin/Field<Type>.vue), if it has one
const fieldOverride = useOverrides()(`Field${pascal(props.field.type === 'custom' ? props.field.fieldType : props.field.type)}`)
const custom = computed(() => props.field.type === 'custom' && props.field.input ? resolveComponent(props.field.input) : undefined)
const inputType = { text: 'text', slug: 'text', email: 'email', url: 'url', color: 'color' } as Record<string, string>
</script>

<template>
  <template v-if="visible">
    <!-- an object: its own fields, in a group -->
    <fieldset
      v-if="field.type === 'object'"
      class="app-fieldset"
    >
      <legend class="cn-label">
        {{ label }}
      </legend>
      <AtelierAdminFieldInput
        v-for="(sub, key) in field.fields"
        :key="key"
        :form="form"
        :name="`${name}.${key}`"
        :field="sub"
        :root="root"
        :sibling="(sibling?.[name.split('.').pop()!] ?? {}) as Record<string, unknown>"
        :read-only="readOnly"
      />
    </fieldset>

    <!-- a repeater: a list of items with the same fields -->
    <form.Field
      v-else-if="field.type === 'repeater'"
      :name="name"
      mode="array"
    >
      <template #default="{ field: list }">
        <fieldset class="app-fieldset">
          <legend class="cn-label">
            {{ label }}
          </legend>
          <div
            v-for="(item, i) in (list.state.value ?? [])"
            :key="i"
            class="app-repeater__item app-fieldset"
          >
            <AtelierAdminFieldInput
              v-for="(sub, key) in field.fields"
              :key="key"
              :form="form"
              :name="`${name}[${i}].${key}`"
              :field="sub"
              :root="root"
              :sibling="item"
              :read-only="readOnly"
            />
            <div>
              <CnButton
                variant="ghost"
                size="sm"
                :disabled="readOnly"
                @click="list.removeValue(i)"
              >
                <Icon name="trash-2" />
                Remove
              </CnButton>
            </div>
          </div>
          <div>
            <CnButton
              variant="secondary"
              size="sm"
              :disabled="readOnly"
              @click="list.pushValue({})"
            >
              <Icon name="plus" />
              Add
            </CnButton>
          </div>
        </fieldset>
      </template>
    </form.Field>

    <form.Field
      v-else
      :name="name"
    >
      <template #default="{ field: f }">
        <div class="cn-field">
          <component
            :is="fieldOverride"
            v-if="fieldOverride"
            :model-value="f.state.value"
            :field="field"
            :label="label"
            :error="errorOf(f)"
            :disabled="readOnly"
            @update:model-value="f.handleChange"
          />
          <CnToggle
            v-else-if="field.type === 'boolean'"
            :checked="!!f.state.value"
            :label="label"
            :disabled="readOnly"
            @update:checked="f.handleChange"
          />

          <CnSelect
            v-else-if="field.type === 'select' || (field.type === 'relation' && !field.many)"
            :model-value="(f.state.value as string) ?? ''"
            :label="label"
            :options="[{ value: '', label: '—' }, ...(field.type === 'select' ? options(field.options) : relatedOptions)]"
            :error="errorOf(f)"
            :disabled="readOnly"
            @update:model-value="(v: string) => f.handleChange(v || null)"
          />

          <fieldset
            v-else-if="field.type === 'multiSelect' || field.type === 'relation'"
            class="app-fieldset"
          >
            <legend class="cn-label">
              {{ label }}
            </legend>
            <CnCheckbox
              v-for="o in (field.type === 'multiSelect' ? options(field.options) : relatedOptions)"
              :key="o.value"
              :label="o.label"
              :checked="((f.state.value as string[] | null) ?? []).includes(o.value)"
              :disabled="readOnly"
              @update:checked="(on: boolean) => f.handleChange(on ? [...((f.state.value as string[] | null) ?? []), o.value] : ((f.state.value as string[] | null) ?? []).filter((x: string) => x !== o.value))"
            />
            <span
              v-if="errorOf(f)"
              class="cn-field__message"
              role="alert"
            >{{ errorOf(f) }}</span>
          </fieldset>

          <CnInput
            v-else-if="field.type === 'number'"
            :model-value="f.state.value === null || f.state.value === undefined ? '' : String(f.state.value)"
            :label="label"
            type="number"
            :step="field.integer ? 1 : 'any'"
            :min="field.min"
            :max="field.max"
            :hint="field.help"
            :error="errorOf(f)"
            :disabled="readOnly"
            @update:model-value="(v: string) => f.handleChange(v === '' ? null : Number(v))"
            @blur="f.handleBlur"
          />

          <CnInput
            v-else-if="field.type === 'date'"
            :model-value="field.mode === 'datetime' ? toLocal(f.state.value) : ((f.state.value as string) ?? '')"
            :label="label"
            :type="field.mode === 'datetime' ? 'datetime-local' : field.mode === 'time' ? 'time' : 'date'"
            :hint="field.help"
            :error="errorOf(f)"
            :disabled="readOnly"
            @update:model-value="(v: string) => f.handleChange(field.mode === 'datetime' ? fromLocal(v) : (v || null))"
          />

          <CnTextarea
            v-else-if="field.type === 'textarea'"
            :model-value="(f.state.value as string) ?? ''"
            :label="label"
            :rows="field.rows ?? 4"
            :hint="field.help"
            :error="errorOf(f)"
            :disabled="readOnly"
            @update:model-value="(v: string) => f.handleChange(v || null)"
            @blur="f.handleBlur"
          />

          <CnTextarea
            v-else-if="field.type === 'richText'"
            :model-value="docText(f.state.value)"
            :label="label"
            :rows="8"
            :hint="field.help ?? 'Paragraphs separated by a blank line.'"
            :error="errorOf(f)"
            :disabled="readOnly"
            @update:model-value="(v: string) => f.handleChange(textDoc(v))"
          />

          <component
            :is="custom"
            v-else-if="custom"
            :model-value="f.state.value"
            :field="field"
            :label="label"
            :disabled="readOnly"
            @update:model-value="f.handleChange"
          />

          <CnTextarea
            v-else-if="field.type === 'json' || field.type === 'blocks' || field.type === 'custom'"
            :model-value="json(f.state.value)"
            :label="label"
            :rows="6"
            :hint="field.help ?? 'JSON'"
            :error="errorOf(f)"
            :disabled="readOnly"
            @update:model-value="(v: string) => parseJson(v, f.handleChange)"
          />

          <CnInput
            v-else
            :model-value="(f.state.value as string) ?? ''"
            :label="label"
            :type="inputType[field.type] ?? 'text'"
            :hint="field.type === 'media' ? (field.help ?? 'A media item id') : field.help"
            :error="errorOf(f)"
            :disabled="readOnly"
            :maxlength="'maxLength' in field ? field.maxLength : undefined"
            @update:model-value="(v: string) => f.handleChange(v || null)"
            @blur="f.handleBlur"
          />
          <template v-if="field.type === 'relation' && target?.can.create && !readOnly">
            <div>
              <CnButton
                variant="ghost"
                size="sm"
                @click="creating = true"
              >
                <Icon name="plus" />
                New {{ singularLabel(target).toLowerCase() }}
              </CnButton>
            </div>
            <RelatedCreate
              v-model:open="creating"
              :collection="target.name"
              @created="(id: string) => f.handleChange(field.many ? [...((f.state.value as string[] | null) ?? []), id] : id)"
            />
          </template>
        </div>
      </template>
    </form.Field>
  </template>
</template>
