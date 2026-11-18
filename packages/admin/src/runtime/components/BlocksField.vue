<!-- A blocks field in the entry form: each block a card (collapsed to its name and first text) with its
     fields and options, its areas as nested lists, and buttons to move or remove it; below, the blocks this
     list accepts, to add one. The visual editor edits the same blocks on the page. -->
<script setup lang="ts">
import type { AreaRules } from '#atelier/shared/blocks'
import { computed, defineAsyncComponent, reactive, ref } from 'vue'
import { newBlock, SHARED_BLOCK } from '#atelier/shared/blocks'
import { placeable } from '#atelier/shared/fields'
import { useAtelierAdminSchema } from '../composables/useAtelierAdminSchema'
import { humanize } from '../composables/useAtelierNavigation'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnSelect from '../crystal-neuo/components/Select.vue'
import { useAdminI18n } from '../i18n'
import Icon from './Icon'

defineOptions({ name: 'AtelierAdminBlocksField' })

// FieldInput renders this component for blocks fields: loaded lazily, not imported in a cycle
const FieldInput = defineAsyncComponent(() => import('./FieldInput.vue'))

interface Block { id: string, type: string, props?: Record<string, unknown> }

const props = defineProps<{
  // TanStack Form's form API, as FieldInput gets it
  form: any // eslint-disable-line @typescript-eslint/no-explicit-any
  /** The list's path in the entry: `content`, or a block's area, `content.0.props.items`. */
  name: string
  label: string
  rules: AreaRules
  root: Record<string, unknown>
  error?: string
  readOnly?: boolean
}>()
const { t } = useAdminI18n()
const { schema } = useAtelierAdminSchema()
const registry = computed(() => schema.value?.blocks ?? {})

const labelOf = (block: Block) => block.type === SHARED_BLOCK ? t('field.sharedBlock') : registry.value[block.type]?.label ?? humanize(block.type)
/** The block's first text, to tell blocks of one type apart while folded. */
function preview(block: Block): string {
  const text = Object.values(block.props ?? {}).find(v => typeof v === 'string' && v.trim()) as string | undefined
  return text && text.length > 80 ? `${text.slice(0, 80)}…` : text ?? ''
}
const fieldsOf = (block: Block) => Object.entries({ ...registry.value[block.type]?.fields, ...registry.value[block.type]?.options })
const areasOf = (block: Block) => Object.entries(registry.value[block.type]?.areas ?? {})

const choices = computed(() => Object.values(registry.value)
  .filter(s => placeable(s.name, s, props.rules))
  .map(s => ({ value: s.name, label: s.label ?? humanize(s.name) })))
const adding = ref('')
/** Blocks shown unfolded: the ones just added, and the ones opened. */
const open = reactive(new Set<string>())
function toggle(id: string, event: Event) {
  if ((event.target as HTMLDetailsElement).open)
    open.add(id)
  else
    open.delete(id)
}
function add(list: { pushValue: (v: unknown) => void }) {
  const block = newBlock(adding.value, registry.value)
  list.pushValue(block)
  open.add(block.id)
  adding.value = ''
}
</script>

<template>
  <form.Field
    :name="name"
    mode="array"
  >
    <template #default="{ field: list }">
      <fieldset
        class="app-fieldset app-blocks"
        data-blocks-field
      >
        <legend class="cn-label">
          {{ label }}
        </legend>
        <p
          v-if="!(list.state.value ?? []).length"
          class="app-muted"
        >
          {{ t('field.noBlocks') }}
        </p>
        <details
          v-for="(block, i) in ((list.state.value ?? []) as Block[])"
          :key="`${block.id}:${i}`"
          class="app-block"
          :open="open.has(block.id)"
          @toggle="toggle(block.id, $event)"
        >
          <summary class="app-block__head">
            <span class="app-block__label">{{ labelOf(block) }}</span>
            <span class="app-muted app-block__preview">{{ preview(block) }}</span>
          </summary>
          <div class="app-repeater__item">
            <p
              v-if="block.type === SHARED_BLOCK"
              class="app-muted"
            >
              {{ t('field.sharedBlockHint') }}
            </p>
            <template v-else>
              <FieldInput
                v-for="[key, field] in fieldsOf(block)"
                :key="key"
                :form="form"
                :name="`${name}.${i}.props.${key}`"
                :field="field"
                :root="root"
                :sibling="block.props ?? {}"
                :read-only="readOnly"
              />
              <AtelierAdminBlocksField
                v-for="[area, areaRules] in areasOf(block)"
                :key="area"
                :form="form"
                :name="`${name}.${i}.props.${area}`"
                :label="areaRules.label ?? humanize(area)"
                :rules="areaRules"
                :root="root"
                :read-only="readOnly"
              />
            </template>
            <div
              v-if="!readOnly"
              class="app-row"
            >
              <CnButton
                variant="ghost"
                size="sm"
                :disabled="i === 0"
                @click="list.moveValue(i, i - 1)"
              >
                {{ t('editor.moveUp') }}
              </CnButton>
              <CnButton
                variant="ghost"
                size="sm"
                :disabled="i === (list.state.value ?? []).length - 1"
                @click="list.moveValue(i, i + 1)"
              >
                {{ t('editor.moveDown') }}
              </CnButton>
              <CnButton
                variant="ghost"
                size="sm"
                @click="list.removeValue(i)"
              >
                <Icon name="trash-2" />
                {{ t('field.remove') }}
              </CnButton>
            </div>
          </div>
        </details>
        <div
          v-if="!readOnly && choices.length && (rules.max === undefined || (list.state.value ?? []).length < rules.max)"
          class="app-row app-blocks__add"
        >
          <CnSelect
            v-model="adding"
            :label="t('editor.add')"
            :options="[{ value: '', label: '—' }, ...choices]"
            size="sm"
          />
          <CnButton
            variant="secondary"
            size="sm"
            :disabled="!adding"
            @click="add(list)"
          >
            <Icon name="plus" />
            {{ t('field.add') }}
          </CnButton>
        </div>
        <span
          v-if="error"
          class="cn-field__message"
          role="alert"
        >{{ error }}</span>
      </fieldset>
    </template>
  </form.Field>
</template>
