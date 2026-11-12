<!-- Every appearance and layout choice in one place (adapted from the licenses app). Changes apply at once and
     are remembered in this browser; the modal stays open so the viewer can compare. Alt+Shift+A toggles it. -->
<script setup lang="ts">
import type { Appearance, ContentWidth, NavMode, SidebarStyle } from '../appearance'
import type { Density, Material, Platform, ThemePreference } from '../crystal-neuo/runtime/axes'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useAppearance } from '../appearance'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnModal from '../crystal-neuo/components/Modal.vue'
import CnSegmentedControl from '../crystal-neuo/components/SegmentedControl.vue'
import CnToggle from '../crystal-neuo/components/Toggle.vue'

const { appearance, set, reset, matchDevice, isGlass, modalOpen } = useAppearance()

const materials: { value: Material, label: string, note: string }[] = [
  { value: 'refraction', label: 'Refraction', note: 'Glass chrome' },
  { value: 'tactile', label: 'Tactile', note: 'Ink and offset' },
  { value: 'signal', label: 'Signal', note: 'Machined' },
  { value: 'folio', label: 'Folio', note: 'Flat, dense' },
  { value: 'bloom', label: 'Bloom', note: 'Tonal colour' },
  { value: 'hybrid', label: 'Hybrid', note: 'Glass + ink' },
]
const themes: { value: ThemePreference, label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'high-contrast', label: 'High contrast' },
]
const densities: { value: Density, label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'spacious', label: 'Spacious' },
]
const platforms: { value: Platform, label: string }[] = [
  { value: 'web', label: 'Web' },
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
]
const navModes: { value: NavMode, label: string }[] = [
  { value: 'sidebar', label: 'Sidebar' },
  { value: 'top', label: 'Top bar' },
]
const sidebarStyles = computed(() => ([
  { value: 'floating', label: 'Floating' },
  { value: 'rail', label: 'Icons only' },
  { value: 'expanded', label: 'Attached' },
] as { value: SidebarStyle, label: string }[]).map(o => ({ ...o, disabled: appearance.value.nav === 'top' })))
const widths: { value: ContentWidth, label: string }[] = [
  { value: 'contained', label: 'Contained' },
  { value: 'full', label: 'Full width' },
]

/** A two-way binding onto one appearance key. */
function field<K extends keyof Appearance>(key: K) {
  return computed({
    get: () => appearance.value[key],
    set: (v: Appearance[K]) => set({ [key]: v } as Partial<Appearance>),
  })
}
const material = field('material')
const theme = field('theme')
const density = field('density')
const platform = field('platform')
const frost = field('frost')
const rim = field('rim')
const reduceTransparency = field('reduceTransparency')
const nav = field('nav')
const sidebar = field('sidebar')
const width = field('width')

function onKey(e: KeyboardEvent) {
  if (e.altKey && e.shiftKey && (e.code === 'KeyA' || e.key.toLowerCase() === 'a')) {
    e.preventDefault()
    modalOpen.value = !modalOpen.value
  }
}
onMounted(() => window.addEventListener('keydown', onKey, { capture: true }))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, { capture: true }))
</script>

<template>
  <CnModal
    v-model:open="modalOpen"
    title="Appearance"
    size="lg"
    class="app-appearance"
  >
    <div class="app-appearance__body">
      <fieldset class="app-appearance__group">
        <legend class="cn-label">
          Material
        </legend>
        <div class="app-swatches">
          <label
            v-for="m in materials"
            :key="m.value"
            class="app-swatch"
            :data-material="m.value"
          >
            <input
              v-model="material"
              type="radio"
              name="appearance-material"
              :value="m.value"
            >
            <span class="app-swatch__face">
              <span
                class="app-swatch__chips"
                aria-hidden="true"
              ><span /><span /><span /></span>
              {{ m.label }}
              <small>{{ m.note }}</small>
            </span>
          </label>
        </div>
      </fieldset>

      <div class="app-appearance__field">
        <span
          class="cn-label"
          aria-hidden="true"
        >Theme</span>
        <CnSegmentedControl
          v-model="theme"
          label="Theme"
          :options="themes"
          size="sm"
          variant="block"
          class="app-appearance__seg"
        />
      </div>
      <div class="app-appearance__field">
        <span
          class="cn-label"
          aria-hidden="true"
        >Density</span>
        <CnSegmentedControl
          v-model="density"
          label="Density"
          :options="densities"
          size="sm"
          variant="block"
          class="app-appearance__seg"
        />
      </div>
      <div class="app-appearance__group">
        <div class="app-appearance__field">
          <span
            class="cn-label"
            aria-hidden="true"
          >Platform</span>
          <CnSegmentedControl
            v-model="platform"
            label="Platform"
            :options="platforms"
            size="sm"
            variant="block"
            class="app-appearance__seg"
          />
        </div>
        <div>
          <CnButton
            variant="ghost"
            size="sm"
            @click="matchDevice"
          >
            Match this device
          </CnButton>
        </div>
      </div>

      <fieldset class="app-appearance__group">
        <legend class="cn-label">
          Glass
        </legend>
        <p
          v-if="!isGlass"
          class="app-appearance__note"
        >
          The current material has no glass, so these take effect when you choose Refraction, Bloom or Hybrid.
        </p>
        <CnToggle
          v-model:checked="frost"
          label="Frost: blur what the glass covers"
          size="sm"
        />
        <CnToggle
          v-model:checked="rim"
          label="Rim light: specular top edge"
          size="sm"
        />
        <CnToggle
          v-model:checked="reduceTransparency"
          label="Reduce transparency: opaque surfaces"
          size="sm"
        />
      </fieldset>

      <fieldset class="app-appearance__group">
        <legend class="cn-label">
          Layout
        </legend>
        <div class="app-appearance__field">
          <span
            class="cn-label"
            aria-hidden="true"
          >Navigation</span>
          <CnSegmentedControl
            v-model="nav"
            label="Navigation"
            :options="navModes"
            size="sm"
            variant="block"
            class="app-appearance__seg"
          />
        </div>
        <div class="app-appearance__field">
          <span
            class="cn-label"
            aria-hidden="true"
          >Sidebar</span>
          <CnSegmentedControl
            v-model="sidebar"
            label="Sidebar"
            :options="sidebarStyles"
            size="sm"
            variant="block"
            class="app-appearance__seg"
          />
        </div>
        <div class="app-appearance__field">
          <span
            class="cn-label"
            aria-hidden="true"
          >Content width</span>
          <CnSegmentedControl
            v-model="width"
            label="Content width"
            :options="widths"
            size="sm"
            variant="block"
            class="app-appearance__seg"
          />
        </div>
        <p class="app-appearance__note">
          On small screens navigation always opens from the menu button.
        </p>
      </fieldset>
    </div>

    <div class="cn-modal__actions">
      <CnButton
        variant="ghost"
        @click="reset()"
      >
        Reset to defaults
      </CnButton>
      <CnButton @click="modalOpen = false">
        Done
      </CnButton>
    </div>
  </CnModal>
</template>
