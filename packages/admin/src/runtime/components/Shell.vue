<!-- The signed-in frame (the licenses app's shell). The viewer's appearance decides the layout:
       nav: sidebar  → a sidebar (attached, icon rail or floating panel) and a glass top bar for actions
       nav: top      → every section in the glass top bar
       narrow screen → navigation opens from a menu button in a drawer -->
<script setup lang="ts">
import type { NavigationItem } from '../composables/useAtelierNavigation'
import { computed, ref, watch } from 'vue'
import { NuxtLink } from '#components'
import { navigateTo, useRoute } from '#imports'
import { useAppearance } from '../appearance'
import { useQueryClient } from '@tanstack/vue-query'
import { chooseSite, useAtelierAdmin } from '../composables/useAtelierAdmin'
import { useAtelierAdminSchema } from '../composables/useAtelierAdminSchema'
import CnSelect from '../crystal-neuo/components/Select.vue'
import { useAtelierNavigation } from '../composables/useAtelierNavigation'
import { useAtelierSession } from '../composables/useAtelierSession'
import CnDrawer from '../crystal-neuo/components/Drawer.vue'
import CnMenu from '../crystal-neuo/components/Menu.vue'
import { useOverrides } from '../overrides'
import Brand from './Brand.vue'
import GlobalSearch from './GlobalSearch.vue'
import Icon from './Icon'
import NotificationBell from './NotificationBell.vue'
import { useAdminI18n } from '../i18n'

const { t } = useAdminI18n()

const route = useRoute()
const { base } = useAtelierAdmin()
const { appearance, set, openModal } = useAppearance()
const brand = useOverrides()('Brand', Brand)
const { items } = useAtelierNavigation()
const { user, signOut } = useAtelierSession()

// with several sites the user may reach: which one the admin works on
const { schema } = useAtelierAdminSchema()
const client = useQueryClient()
const sites = computed(() => (schema.value?.sites ?? []).map(s => ({ value: s.name, label: s.label })))
async function switchSite(site: string) {
  chooseSite(site)
  client.removeQueries({ predicate: q => q.queryKey[1] !== 'me' })
  await navigateTo(base)
}

const nav = computed(() => appearance.value.nav)
const sidebar = computed(() => appearance.value.sidebar)
const rail = computed(() => nav.value === 'sidebar' && sidebar.value === 'rail')

// one group per `group`, in the order groups first appear; the dashboard on its own
const groups = computed(() => {
  const byGroup = new Map<string, NavigationItem[]>()
  for (const item of items.value)
    byGroup.set(item.group ?? '', [...byGroup.get(item.group ?? '') ?? [], item])
  return [...byGroup].map(([label, list]) => ({ label, items: list }))
})
const isCurrent = (item: NavigationItem) => item.to === base ? route.path === base || route.path === `${base}/` : route.path === item.to || route.path.startsWith(`${item.to}/`)

const drawerOpen = ref(false)
const searching = ref(false)
watch(() => route.fullPath, () => (drawerOpen.value = false))
const toggleRail = () => set({ sidebar: sidebar.value === 'rail' ? 'floating' : 'rail' })

/** Top-bar menus: a group of one is a plain link, a larger group opens a menu. */
const topEntries = computed(() => groups.value.map(g => ({
  group: g,
  current: g.items.some(isCurrent),
  menu: g.items.map(i => ({ label: i.label, onSelect: () => navigateTo(i.to) })),
})))
const account = computed(() => [
  { label: t('common.appearance'), onSelect: openModal },
  { separator: true as const },
  { label: t('nav.signOut'), onSelect: () => signOut.mutate() },
])
</script>

<template>
  <div
    class="app-shell"
    :data-nav="nav"
    :data-sidebar="sidebar"
    :data-content-width="appearance.width"
  >
    <a
      class="app-skip-link"
      href="#atelier-main"
    >Skip to content</a>

    <aside
      v-if="nav === 'sidebar'"
      class="app-side"
      :class="{ 'cn-glass': sidebar !== 'expanded' }"
      :aria-label="t('nav.label')"
    >
      <div class="app-side__head">
        <component
          :is="brand"
          :compact="rail"
        />
      </div>
      <nav
        class="app-nav"
        :aria-label="t('nav.label')"
      >
        <div
          v-for="g in groups"
          :key="g.label"
        >
          <p
            v-if="g.label"
            class="app-nav__label"
          >
            {{ g.label }}
          </p>
          <ul class="app-nav__group">
            <li
              v-for="item in g.items"
              :key="item.to"
            >
              <NuxtLink
                :to="item.to"
                class="app-nav__link"
                :aria-current="isCurrent(item) ? 'page' : undefined"
                :title="rail ? item.label : undefined"
              >
                <Icon :name="item.icon" />
                <span class="app-nav__text">{{ item.label }}</span>
              </NuxtLink>
            </li>
          </ul>
        </div>
      </nav>
      <div class="app-side__foot">
        <CnMenu
          :items="account"
          trigger-variant="ghost"
          class="app-account"
        >
          <template #trigger>
            <span class="app-account__text"><span class="app-account__name">{{ user?.name || user?.email }}</span></span>
          </template>
        </CnMenu>
      </div>
    </aside>

    <div class="app-column">
      <header class="app-topbar cn-glass">
        <button
          type="button"
          class="app-icon-button app-menu-toggle"
          :aria-label="t('nav.open')"
          :aria-expanded="drawerOpen"
          @click="drawerOpen = true"
        >
          <Icon name="menu" />
        </button>
        <button
          v-if="nav === 'sidebar'"
          type="button"
          class="app-icon-button app-rail-toggle"
          :aria-label="rail ? t('nav.expand') : t('nav.collapse')"
          :aria-pressed="rail"
          @click="toggleRail"
        >
          <Icon :name="rail ? 'panel-left-open' : 'panel-left-close'" />
        </button>
        <template v-if="nav === 'top'">
          <component :is="brand" />
          <nav
            class="app-topbar__nav"
            :aria-label="t('nav.label')"
          >
            <template
              v-for="e in topEntries"
              :key="e.group.label"
            >
              <NuxtLink
                v-if="e.group.items.length === 1"
                :to="e.group.items[0]!.to"
                class="app-nav__link"
                :aria-current="isCurrent(e.group.items[0]!) ? 'page' : undefined"
              >
                {{ e.group.items[0]!.label }}
              </NuxtLink>
              <CnMenu
                v-else
                :items="e.menu"
                trigger-variant="ghost"
                :class="e.current ? 'app-topbar__menu--current' : undefined"
              >
                <template #trigger>
                  {{ e.group.label }}
                  <Icon name="chevron-down" />
                </template>
              </CnMenu>
            </template>
          </nav>
        </template>
        <div class="app-topbar__actions">
          <button
            type="button"
            class="app-icon-button"
            :aria-label="t('globalSearch.open')"
            aria-haspopup="dialog"
            @click="searching = true"
          >
            <Icon name="search" />
          </button>
          <CnSelect
            v-if="sites.length > 1"
            :model-value="schema?.site ?? ''"
            :label="t('nav.site')"
            :options="sites"
            class="app-site-switcher"
            data-site-switcher
            @update:model-value="switchSite"
          />
          <NotificationBell />
          <button
            type="button"
            class="app-icon-button"
            :aria-label="t('common.appearance')"
            aria-haspopup="dialog"
            @click="openModal"
          >
            <Icon name="palette" />
          </button>
          <div
            v-if="nav === 'top'"
            class="app-topbar__account"
          >
            <CnMenu
              :items="account"
              trigger-variant="ghost"
              class="app-account"
            >
              <template #trigger>
                {{ user?.name || user?.email }}
              </template>
            </CnMenu>
          </div>
        </div>
      </header>

      <main
        id="atelier-main"
        class="app-main"
        tabindex="-1"
      >
        <slot />
      </main>
    </div>

    <GlobalSearch v-model:open="searching" />
    <CnDrawer
      v-model:open="drawerOpen"
      :title="t('nav.title')"
      size="sm"
    >
      <nav
        class="app-nav app-drawer-nav"
        :aria-label="t('nav.label')"
      >
        <div
          v-for="g in groups"
          :key="g.label"
        >
          <p
            v-if="g.label"
            class="app-nav__label"
          >
            {{ g.label }}
          </p>
          <ul class="app-nav__group">
            <li
              v-for="item in g.items"
              :key="item.to"
            >
              <NuxtLink
                :to="item.to"
                class="app-nav__link"
                :aria-current="isCurrent(item) ? 'page' : undefined"
              >
                <Icon :name="item.icon" />
                <span class="app-nav__text">{{ item.label }}</span>
              </NuxtLink>
            </li>
          </ul>
        </div>
      </nav>
    </CnDrawer>
  </div>
</template>
