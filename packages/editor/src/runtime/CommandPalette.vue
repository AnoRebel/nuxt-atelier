<!-- The editor's command palette: filters the commands as the user types (every word must match), arrows
     move, Enter runs. Built like the admin's global search. -->
<script setup lang="ts">
import type { EditorCommand } from './commands'
import { computed, nextTick, ref, watch } from 'vue'
import { useAdminI18n } from '#imports'
import CnModal from '#atelier-admin-runtime/crystal-neuo/components/Modal.vue'

const props = defineProps<{ commands: EditorCommand[] }>()
const emit = defineEmits<{ run: [command: EditorCommand] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useAdminI18n()
const text = ref('')
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)

const shown = computed(() => {
  const words = text.value.toLowerCase().split(/\s+/).filter(Boolean)
  return props.commands.filter(c => words.every(w => `${c.label} ${c.group ?? ''}`.toLowerCase().includes(w)))
})
watch(shown, () => active.value = 0)
watch(open, async (isOpen) => {
  if (isOpen) {
    text.value = ''
    await nextTick()
    input.value?.focus()
  }
})
function run(command: EditorCommand | undefined) {
  if (!command)
    return
  open.value = false
  emit('run', command)
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = shown.value.length
    if (n)
      active.value = (active.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    run(shown.value[active.value])
  }
}
</script>

<template>
  <CnModal
    v-model:open="open"
    :title="t('editor.commands')"
    size="lg"
  >
    <div class="app-stack app-global-search">
      <input
        ref="input"
        v-model="text"
        class="cn-input"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="atelier-editor-commands"
        :aria-expanded="shown.length > 0"
        :aria-activedescendant="shown[active] ? `atelier-cmd-${active}` : undefined"
        :aria-label="t('editor.commandsLabel')"
        :placeholder="t('editor.commandsLabel')"
        @keydown="onKey"
      >
      <ul
        id="atelier-editor-commands"
        role="listbox"
        class="app-list app-global-search__results"
        :aria-label="t('editor.commands')"
      >
        <li
          v-for="(command, i) in shown"
          :id="`atelier-cmd-${i}`"
          :key="command.id"
          role="option"
          :aria-selected="i === active"
          class="app-global-search__option"
          @mousemove="active = i"
          @click="run(command)"
        >
          <span class="app-global-search__title">{{ command.label }}</span>
          <span
            v-if="command.group"
            class="app-muted"
          >{{ command.group }}</span>
        </li>
      </ul>
      <p
        v-if="!shown.length"
        class="app-muted"
        role="status"
      >
        {{ t('editor.noCommands') }}
      </p>
    </div>
  </CnModal>
</template>
