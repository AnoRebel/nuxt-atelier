// The viewer's appearance in the admin: crystal-neuo's axes (material, theme, density, platform, glass) and
// the layout (sidebar or top bar, sidebar style, content width). Chosen in the Appearance modal, applied as
// `data-*` attributes on the admin's root, and remembered in this browser. Adapted from the licenses app.
import type { Density, Material, Platform, ThemePreference } from './crystal-neuo/runtime/axes'
import { computed, readonly, ref } from 'vue'
import { DEFAULT_DENSITY, DEFAULT_MATERIAL, DEFAULT_PLATFORM, DENSITIES, GLASS_MATERIALS, MATERIALS, PLATFORMS, THEMES } from './crystal-neuo/runtime/axes'
import { detectPlatform } from './crystal-neuo/runtime/platform'

export type NavMode = 'sidebar' | 'top'
export type SidebarStyle = 'expanded' | 'rail' | 'floating'
export type ContentWidth = 'contained' | 'full'

const NAV_MODES: readonly NavMode[] = ['sidebar', 'top']
const SIDEBAR_STYLES: readonly SidebarStyle[] = ['expanded', 'rail', 'floating']
const CONTENT_WIDTHS: readonly ContentWidth[] = ['contained', 'full']
const THEME_PREFERENCES: readonly ThemePreference[] = ['system', ...THEMES]

export interface Appearance {
  material: Material
  theme: ThemePreference
  density: Density
  platform: Platform
  /** Glass blurs what is behind it. */
  frost: boolean
  /** Specular rim light on glass. */
  rim: boolean
  /** Live refraction at glass rims, where the browser supports it. */
  refraction: boolean
  /** Opaque surfaces even when the OS doesn't ask for it. */
  reduceTransparency: boolean
  nav: NavMode
  sidebar: SidebarStyle
  width: ContentWidth
}

const DEFAULT_APPEARANCE: Readonly<Appearance> = Object.freeze({
  material: DEFAULT_MATERIAL,
  theme: 'system',
  density: DEFAULT_DENSITY,
  platform: DEFAULT_PLATFORM,
  frost: true,
  rim: true,
  refraction: false,
  reduceTransparency: false,
  nav: 'sidebar',
  sidebar: 'floating',
  width: 'contained',
})

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
const flag = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)

/** A stored appearance, every unknown value replaced by its default. Never throws. */
function parseAppearance(raw: unknown): Appearance {
  let v: unknown = raw
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    }
    catch {
      v = null
    }
  }
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const d = DEFAULT_APPEARANCE
  return {
    material: pick(o.material, MATERIALS, d.material),
    theme: pick(o.theme, THEME_PREFERENCES, d.theme),
    density: pick(o.density, DENSITIES, d.density),
    platform: pick(o.platform, PLATFORMS, d.platform),
    frost: flag(o.frost, d.frost),
    rim: flag(o.rim, d.rim),
    refraction: flag(o.refraction, d.refraction),
    reduceTransparency: flag(o.reduceTransparency, d.reduceTransparency),
    nav: pick(o.nav, NAV_MODES, d.nav),
    sidebar: pick(o.sidebar, SIDEBAR_STYLES, d.sidebar),
    width: pick(o.width, CONTENT_WIDTHS, d.width),
  }
}

/** The attributes crystal-neuo reads, for the admin's root element. */
export function appearanceAttrs(a: Appearance, systemDark: boolean): Record<string, string | undefined> {
  return {
    'data-theme': a.theme === 'system' ? (systemDark ? 'dark' : 'light') : a.theme,
    'data-theme-preference': a.theme,
    'data-material': a.material,
    'data-density': a.density,
    'data-platform': a.platform,
    'data-glass-frost': a.frost ? undefined : 'off',
    'data-glass-rim': a.rim ? undefined : 'off',
    'data-refraction': a.refraction ? 'on' : 'off',
    'data-transparency': a.reduceTransparency ? 'reduced' : undefined,
  }
}

const STORAGE = 'atelier-admin-appearance'
function load(): Appearance {
  try {
    return parseAppearance(localStorage.getItem(STORAGE))
  }
  catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

// one state for the whole admin
const state = ref<Appearance>(load())
const modalOpen = ref(false)

export function useAppearance() {
  function set(patch: Partial<Appearance>) {
    state.value = parseAppearance({ ...state.value, ...patch })
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state.value))
    }
    catch {
      // storage blocked (private window, site data off): the choice lasts this visit only
    }
  }
  function reset() {
    state.value = { ...DEFAULT_APPEARANCE }
    try {
      localStorage.removeItem(STORAGE)
    }
    catch {
      // storage blocked: nothing was stored
    }
  }
  return {
    appearance: readonly(state),
    set,
    reset,
    /** Use the platform proportions of the device in hand. */
    matchDevice: () => set({ platform: detectPlatform() }),
    isGlass: computed(() => GLASS_MATERIALS.includes(state.value.material)),
    modalOpen,
    openModal: () => (modalOpen.value = true),
  }
}
