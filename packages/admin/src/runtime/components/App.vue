<!-- The default kit's root: the appearance axes, the app's theme tokens and favicon on the admin's root
     element, toasts, the Appearance modal, and the view for the current admin path. Every view can be
     replaced by the app (see overrides.ts). -->
<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import customPages from '#atelier-admin-pages'
import { useHead, useRoute } from '#imports'
import { appearanceAttrs, setDefaultAppearance, useAppearance } from '../appearance'
import { useBranding } from '../branding'
import { useAtelierAdminSchema } from '../composables/useAtelierAdminSchema'
import { allowed } from '../composables/useAtelierNavigation'
import { useAtelierSession } from '../composables/useAtelierSession'
import { startLanguage, useAdminI18n } from '../i18n'
import { useOverrides } from '../overrides'
import AppearanceModal from './AppearanceModal.vue'
import AuthFrame from './AuthFrame.vue'
import CollectionList from './CollectionList.vue'
import EntryEdit from './EntryEdit.vue'
import Home from './Home.vue'
import Icon from './Icon'
import NotFound from './NotFound.vue'
import RobotsSettings from './RobotsSettings.vue'
import RoleEdit from './RoleEdit.vue'
import Roles from './Roles.vue'
import Setup from './Setup.vue'
import Shell from './Shell.vue'
import SignIn from './SignIn.vue'
import Toaster from './Toaster.vue'
import Users from './Users.vue'

const props = defineProps<{ root: HTMLElement }>()

const { t } = useAdminI18n()
const view = useOverrides()
const views = {
  Home: view('Home', Home),
  CollectionList: view('CollectionList', CollectionList),
  EntryEdit: view('EntryEdit', EntryEdit),
  Users: view('Users', Users),
  Roles: view('Roles', Roles),
  RoleEdit: view('RoleEdit', RoleEdit),
  RobotsSettings: view('RobotsSettings', RobotsSettings),
  SignIn: view('SignIn', SignIn),
  Setup: view('Setup', Setup),
  NotFound: view('NotFound', NotFound),
}

const branding = useBranding()
setDefaultAppearance(branding.value.appearance)
// the interface language, loaded before the first screen so it doesn't flash in English
const languageReady = ref(false)
void startLanguage(branding.value.language).finally(() => languageReady.value = true)
const { appearance } = useAppearance()
const media = matchMedia('(prefers-color-scheme: dark)')
const systemDark = ref(media.matches)
const onChange = (e: MediaQueryListEvent) => systemDark.value = e.matches
media.addEventListener('change', onChange)
onBeforeUnmount(() => media.removeEventListener('change', onChange))

// the axes and the app's token overrides go on the admin's root element (outside this component's tree)
const attrs = computed(() => appearanceAttrs(appearance.value, systemDark.value))
function apply() {
  for (const [name, value] of Object.entries(attrs.value)) {
    if (value === undefined)
      props.root.removeAttribute(name)
    else
      props.root.setAttribute(name, value)
  }
  for (const [name, value] of Object.entries(branding.value.tokens))
    props.root.style.setProperty(name, value)
}
apply()
watch([attrs, branding], apply)
useHead(() => ({
  title: branding.value.name,
  link: branding.value.favicon ? [{ rel: 'icon', href: branding.value.favicon, key: 'atelier-admin-favicon' }] : [],
}))

const route = useRoute()
const segments = computed(() => [route.params.path].flat().filter((s): s is string => !!s))
const session = useAtelierSession()
const { schema } = useAtelierAdminSchema()

// the app's own admin pages: loaded when opened, refused to users who lack what they require
const page = computed(() => customPages.find(p => p.path === segments.value.join('/')))
const pageComponent = computed(() => page.value && defineAsyncComponent(page.value.component))
const pageAllowed = computed(() => !!page.value && !!schema.value && allowed(page.value.requires, schema.value.capabilities))
</script>

<template>
  <div
    v-if="session.loading.value || !languageReady"
    class="app-loading"
    role="status"
  >
    <Icon name="loader-circle" />
    <span class="sr-only">{{ t('common.loading') }}</span>
  </div>
  <AuthFrame v-else-if="session.setupNeeded.value || !session.user.value">
    <component
      :is="views.Setup"
      v-if="session.setupNeeded.value"
    />
    <component
      :is="views.SignIn"
      v-else
    />
  </AuthFrame>
  <Shell v-else>
    <component
      :is="views.Home"
      v-if="!segments.length"
    />
    <template v-else-if="page">
      <component
        :is="pageComponent"
        v-if="pageAllowed"
        :key="page.path"
      />
      <component
        :is="views.NotFound"
        v-else-if="schema"
        forbidden
      />
    </template>
    <component
      :is="views.CollectionList"
      v-else-if="segments[0] === 'collections' && segments.length === 2"
      :key="segments[1]"
      :name="segments[1]!"
    />
    <component
      :is="views.EntryEdit"
      v-else-if="segments[0] === 'collections' && segments.length === 3"
      :id="segments[2] === 'new' ? undefined : segments[2]"
      :key="segments.join('/')"
      :locale="typeof route.query.locale === 'string' ? route.query.locale : undefined"
      kind="collection"
      :name="segments[1]!"
    />
    <component
      :is="views.EntryEdit"
      v-else-if="segments[0] === 'singletons' && segments.length === 2"
      :key="segments[1]"
      kind="singleton"
      :name="segments[1]!"
    />
    <component
      :is="views.Users"
      v-else-if="segments[0] === 'users' && segments.length === 1"
    />
    <component
      :is="views.Roles"
      v-else-if="segments[0] === 'roles' && segments.length === 1"
    />
    <component
      :is="views.RoleEdit"
      v-else-if="segments[0] === 'roles' && segments.length === 2"
      :key="segments[1]"
      :name="segments[1] === 'new' ? undefined : segments[1]"
    />
    <component
      :is="views.RobotsSettings"
      v-else-if="segments.join('/') === 'settings/robots'"
    />
    <component
      :is="views.NotFound"
      v-else
    />
  </Shell>
  <AppearanceModal />
  <Toaster />
</template>
