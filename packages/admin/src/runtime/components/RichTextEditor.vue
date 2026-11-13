<!-- Toolbar buttons don't take focus from a mouse (the text keeps it); from the keyboard each command
     returns focus to the text.
     The rich-text input: Tiptap 3 (ProseMirror) with a formatting toolbar, storing ProseMirror JSON (the
     server keeps only safe nodes, marks and links on save). Loaded only when a rich-text field is shown.
     Replace it with app/atelier-admin/FieldRichText.vue (Domternal's editor, say): it stores the same JSON. -->
<script setup lang="ts">
import type { JSONContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnInput from '../crystal-neuo/components/Input.vue'
import CnModal from '../crystal-neuo/components/Modal.vue'
import { useAdminI18n } from '../i18n'
import Icon from './Icon'

const props = defineProps<{ modelValue?: JSONContent | null, label: string, error?: string, hint?: string, disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: JSONContent | null] }>()
const { t } = useAdminI18n()
const labelId = useId()
const messageId = useId()

const editor = useEditor({
  content: props.modelValue ?? '',
  editable: !props.disabled,
  extensions: [StarterKit.configure({
    heading: { levels: [2, 3] },
    link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
  })],
  editorProps: {
    attributes: {
      'class': 'app-richtext__content',
      'role': 'textbox',
      'aria-multiline': 'true',
      'aria-labelledby': labelId,
    },
  },
  onUpdate: ({ editor: e }) => emit('update:modelValue', e.isEmpty ? null : e.getJSON()),
})
onBeforeUnmount(() => editor.value?.destroy())
// a value set from outside (a reset, a restored copy) replaces the content; our own updates don't loop back
watch(() => props.modelValue, (value) => {
  const e = editor.value
  if (e && JSON.stringify(value ?? null) !== JSON.stringify(e.isEmpty ? null : e.getJSON()))
    e.commands.setContent(value ?? '', { emitUpdate: false })
})
watch(() => props.disabled, disabled => editor.value?.setEditable(!disabled))

type Command = (e: NonNullable<typeof editor.value>) => void
const buttons = computed<{ key: string, icon: string, active?: string | [string, Record<string, unknown>], run: Command }[]>(() => [
  { key: 'bold', icon: 'bold', active: 'bold', run: e => e.chain().focus().toggleBold().run() },
  { key: 'italic', icon: 'italic', active: 'italic', run: e => e.chain().focus().toggleItalic().run() },
  { key: 'underline', icon: 'underline', active: 'underline', run: e => e.chain().focus().toggleUnderline().run() },
  { key: 'strike', icon: 'strikethrough', active: 'strike', run: e => e.chain().focus().toggleStrike().run() },
  { key: 'code', icon: 'code', active: 'code', run: e => e.chain().focus().toggleCode().run() },
  { key: 'h2', icon: 'heading-2', active: ['heading', { level: 2 }], run: e => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { key: 'h3', icon: 'heading-3', active: ['heading', { level: 3 }], run: e => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { key: 'bulletList', icon: 'list', active: 'bulletList', run: e => e.chain().focus().toggleBulletList().run() },
  { key: 'orderedList', icon: 'list-ordered', active: 'orderedList', run: e => e.chain().focus().toggleOrderedList().run() },
  { key: 'quote', icon: 'quote', active: 'blockquote', run: e => e.chain().focus().toggleBlockquote().run() },
  { key: 'codeBlock', icon: 'square-code', active: 'codeBlock', run: e => e.chain().focus().toggleCodeBlock().run() },
])
const isActive = (active: string | [string, Record<string, unknown>] | undefined) =>
  !!active && !!editor.value && (Array.isArray(active) ? editor.value.isActive(active[0], active[1]) : editor.value.isActive(active))

// links: an address in a dialog
const linking = ref(false)
const url = ref('')
function openLink() {
  url.value = (editor.value?.getAttributes('link').href as string | undefined) ?? ''
  linking.value = true
}
function applyLink() {
  const href = url.value.trim()
  const chain = editor.value?.chain().focus().extendMarkRange('link')
  if (href)
    chain?.setLink({ href }).run()
  else
    chain?.unsetLink().run()
  linking.value = false
}
</script>

<template>
  <div
    class="cn-field app-richtext"
    data-rich-text
  >
    <span
      :id="labelId"
      class="cn-field__label"
    >{{ label }}</span>
    <div
      v-if="editor && !disabled"
      class="app-richtext__toolbar"
      role="toolbar"
      :aria-label="t('richText.toolbar')"
      :aria-controls="labelId"
    >
      <button
        v-for="b in buttons"
        :key="b.key"
        type="button"
        class="app-icon-button"
        :aria-label="t(`richText.${b.key}`)"
        :aria-pressed="isActive(b.active)"
        @mousedown.prevent
        @click="b.run(editor)"
      >
        <Icon :name="b.icon" />
      </button>
      <button
        type="button"
        class="app-icon-button"
        :aria-label="t('richText.link')"
        :aria-pressed="editor.isActive('link')"
        @mousedown.prevent
        @click="openLink"
      >
        <Icon name="link" />
      </button>
      <button
        v-if="editor.isActive('link')"
        type="button"
        class="app-icon-button"
        :aria-label="t('richText.unlink')"
        @mousedown.prevent
        @click="editor.chain().focus().unsetLink().run()"
      >
        <Icon name="unlink" />
      </button>
      <button
        type="button"
        class="app-icon-button"
        :aria-label="t('richText.undo')"
        :disabled="!editor.can().undo()"
        @mousedown.prevent
        @click="editor.chain().focus().undo().run()"
      >
        <Icon name="undo-2" />
      </button>
      <button
        type="button"
        class="app-icon-button"
        :aria-label="t('richText.redo')"
        :disabled="!editor.can().redo()"
        @mousedown.prevent
        @click="editor.chain().focus().redo().run()"
      >
        <Icon name="redo-2" />
      </button>
    </div>
    <EditorContent
      :editor="editor"
      class="app-richtext__editor"
      :aria-describedby="error || hint ? messageId : undefined"
    />
    <span
      v-if="error"
      :id="messageId"
      class="cn-field__message"
      role="alert"
    >{{ error }}</span>
    <span
      v-else-if="hint"
      :id="messageId"
      class="cn-field__hint"
    >{{ hint }}</span>
    <CnModal
      v-model:open="linking"
      :title="t('richText.linkTitle')"
      size="sm"
    >
      <div
        class="app-form"
        @keydown.enter.prevent="applyLink"
      >
        <CnInput
          v-model="url"
          :label="t('richText.url')"
          :hint="t('richText.urlHint')"
          type="url"
        />
        <div class="cn-modal__actions">
          <CnButton
            variant="ghost"
            @click="linking = false"
          >
            {{ t('common.cancel') }}
          </CnButton>
          <CnButton @click="applyLink">
            {{ t('richText.apply') }}
          </CnButton>
        </div>
      </div>
    </CnModal>
  </div>
</template>
