<!-- Every appearance and layout choice in one place (adapted from the licenses app). Changes apply at once and
     are remembered in this browser; the modal stays open so the viewer can compare. Alt+Shift+A toggles it. -->
<script setup lang="ts">
import type { Appearance, ContentWidth, NavMode, SidebarStyle } from '../appearance'
import type { Density, Material, Platform, ThemePreference } from '../crystal-neuo/runtime/axes'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useAppearance } from '../appearance'
import CnButton from '../crystal-neuo/components/Button.vue'
import CnModal from '../crystal-neuo/components/Modal.vue'
import CnSelect from '../crystal-neuo/components/Select.vue'
import CnSegmentedControl from '../crystal-neuo/components/SegmentedControl.vue'
import CnToggle from '../crystal-neuo/components/Toggle.vue'
import { useAdminI18n } from '../i18n'

const { t, language, languages, setLanguage } = useAdminI18n()
const languageChoice = computed({ get: () => language.value, set: (code: string) => void setLanguage(code) })
const languageOptions = computed(() => languages.value.map(l => ({ value: l.code, label: l.name })))

const { appearance, set, reset, matchDevice, isGlass, modalOpen } = useAppearance()

const materials = computed((): { value: Material, label: string, note: string }[] => [
  { value: 'refraction', label: t('material.refraction'), note: t('material.refractionNote') },
  { value: 'tactile', label: t('material.tactile'), note: t('material.tactileNote') },
  { value: 'signal', label: t('material.signal'), note: t('material.signalNote') },
  { value: 'folio', label: t('material.folio'), note: t('material.folioNote') },
  { value: 'bloom', label: t('material.bloom'), note: t('material.bloomNote') },
  { value: 'hybrid', label: t('material.hybrid'), note: t('material.hybridNote') },
])
const themes = computed((): { value: ThemePreference, label: string }[] => [
  { value: 'system', label: t('theme.system') },
  { value: 'light', label: t('theme.light') },
  { value: 'dark', label: t('theme.dark') },
  { value: 'high-contrast', label: t('theme.high-contrast') },
])
const densities = computed((): { value: Density, label: string }[] => [
  { value: 'compact', label: t('density.compact') },
  { value: 'comfortable', label: t('density.comfortable') },
  { value: 'spacious', label: t('density.spacious') },
])
const platforms = computed((): { value: Platform, label: string }[] => [
  { value: 'web', label: 'Web' },
  { value: 'ios', label: 'iOS' },
  { value: 'android', label: 'Android' },
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
])
const navModes = computed((): { value: NavMode, label: string }[] => [
  { value: 'sidebar', label: t('nav.sidebar') },
  { value: 'top', label: t('nav.top') },
])
const sidebarStyles = computed(() => ([
  { value: 'floating', label: t('sidebar.floating') },
  { value: 'rail', label: t('sidebar.rail') },
  { value: 'expanded', label: t('sidebar.expanded') },
] as { value: SidebarStyle, label: string }[]).map(o => ({ ...o, disabled: appearance.value.nav === 'top' })))
const widths = computed((): { value: ContentWidth, label: string }[] => [
  { value: 'contained', label: t('width.contained') },
  { value: 'full', label: t('width.full') },
])

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
    :title="t('common.appearance')"
    size="lg"
    class="app-appearance"
  >
    <div class="app-appearance__body">
      <CnSelect
        v-if="languageOptions.length > 1"
        v-model="languageChoice"
        :label="t('appearance.language')"
        :options="languageOptions"
      />
      <fieldset class="app-appearance__group">
        <legend class="cn-label">
          {{ t('appearance.material') }}
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
        >{{ t('appearance.theme') }}</span>
        <CnSegmentedControl
          v-model="theme"
          :label="t('appearance.theme')"
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
        >{{ t('appearance.density') }}</span>
        <CnSegmentedControl
          v-model="density"
          :label="t('appearance.density')"
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
          >{{ t('appearance.platform') }}</span>
          <CnSegmentedControl
            v-model="platform"
            :label="t('appearance.platform')"
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
            {{ t('appearance.matchDevice') }}
          </CnButton>
        </div>
      </div>

      <fieldset class="app-appearance__group">
        <legend class="cn-label">
          {{ t('appearance.glass') }}
        </legend>
        <p
          v-if="!isGlass"
          class="app-appearance__note"
        >
          {{ t('appearance.noGlass') }}
        </p>
        <CnToggle
          v-model:checked="frost"
          :label="t('appearance.frost')"
          size="sm"
        />
        <CnToggle
          v-model:checked="rim"
          :label="t('appearance.rim')"
          size="sm"
        />
        <CnToggle
          v-model:checked="reduceTransparency"
          :label="t('appearance.reduceTransparency')"
          size="sm"
        />
      </fieldset>

      <fieldset class="app-appearance__group">
        <legend class="cn-label">
          {{ t('appearance.layout') }}
        </legend>
        <div class="app-appearance__field">
          <span
            class="cn-label"
            aria-hidden="true"
          >{{ t('appearance.navigation') }}</span>
          <CnSegmentedControl
            v-model="nav"
            :label="t('appearance.navigation')"
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
          >{{ t('appearance.sidebar') }}</span>
          <CnSegmentedControl
            v-model="sidebar"
            :label="t('appearance.sidebar')"
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
          >{{ t('appearance.width') }}</span>
          <CnSegmentedControl
            v-model="width"
            :label="t('appearance.width')"
            :options="widths"
            size="sm"
            variant="block"
            class="app-appearance__seg"
          />
        </div>
        <p class="app-appearance__note">
          {{ t('appearance.smallScreens') }}
        </p>
      </fieldset>
    </div>

    <div class="cn-modal__actions">
      <CnButton
        variant="ghost"
        @click="reset()"
      >
        {{ t('appearance.reset') }}
      </CnButton>
      <CnButton @click="modalOpen = false">
        {{ t('common.done') }}
      </CnButton>
    </div>
  </CnModal>
</template>
