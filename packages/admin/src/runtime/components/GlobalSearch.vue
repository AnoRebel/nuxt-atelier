<!-- The admin's global search (Ctrl+K or ⌘K): entries, singletons and users the user may see, and the
     admin's own pages, as they type; arrows move, Enter opens. -->
<script setup lang="ts">
import type { GlobalSearchResult } from '../composables/useAtelierGlobalSearch'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ai } from '#atelier-admin-ai'
import { navigateTo } from '#imports'
import { useAtelierAdmin } from '../composables/useAtelierAdmin'
import { useAtelierAdminSchema } from '../composables/useAtelierAdminSchema'
import { useAtelierGlobalSearch } from '../composables/useAtelierGlobalSearch'
import { humanize, useAtelierNavigation } from '../composables/useAtelierNavigation'
import CnModal from '../crystal-neuo/components/Modal.vue'
import { useAdminI18n } from '../i18n'

const open = defineModel<boolean>('open', { default: false })
const { t } = useAdminI18n()
const { to } = useAtelierAdmin()
const { schema } = useAtelierAdminSchema()
const { items } = useAtelierNavigation()
const text = ref('')
const { results } = useAtelierGlobalSearch(text)
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)
// AI assist: the request goes to the assistant, which proposes what to do
const aiOn = ai ? ai.enabled() : ref(false)
const asking = ref<string | null>(null)

interface Option { key: string, kind: GlobalSearchResult['kind'] | 'page' | 'assistant', title: string, detail?: string, to: string }
const typeLabel = (name: string) => schema.value?.collections.find(c => c.name === name)?.labels?.plural ?? humanize(name)
const options = computed<Option[]>(() => {
  const needle = text.value.trim().toLowerCase()
  const pages = needle ? items.value.filter(i => i.label.toLowerCase().includes(needle)).map(i => ({ key: `page:${i.to}`, kind: 'page' as const, title: i.label, to: i.to })) : []
  const found = results.value.flatMap((r): Option[] => {
    if (r.kind === 'entry')
      return [{ key: `entry:${r.type}:${r.id}`, kind: r.kind, title: r.title || t('common.untitled'), detail: [typeLabel(r.type!), r.detail?.toUpperCase()].filter(Boolean).join(' · '), to: to('collections', r.type!, r.id) }]
    if (r.kind === 'singleton')
      return [{ key: `singleton:${r.id}`, kind: r.kind, title: r.title, to: to('singletons', r.id) }]
    if (r.kind === 'user')
      return [{ key: `user:${r.id}`, kind: r.kind, title: r.title, detail: r.detail, to: to('users') }]
    if (r.kind === 'media')
      return [{ key: `media:${r.id}`, kind: r.kind, title: r.title, detail: r.detail, to: `${to('media')}?search=${encodeURIComponent(r.detail ?? r.title)}` }]
    return []
  })
  const assistant = aiOn.value && text.value.trim().length > 2 ? [{ key: 'assistant', kind: 'assistant' as const, title: t('ai.ask', { request: text.value.trim() }), to: '' }] : []
  return [...pages, ...found, ...assistant]
})
watch(options, () => active.value = 0)
watch(open, async (isOpen) => {
  if (isOpen) {
    text.value = ''
    asking.value = null
    await nextTick()
    input.value?.focus()
  }
})

async function choose(option: Option | undefined) {
  if (!option)
    return
  if (option.kind === 'assistant') {
    asking.value = text.value.trim()
    return
  }
  open.value = false
  await navigateTo(option.to)
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = options.value.length
    if (n)
      active.value = (active.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    void choose(options.value[active.value])
  }
}
// Ctrl+K / ⌘K anywhere in the admin
function onShortcut(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    open.value = !open.value
  }
}
onMounted(() => window.addEventListener('keydown', onShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', onShortcut))
</script>

<template>
  <CnModal
    v-model:open="open"
    :title="t('globalSearch.title')"
    size="lg"
  >
    <component
      :is="ai.Assistant"
      v-if="ai && asking"
      :request="asking"
      @close="open = false"
    />
    <div
      v-else
      class="app-stack app-global-search"
    >
      <input
        ref="input"
        v-model="text"
        class="cn-input"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="atelier-global-search-results"
        :aria-expanded="options.length > 0"
        :aria-activedescendant="options[active] ? `atelier-gs-${active}` : undefined"
        :aria-label="t('globalSearch.label')"
        :placeholder="t('globalSearch.label')"
        @keydown="onKey"
      >
      <ul
        id="atelier-global-search-results"
        role="listbox"
        class="app-list app-global-search__results"
        :aria-label="t('globalSearch.title')"
      >
        <li
          v-for="(option, i) in options"
          :id="`atelier-gs-${i}`"
          :key="option.key"
          role="option"
          :aria-selected="i === active"
          class="app-global-search__option"
          @mousemove="active = i"
          @click="choose(option)"
        >
          <span class="app-global-search__title">{{ option.title }}</span>
          <span class="app-muted">{{ t(`globalSearch.kind.${option.kind}`) }}{{ option.detail ? ` · ${option.detail}` : '' }}</span>
        </li>
      </ul>
      <p
        v-if="text.trim() && !options.length"
        class="app-muted"
        role="status"
      >
        {{ t('globalSearch.empty') }}
      </p>
      <p
        v-else-if="!text.trim()"
        class="app-muted"
      >
        {{ t('globalSearch.hint') }}
      </p>
    </div>
  </CnModal>
</template>
