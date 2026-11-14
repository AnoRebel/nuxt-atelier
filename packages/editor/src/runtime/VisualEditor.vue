<!-- The visual editor (`/admin/edit?type=pages&id=…`): the real page in a frame, rendering the entry as edited;
     selection and hover drawn over it from the positions the page reports; the structure of its blocks; the
     selected block's form. Edits are the entry form's, saved with Save like any other. -->
<script setup lang="ts">
import type { BlockList } from './tree'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { navigateTo, useAdminI18n, useAtelierAdmin, useAtelierAdminSchema, useAtelierEntryForm, useRoute, useRuntimeConfig } from '#imports'
import FieldInput from '#atelier-admin-runtime/components/FieldInput.vue'
import CnAlert from '#atelier-admin-runtime/crystal-neuo/components/Alert.vue'
import CnButton from '#atelier-admin-runtime/crystal-neuo/components/Button.vue'
import CnSelect from '#atelier-admin-runtime/crystal-neuo/components/Select.vue'
import { useAdminToast } from '#atelier-admin-runtime/toast'
import { BRIDGE_VERSION, ChildMessage, readMessage } from '#atelier/shared/bridge'
import styles from './editor.css?raw'
import { createHistory } from './history'
import StructureList from './StructureList.vue'
import { accepts, blockTree, duplicate, get, insert, locate, move, newBlock, remove } from './tree'

type Geometry = Extract<ChildMessage, { type: 'atelier:geometry' }>
type Data = Record<string, unknown>

const route = useRoute()
const { t } = useAdminI18n()
const { api, to } = useAtelierAdmin()
const toast = useAdminToast()
const { schema } = useAtelierAdminSchema()
const presets = ((useRuntimeConfig().public.atelierEditor as { presets?: { label: string, width: number }[] } | undefined)?.presets ?? [])
const name = String(route.query.type ?? '')
const id = typeof route.query.id === 'string' ? route.query.id : undefined
const kind = computed<'collection' | 'singleton'>(() => schema.value?.singletons.some(s => s.name === name) ? 'singleton' : 'collection')
const edit = useAtelierEntryForm(() => ({ kind: kind.value, name, id }))
const { form, type } = edit
const values = form.useStore(state => state.values) as unknown as { value: Data }
const registry = computed(() => (schema.value?.blocks ?? {}) as never)
const lists = computed<BlockList[]>(() => type.value ? blockTree(values.value, type.value.fields as never, registry.value) : [])
const canSave = computed(() => !!type.value?.can.update)

// --- the frame: opened with a token for this entry, which the page exchanges for its edit session
const frame = ref<HTMLIFrameElement | null>(null)
const src = ref('')
const failure = ref('')
const width = ref(presets[0]?.width ?? 1280)
const presetOptions = computed(() => presets.map(p => ({ value: String(p.width), label: `${p.label} (${p.width}px)` })))
onMounted(async () => {
  try {
    src.value = (await api<{ url: string }>('/editor/token', { method: 'POST', body: { type: name, ...id ? { id } : {} } })).url
  }
  catch (e) {
    failure.value = (e as { message?: string }).message ?? ''
  }
})

// --- what the page says
const geometry = ref<Geometry | null>(null)
const hovered = ref<string | null>(null)
const selected = ref<string | null>(null)
const announcement = ref('')
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T
}
let pending = 0
/** The edited data to the page, at most once a frame. */
function sendState() {
  if (pending)
    return
  pending = requestAnimationFrame(() => {
    pending = 0
    frame.value?.contentWindow?.postMessage({ type: 'atelier:state', version: BRIDGE_VERSION, id: id ?? name, data: clone(values.value) }, location.origin)
  })
}
function onMessage(event: MessageEvent) {
  const message = readMessage(ChildMessage, event, { origin: location.origin, source: frame.value?.contentWindow })
  if (!message)
    return
  if (message.type === 'atelier:ready')
    sendState()
  else if (message.type === 'atelier:geometry')
    geometry.value = message
  else if (message.type === 'atelier:select')
    selected.value = message.id
  else if (message.type === 'atelier:hover')
    hovered.value = message.id
  else if (message.type === 'atelier:inline')
    applyInline(message.path, message.value)
}
onMounted(() => addEventListener('message', onMessage))
onBeforeUnmount(() => removeEventListener('message', onMessage))
watch(selected, blockId => frame.value?.contentWindow?.postMessage({ type: 'atelier:select', version: BRIDGE_VERSION, id: blockId }, location.origin))

/** The overlay box of a block, in the frame's coordinates. */
const boxOf = (blockId: string | null) => {
  const found = blockId ? geometry.value?.blocks.find(b => b.id === blockId) : undefined
  return found && { left: `${found.rect.x}px`, top: `${found.rect.y}px`, width: `${found.rect.width}px`, height: `${found.rect.height}px` }
}

// --- edits: history first, then the form (which the page follows)
const history = createHistory<Data>()
let last = clone(values.value)
let nextKind: 'typing' | 'operation' = 'typing'
let restoring = false
watch(values, (current) => {
  // the entry arriving in the form isn't an edit, and neither is a change that changes nothing
  const loaded = Object.keys(last ?? {}).length > 0
  if (!restoring && loaded && JSON.stringify(last) !== JSON.stringify(current))
    history.record(last, nextKind)
  nextKind = 'typing'
  restoring = false
  last = clone(current)
  sendState()
}, { deep: true })
/** Puts whole fields' values in the form (an operation, an undo). */
function setData(data: Data, how: 'operation' | 'restore') {
  if (how === 'restore')
    restoring = true
  else
    nextKind = 'operation'
  for (const key of Object.keys(type.value?.fields ?? {})) {
    if (JSON.stringify(data[key]) !== JSON.stringify(values.value[key]))
      form.setFieldValue(key as never, clone(data[key]) as never)
  }
}
function undo() {
  const previous = history.undo(clone(values.value))
  if (previous)
    setData(previous, 'restore')
}
function redo() {
  const next = history.redo(clone(values.value))
  if (next)
    setData(next, 'restore')
}
function applyInline(path: string, value: string) {
  const [blockId, field] = path.includes('/') ? path.split('/') : [null, path]
  const at = blockId ? locate(lists.value, blockId) : undefined
  if (blockId && !at)
    return
  form.setFieldValue((at ? `${at.block.path}.props.${field}` : field) as never, value as never)
}

const selectedAt = computed(() => selected.value ? locate(lists.value, selected.value) : undefined)
const selectedSchema = computed(() => selectedAt.value ? (registry.value as Record<string, { label?: string, fields: Record<string, unknown>, options: Record<string, unknown> }>)[selectedAt.value.block.type] : undefined)
const selectedFields = computed(() => Object.entries({ ...selectedSchema.value?.fields, ...selectedSchema.value?.options }))

function moveBy(blockId: string, by: -1 | 1) {
  const at = locate(lists.value, blockId)
  if (!at)
    return
  const index = at.index + (by === 1 ? 2 : -1)
  if (index < 0 || index > at.list.blocks.length)
    return
  const moved = move(values.value, lists.value, registry.value, blockId, at.list.path, index)
  if (moved) {
    setData(moved, 'operation')
    announcement.value = t('editor.moved', { block: at.block.label, position: at.index + by + 1, list: at.list.label })
  }
}
function removeBlock(blockId: string) {
  setData(remove(values.value, lists.value, blockId), 'operation')
  if (selected.value === blockId)
    selected.value = null
}
function duplicateBlock(blockId: string) {
  const copied = duplicate(values.value, lists.value, registry.value, blockId)
  if (copied) {
    setData(copied.data, 'operation')
    selected.value = copied.id
  }
}

// --- adding: into the selected block's list, after it, or at the end of the first list
const target = computed(() => selectedAt.value ? { list: selectedAt.value.list, index: selectedAt.value.index + 1 } : lists.value[0] ? { list: lists.value[0], index: lists.value[0].blocks.length } : undefined)
const addOptions = computed(() => target.value
  ? Object.values(registry.value as Record<string, { name: string, label?: string }>).filter(b => accepts(target.value!.list, b.name, registry.value)).map(b => ({ value: b.name, label: b.label ?? b.name }))
  : [])
const adding = ref('')
watch(adding, (blockType) => {
  if (!blockType || !target.value)
    return
  const block = newBlock(blockType, registry.value)
  setData(insert(values.value, target.value.list.path, target.value.index, block), 'operation')
  selected.value = block.id
  adding.value = ''
})

// --- keys: undo, redo
function onKey(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey)
    return
  const key = event.key.toLowerCase()
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault()
    undo()
  }
  else if ((key === 'z' && event.shiftKey) || key === 'y') {
    event.preventDefault()
    redo()
  }
}
onMounted(() => addEventListener('keydown', onKey))
onBeforeUnmount(() => removeEventListener('keydown', onKey))

async function save() {
  try {
    await edit.submit()
    if (form.state.isSubmitSuccessful)
      toast.add({ color: 'success', title: t('editor.saved') })
  }
  catch (e) {
    toast.add({ color: 'error', title: (e as { message?: string }).message ?? '' })
  }
}
const back = () => navigateTo(kind.value === 'singleton' ? to('singletons', name) : to('collections', name, id ?? ''))
const blockOf = (path: string) => get(values.value, path) as Data
// the frame's lists, for the add picker's label
const targetLabel = computed(() => target.value?.list.label ?? '')
</script>

<template>
  <div
    class="ate-editor"
    data-visual-editor
  >
    <component :is="'style'">
      {{ styles }}
    </component>
    <header class="ate-editor__bar">
      <CnButton
        variant="ghost"
        size="sm"
        @click="back"
      >
        {{ t('editor.backToForm') }}
      </CnButton>
      <CnSelect
        :model-value="String(width)"
        :label="t('editor.viewport')"
        :options="presetOptions"
        @update:model-value="(v: string) => width = Number(v)"
      />
      <label class="ate-editor__width">
        <span>{{ t('editor.custom') }}</span>
        <input
          v-model.number="width"
          type="number"
          min="240"
          max="3840"
          class="cn-input cn-input--size-sm"
        >
      </label>
      <CnButton
        variant="ghost"
        size="sm"
        :aria-label="t('editor.undo')"
        @click="undo"
      >
        {{ t('editor.undo') }}
      </CnButton>
      <CnButton
        variant="ghost"
        size="sm"
        :aria-label="t('editor.redo')"
        @click="redo"
      >
        {{ t('editor.redo') }}
      </CnButton>
      <CnButton
        v-if="canSave"
        size="sm"
        :loading="form.state.isSubmitting"
        @click="save"
      >
        {{ type?.versioned ? t('entry.saveDraft') : t('common.save') }}
      </CnButton>
    </header>
    <CnAlert
      v-if="failure"
      variant="danger"
    >
      {{ failure }}
    </CnAlert>
    <div class="ate-editor__body">
      <nav
        class="ate-editor__structure"
        :aria-label="t('editor.structure')"
      >
        <template
          v-for="list in lists"
          :key="list.path"
        >
          <p class="ate-tree__area">
            {{ list.label }}
          </p>
          <StructureList
            :list="list"
            :selected="selected"
            :hovered="hovered"
            :depth="0"
            @select="selected = $event"
            @hover="hovered = $event"
            @move="moveBy"
            @remove="removeBlock"
          />
        </template>
        <CnSelect
          v-if="addOptions.length"
          v-model="adding"
          :label="t('editor.addTo', { list: targetLabel })"
          :options="[{ value: '', label: '—' }, ...addOptions]"
          data-add-block
        />
      </nav>
      <div
        class="ate-editor__stage"
        role="region"
        tabindex="0"
        :aria-label="t('editor.preview')"
      >
        <div
          class="ate-editor__viewport"
          :style="{ width: `${width}px` }"
        >
          <iframe
            v-if="src"
            ref="frame"
            :src="src"
            :title="t('editor.preview')"
            class="ate-editor__frame"
          />
          <div
            class="ate-editor__overlay"
            aria-hidden="true"
          >
            <div
              v-if="hovered && hovered !== selected && boxOf(hovered)"
              class="ate-editor__box ate-editor__box--hover"
              :style="boxOf(hovered)"
            />
            <div
              v-if="boxOf(selected)"
              class="ate-editor__box ate-editor__box--selected"
              :style="boxOf(selected)"
              data-overlay-selected
            >
              <span class="ate-editor__tag">{{ selectedAt?.block.label }}</span>
            </div>
          </div>
        </div>
      </div>
      <aside
        class="ate-editor__panel"
        :aria-label="t('editor.block')"
      >
        <template v-if="selectedAt && selectedSchema">
          <h2 class="app-section__title">
            {{ selectedAt.block.label }}
          </h2>
          <div class="app-row">
            <CnButton
              variant="ghost"
              size="sm"
              @click="moveBy(selectedAt.block.id, -1)"
            >
              {{ t('editor.moveUp') }}
            </CnButton>
            <CnButton
              variant="ghost"
              size="sm"
              @click="moveBy(selectedAt.block.id, 1)"
            >
              {{ t('editor.moveDown') }}
            </CnButton>
            <CnButton
              variant="ghost"
              size="sm"
              @click="duplicateBlock(selectedAt.block.id)"
            >
              {{ t('editor.duplicate') }}
            </CnButton>
            <CnButton
              variant="ghost"
              size="sm"
              @click="removeBlock(selectedAt.block.id)"
            >
              {{ t('editor.delete') }}
            </CnButton>
          </div>
          <div
            class="app-form"
            data-block-form
          >
            <FieldInput
              v-for="[key, field] in selectedFields"
              :key="`${selectedAt.block.id}:${key}`"
              :form="form"
              :name="`${selectedAt.block.path}.props.${key}`"
              :field="field as never"
              :root="values"
              :sibling="(blockOf(selectedAt.block.path)?.props as Record<string, unknown>) ?? {}"
              :read-only="!canSave"
            />
          </div>
        </template>
        <p
          v-else
          class="app-muted"
        >
          {{ t('editor.noSelection') }}
        </p>
      </aside>
    </div>
    <p
      class="sr-only"
      aria-live="polite"
    >
      {{ announcement }}
    </p>
  </div>
</template>
