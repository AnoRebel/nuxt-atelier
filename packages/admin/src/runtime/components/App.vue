<!-- The default kit's root: the appearance axes on the admin's root element, toasts, the Appearance modal,
     and the view for the current admin path. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from '#imports'
import { appearanceAttrs, useAppearance } from '../appearance'
import { useAtelierSession } from '../composables/useAtelierSession'
import AppearanceModal from './AppearanceModal.vue'
import AuthFrame from './AuthFrame.vue'
import CollectionList from './CollectionList.vue'
import EntryEdit from './EntryEdit.vue'
import Home from './Home.vue'
import Icon from './Icon'
import NotFound from './NotFound.vue'
import Setup from './Setup.vue'
import Shell from './Shell.vue'
import SignIn from './SignIn.vue'
import Toaster from './Toaster.vue'

const props = defineProps<{ root: HTMLElement }>()

const { appearance } = useAppearance()
const media = matchMedia('(prefers-color-scheme: dark)')
const systemDark = ref(media.matches)
const onChange = (e: MediaQueryListEvent) => systemDark.value = e.matches
media.addEventListener('change', onChange)
onBeforeUnmount(() => media.removeEventListener('change', onChange))

// the axes go on the admin's root element (outside this component's own tree)
const attrs = computed(() => appearanceAttrs(appearance.value, systemDark.value))
function apply() {
  for (const [name, value] of Object.entries(attrs.value)) {
    if (value === undefined)
      props.root.removeAttribute(name)
    else
      props.root.setAttribute(name, value)
  }
}
apply()
watch(attrs, apply)

const route = useRoute()
const segments = computed(() => [route.params.path].flat().filter((s): s is string => !!s))
const session = useAtelierSession()
</script>

<template>
  <div
    v-if="session.loading.value"
    class="app-loading"
    role="status"
  >
    <Icon name="loader-circle" />
    <span class="sr-only">Loading</span>
  </div>
  <AuthFrame v-else-if="session.setupNeeded.value || !session.user.value">
    <Setup v-if="session.setupNeeded.value" />
    <SignIn v-else />
  </AuthFrame>
  <Shell v-else>
    <Home v-if="!segments.length" />
    <CollectionList
      v-else-if="segments[0] === 'collections' && segments.length === 2"
      :key="segments[1]"
      :name="segments[1]!"
    />
    <EntryEdit
      v-else-if="segments[0] === 'collections' && segments.length === 3"
      :id="segments[2] === 'new' ? undefined : segments[2]"
      :key="segments.join('/')"
      kind="collection"
      :name="segments[1]!"
    />
    <EntryEdit
      v-else-if="segments[0] === 'singletons' && segments.length === 2"
      :key="segments[1]"
      kind="singleton"
      :name="segments[1]!"
    />
    <NotFound v-else />
  </Shell>
  <AppearanceModal />
  <Toaster />
</template>
