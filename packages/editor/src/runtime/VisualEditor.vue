<!-- The visual editor (`/admin/edit?type=pages&id=…`): the real page in a frame, rendering the entry as edited;
     selection and hover drawn over it from the positions the page reports; the structure of its blocks; the
     selected block's form. Edits are the entry form's, saved with Save like any other. -->
<script setup lang="ts">
import type { EditorCommand, EditorContext } from './commands'
import type { Dnd, Dragged, DropAt } from './dnd'
import type { Block, BlockList } from './tree'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { navigateTo, useAdminI18n, useAtelierAdmin, useAtelierAdminSchema, useAtelierComments, useAtelierEntryForm, useRoute, useRuntimeConfig } from '#imports'
import CommentsPanel from '#atelier-admin-runtime/components/CommentsPanel.vue'
import FieldInput from '#atelier-admin-runtime/components/FieldInput.vue'
import CnAlert from '#atelier-admin-runtime/crystal-neuo/components/Alert.vue'
import CnButton from '#atelier-admin-runtime/crystal-neuo/components/Button.vue'
import CnSelect from '#atelier-admin-runtime/crystal-neuo/components/Select.vue'
import { useAdminToast } from '#atelier-admin-runtime/toast'
import { copyBlocks, resolveShared, SHARED_BLOCK, SHARED_BLOCKS } from '#atelier/shared/blocks'
import { BRIDGE_VERSION, ChildMessage, readMessage } from '#atelier/shared/bridge'
import styles from './editor.css?raw'
import CommandPalette from './CommandPalette.vue'
import { addedBlockActions, addedCommands } from './commands'
import { dndKey } from './dnd'
import { createHistory } from './history'
import StructureList from './StructureList.vue'
import { accepts, allLists, blockTree, duplicate, get, insert, locate, move, newBlock, remove } from './tree'

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
  else if (message.type === 'atelier:key')
    shortcut(message.key, message.shift)
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
function applyInline(path: string, value: unknown) {
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

// --- adding: a palette block clicked goes after the selected block, or at the end of the first list
const target = computed<DropAt | undefined>(() => selectedAt.value ? { list: selectedAt.value.list.path, index: selectedAt.value.index + 1 } : lists.value[0] ? { list: lists.value[0].path, index: lists.value[0].blocks.length } : undefined)
const palette = computed(() => Object.values(registry.value as Record<string, { name: string, label?: string }>).map(b => ({ name: b.name, label: b.label ?? b.name })))
const listAt = (path: string) => allLists(lists.value).find(l => l.path === path)
/** Whether `dragged` may go at `at`: its rules, its size limit, and never inside itself. */
function canPlace(dragged: Dragged, at: DropAt): boolean {
  if (dragged.kind === 'block')
    return !!move(values.value, lists.value, registry.value, dragged.id, at.list, at.index)
  const list = listAt(at.list)
  return !!list && accepts(list, dragged.type, registry.value)
}
function place(dragged: Dragged, at: DropAt) {
  if (!canPlace(dragged, at))
    return
  if (dragged.kind === 'block') {
    setData(move(values.value, lists.value, registry.value, dragged.id, at.list, at.index)!, 'operation')
    selected.value = dragged.id
    return
  }
  const block = newBlock(dragged.type, registry.value)
  setData(insert(values.value, at.list, at.index, block), 'operation')
  selected.value = block.id
}

// --- dragging, in the tree, from the palette, and over the preview
const dragging = ref<Dragged | null>(null)
const dropAt = ref<DropAt | null>(null)
const dnd: Dnd = {
  dragging,
  dropAt,
  start(event, dragged) {
    event.dataTransfer?.setData('text/plain', dragged.kind === 'block' ? dragged.id : dragged.type)
    if (event.dataTransfer)
      event.dataTransfer.effectAllowed = dragged.kind === 'block' ? 'move' : 'copy'
    dragging.value = dragged
  },
  over(event, at) {
    // a spot that doesn't take it: no line, and the drop isn't allowed (the browser shows it)
    const ok = !!dragging.value && canPlace(dragging.value, at)
    dropAt.value = ok ? at : null
    if (ok)
      event.preventDefault()
  },
  drop(event) {
    event.preventDefault()
    if (dragging.value && dropAt.value)
      place(dragging.value, dropAt.value)
    dragging.value = null
    dropAt.value = null
  },
  end() {
    dragging.value = null
    dropAt.value = null
  },
}
provide(dndKey, dnd)

/** Over the preview while dragging: the innermost block under the pointer that takes it, before or after it by halves. */
const overlay = ref<HTMLElement | null>(null)
const previewLine = ref<{ left: string, top: string, width: string } | null>(null)
/** The blocks under the pointer, innermost first, and where the pointer is over the preview. */
function blocksUnder(event: DragEvent) {
  const origin = overlay.value!.getBoundingClientRect()
  const x = event.clientX - origin.left
  const y = event.clientY - origin.top
  const under = (geometry.value?.blocks ?? [])
    .filter(b => x >= b.rect.x && x <= b.rect.x + b.rect.width && y >= b.rect.y && y <= b.rect.y + b.rect.height)
    .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height)
  return { under, y }
}
function overPreview(event: DragEvent) {
  if (isFileDrag(event))
    return overWithFile(event)
  const { under, y } = blocksUnder(event)
  for (const hit of under) {
    const at = locate(lists.value, hit.id)
    const after = y > hit.rect.y + hit.rect.height / 2
    const spot = at && { list: at.list.path, index: at.index + (after ? 1 : 0) }
    if (spot && dragging.value && canPlace(dragging.value, spot)) {
      dnd.over(event, spot)
      previewLine.value = { left: `${hit.rect.x}px`, top: `${after ? hit.rect.y + hit.rect.height : hit.rect.y}px`, width: `${hit.rect.width}px` }
      return
    }
  }
  dropAt.value = null
  previewLine.value = null
}
watch(dropAt, (at) => {
  if (!at)
    previewLine.value = null
})

// --- files dropped on the preview: onto the innermost block with a media field that takes the file, uploaded
// to the media library and set as that field (one undoable step)
const draggingFiles = ref(false)
const fileTarget = ref<string | null>(null)
const isFileDrag = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files')
/** The block's first media field that takes `mime` (`accept` patterns like `image/*`), if it has one. */
function mediaFieldOf(blockType: string, mime: string): string | undefined {
  const fields = (registry.value as Record<string, { fields: Record<string, { type: string, accept?: readonly string[] }> }>)[blockType]?.fields ?? {}
  return Object.entries(fields).find(([, f]) => f.type === 'media'
    && (!f.accept || f.accept.some(a => a === mime || (a.endsWith('/*') && mime.startsWith(a.slice(0, -1))))))?.[0]
}
// the types of dragged files are known while dragging, their names only on drop: judge by the first item
const draggedMime = (event: DragEvent) => [...event.dataTransfer?.items ?? []].find(i => i.kind === 'file')?.type ?? ''
function overWithFile(event: DragEvent) {
  const mime = draggedMime(event)
  const hit = blocksUnder(event).under.find((b) => {
    const at = locate(lists.value, b.id)
    return at && mediaFieldOf(at.block.type, mime)
  })
  fileTarget.value = hit?.id ?? null
  if (hit)
    event.preventDefault()
}
async function dropFile(event: DragEvent) {
  event.preventDefault()
  const blockId = fileTarget.value
  const file = event.dataTransfer?.files[0]
  draggingFiles.value = false
  fileTarget.value = null
  const at = blockId ? locate(lists.value, blockId) : undefined
  const field = at && file && mediaFieldOf(at.block.type, file.type)
  if (!at || !file || !field)
    return
  try {
    // ponytail: one request, so up to media.maxUploadSize; the media page's chunked upload for larger files
    const item = await api<{ id: string }>('/media', { method: 'POST', query: { filename: file.name }, body: file })
    const block = blockOf(at.block.path) as unknown as Block
    context.setProps(blockId!, { ...block.props, [field]: item.id })
    announce(t('editor.uploaded', { file: file.name }))
  }
  catch (error) {
    toast.add({ color: 'error', title: (error as { message?: string }).message ?? String(error) })
  }
}
// a file dragged in from outside: let the overlay catch it over the frame, until it's dropped or leaves
function onWindowDrag(event: DragEvent) {
  if (event.type === 'dragenter' && isFileDrag(event))
    draggingFiles.value = true
  else if ((event.type === 'dragleave' && !event.relatedTarget) || event.type === 'drop') {
    draggingFiles.value = false
    fileTarget.value = null
  }
}
onMounted(() => ['dragenter', 'dragleave', 'drop'].forEach(type => addEventListener(type, onWindowDrag as EventListener)))
onBeforeUnmount(() => ['dragenter', 'dragleave', 'drop'].forEach(type => removeEventListener(type, onWindowDrag as EventListener)))
// --- keys: undo, redo, the command palette (Ctrl+K here: the editor's, not the admin's search)
const commandsOpen = ref(false)
/** Ctrl/⌘ + `key`, here or passed on by the page when it has focus: whether it was the editor's. */
function shortcut(key: string, shift: boolean): boolean {
  if (key === 'k') {
    commandsOpen.value = !commandsOpen.value
    return true
  }
  // in the palette's field, undo is the text's
  if (commandsOpen.value)
    return false
  if (key === 'z' && !shift)
    undo()
  else if ((key === 'z' && shift) || key === 'y')
    redo()
  else
    return false
  return true
}
function onKey(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && shortcut(event.key.toLowerCase(), event.shiftKey)) {
    event.preventDefault()
    event.stopImmediatePropagation() // Ctrl+K: not the admin's search
  }
}
onMounted(() => addEventListener('keydown', onKey, { capture: true }))
onBeforeUnmount(() => removeEventListener('keydown', onKey, { capture: true }))

const context: EditorContext = {
  get selected() {
    return selected.value
  },
  select: (blockId) => {
    selected.value = blockId
  },
  insert: (blockType) => {
    if (!target.value || !canPlace({ kind: 'new', type: blockType }, target.value))
      return false
    place({ kind: 'new', type: blockType }, target.value)
    return true
  },
  data: () => clone(values.value),
  setData: data => setData(data, 'operation'),
  undo,
  redo,
  save: () => save(),
  setProps: (blockId, props) => {
    const at = locate(lists.value, blockId)
    if (at)
      replaceAt(at.block.path, { ...blockOf(at.block.path) as unknown as Block, props: clone(props) })
  },
}
/** The selected block's actions from plugins (addBlockActions). */
const pluginActions = computed(() => selectedBlock.value ? addedBlockActions(clone(selectedBlock.value), context) : [])
// --- comments: a marker on each block with open threads, opening them in the side panel
const commentsTarget = computed(() => type.value ? { type: name, id: kind.value === 'singleton' ? name : id ?? '' } : null)
const comments = useAtelierComments(commentsTarget)
const panel = ref<'block' | 'comments'>('block')
const aside = ref<HTMLElement | null>(null)
const markers = computed(() => {
  const open = new Map<string, string[]>()
  for (const thread of comments.threads.value) {
    if (thread.block && !thread.resolvedAt && !thread.orphaned)
      open.set(thread.block, [...open.get(thread.block) ?? [], thread.id])
  }
  return [...open].flatMap(([blockId, threads]) => {
    const at = geometry.value?.blocks.find(b => b.id === blockId)
    const label = locate(lists.value, blockId)?.block.label ?? ''
    // at the block's start, which is in view even when the frame is wider than the stage
    return at ? [{ blockId, threads, label, style: { left: `${at.rect.x}px`, top: `${at.rect.y}px` } }] : []
  })
})
async function openThread(blockId: string, thread: string) {
  selected.value = blockId
  panel.value = 'comments'
  await nextTick()
  const el = aside.value?.querySelector<HTMLElement>(`[data-comment="${thread}"]`)
  el?.scrollIntoView({ block: 'nearest' })
  el?.setAttribute('data-highlighted', '')
  setTimeout(() => el?.removeAttribute('data-highlighted'), 2000)
}

// --- reuse: patterns and shared blocks to insert, a block saved as either, detached, copied and pasted
interface Pattern { id: string, label: string, blocks: Block[] }
interface Shared { id: string, label: string, block: Block }
const patterns = ref<Pattern[]>([])
const sharedBlocks = ref<Shared[]>([])
async function loadReusable() {
  const [found, shared] = await Promise.all([
    api<{ id: string, label: string, blocks: Block[] }[]>('/patterns').catch(() => []),
    schema.value?.collections.some(c => c.name === SHARED_BLOCKS)
      ? api<{ items: { id: string, data: { title?: string, block?: Block[] } }[] }>(`/collections/${SHARED_BLOCKS}`, { query: { draft: 'true', limit: 100, sort: 'title' } }).catch(() => ({ items: [] }))
      : { items: [] },
  ])
  patterns.value = found
  sharedBlocks.value = shared.items.filter(e => e.data.block?.[0]).map(e => ({ id: e.id, label: e.data.title ?? e.id, block: e.data.block![0]! }))
}
onMounted(loadReusable)
/** Whether `blocks` all go at `at`: each type's rules, and the list's size limit for them all. */
function fits(blocks: Block[], at: DropAt) {
  const list = listAt(at.list)
  return !!list && blocks.length > 0 && blocks.every(b => accepts(list, b.type, registry.value, true))
    && (list.rules.max === undefined || list.blocks.length + blocks.length <= list.rules.max)
}
/** Inserts copies of `blocks` at `at` (or after the selection): false if they can't go there. */
function insertBlocks(blocks: Block[], at = target.value): boolean {
  if (!at || !fits(blocks, at)) {
    announce(t('editor.cantPlace', { block: blocks.map(b => labelOf(b.type)).join(', ') }))
    return false
  }
  let data = values.value
  blocks.forEach((block, i) => data = insert(data, at.list, at.index + i, block))
  setData(data, 'operation')
  selected.value = blocks[0]!.id
  return true
}
const labelOf = (blockType: string) => (registry.value as Record<string, { label?: string }>)[blockType]?.label ?? blockType
// (plain copies first: structuredClone, in copyBlocks, refuses reactive proxies)
const insertPattern = (pattern: Pattern) => insertBlocks(copyBlocks(clone(pattern.blocks)))
/** A shared block placed by reference: shown with its content, saved as the reference. */
const insertShared = (shared: Shared) => insertBlocks([resolveShared([{ id: crypto.randomUUID(), type: SHARED_BLOCK, props: { ref: shared.id } }], () => clone(shared.block))[0]! as Block])
/** Replaces the block at `path` with `block` (one step). */
function replaceAt(path: string, block: Block) {
  const at = locate(lists.value, (get(values.value, path) as Block).id)!
  setData(insert(remove(values.value, lists.value, at.block.id), at.list.path, at.index, block), 'operation')
  selected.value = block.id
}
const selectedBlock = computed(() => selectedAt.value ? blockOf(selectedAt.value.block.path) as unknown as Block & { shared?: string } : undefined)
const reuseTitle = ref('')
async function saveAs(kind: 'shared' | 'pattern') {
  const block = selectedBlock.value
  const title = reuseTitle.value.trim()
  if (!block || !title)
    return
  try {
    const [copy] = copyBlocks([clone(block)])
    if (kind === 'pattern') {
      await api(`/collections/atelier-patterns`, { method: 'POST', body: { data: { title, blocks: [copy] } } })
    }
    else {
      const created = await api<{ id: string }>(`/collections/${SHARED_BLOCKS}`, { method: 'POST', body: { data: { title, block: [copy] } } })
      // the page now places it by reference (its content shown as it is)
      replaceAt(selectedAt.value!.block.path, { ...block, shared: created.id } as Block)
    }
    reuseTitle.value = ''
    toast.add({ color: 'success', title: t(kind === 'shared' ? 'editor.savedShared' : 'editor.savedPattern', { title }) })
    await loadReusable()
  }
  catch (e) {
    toast.add({ color: 'error', title: (e as { message?: string }).message ?? '' })
  }
}
/** The shared block's content as the page's own: a copy, linked to nothing. */
function detach() {
  if (selectedBlock.value?.shared)
    replaceAt(selectedAt.value!.block.path, copyBlocks([clone(selectedBlock.value)])[0]!)
}

// copy and paste, through the clipboard (so across entries and tabs): Ctrl+C / Ctrl+V outside text fields
const CLIPBOARD = 'atelier/blocks'
const editable = (event: Event) => {
  const el = event.composedPath()[0] as HTMLElement | undefined
  return !!el && (el.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}
function onCopy(event: ClipboardEvent) {
  if (editable(event) || !selectedBlock.value || !event.clipboardData)
    return
  event.preventDefault()
  event.clipboardData.setData('text/plain', JSON.stringify({ [CLIPBOARD]: [selectedBlock.value] }))
  announce(t('editor.copied', { block: selectedAt.value!.block.label }))
}
function onPaste(event: ClipboardEvent) {
  if (editable(event) || !event.clipboardData)
    return
  let blocks: unknown
  try {
    blocks = (JSON.parse(event.clipboardData.getData('text/plain')) as Record<string, unknown>)[CLIPBOARD]
  }
  catch {
    return
  }
  if (!Array.isArray(blocks) || !blocks.every(b => b && typeof b === 'object' && typeof b.type === 'string' && registry.value[b.type as never]))
    return
  event.preventDefault()
  insertBlocks(copyBlocks(blocks as Block[]))
}
onMounted(() => {
  addEventListener('copy', onCopy)
  addEventListener('paste', onPaste)
})
onBeforeUnmount(() => {
  removeEventListener('copy', onCopy)
  removeEventListener('paste', onPaste)
})
function announce(text: string) {
  announcement.value = text
}

const commands = computed<EditorCommand[]>(() => {
  const blocks = t('editor.groupBlocks')
  const editing = t('editor.groupEdit')
  const at = selectedAt.value
  return [
    ...target.value ? palette.value.filter(b => canPlace({ kind: 'new', type: b.name }, target.value!)).map(b => ({ id: `insert:${b.name}`, label: t('editor.insert', { block: b.label }), group: blocks, run: () => void context.insert(b.name) })) : [],
    ...at
      ? [
          { id: 'move-up', label: t('editor.moveUp'), group: editing, run: () => moveBy(at.block.id, -1) },
          { id: 'move-down', label: t('editor.moveDown'), group: editing, run: () => moveBy(at.block.id, 1) },
          { id: 'duplicate', label: t('editor.duplicate'), group: editing, run: () => duplicateBlock(at.block.id) },
          { id: 'delete', label: t('editor.delete'), group: editing, run: () => removeBlock(at.block.id) },
          ...pluginActions.value.map(a => ({ ...a, group: a.group ?? editing })),
        ]
      : [],
    ...patterns.value.map(p => ({ id: `pattern:${p.id}`, label: t('editor.insert', { block: p.label }), group: t('editor.patterns'), run: () => void insertPattern(p) })),
    ...sharedBlocks.value.map(b => ({ id: `shared:${b.id}`, label: t('editor.insert', { block: b.label }), group: t('editor.sharedBlocks'), run: () => void insertShared(b) })),
    ...selectedBlock.value?.shared ? [{ id: 'detach', label: t('editor.detach'), group: editing, run: detach }] : [],
    { id: 'undo', label: t('editor.undo'), group: editing, run: undo },
    { id: 'redo', label: t('editor.redo'), group: editing, run: redo },
    ...canSave.value ? [{ id: 'save', label: type.value?.versioned ? t('entry.saveDraft') : t('common.save'), group: editing, run: save }] : [],
    ...commandsOpen.value ? addedCommands(context) : [],
  ]
})
async function runCommand(command: EditorCommand) {
  try {
    await command.run(context)
  }
  catch (e) {
    toast.add({ color: 'error', title: (e as { message?: string }).message ?? '' })
  }
}

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
const targetLabel = computed(() => (target.value && listAt(target.value.list)?.label) ?? '')
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
            :empty-label="t('editor.empty')"
            @select="selected = $event"
            @hover="hovered = $event"
            @move="moveBy"
            @remove="removeBlock"
          />
        </template>
        <p class="ate-tree__area">
          {{ t('editor.addTo', { list: targetLabel }) }}
        </p>
        <ul
          class="ate-palette"
          :aria-label="t('editor.add')"
        >
          <li
            v-for="b in palette"
            :key="b.name"
          >
            <button
              type="button"
              class="ate-palette__block"
              draggable="true"
              :disabled="!target || !canPlace({ kind: 'new', type: b.name }, target)"
              :data-palette-block="b.name"
              @click="target && place({ kind: 'new', type: b.name }, target)"
              @dragstart="dnd.start($event, { kind: 'new', type: b.name })"
              @dragend="dnd.end()"
            >
              {{ b.label }}
            </button>
          </li>
        </ul>
        <template
          v-for="group in [{ label: t('editor.patterns'), items: patterns.map(p => ({ id: p.id, label: p.label, insert: () => insertPattern(p) })), attr: 'data-pattern' }, { label: t('editor.sharedBlocks'), items: sharedBlocks.map(b => ({ id: b.id, label: b.label, insert: () => insertShared(b) })), attr: 'data-shared-block' }]"
          :key="group.attr"
        >
          <template v-if="group.items.length">
            <p class="ate-tree__area">
              {{ group.label }}
            </p>
            <ul
              class="ate-palette"
              :aria-label="group.label"
            >
              <li
                v-for="item in group.items"
                :key="item.id"
              >
                <button
                  type="button"
                  class="ate-palette__block"
                  v-bind="{ [group.attr]: item.id }"
                  @click="item.insert()"
                >
                  {{ item.label }}
                </button>
              </li>
            </ul>
          </template>
        </template>
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
            ref="overlay"
            class="ate-editor__overlay"
            :class="{ 'ate-editor__overlay--dropping': dragging || draggingFiles }"
            aria-hidden="true"
            data-preview-drop
            @dragover="overPreview"
            @dragleave="previewLine = null"
            @drop="isFileDrag($event) ? dropFile($event) : dnd.drop($event)"
          >
            <div
              v-if="fileTarget && boxOf(fileTarget)"
              class="ate-editor__box ate-editor__box--selected"
              data-file-target
              :style="boxOf(fileTarget)"
            />
            <div
              v-if="previewLine"
              class="ate-editor__drop"
              :style="previewLine"
            />
            <div
              v-if="hovered && hovered !== selected && boxOf(hovered)"
              class="ate-editor__box ate-editor__box--hover"
              :style="boxOf(hovered)"
            />
            <div
              v-if="boxOf(selected)"
              class="ate-editor__box ate-editor__box--selected"
              :class="{ 'ate-editor__box--top': (geometry?.blocks.find(b => b.id === selected)?.rect.y ?? 0) < 20 }"
              :style="boxOf(selected)"
              data-overlay-selected
            >
              <span
                class="ate-editor__tag"
                draggable="true"
                data-overlay-handle
                @dragstart="selected && dnd.start($event, { kind: 'block', id: selected })"
                @dragend="dnd.end()"
              >{{ selectedAt?.block.label }}</span>
            </div>
          </div>
          <div class="ate-editor__markers">
            <button
              v-for="marker in markers"
              :key="marker.blockId"
              type="button"
              class="ate-editor__marker"
              :style="marker.style"
              :data-comment-marker="marker.blockId"
              :aria-label="t('editor.commentsOn', { count: marker.threads.length, block: marker.label })"
              @click="openThread(marker.blockId, marker.threads[0]!)"
            >
              {{ marker.threads.length }}
            </button>
          </div>
        </div>
      </div>
      <aside
        ref="aside"
        class="ate-editor__panel"
        :aria-label="panel === 'comments' ? t('editor.comments') : t('editor.block')"
      >
        <div
          class="app-row ate-editor__tabs"
          role="group"
          :aria-label="t('editor.panel')"
        >
          <CnButton
            :variant="panel === 'block' ? 'secondary' : 'ghost'"
            size="sm"
            :aria-pressed="panel === 'block'"
            @click="panel = 'block'"
          >
            {{ t('editor.block') }}
          </CnButton>
          <CnButton
            :variant="panel === 'comments' ? 'secondary' : 'ghost'"
            size="sm"
            :aria-pressed="panel === 'comments'"
            data-comments-tab
            @click="panel = 'comments'"
          >
            {{ t('editor.comments') }}
          </CnButton>
        </div>
        <CommentsPanel
          v-if="panel === 'comments' && commentsTarget"
          :id="commentsTarget.id"
          :type="commentsTarget.type"
          :data="values"
          :can-comment="!!type?.can.comment"
        />
        <template v-else-if="selectedAt && selectedSchema">
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
            <CnButton
              v-for="action in pluginActions"
              :key="action.id"
              variant="ghost"
              size="sm"
              :data-block-action="action.id"
              @click="runCommand(action)"
            >
              {{ action.label }}
            </CnButton>
          </div>
          <p
            v-if="selectedBlock?.shared"
            class="app-row"
          >
            <span class="app-muted">{{ t('editor.isShared') }}</span>
            <CnButton
              variant="ghost"
              size="sm"
              data-detach
              @click="detach"
            >
              {{ t('editor.detach') }}
            </CnButton>
          </p>
          <details
            v-else
            class="ate-editor__reuse"
          >
            <summary>{{ t('editor.reuse') }}</summary>
            <label class="ate-editor__width">
              <span>{{ t('editor.reuseTitle') }}</span>
              <input
                v-model="reuseTitle"
                class="cn-input cn-input--size-sm"
              >
            </label>
            <div class="app-row">
              <CnButton
                variant="ghost"
                size="sm"
                :disabled="!reuseTitle.trim()"
                @click="saveAs('shared')"
              >
                {{ t('editor.saveAsShared') }}
              </CnButton>
              <CnButton
                variant="ghost"
                size="sm"
                :disabled="!reuseTitle.trim()"
                @click="saveAs('pattern')"
              >
                {{ t('editor.saveAsPattern') }}
              </CnButton>
            </div>
          </details>
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
    <CommandPalette
      v-model:open="commandsOpen"
      :commands="commands"
      @run="runCommand"
    />
    <p
      class="sr-only"
      aria-live="polite"
    >
      {{ announcement }}
    </p>
  </div>
</template>
